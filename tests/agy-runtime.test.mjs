import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  analyzeAgyHelpResult,
  buildAgyArgv,
  createJob,
  goDurationToMilliseconds,
  normalizeRunOptions,
  runJobFile,
  resolveStateDir
} from "../plugins/agy/scripts/lib/agy-runtime.mjs";
import { collectGitReviewContext } from "../plugins/agy/scripts/lib/git-context.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPANION = path.join(ROOT, "plugins", "agy", "scripts", "agy-companion.mjs");

function writeFakeAgy(binDir, script, version = "1.1.1") {
  fs.mkdirSync(binDir, { recursive: true });
  const fakeAgy = path.join(binDir, "agy");
  const source = script.replace(
    "#!/usr/bin/env node\n",
    `#!/usr/bin/env node\nif (process.argv.includes("--version")) {\n  console.log(${JSON.stringify(version)});\n  process.exit(0);\n}\n`
  );
  fs.writeFileSync(fakeAgy, source, "utf8");
  fs.chmodSync(fakeAgy, 0o755);
  return fakeAgy;
}

function fakeAgyEnv(cwd, binDir) {
  return {
    ...process.env,
    CLAUDE_PLUGIN_DATA: path.join(cwd, "plugin-data"),
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`
  };
}

test("buildAgyArgv emits only non-prompt flags for implicit stdin print mode", () => {
  const prompt = 'review this"; rm -rf / #';
  const argv = buildAgyArgv({
    prompt,
    addDirs: [ROOT],
    logFile: "/tmp/agy.log",
    printTimeout: "10m0s",
    sandbox: true
  });

  // AGY 1.1.1 auto-enters non-interactive print mode when stdin is piped and
  // no --print flag is present. A bare --print would consume the next flag as
  // its required prompt value.
  assert.deepEqual(argv, [
    "--print-timeout",
    "10m0s",
    "--log-file",
    "/tmp/agy.log",
    "--sandbox",
    "--add-dir",
    ROOT
  ]);
  assert.ok(!argv.includes("--print"));
  assert.ok(!argv.some((value) => value.startsWith("--print=")));
  assert.ok(!argv.includes(prompt));
});

test("dangerous permission bypass is explicit and never enabled by default", () => {
  assert.ok(!buildAgyArgv({ prompt: "x" }).includes("--dangerously-skip-permissions"));
  assert.ok(
    buildAgyArgv({ prompt: "x", dangerouslySkipPermissions: true }).includes(
      "--dangerously-skip-permissions"
    )
  );
});

test("normalizeRunOptions rejects invalid user-controlled values", () => {
  assert.throws(() => normalizeRunOptions({ prompt: "" }), /prompt is required/i);
  assert.throws(() => normalizeRunOptions({ prompt: "x", printTimeout: "../bad" }), /print-timeout/i);
  assert.throws(() => normalizeRunOptions({ prompt: "x", addDirs: ["relative"] }), /absolute/i);
});

test("state dir prefers CLAUDE_PLUGIN_DATA and falls back outside the workspace", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-runtime-"));
  const pluginData = path.join(cwd, "plugin-data");

  assert.equal(resolveStateDir(cwd, { CLAUDE_PLUGIN_DATA: pluginData }), path.join(pluginData, "state"));
  assert.ok(resolveStateDir(cwd, {}).startsWith(path.join(os.tmpdir(), "agy-companion")));
});

test("buildAgyArgv conditionally omits --print-timeout when not supported", () => {
  const argv = buildAgyArgv({ prompt: "x" }, false);
  assert.ok(!argv.includes("--print-timeout"));
});

test("analyzeAgyHelpResult treats sandbox EPERM with valid help output as available", () => {
  const report = analyzeAgyHelpResult({
    status: 0,
    error: new Error("spawnSync agy EPERM"),
    stdout: "",
    stderr: "--print --sandbox --add-dir --print-timeout --continue --conversation"
  });

  assert.equal(report.available, true);
  assert.equal(report.error, "spawnSync agy EPERM");
  assert.equal(report.supports.print, true);
});

test("goDurationToMilliseconds parses bounded Go-style durations", () => {
  assert.equal(goDurationToMilliseconds("100ms"), 100);
  assert.equal(goDurationToMilliseconds("1.5s"), 1500);
  assert.equal(goDurationToMilliseconds("10m0s"), 600000);
  assert.equal(goDurationToMilliseconds("1h30m"), 5400000);
});

test("runJobFile enforces print-timeout as a hard wrapper timeout", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-timeout-"));
  const binDir = path.join(cwd, "bin");
  writeFakeAgy(
    binDir,
    `#!/usr/bin/env node
if (process.argv.includes("--help")) {
  console.log("--print --print-timeout --sandbox --add-dir --continue --conversation");
  process.exit(0);
}
setTimeout(() => process.stdout.write("late output"), 1000);
`,
  );

  const env = {
    ...fakeAgyEnv(cwd, binDir),
    AGY_COMPANION_WRAPPER_TIMEOUT_GRACE_MS: "10"
  };
  const payload = createJob(cwd, {
    kind: "rescue",
    prompt: "x",
    addDirs: [cwd],
    printTimeout: "100ms",
    sandbox: true
  }, env);

  const result = await runJobFile(payload.jobFile, env);

  assert.equal(result.status, "failed");
  assert.match(fs.readFileSync(payload.resultFile, "utf8"), /timed out after 100ms/i);
});

test("runJobFile gives agy print-timeout a grace window before wrapper hard-kill", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-timeout-grace-"));
  const binDir = path.join(cwd, "bin");
  writeFakeAgy(
    binDir,
    `#!/usr/bin/env node
if (process.argv.includes("--help")) {
  console.log("--print --print-timeout --sandbox --add-dir --continue --conversation");
  process.exit(0);
}
process.stdin.resume();
process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  setTimeout(() => {
    process.stderr.write("Error: timed out waiting for response\\n");
    process.exit(1);
  }, 350);
});
`
  );

  const env = {
    ...fakeAgyEnv(cwd, binDir),
    AGY_COMPANION_WRAPPER_TIMEOUT_GRACE_MS: "500"
  };
  const payload = createJob(cwd, {
    kind: "rescue",
    prompt: "x",
    addDirs: [cwd],
    printTimeout: "300ms",
    sandbox: true
  }, env);

  const result = await runJobFile(payload.jobFile, env);

  assert.equal(result.status, "failed");
  assert.equal(result.exitCode, 1);
  assert.equal(result.signal, null);
  assert.match(result.stderr, /timed out waiting for response/i);
  assert.doesNotMatch(fs.readFileSync(payload.resultFile, "utf8"), /agy timed out after 300ms/i);
});

test("runJobFile marks timed-out jobs with captured stdout as partial", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-partial-timeout-"));
  const binDir = path.join(cwd, "bin");
  writeFakeAgy(
    binDir,
    `#!/usr/bin/env node
