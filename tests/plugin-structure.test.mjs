import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ROOT = path.join(ROOT, "plugins", "agy");

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

test("marketplace metadata exposes the agy Claude Code plugin", () => {
  const marketplace = readJson(".claude-plugin/marketplace.json");
  const plugin = marketplace.plugins.find((entry) => entry.name === "agy");

  assert.equal(marketplace.name, "claude-code-agy");
  assert.equal(plugin.source, "./plugins/agy");
  assert.match(plugin.description, /Antigravity CLI|agy/i);
});

test("plugin metadata lives in the Claude plugin location", () => {
  const manifest = readJson("plugins/agy/.claude-plugin/plugin.json");

  assert.equal(manifest.name, "agy");
  assert.match(manifest.description, /Claude Code/i);
  assert.match(manifest.description, /Antigravity CLI|agy/i);
});

test("Codex marketplace exposes the agy plugin from the repo plugin path", () => {
  const marketplace = readJson(".agents/plugins/marketplace.json");
  const plugin = marketplace.plugins.find((entry) => entry.name === "agy");

  assert.equal(marketplace.name, "antigravity-plugins");
  assert.equal(plugin.source.source, "local");
  assert.equal(plugin.source.path, "./plugins/agy");
  assert.equal(plugin.policy.installation, "AVAILABLE");
  assert.equal(plugin.policy.authentication, "ON_INSTALL");
  assert.equal(plugin.category, "Coding");
});

test("Codex plugin manifest is present and points at shared skills", () => {
  const manifest = readJson("plugins/agy/.codex-plugin/plugin.json");

  assert.equal(manifest.name, "agy");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.match(manifest.description, /Codex/i);
  assert.match(manifest.description, /Antigravity CLI|agy/i);
  assert.equal(manifest.interface.displayName, "AGY");
  assert.ok(manifest.interface.capabilities.includes("Interactive"));
});

test("Codex MCP config uses the local AGY stdio server", () => {
  const mcp = readJson("plugins/agy/.mcp.json");

  assert.equal(mcp.mcpServers.agy.command, "bash");
  assert.equal(mcp.mcpServers.agy.args[0], "-lc");
  assert.match(mcp.mcpServers.agy.args[1], /CLAUDE_PLUGIN_ROOT/);
  assert.match(mcp.mcpServers.agy.args[1], /CODEX_PLUGIN_ROOT/);
  assert.doesNotMatch(mcp.mcpServers.agy.args[1], /\/home\/|iicmaster/);
  assert.match(mcp.mcpServers.agy.args[1], /\.codex\/plugins\/cache/);
  assert.match(mcp.mcpServers.agy.args[1], /plugins\/agy\/scripts\/agy-mcp-server\.mjs/);
  assert.match(mcp.mcpServers.agy.args[1], /agy-mcp-server\.mjs/);
});

test("package metadata is ready for public open-source release", () => {
  const manifest = readJson("package.json");

  assert.equal(manifest.private, false);
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.repository.url, "git+https://github.com/iicmaster/antigravity-plugins.git");
  assert.match(manifest.description, /open-source/i);
});

test("developer preview docs state local agy prerequisites and known session failure", () => {
  const readme = readText("README.md");

  assert.match(readme, /Developer Preview/i);
  assert.match(readme, /working local Antigravity CLI \(`agy`\)/i);
  assert.match(readme, /not a general-availability hosted product/i);
  assert.match(readme, /no active conversation/i);
});

test("developer preview docs identify implicit stdin print-mode transport limits", () => {
  const readme = readText("README.md");
  const architecture = readText("docs/architecture.md");
  const agents = readText("AGENTS.md");

  assert.match(readme, /setup --smoke/i);
  assert.match(readme, /without the `--print` flag/i);
  assert.match(architecture, /implicit non-interactive mode/i);
  assert.match(architecture, /not equivalent to Codex app-server/i);
  assert.match(agents, /without passing `--print`/i);
});

test("npm payload excludes repo guidance and local workflow state", () => {
  const npmIgnore = readText(".npmignore");

  assert.match(npmIgnore, /^AGENTS\.md$/m);
  assert.match(npmIgnore, /^_bmad\/$/m);
  assert.match(npmIgnore, /^\.omx\/$/m);
  assert.match(npmIgnore, /^plugin-data\/$/m);
  assert.match(npmIgnore, /^\.agy-state\/$/m);
  assert.doesNotMatch(npmIgnore, /^\.agents\/$/m);
});

test("npm payload excludes local Serena project state", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-pack-"));
  fs.writeFileSync(path.join(cwd, ".npmignore"), readText(".npmignore"), "utf8");
  fs.writeFileSync(
    path.join(cwd, "package.json"),
    JSON.stringify({ name: "agy-pack-fixture", version: "1.0.0" }),
    "utf8"
  );
  fs.writeFileSync(path.join(cwd, "included.txt"), "included\n", "utf8");
  fs.mkdirSync(path.join(cwd, ".serena"));
  fs.writeFileSync(path.join(cwd, ".serena", "project.yml"), "project_name: fixture\n", "utf8");

  const result = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const files = JSON.parse(result.stdout)[0].files.map((entry) => entry.path);
  assert.ok(files.includes("included.txt"));
  assert.ok(!files.some((file) => file === ".serena" || file.startsWith(".serena/")));
});

test("Claude commands route through the shared agy companion script", () => {
  const commands = [
    "setup",
    "review",
    "adversarial-review",
    "rescue",
    "status",
    "result",
    "cancel"
  ];

  for (const command of commands) {
    const source = readText(`plugins/agy/commands/${command}.md`);
    assert.match(source, /agy-companion\.mjs/, `${command} should use the companion runtime`);
    assert.doesNotMatch(source, /plugin\.json/, `${command} should not describe an agy-native plugin`);
  }
});

test("future agy-native plugin work is documented outside the current plugin", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "docs", "future-projects", "agy-native-plugin.md")));
  assert.ok(!fs.existsSync(path.join(PLUGIN_ROOT, "plugin.json")));
});

test("rescue prompt defaults to no file edits unless explicitly requested", () => {
  const rescuePrompt = readText("plugins/agy/prompts/rescue.md");
  assert.match(rescuePrompt, /Do not modify files unless the task explicitly asks for file changes/i);
});

test("Codex-facing skill routes through the local wrapper instead of Claude-only env vars", () => {
  const codexSkill = readText("plugins/agy/skills/agy/SKILL.md");
  const wrapper = readText("plugins/agy/skills/agy/scripts/agy-codex.mjs");

  assert.match(codexSkill, /agy-codex\.mjs/);
  assert.doesNotMatch(codexSkill, /CLAUDE_PLUGIN_ROOT/);
  assert.match(wrapper, /agy-companion\.mjs/);
  assert.match(wrapper, /shell:\s*false/);
});
