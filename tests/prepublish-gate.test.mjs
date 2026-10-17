import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runPrePublishGate } from "../scripts/check-agent-plugins.mjs";
import { AGENT_PLUGIN_SCHEMA_URL, AGENT_PLUGIN_MCP_SCHEMA_URL } from "../plugins/agy/scripts/lib/agent-plugin-validator.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("pre-publish gate runs successfully on repository root", () => {
  const result = runPrePublishGate(ROOT, { quiet: true });
  assert.equal(result.success, true, `Pre-publish gate failed: ${result.errors.join("; ")}`);
  assert.equal(result.errors.length, 0);
  assert.ok(result.pluginCount >= 3);
});

test("scripts/check-agent-plugins.mjs CLI executes with exit code 0", () => {
  const scriptPath = path.join(ROOT, "scripts", "check-agent-plugins.mjs");
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: ROOT,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, `CLI failed with error:\n${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /PRE-PUBLISH GATE PASSED/);
  assert.match(result.stdout, /agent-plugins\.org v1\.0\.0/);
});

test("package.json scripts define check:spec and prepublishOnly hooks", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

  assert.ok(pkg.scripts["check:spec"]);
  assert.match(pkg.scripts["check:spec"], /check-agent-plugins\.mjs/);

  assert.ok(pkg.scripts["prepublishOnly"]);
  assert.match(pkg.scripts["prepublishOnly"], /check-agent-plugins\.mjs|check:spec/);

  assert.ok(pkg.scripts["validate"]);
  assert.match(pkg.scripts["validate"], /check-agent-plugins\.mjs|check:spec/);
});

test("pre-publish gate rejects temporary broken repository fixtures", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prepublish-test-"));

  // 1. Missing package.json
  const res1 = runPrePublishGate(tmpDir, { quiet: true });
  assert.equal(res1.success, false);
  assert.ok(res1.errors.some((e) => e.includes("Missing root package.json")));

  // 2. Add package.json and broken plugin missing $schema
  fs.writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name: "fixture-repo", version: "1.0.0", license: "MIT" }),
    "utf8"
  );
  const pluginsDir = path.join(tmpDir, "plugins", "broken-plugin");
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginsDir, "plugin.json"),
    JSON.stringify({
      name: "broken-plugin",
      version: "1.0.0",
      description: "Missing schema",
      skills: "./skills/",
      mcpServers: "./mcp.json"
    }),
    "utf8"
  );

  const res2 = runPrePublishGate(tmpDir, { quiet: true });
  assert.equal(res2.success, false);
  assert.ok(res2.errors.some((e) => e.includes("'$schema' field is required")));

  // 3. Fix $schema in plugin.json but break mcp.json
  fs.writeFileSync(
    path.join(pluginsDir, "plugin.json"),
    JSON.stringify({
      $schema: AGENT_PLUGIN_SCHEMA_URL,
      name: "broken-plugin",
      version: "1.0.0",
      description: "Has valid schema",
      skills: "./skills/",
      mcpServers: "./mcp.json"
    }),
    "utf8"
  );
  const skillsDir = path.join(pluginsDir, "skills", "s1");
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillsDir, "SKILL.md"),
    `---\nname: s1\ndescription: Skill one\n---\nContent`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(pluginsDir, "mcp.json"),
    JSON.stringify({
      mcpServers: {
        server1: { command: "node" }
      }
    }),
    "utf8"
  );

  const res3 = runPrePublishGate(tmpDir, { quiet: true });
  assert.equal(res3.success, false);
  assert.ok(res3.errors.some((e) => e.includes("'$schema' field is required")));

  // 4. Fully compliant plugin in fixture
  fs.writeFileSync(
    path.join(pluginsDir, "mcp.json"),
    JSON.stringify({
      $schema: AGENT_PLUGIN_MCP_SCHEMA_URL,
      mcpServers: {
        server1: { command: "node" }
      }
    }),
    "utf8"
  );

  const res4 = runPrePublishGate(tmpDir, { quiet: true });
  assert.equal(res4.success, true);
  assert.equal(res4.errors.length, 0);
});
