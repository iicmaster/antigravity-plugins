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
  assert.ok(fs.existsSync(path.join(DASHBOARD_DIR, "public", "favicon.svg")), "favicon.svg should exist");
});

test("quota dashboard server supports process.env.PORT, account extraction, and notification endpoints", () => {
  const serverCode = readText("server.js");
  assert.match(serverCode, /process\.env\.PORT || 3838/);
  assert.match(serverCode, /\/api\/quota/);
  assert.match(serverCode, /getAccountInfo/);
  assert.match(serverCode, /DEFAULT_PRIMARY_MODEL = 'Gemini 4 Argon \(Medium\)'/);
  assert.match(serverCode, /gemini4Weekly/);
  assert.match(serverCode, /\/api\/notifications\/settings/);
  assert.match(serverCode, /\/api\/notifications\/test/);
  assert.match(serverCode, /evaluateQuotaAlerts/);
  assert.match(serverCode, /sendOsNotification/);
});

test("quota dashboard UI includes account cards, notification controls, toast container, and settings modal", () => {
  const html = readText("public/index.html");
  assert.match(html, /rel="icon"/, "index.html should have favicon link");
  assert.match(html, /id="accountName"/, "index.html should have accountName");
  assert.match(html, /id="accountEmail"/, "index.html should have accountEmail");
  assert.match(html, /id="pluginVersion"/, "index.html should have pluginVersion");
  assert.match(html, /id="gemini4Group"/, "index.html should have gemini4Group primary section");
  assert.match(html, /id="gemini4WeeklyPercent"/, "index.html should have gemini4WeeklyPercent");
  assert.match(html, /id="notifBtn"/, "index.html should have notifBtn");
  assert.match(html, /id="toastContainer"/, "index.html should have toastContainer");
  assert.match(html, /id="notifModal"/, "index.html should have notifModal");

  const css = readText("public/style.css");
  assert.match(css, /\.metadata-strip/, "style.css should have metadata-strip styles");
  assert.match(css, /\.meta-email/, "style.css should have meta-email styles");
  assert.match(css, /\.version-tag/, "style.css should have version-tag styles");
  assert.match(css, /\.primary-group-card/, "style.css should have primary-group-card styles");
  assert.match(css, /\.toast-container/, "style.css should have toast container styles");
  assert.match(css, /\.modal-overlay/, "style.css should have modal styles");

  const js = readText("public/app.js");
  assert.match(js, /accountNameEl/, "app.js should bind accountNameEl");
  assert.match(js, /accountEmailEl/, "app.js should bind accountEmailEl");
  assert.match(js, /pluginVersionEl/, "app.js should bind pluginVersionEl");
  assert.match(js, /gemini4Weekly/, "app.js should handle gemini4Weekly quota history and meters");
  assert.match(js, /Gemini 4 Argon \(Medium\)/, "app.js should default to Gemini 4 Argon (Medium)");
  assert.match(js, /playChime/, "app.js should have playChime function");
  assert.match(js, /showToast/, "app.js should have showToast function");
  assert.match(js, /showBrowserPush/, "app.js should have showBrowserPush function");
});

test("quota dashboard manifests are valid and structured properly", () => {
  const claudeManifest = readJson(".claude-plugin/plugin.json");
  const codexManifest = readJson(".codex-plugin/plugin.json");
  const pluginManifest = readJson("plugin.json");

  assert.equal(claudeManifest.name, "quota-dashboard");
  assert.equal(codexManifest.name, "quota-dashboard");
  assert.equal(pluginManifest.name, "quota-dashboard");
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
