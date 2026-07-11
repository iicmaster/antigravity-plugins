import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STATE_FILE_NAME = "state.json";
const JOBS_DIR_NAME = "jobs";
const DEFAULT_PRINT_TIMEOUT = "10m0s";
const DEFAULT_WRAPPER_TIMEOUT_GRACE_MS = 2000;
const MIN_AGY_VERSION = "1.1.1";
const GO_DURATION_PATTERN = /^(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h))+$/;
const FORCE_KILL_GRACE_MS = 2000;
const PRINT_SMOKE_SENTINEL = "AGY_SMOKE_OK";
const PRINT_SMOKE_PROMPT = `Reply with exactly ${PRINT_SMOKE_SENTINEL} and do not run tools.`;

function nowIso() {
  return new Date().toISOString();
}

function workspaceSlug(cwd) {
  const base = path.basename(cwd) || "workspace";
  const slug = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  const hash = createHash("sha256").update(path.resolve(cwd)).digest("hex").slice(0, 16);
  return `${slug}-${hash}`;
}

export function resolveStateDir(cwd = process.cwd(), env = process.env) {
  if (env.CLAUDE_PLUGIN_DATA) {
    return path.join(env.CLAUDE_PLUGIN_DATA, "state");
  }
  return path.join(os.tmpdir(), "agy-companion", workspaceSlug(cwd));
}

export function resolveJobsDir(cwd = process.cwd(), env = process.env) {
  return path.join(resolveStateDir(cwd, env), JOBS_DIR_NAME);
}

export function resolveStateFile(cwd = process.cwd(), env = process.env) {
  return path.join(resolveStateDir(cwd, env), STATE_FILE_NAME);
}

export function ensureStateDir(cwd = process.cwd(), env = process.env) {
  fs.mkdirSync(resolveJobsDir(cwd, env), { recursive: true });
}

export function normalizeRunOptions(options = {}) {
  const prompt = String(options.prompt ?? "").trim();
  if (!prompt) {
    throw new Error("prompt is required");
  }

  const printTimeout = String(options.printTimeout ?? DEFAULT_PRINT_TIMEOUT).trim();
  if (!GO_DURATION_PATTERN.test(printTimeout)) {
    throw new Error("print-timeout must be a Go duration such as 30s or 10m0s");
  }

  const addDirs = [...(options.addDirs ?? [])].map((entry) => {
    const value = String(entry);
    if (!path.isAbsolute(value)) {
      throw new Error(`add-dir must be absolute: ${value}`);
    }
    return path.resolve(value);
  });

  const logFile = options.logFile ? path.resolve(String(options.logFile)) : null;
  const conversation = options.conversation ? String(options.conversation).trim() : null;

  return {
    prompt,
    addDirs,
    logFile,
    printTimeout,
    sandbox: Boolean(options.sandbox),
    dangerouslySkipPermissions: Boolean(options.dangerouslySkipPermissions),
    continueLast: Boolean(options.continueLast),
    conversation
  };
}

export function goDurationToMilliseconds(duration) {
  const value = String(duration ?? "").trim();
  if (!GO_DURATION_PATTERN.test(value)) {
    throw new Error("duration must be a Go duration such as 30s or 10m0s");
  }

  const unitToMilliseconds = {
    ns: 1 / 1_000_000,
    us: 1 / 1000,
    "µs": 1 / 1000,
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000
  };
  let total = 0;
  const matcher = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g;
  for (const match of value.matchAll(matcher)) {
    total += Number(match[1]) * unitToMilliseconds[match[2]];
  }
  return Math.ceil(total);
}

function wrapperTimeoutGraceMs(env = process.env) {
  const raw = env.AGY_COMPANION_WRAPPER_TIMEOUT_GRACE_MS;
  if (raw == null || raw === "") {
    return DEFAULT_WRAPPER_TIMEOUT_GRACE_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_WRAPPER_TIMEOUT_GRACE_MS;
  }
  return Math.ceil(parsed);
}

export function buildAgyArgv(options = {}, supportsPrintTimeout = true) {
  const normalized = normalizeRunOptions(options);
  const argv = [];
  if (supportsPrintTimeout) {
    argv.push("--print-timeout", normalized.printTimeout);
  }

  if (normalized.logFile) {
    argv.push("--log-file", normalized.logFile);
  }
  if (normalized.sandbox) {
    argv.push("--sandbox");
  }
  if (normalized.dangerouslySkipPermissions) {
    argv.push("--dangerously-skip-permissions");
  }
  if (normalized.continueLast) {
    argv.push("--continue");
  }
  if (normalized.conversation) {
    argv.push("--conversation", normalized.conversation);
  }
  for (const dir of normalized.addDirs) {
    argv.push("--add-dir", dir);
  }

  // AGY 1.1.1 auto-enters non-interactive print mode for piped stdin when no
  // --print flag is present. A bare --print would consume the next option as
  // its required prompt value, so the prompt is written only to child stdin.
  return argv;
}

