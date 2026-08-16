import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
  assert.ok(fs.existsSync(path.join(DASHBOARD_DIR, "mcp-server.js")), "mcp-server.js should exist");
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

test("quota dashboard MCP server defines get_quota and open_dashboard tools", async () => {
  const mcpServerPath = path.join(DASHBOARD_DIR, "mcp-server.js");
  const child = spawn(process.execPath, [mcpServerPath], {
    stdio: ["pipe", "pipe", "inherit"]
  });

  const responsePromise = new Promise((resolve, reject) => {
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const lines = output.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === 1) {
            resolve(parsed);
            return;
          }
        } catch {
          // keep waiting
        }
      }
    });
    child.on("error", reject);
  });

  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n");
  const listRes = await responsePromise;
  child.kill();

  assert.ok(listRes.result);
  const toolNames = listRes.result.tools.map((t) => t.name);
  assert.ok(toolNames.includes("get_quota"), "Should include get_quota");
  assert.ok(toolNames.includes("open_dashboard"), "Should include open_dashboard");

  const openDashboardTool = listRes.result.tools.find((t) => t.name === "open_dashboard");
  assert.ok(openDashboardTool.inputSchema.properties.port);
  assert.ok(openDashboardTool.inputSchema.properties.openBrowser);
});

test("quota dashboard open_dashboard tool handles openBrowser: false gracefully", async () => {
  const mcpServerPath = path.join(DASHBOARD_DIR, "mcp-server.js");
  const child = spawn(process.execPath, [mcpServerPath], {
    stdio: ["pipe", "pipe", "inherit"]
  });

  const responsePromise = new Promise((resolve, reject) => {
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const lines = output.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === 2) {
            resolve(parsed);
            return;
          }
        } catch {
          // keep waiting
        }
      }
    });
    child.on("error", reject);
  });

  child.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "open_dashboard",
        arguments: { openBrowser: false, port: 3838 }
      }
    }) + "\n"
  );

  const callRes = await responsePromise;
  child.kill();

  assert.ok(callRes.result);
  assert.equal(callRes.result.isError, false);
  const parsedContent = JSON.parse(callRes.result.content[0].text);
  assert.equal(parsedContent.success, true);
  assert.equal(parsedContent.port, 3838);
  assert.equal(parsedContent.browserOpened, false);
});