if (process.argv.includes("--help")) {
  console.log("--print --print-timeout --sandbox --add-dir --continue --conversation");
  process.exit(0);
}
process.stdout.write("partial answer\\n");
setTimeout(() => {}, 1000);
`
  );

  const env = {
    ...fakeAgyEnv(cwd, binDir),
    AGY_COMPANION_WRAPPER_TIMEOUT_GRACE_MS: "50"
  };
  const payload = createJob(cwd, {
    kind: "rescue",
    prompt: "x",
    addDirs: [cwd],
    printTimeout: "300ms",
    sandbox: true
  }, env);

  const result = await runJobFile(payload.jobFile, env);
  const resultText = fs.readFileSync(payload.resultFile, "utf8");

  assert.equal(result.status, "partial");
  assert.match(resultText, /partial answer/);
  assert.match(resultText, /agy timed out after 300ms/i);
});

test("setup smoke verifies print mode beyond help flags", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-setup-smoke-"));
  const binDir = path.join(cwd, "bin");
  writeFakeAgy(
    binDir,
    `#!/usr/bin/env node
if (process.argv.includes("--help")) {
  console.log("--print --print-timeout --sandbox --add-dir --continue --conversation");
  process.exit(0);
}
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdin += chunk;
});
process.stdin.on("end", () => {
  process.stdout.write(stdin.includes("AGY_SMOKE_OK") ? "AGY_SMOKE_OK\\n" : "unexpected\\n");
});
`
  );

  const result = spawnSync(process.execPath, [COMPANION, "setup", "--json", "--smoke", "--timeout", "50ms"], {
    cwd,
    env: fakeAgyEnv(cwd, binDir),
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ready, true);
  assert.equal(report.smoke.ok, true);
  assert.equal(report.smoke.timeout, "50ms");
  assert.match(report.smoke.stdout, /AGY_SMOKE_OK/);
});

test("setup fails closed when required AGY capabilities are missing", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-setup-degraded-"));
  const binDir = path.join(cwd, "bin");
  writeFakeAgy(
    binDir,
    `#!/usr/bin/env node