export function generateJobId(prefix = "agy") {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function defaultState() {
  return {
    version: 1,
    jobs: []
  };
}

export function loadState(cwd = process.cwd(), env = process.env) {
  const stateFile = resolveStateFile(cwd, env);
  if (!fs.existsSync(stateFile)) {
    return defaultState();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    return {
      ...defaultState(),
      ...parsed,
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : []
    };
  } catch {
    return defaultState();
  }
}

export function saveState(cwd, state, env = process.env) {
  ensureStateDir(cwd, env);
  const nextState = {
    version: 1,
    jobs: [...(state.jobs ?? [])]
      .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")))
      .slice(0, 50)
  };
  fs.writeFileSync(resolveStateFile(cwd, env), `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
  return nextState;
}

export function upsertJob(cwd, patch, env = process.env) {
  const state = loadState(cwd, env);
  const timestamp = nowIso();
  const existingIndex = state.jobs.findIndex((job) => job.id === patch.id);
  if (existingIndex === -1) {
    state.jobs.unshift({
      createdAt: timestamp,
      updatedAt: timestamp,
      ...patch
    });
  } else {
    state.jobs[existingIndex] = {
      ...state.jobs[existingIndex],
      ...patch,
      updatedAt: timestamp
    };
  }
  return saveState(cwd, state, env);
}

export function listJobs(cwd = process.cwd(), env = process.env) {
  return [...loadState(cwd, env).jobs].sort((left, right) =>
    String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""))
  );
}

export function resolveJobPaths(cwd, jobId, env = process.env) {
  const jobsDir = resolveJobsDir(cwd, env);
  return {
    jobFile: path.join(jobsDir, `${jobId}.json`),
    logFile: path.join(jobsDir, `${jobId}.log`),
    promptFile: path.join(jobsDir, `${jobId}.prompt.md`),
    resultFile: path.join(jobsDir, `${jobId}.result.md`)
  };
}

export function writeJobPayload(cwd, payload, env = process.env) {
  ensureStateDir(cwd, env);
  fs.writeFileSync(payload.jobFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload.jobFile;
}

export function readJobPayload(jobFile) {
  return JSON.parse(fs.readFileSync(jobFile, "utf8"));
}

export function createJob(cwd, options, env = process.env) {
  const id = generateJobId(options.kind ?? "agy");
  const paths = resolveJobPaths(cwd, id, env);
  const prompt = String(options.prompt ?? "");
  fs.mkdirSync(path.dirname(paths.jobFile), { recursive: true });
  fs.writeFileSync(paths.promptFile, prompt, "utf8");

  const payload = {
    id,
    kind: options.kind ?? "task",
    cwd: path.resolve(cwd),
    status: "queued",
    promptFile: paths.promptFile,
    logFile: paths.logFile,
    resultFile: paths.resultFile,
    jobFile: paths.jobFile,
    runOptions: {
      prompt,
      addDirs: options.addDirs ?? [path.resolve(cwd)],
      logFile: paths.logFile,
      printTimeout: options.printTimeout ?? DEFAULT_PRINT_TIMEOUT,
      sandbox: options.sandbox ?? true,
      dangerouslySkipPermissions: Boolean(options.dangerouslySkipPermissions),
      continueLast: Boolean(options.continueLast),
      conversation: options.conversation ?? null
    }
  };

  writeJobPayload(cwd, payload, env);
  upsertJob(cwd, {
    id,
    kind: payload.kind,
    status: payload.status,
    cwd: payload.cwd,
    jobFile: payload.jobFile,
    logFile: payload.logFile,
    resultFile: payload.resultFile,
    promptFile: payload.promptFile
  }, env);
  return payload;
}

export function findJob(cwd, reference = null, env = process.env) {
  const jobs = listJobs(cwd, env);
  if (!reference) {
    return jobs[0] ?? null;
  }
  const exact = jobs.find((job) => job.id === reference);
  if (exact) {
    return exact;
  }
  const matches = jobs.filter((job) => job.id.startsWith(reference));
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    throw new Error(`Job reference "${reference}" is ambiguous.`);
  }
  return null;
}

export function analyzeAgyHelpResult(result) {
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const supports = {
    print: output.includes("--print"),
    sandbox: output.includes("--sandbox"),
    addDir: output.includes("--add-dir"),
    printTimeout: output.includes("--print-timeout"),
    continue: output.includes("--continue"),
    conversation: output.includes("--conversation")
  };
  return {
    available: result.status === 0 && supports.print,
    status: result.status,
    error: result.error?.message ?? null,
    help: output,
    supports
  };
}

function parseVersion(value) {
  const match = String(value ?? "").match(/\b(\d+)\.(\d+)\.(\d+)\b/);
  return match ? match.slice(1, 4).map(Number) : null;
}

function versionAtLeast(version, minimum) {
  const actual = parseVersion(version);
  const required = parseVersion(minimum);
  if (!actual || !required) {
    return false;
  }
  for (let index = 0; index < required.length; index += 1) {
    if (actual[index] !== required[index]) {
      return actual[index] > required[index];
    }
  }
  return true;
}

export function agyAvailable(cwd = process.cwd(), env = process.env) {
  const helpResult = spawnSync("agy", ["--help"], {
    cwd,
    env,
    encoding: "utf8"
  });
  const versionResult = spawnSync("agy", ["--version"], {
    cwd,
    env,
    encoding: "utf8"
  });
  const versionOutput = `${versionResult.stdout ?? ""}${versionResult.stderr ?? ""}`;
  const versionMatch = versionOutput.match(/\b\d+\.\d+\.\d+\b/);
  const version = versionMatch?.[0] ?? null;
  return {
    ...analyzeAgyHelpResult(helpResult),
    version,
    minimumVersion: MIN_AGY_VERSION,
    versionSupported: versionAtLeast(version, MIN_AGY_VERSION)
  };
}

export async function runPrintSmoke(cwd = process.cwd(), env = process.env, options = {}) {
  const startedAt = Date.now();
  const timeout = String(options.timeout ?? "30s").trim();
  const agy = options.agy ?? agyAvailable(cwd, env);
  const unavailableReason = !agy.available || !agy.supports.print
    ? "agy print mode is unavailable"
    : agy.versionSupported === false
      ? `agy ${agy.minimumVersion ?? MIN_AGY_VERSION} or newer is required`
      : !agy.supports.sandbox
        ? "agy sandbox mode is unavailable"
        : null;
  if (unavailableReason) {
    return {
      ok: false,
      skipped: true,
      reason: unavailableReason,
      timeout,
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      durationMs: 0
    };
  }

  const argv = buildAgyArgv({
    prompt: PRINT_SMOKE_PROMPT,
    printTimeout: timeout,
    sandbox: Boolean(agy.supports.sandbox)
  }, agy.supports.printTimeout);
  const hardTimeoutMs = goDurationToMilliseconds(timeout) + wrapperTimeoutGraceMs(env);

  return new Promise((resolve) => {
    const child = spawn("agy", argv, {
      cwd,
      env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let forceKillTimer = null;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      stderr += `agy smoke timed out after ${timeout}\n`;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, FORCE_KILL_GRACE_MS);
      forceKillTimer.unref();
    }, hardTimeoutMs);
    timeoutTimer.unref();

    function finish(patch = {}) {
      settled = true;
      clearTimeout(timeoutTimer);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      const durationMs = Date.now() - startedAt;
      resolve({
        ok: false,
        skipped: false,
        timeout,
        stdout,
        stderr,
        exitCode: null,
        signal: null,
        timedOut,
        durationMs,
        ...patch
      });
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      stderr += `agy smoke failed to start: ${error.message}\n`;
      finish({ error: error.message });
    });

    child.on("close", (exitCode, signal) => {
      if (settled) {
        return;
      }
      finish({
        ok: !timedOut && exitCode === 0 && stdout.includes(PRINT_SMOKE_SENTINEL),
        exitCode,
        signal
      });
    });

    if (child.stdin) {
      child.stdin.end(PRINT_SMOKE_PROMPT, "utf8");
    }
  });
}

export async function runJobFile(jobFile, env = process.env) {
  const payload = readJobPayload(jobFile);
  const cwd = payload.cwd;
  const startedAt = nowIso();

  upsertJob(cwd, {
    id: payload.id,
    status: "running",
    startedAt,
    pid: process.pid
  }, env);

  const agy = agyAvailable(cwd, env);
  const unavailableReason = !agy.available
    ? "agy print mode is unavailable"
    : !agy.versionSupported
      ? `agy ${agy.minimumVersion} or newer is required`
      : null;
  if (unavailableReason) {
    const endedAt = nowIso();
    const message = `${unavailableReason}\n`;
    fs.appendFileSync(payload.logFile, message, "utf8");
    fs.writeFileSync(payload.resultFile, message, "utf8");
    upsertJob(cwd, {
      id: payload.id,
      status: "failed",
      error: unavailableReason,
      endedAt
    }, env);
    return {
      status: "failed",
      stdout: "",
      stderr: message,
      exitCode: null,
      signal: null
    };
  }
  const argv = buildAgyArgv(payload.runOptions, agy.supports.printTimeout);
  await fs.promises.appendFile(payload.logFile, `$ agy ${argv.map((arg) => JSON.stringify(arg)).join(" ")}\n`, "utf8");

  return new Promise((resolve) => {
    const child = spawn("agy", argv, {
      cwd,
      env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });

    upsertJob(cwd, {
      id: payload.id,
      childPid: child.pid
    }, env);

    let stdout = "";
    let stderr = "";
    let stdinError = null;
    let timedOut = false;
    let settled = false;
    let forceKillTimer = null;
    const timeoutMs = goDurationToMilliseconds(payload.runOptions.printTimeout) + wrapperTimeoutGraceMs(env);
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      const message = `agy timed out after ${payload.runOptions.printTimeout}\n`;
      stderr += message;
      fs.appendFileSync(payload.logFile, message, "utf8");
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, FORCE_KILL_GRACE_MS);
      forceKillTimer.unref();
    }, timeoutMs);
    timeoutTimer.unref();

    function clearProcessTimers() {
      settled = true;
      clearTimeout(timeoutTimer);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
    }

    function recordStdinError(error) {
      if (stdinError) {
        return;
      }
      stdinError = error;
      const message = `agy stdin write failed: ${error.message}\n`;
      stderr += message;
      fs.appendFileSync(payload.logFile, message, "utf8");
      if (!settled) {
        child.kill("SIGTERM");
      }
    }

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      fs.appendFileSync(payload.logFile, text, "utf8");
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      fs.appendFileSync(payload.logFile, text, "utf8");
    });

    if (child.stdin) {
      child.stdin.on("error", recordStdinError);
      try {
        child.stdin.end(payload.runOptions.prompt ?? "", "utf8");
      } catch (error) {
        recordStdinError(error);
      }
    }

    child.on("error", (error) => {
      clearProcessTimers();
      const endedAt = nowIso();
      fs.writeFileSync(payload.resultFile, `agy failed to start: ${error.message}\n`, "utf8");
      upsertJob(cwd, {
        id: payload.id,
        status: "failed",
        error: error.message,
        endedAt
      }, env);
      resolve({ status: "failed", stdout, stderr, error });
    });

    child.on("close", (exitCode, signal) => {
      if (settled) {
        return;
      }
      clearProcessTimers();
      const endedAt = nowIso();
      const resultText = [stdout, stderr].filter(Boolean).join(stdout && stderr ? "\n" : "");
      const hasCapturedStdout = stdout.trim().length > 0;
      const status = timedOut && hasCapturedStdout
        ? "partial"
        : timedOut || stdinError
          ? "failed"
          : exitCode === 0 ? "succeeded" : "failed";
      fs.writeFileSync(payload.resultFile, resultText, "utf8");
      upsertJob(cwd, {
        id: payload.id,
        status,
        exitCode,
        signal,
        error: timedOut
          ? `agy timed out after ${payload.runOptions.printTimeout}`
          : stdinError
            ? `agy stdin write failed: ${stdinError.message}`
            : undefined,
        endedAt
      }, env);
      resolve({ status, stdout, stderr, exitCode, signal });
    });
  });
}

export function startBackgroundWorker(cwd, jobFile, workerFile, env = process.env) {
  const child = spawn(process.execPath, [workerFile, jobFile], {
    cwd,
    env,
    detached: true,
    stdio: "ignore",
    shell: false
  });
  child.unref();
  return child.pid;
}

export function cancelJob(cwd, job, env = process.env) {
  if (!job || !["queued", "running"].includes(job.status)) {
    return false;
  }

  const targetPid = job.childPid ?? job.pid;
  if (!targetPid) {
    upsertJob(cwd, { id: job.id, status: "cancelled", endedAt: nowIso() }, env);
    return true;
  }

  try {
    process.kill(-targetPid, "SIGTERM");
  } catch {
    try {
      process.kill(targetPid, "SIGTERM");
    } catch {
      // The process may have already exited. Still mark the job as cancelled
      // because the user explicitly requested cancellation.
    }
  }

  upsertJob(cwd, { id: job.id, status: "cancelled", endedAt: nowIso() }, env);
  return true;
}
