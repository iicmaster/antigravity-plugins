import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseSkillFrontmatter,
  validateAgentPlugin,
  validateAllAgentPlugins,
  AGENT_PLUGIN_SCHEMA_URL,
  AGENT_PLUGIN_MCP_SCHEMA_URL
} from "../plugins/agy/scripts/lib/agent-plugin-validator.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE_PLUGIN_DIR = path.join(ROOT, "plugins", "sample-agent-plugin");

function createTempDir(prefix = "agent-plugin-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("validates canonical reference sample Agent Plugin package successfully", () => {
  const result = validateAgentPlugin(SAMPLE_PLUGIN_DIR);

  assert.equal(result.valid, true, `Validation failed with errors: ${result.errors.join("; ")}`);
  assert.equal(result.errors.length, 0);

  // Verify details structure
  assert.equal(result.details.plugin.name, "sample-agent-plugin");
  assert.equal(result.details.plugin.$schema, AGENT_PLUGIN_SCHEMA_URL);
  assert.equal(result.details.plugin.version, "1.0.0");
  assert.equal(result.details.plugin.skills, "./skills/");
  assert.equal(result.details.plugin.mcpServers, "./mcp.json");

  // Verify skills detection
  assert.equal(result.details.skills.length, 1);
  assert.equal(result.details.skills[0].name, "sample-skill");
  assert.equal(result.details.skills[0].attributes.name, "sample-skill");
  assert.equal(result.details.skills[0].hasBody, true);

  // Verify MCP servers (stdio, streamable-http, sse)
  assert.equal(result.details.mcpServers.length, 3);
  const stdioServer = result.details.mcpServers.find((s) => s.name === "sample-stdio-server");
  const httpServer = result.details.mcpServers.find((s) => s.name === "sample-http-server");
  const sseServer = result.details.mcpServers.find((s) => s.name === "sample-sse-server");

  assert.ok(stdioServer);
  assert.equal(stdioServer.type, "stdio");
  assert.equal(stdioServer.config.command, "node");

  assert.ok(httpServer);
  assert.equal(httpServer.type, "streamable-http");
  assert.equal(httpServer.config.url, "https://api.example.com/mcp");

  assert.ok(sseServer);
  assert.equal(sseServer.type, "sse");
  assert.equal(sseServer.config.url, "https://sse.example.com/events");

  // Verify client extension
  assert.equal(result.details.clientExtensions.length, 1);
  assert.equal(result.details.clientExtensions[0].name, "com.example.client");
});

test("parseSkillFrontmatter parses valid YAML frontmatter and detects invalid formats", () => {
  const validMd = `---
name: my-skill
description: Useful skill
---

# Title
Skill body content.`;

  const parsed = parseSkillFrontmatter(validMd);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.attributes.name, "my-skill");
  assert.equal(parsed.attributes.description, "Useful skill");
  assert.match(parsed.body, /# Title/);

  const missingStart = `name: my-skill\n---\nbody`;
  assert.equal(parseSkillFrontmatter(missingStart).valid, false);

  const missingEnd = `---\nname: my-skill\ndescription: missing closing`;
  assert.equal(parseSkillFrontmatter(missingEnd).valid, false);
});

test("detects missing or invalid plugin.json", () => {
  const tmpDir = createTempDir();

  // Missing plugin.json
  const res1 = validateAgentPlugin(tmpDir);
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.some((e) => e.includes("Missing required manifest: plugin.json")));

  // Invalid JSON syntax in plugin.json
  fs.writeFileSync(path.join(tmpDir, "plugin.json"), "{ invalid json", "utf8");
  const res2 = validateAgentPlugin(tmpDir);
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.includes("Invalid JSON format in plugin.json")));

  // Incomplete plugin.json fields
  fs.writeFileSync(
    path.join(tmpDir, "plugin.json"),
    JSON.stringify({ name: "bad plugin!", version: "invalid", description: "" }),
    "utf8"
  );
  const res3 = validateAgentPlugin(tmpDir);
  assert.equal(res3.valid, false);
  assert.ok(res3.errors.some((e) => e.includes("'$schema' field is required")));
  assert.ok(res3.errors.some((e) => e.includes("invalid characters")));
  assert.ok(res3.errors.some((e) => e.includes("valid semver")));
  assert.ok(res3.errors.some((e) => e.includes("'description' field is required")));
  assert.ok(res3.errors.some((e) => e.includes("'skills' field is required")));
});

