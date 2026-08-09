import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DASHBOARD_DIR = path.join(ROOT, "plugins", "quota-dashboard");

function readText(relativePath) {
  return fs.readFileSync(path.join(DASHBOARD_DIR, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

test("quota dashboard plugin includes required server and frontend files", () => {
  assert.ok(fs.existsSync(path.join(DASHBOARD_DIR, "server.js")), "server.js should exist");
  assert.ok(fs.existsSync(path.join(DASHBOARD_DIR, "start.sh")), "start.sh should exist");
  assert.ok(fs.existsSync(path.join(DASHBOARD_DIR, "public", "index.html")), "index.html should exist");
  assert.ok(fs.existsSync(path.join(DASHBOARD_DIR, "public", "app.js")), "app.js should exist");
  assert.ok(fs.existsSync(path.join(DASHBOARD_DIR, "public", "style.css")), "style.css should exist");
});

test("quota dashboard server supports process.env.PORT", () => {
  const serverCode = readText("server.js");
  assert.match(serverCode, /process\.env\.PORT || 3838/);
  assert.match(serverCode, /\/api\/quota/);
});

test("quota dashboard manifests are valid and structured properly", () => {
  const claudeManifest = readJson(".claude-plugin/plugin.json");
  const codexManifest = readJson(".codex-plugin/plugin.json");

  assert.equal(claudeManifest.name, "quota-dashboard");
  assert.equal(codexManifest.name, "quota-dashboard");
  assert.equal(codexManifest.interface.displayName, "Quota Monitor Dashboard");
});
