#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  agyAvailable,
  cancelJob,
  createJob,
  findJob,
  listJobs,
  readJobPayload,
  resolveStateDir,
  runJobFile,
  startBackgroundWorker,
  upsertJob
} from "./lib/agy-runtime.mjs";
import { collectGitReviewContext } from "./lib/git-context.mjs";
import { interpolate, loadPrompt } from "./lib/prompts.mjs";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const WORKER_FILE = path.join(ROOT_DIR, "scripts", "agy-worker.mjs");

function splitRawArgumentString(raw) {
  const result = [];
  let current = "";
  let quote = null;
  let escaping = false;

  for (const char of String(raw ?? "")) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        result.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) {
    result.push(current);
  }
  return result;
}

function normalizeArgv(argv) {
  if (argv.length === 1) {
    return splitRawArgumentString(argv[0]);
  }
  return argv;
}

function parseArgs(argv) {
  const tokens = normalizeArgv(argv);
  const options = {};
  const positionals = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    switch (token) {
      case "--json":
      case "--wait":
      case "--background":
      case "--no-sandbox":
      case "--dangerously-skip-permissions":
      case "--continue":
        options[token.slice(2)] = true;
        break;
      case "--base":
      case "--timeout":
      case "--conversation":
      case "--add-dir":
        if (tokens[index + 1] == null) {
          throw new Error(`${token} requires a value`);
        }
        if (token === "--add-dir") {
          options.addDir = [...(options.addDir ?? []), tokens[index + 1]];
        } else {
          options[token.slice(2)] = tokens[index + 1];
        }
        index += 1;
        break;
      default:
        positionals.push(token);
        break;
    }
  }

  return { options, text: positionals.join(" ").trim() };
}

function output(value, asJson = false) {
  if (asJson) {
    console.log(JSON.stringify(value, null, 2));
  } else {
    process.stdout.write(String(value));
  }
}

function renderSetup(report) {
  const lines = [
    `AGY ready: ${report.ready ? "yes" : "no"}`,
    `agy available: ${report.agy.available ? "yes" : "no"}`,
    `state dir: ${report.stateDir}`,
    ""
  ];
  if (report.missingFeatures.length > 0) {
    lines.push(`Missing expected flags: ${report.missingFeatures.join(", ")}`, "");
  }
  if (!report.ready) {
    lines.push("Next steps:");
    lines.push("- Install or authenticate Antigravity CLI, then rerun `/agy:setup`.");
    lines.push("- If print mode reports no active conversation, open or resume an AGY conversation once and retry.");
  }
  return `${lines.join("\n")}\n`;
}

async function handleSetup(argv) {
  const { options } = parseArgs(argv);
  const cwd = process.cwd();
  const agy = agyAvailable(cwd);
  const missingFeatures = Object.entries(agy.supports)
    .filter(([, supported]) => !supported)
    .map(([name]) => name);
  const report = {
    ready: agy.available && agy.supports.print,
    agy: {
      available: agy.available,
      status: agy.status,
      error: agy.error,
      supports: agy.supports
    },
    missingFeatures,
    stateDir: resolveStateDir(cwd)
  };
  output(options.json ? report : renderSetup(report), Boolean(options.json));
}

function buildReviewPrompt(kind, options, focusText) {
  const context = collectGitReviewContext(process.cwd(), { base: options.base });
  const templateName = kind === "adversarial-review" ? "adversarial-review" : "review";
  return interpolate(loadPrompt(ROOT_DIR, templateName), {
    TARGET_LABEL: context.targetLabel,
    USER_FOCUS: focusText || "No extra focus provided.",
    REVIEW_INPUT: context.content
  });
}

async function runPromptJob(kind, prompt, options) {
  const cwd = process.cwd();
  const addDirs = options.addDir?.length ? options.addDir : [cwd];
  const payload = createJob(cwd, {
    kind,
    prompt,
    addDirs,
    printTimeout: options.timeout ?? "10m0s",
    sandbox: !options["no-sandbox"],
    dangerouslySkipPermissions: Boolean(options["dangerously-skip-permissions"]),
    continueLast: Boolean(options.continue),
    conversation: options.conversation ?? null
  });

  if (options.background) {
    const pid = startBackgroundWorker(cwd, payload.jobFile, WORKER_FILE);
    upsertJob(cwd, { id: payload.id, pid });
    output(`AGY ${kind} started in the background.\nJob: ${payload.id}\nCheck /agy:status or /agy:result ${payload.id}\n`);
    return;
  }

  const result = await runJobFile(payload.jobFile);
  const statusLine = `\n\n[agy job ${payload.id}: ${result.status}${result.exitCode != null ? `, exit ${result.exitCode}` : ""}]\n`;
  output(`${result.stdout || result.stderr || ""}${statusLine}`);
}

async function handleReview(kind, argv) {
  const { options, text } = parseArgs(argv);
  const prompt = buildReviewPrompt(kind, options, text);
  await runPromptJob(kind, prompt, options);
}

async function handleRescue(argv) {
  const { options, text } = parseArgs(argv);
  if (!text) {
    throw new Error("rescue task is required");
  }
  const template = loadPrompt(ROOT_DIR, "rescue");
  const prompt = interpolate(template, {
    USER_TASK: text,
    WORKSPACE_CONTEXT: `cwd: ${process.cwd()}`
  });
  await runPromptJob("rescue", prompt, options);
}

function renderStatus(jobs) {
  if (jobs.length === 0) {
    return "No AGY jobs found.\n";
  }
  return `${jobs.map((job) => {
    const updated = job.updatedAt ?? job.createdAt ?? "";
    return `${job.id}  ${job.status}  ${job.kind ?? "job"}  ${updated}`;
  }).join("\n")}\n`;
}

async function handleStatus(argv) {
  const { options, text } = parseArgs(argv);
  const jobs = text ? [findJob(process.cwd(), text)].filter(Boolean) : listJobs(process.cwd());
  output(options.json ? jobs : renderStatus(jobs), Boolean(options.json));
}

async function handleResult(argv) {
  const { options, text } = parseArgs(argv);
  const job = findJob(process.cwd(), text);
  if (!job) {
    throw new Error("No matching AGY job found.");
  }
  const payload = fs.existsSync(job.jobFile) ? readJobPayload(job.jobFile) : job;
  const resultFile = payload.resultFile ?? job.resultFile;
  const result = resultFile && fs.existsSync(resultFile) ? fs.readFileSync(resultFile, "utf8") : "";
  output(options.json ? { job, result } : result || `AGY job ${job.id} has no captured result yet.\n`, Boolean(options.json));
}

async function handleCancel(argv) {
  const { options, text } = parseArgs(argv);
  const job = findJob(process.cwd(), text);
  if (!job) {
    throw new Error("No matching AGY job found.");
  }
  const cancelled = cancelJob(process.cwd(), job);
  output(options.json ? { id: job.id, cancelled } : `AGY job ${job.id}: ${cancelled ? "cancelled" : "not running"}\n`, Boolean(options.json));
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  switch (command) {
    case "setup":
      await handleSetup(argv);
      break;
    case "review":
      await handleReview("review", argv);
      break;
    case "adversarial-review":
      await handleReview("adversarial-review", argv);
      break;
    case "rescue":
      await handleRescue(argv);
      break;
    case "status":
      await handleStatus(argv);
      break;
    case "result":
      await handleResult(argv);
      break;
    case "cancel":
      await handleCancel(argv);
      break;
    default:
      throw new Error("Usage: agy-companion.mjs <setup|review|adversarial-review|rescue|status|result|cancel> [args]");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