test("enforces agent-plugins.org 1.0.0 $schema in plugin.json and mcp.json", () => {
  const tmpDir = createTempDir();
  fs.mkdirSync(path.join(tmpDir, "skills", "s1"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "skills", "s1", "SKILL.md"),
    `---\nname: s1\ndescription: Skill 1\n---\nBody`,
    "utf8"
  );

  // Missing $schema in plugin.json
  fs.writeFileSync(
    path.join(tmpDir, "plugin.json"),
    JSON.stringify({
      name: "valid-name",
      version: "1.0.0",
      description: "Valid description",
      skills: "./skills/",
      mcpServers: "./mcp.json"
    }),
    "utf8"
  );
  fs.writeFileSync(
    path.join(tmpDir, "mcp.json"),
    JSON.stringify({
      $schema: AGENT_PLUGIN_MCP_SCHEMA_URL,
      mcpServers: { s: { command: "node" } }
    }),
    "utf8"
  );

  const res1 = validateAgentPlugin(tmpDir);
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.some((e) => e.includes("'$schema' field is required")));

  // Invalid $schema URL
  fs.writeFileSync(
    path.join(tmpDir, "plugin.json"),
    JSON.stringify({
      $schema: "https://unknown.org/schema.json",
      name: "valid-name",
      version: "1.0.0",
      description: "Valid description",
      skills: "./skills/",
      mcpServers: "./mcp.json"
    }),
    "utf8"
  );

  const res2 = validateAgentPlugin(tmpDir);
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.includes("must start with https://agent-plugins.org/schemas/")));

  // Missing $schema in mcp.json
  fs.writeFileSync(
    path.join(tmpDir, "plugin.json"),
    JSON.stringify({
      $schema: AGENT_PLUGIN_SCHEMA_URL,
      name: "valid-name",
      version: "1.0.0",
      description: "Valid description",
      skills: "./skills/",
      mcpServers: "./mcp.json"
    }),
    "utf8"
  );
  fs.writeFileSync(
    path.join(tmpDir, "mcp.json"),
    JSON.stringify({
      mcpServers: { s: { command: "node" } }
    }),
    "utf8"
  );

  const res3 = validateAgentPlugin(tmpDir);
  assert.equal(res3.valid, false);
  assert.ok(res3.errors.some((e) => e.includes("'$schema' field is required")));
});

test("detects non-existent skills directory and MCP config file", () => {
  const tmpDir = createTempDir();
  fs.writeFileSync(
    path.join(tmpDir, "plugin.json"),
    JSON.stringify({
      $schema: AGENT_PLUGIN_SCHEMA_URL,
      name: "test-plugin",
      version: "1.0.0",
      description: "Test plugin",
      skills: "./non-existent-skills",
      mcpServers: "./non-existent-mcp.json"
    }),
    "utf8"
  );

  const res = validateAgentPlugin(tmpDir);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("Specified skills path does not exist")));
  assert.ok(res.errors.some((e) => e.includes("Specified MCP path does not exist")));
});

test("detects missing SKILL.md and missing frontmatter fields", () => {
  const tmpDir = createTempDir();
  const skillsDir = path.join(tmpDir, "skills");
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(path.join(skillsDir, "empty-skill"), { recursive: true });

  const mcpPath = path.join(tmpDir, "mcp.json");
  fs.writeFileSync(
    mcpPath,
    JSON.stringify({ $schema: AGENT_PLUGIN_MCP_SCHEMA_URL, mcpServers: {} }),
    "utf8"
  );

  fs.writeFileSync(
    path.join(tmpDir, "plugin.json"),
    JSON.stringify({
      $schema: AGENT_PLUGIN_SCHEMA_URL,
      name: "test-plugin",
      version: "1.0.0",
      description: "Test plugin",
      skills: "./skills",
      mcpServers: "./mcp.json"
    }),
    "utf8"
  );

  // empty-skill folder has no SKILL.md
  const res1 = validateAgentPlugin(tmpDir);
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.some((e) => e.includes("Skill 'empty-skill': Missing required SKILL.md file")));

  // Create SKILL.md missing description frontmatter
  fs.writeFileSync(
    path.join(skillsDir, "empty-skill", "SKILL.md"),
    `---\nname: empty-skill\n---\n\nSkill content`,
    "utf8"
  );

  const res2 = validateAgentPlugin(tmpDir);
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.includes("Frontmatter missing required 'description' field")));
});

