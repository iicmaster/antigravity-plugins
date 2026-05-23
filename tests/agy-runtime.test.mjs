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

function writeFakeAgy(binDir, script) {
  fs.mkdirSync(binDir, { recursive: true });
  const fakeAgy = path.join(binDir, "agy");
  fs.writeFileSync(fakeAgy, script, "utf8");
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

test("buildAgyArgv emits only flags; the prompt is piped via stdin", () => {
  const prompt = 'review this"; rm -rf / #';
  const argv = buildAgyArgv({
    prompt,
    addDirs: [ROOT],
    logFile: "/tmp/agy.log",
    printTimeout: "10m0s",
    sandbox: true
  });

  // agy --print reads the prompt from stdin and drops trailing positional
  // arguments. Including the prompt in argv would also leak it to the OS
  // process list, so it is intentionally absent here.
  assert.deepEqual(argv, [
    "--print",
    "--print-timeout",
    "10m0s",
    "--log-file",
    "/tmp/agy.log",
    "--sandbox",
    "--add-dir",
    ROOT
  ]);
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

  const env = fakeAgyEnv(cwd, binDir);
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

test("runJobFile pipes the prompt through stdin without leaking it to argv or command logs", async () => {
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

  assert.equal(result.status, "succeeded");
  assert.equal(output.stdin, prompt);
  assert.ok(!output.argv.includes(prompt));
  assert.ok(!log.includes(prompt));
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

test("git review context includes bounded untracked file contents", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-git-context-"));
  spawnSync("git", ["init"], { cwd, encoding: "utf8" });
  fs.writeFileSync(path.join(cwd, "new-feature.js"), "export const value = 42;\n", "utf8");

  const context = collectGitReviewContext(cwd);

  assert.match(context.content, /## untracked file contents/);
  assert.match(context.content, /### new-feature\.js/);
  assert.match(context.content, /export const value = 42;/);
});