if (process.argv.includes("--help")) {
  console.log("--print");
  process.exit(0);
}
process.stdin.resume();
process.stdin.on("end", () => process.stdout.write("AGY_SMOKE_OK\\n"));
`
  );

  const result = spawnSync(
    process.execPath,
    [COMPANION, "setup", "--json", "--smoke", "--timeout", "50ms"],
    {
      cwd,
      env: fakeAgyEnv(cwd, binDir),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ready, false);
  assert.ok(report.missingFeatures.includes("sandbox"));
  assert.ok(report.missingFeatures.includes("addDir"));
  assert.ok(report.missingFeatures.includes("printTimeout"));
  assert.equal(report.smoke.ok, false);
  assert.equal(report.smoke.skipped, true);
  assert.match(report.smoke.reason, /sandbox mode is unavailable/i);
});

test("setup rejects AGY versions older than the implicit stdin baseline", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-setup-version-"));
  const binDir = path.join(cwd, "bin");
  writeFakeAgy(
    binDir,
    `#!/usr/bin/env node
if (process.argv.includes("--help")) {
  console.log("--print --print-timeout --sandbox --add-dir --continue --conversation");
  process.exit(0);
}
`,
    "1.1.0"
  );

  const result = spawnSync(
    process.execPath,
    [COMPANION, "setup", "--json", "--smoke", "--timeout", "50ms"],
    {
      cwd,
      env: fakeAgyEnv(cwd, binDir),
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ready, false);
  assert.equal(report.agy.version, "1.1.0");
  assert.equal(report.agy.minimumVersion, "1.1.1");
  assert.equal(report.agy.versionSupported, false);
  assert.ok(report.missingFeatures.includes("version>=1.1.1"));
  assert.equal(report.smoke.skipped, true);
  assert.match(report.smoke.reason, /agy 1\.1\.1 or newer is required/i);
});

test("runJobFile refuses unsupported AGY versions before launching a prompt", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-job-version-"));
  const binDir = path.join(cwd, "bin");
  const marker = path.join(cwd, "prompt-launched");
  writeFakeAgy(
    binDir,
    `#!/usr/bin/env node
import fs from "node:fs";
if (process.argv.includes("--help")) {
  console.log("--print --print-timeout --sandbox --add-dir --continue --conversation");
  process.exit(0);
}
fs.writeFileSync(${JSON.stringify(marker)}, "launched");
`,
    "1.1.0"
  );

  const env = fakeAgyEnv(cwd, binDir);
  const payload = createJob(cwd, {
    kind: "rescue",
    prompt: "inspect safely",
    addDirs: [cwd],
    printTimeout: "5s",
    sandbox: true
  }, env);

  const result = await runJobFile(payload.jobFile, env);

  assert.equal(result.status, "failed");
  assert.match(result.stderr, /agy 1\.1\.1 or newer is required/i);
  assert.ok(!fs.existsSync(marker));
});

test("runJobFile pipes the prompt through stdin without command-line leakage", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-stdin-"));
  const binDir = path.join(cwd, "bin");
  writeFakeAgy(
    binDir,
    `#!/usr/bin/env node
if (process.argv.includes("--help")) {
  console.log("--print --print-timeout --sandbox --add-dir --continue --conversation");
  process.exit(0);
}
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdin += chunk;
});
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), stdin }));
});
`
  );

  const env = fakeAgyEnv(cwd, binDir);
  const prompt = 'review this"; keep me off argv';
  const payload = createJob(cwd, {
    kind: "rescue",
    prompt,
    addDirs: [cwd],
    printTimeout: "5s",
    sandbox: true
  }, env);

  const result = await runJobFile(payload.jobFile, env);
  const output = JSON.parse(result.stdout);
  const log = fs.readFileSync(payload.logFile, "utf8");
  const commandLine = log.split("\n", 1)[0];

  assert.equal(result.status, "succeeded");
  assert.equal(output.stdin, prompt);
  assert.ok(!output.argv.includes(prompt));
  assert.ok(!output.argv.includes("--print"));
  assert.ok(!commandLine.includes("keep me off argv"));
});

test("runJobFile survives stdin EPIPE when agy exits before draining a large prompt", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-epipe-"));
  const binDir = path.join(cwd, "bin");
  writeFakeAgy(
    binDir,
    `#!/usr/bin/env node