test("validates MCP transport formats (stdio, streamable HTTP, SSE)", () => {
  const tmpDir = createTempDir();
  fs.mkdirSync(path.join(tmpDir, "skills", "dummy"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "skills", "dummy", "SKILL.md"),
    `---\nname: dummy\ndescription: Dummy skill\n---\nDummy body`,
    "utf8"
  );

  // Invalid MCP configurations
  fs.writeFileSync(
    path.join(tmpDir, "mcp.json"),
    JSON.stringify({
      $schema: AGENT_PLUGIN_MCP_SCHEMA_URL,
      mcpServers: {
        badStdio: { type: "stdio" }, // missing command
        badHttp: { type: "streamable-http", url: "not-a-url" },
        badSse: { type: "sse" }, // missing url
        unknownType: { type: "websocket" }
      }
    }),
    "utf8"
  );

  fs.writeFileSync(
    path.join(tmpDir, "plugin.json"),
    JSON.stringify({
      $schema: AGENT_PLUGIN_SCHEMA_URL,
      name: "test-plugin",
      version: "1.0.0",
      description: "Test plugin",
      skills: "./skills",
      mcpServers: "./mcp.json"
    }),
    "utf8"
  );

  const res = validateAgentPlugin(tmpDir);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("'badStdio': stdio transport requires a non-empty 'command'")));
  assert.ok(res.errors.some((e) => e.includes("'badHttp': Streamable HTTP transport requires a valid 'url'")));
  assert.ok(res.errors.some((e) => e.includes("'badSse': SSE transport requires a valid 'url'")));
  assert.ok(res.errors.some((e) => e.includes("'unknownType': Unsupported or invalid transport configuration")));
});

test("validates reverse-domain client extension folders", () => {
  const tmpDir = createTempDir();
  fs.mkdirSync(path.join(tmpDir, "skills", "dummy"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "skills", "dummy", "SKILL.md"),
    `---\nname: dummy\ndescription: Dummy skill\n---\nDummy body`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tmpDir, "mcp.json"),
    JSON.stringify({
      $schema: AGENT_PLUGIN_MCP_SCHEMA_URL,
      mcpServers: {
        validStdio: { command: "node", args: ["server.js"] }
      }
    }),
    "utf8"
  );

  fs.writeFileSync(
    path.join(tmpDir, "plugin.json"),
    JSON.stringify({
      $schema: AGENT_PLUGIN_SCHEMA_URL,
      name: "test-plugin",
      version: "1.0.0",
      description: "Test plugin",
      skills: "./skills",
      mcpServers: "./mcp.json"
    }),
    "utf8"
  );

  // Add an invalid reverse-domain folder name
  fs.mkdirSync(path.join(tmpDir, "invalid..domain.client"), { recursive: true });

  const res1 = validateAgentPlugin(tmpDir);
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.some((e) => e.includes("invalid reverse-domain name format")));

  // Fix folder name to valid reverse-domain format, but put invalid JSON inside
  fs.rmSync(path.join(tmpDir, "invalid..domain.client"), { recursive: true, force: true });
  fs.mkdirSync(path.join(tmpDir, "org.example.client"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "org.example.client", "config.json"), "invalid json content", "utf8");

  const res2 = validateAgentPlugin(tmpDir);
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.includes("Client extension 'org.example.client': File 'config.json' contains invalid JSON")));

  // Fix JSON inside extension folder
  fs.writeFileSync(path.join(tmpDir, "org.example.client", "config.json"), JSON.stringify({ enabled: true }), "utf8");
  const res3 = validateAgentPlugin(tmpDir);
  assert.equal(res3.valid, true);
  assert.equal(res3.details.clientExtensions.length, 1);
  assert.equal(res3.details.clientExtensions[0].name, "org.example.client");
});

test("validateAllAgentPlugins validates all plugins in workspace", () => {
  const pluginsDir = path.join(ROOT, "plugins");
  const result = validateAllAgentPlugins(pluginsDir);

  assert.equal(result.valid, true);
  assert.ok(result.plugins.length >= 3);
  assert.ok(result.plugins.some((p) => p.name === "agy" && p.valid));
  assert.ok(result.plugins.some((p) => p.name === "quota-dashboard" && p.valid));
  assert.ok(result.plugins.some((p) => p.name === "sample-agent-plugin" && p.valid));
});
