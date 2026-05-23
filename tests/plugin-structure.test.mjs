import assert from "node:assert/strict";
import fs from "node:fs";
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