if (process.argv.includes("--help")) {
  console.log("--print --print-timeout --sandbox --add-dir --continue --conversation");
  process.exit(0);
}
process.exit(0);
`
  );

  const helper = path.join(cwd, "run-helper.mjs");
  fs.writeFileSync(
    helper,
    `import { createJob, runJobFile } from ${JSON.stringify(path.join(ROOT, "plugins/agy/scripts/lib/agy-runtime.mjs"))};
import fs from "node:fs";
import path from "node:path";

const cwd = ${JSON.stringify(cwd)};
const env = {
  ...process.env,
  CLAUDE_PLUGIN_DATA: path.join(cwd, "plugin-data"),
  PATH: ${JSON.stringify(binDir)} + path.delimiter + process.env.PATH
};
const payload = createJob(cwd, {
  kind: "rescue",
  prompt: "x".repeat(16 * 1024 * 1024),
  addDirs: [cwd],
  printTimeout: "5s",
  sandbox: true
}, env);
const result = await runJobFile(payload.jobFile, env);
await new Promise((resolve) => setTimeout(resolve, 100));
if (result.status !== "failed") {
  throw new Error("expected stdin write failure to fail the job");
}
const resultText = fs.readFileSync(payload.resultFile, "utf8");
if (!/stdin write failed/i.test(resultText)) {
  throw new Error("expected result file to mention stdin write failure");
}
`,
    "utf8"
  );

  const result = spawnSync(process.execPath, [helper], {
    cwd,
    env: fakeAgyEnv(cwd, binDir),
    encoding: "utf8"
  });

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
});

test("runJobFile fails jobs whose only output is the headless permission auto-denial banner", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-denied-"));
  const binDir = path.join(cwd, "bin");
  writeFakeAgy(
    binDir,
    `#!/usr/bin/env node
if (process.argv.includes("--help")) {
  console.log("--print --print-timeout --sandbox --add-dir --continue --conversation");
  process.exit(0);
}
process.stdin.resume();
process.stdin.on("end", () => {
  // Real agy 1.1.x prints the denial banner on stderr and leaves stdout empty.
  console.error('jetski: no output produced — a tool required the "command" permission that headless mode cannot prompt for, so it was auto-denied.');
  process.exit(0);
});
`
  );

  const env = fakeAgyEnv(cwd, binDir);
  const payload = createJob(cwd, {
    kind: "rescue",
    prompt: "run git log",
    addDirs: [cwd],
    printTimeout: "5s",
    sandbox: true
  }, env);

  const result = await runJobFile(payload.jobFile, env);

  assert.equal(result.status, "failed");
});

test("companion defaults permission skipping only for sandboxed headless runs", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-perm-default-"));
  const binDir = path.join(cwd, "bin");
  writeFakeAgy(
    binDir,
    `#!/usr/bin/env node
if (process.argv.includes("--help")) {
  console.log("--print --print-timeout --sandbox --add-dir --continue --conversation");
  process.exit(0);
}
process.stdin.resume();
process.stdin.on("end", () => {
  console.log(JSON.stringify({ argv: process.argv.slice(2) }));
});
`
  );

  const env = fakeAgyEnv(cwd, binDir);
  const runRescue = (extra) => {
    const result = spawnSync(
      process.execPath,
      [COMPANION, "rescue", ...extra, "--timeout", "5s", "--", "inspect"],
      { cwd, env, encoding: "utf8" }
    );
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    return JSON.parse(result.stdout.match(/\{"argv":.*\}/)[0]).argv;
  };

  const sandboxed = runRescue([]);
  assert.ok(sandboxed.includes("--sandbox"));
  assert.equal(sandboxed.filter((arg) => arg === "--dangerously-skip-permissions").length, 1);

  const unsandboxed = runRescue(["--no-sandbox"]);
  assert.ok(!unsandboxed.includes("--sandbox"));
  assert.ok(!unsandboxed.includes("--dangerously-skip-permissions"));

  const explicit = runRescue(["--no-sandbox", "--dangerously-skip-permissions"]);
  assert.ok(explicit.includes("--dangerously-skip-permissions"));
});

test("git review context includes bounded untracked file contents", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-git-context-"));
  spawnSync("git", ["init"], { cwd, encoding: "utf8" });
  fs.writeFileSync(path.join(cwd, "new-feature.js"), "export const value = 42;\n", "utf8");

  const context = collectGitReviewContext(cwd);

  assert.match(context.content, /## untracked file contents/);
  assert.match(context.content, /### new-feature\.js/);
  assert.match(context.content, /export const value = 42;/);
});
