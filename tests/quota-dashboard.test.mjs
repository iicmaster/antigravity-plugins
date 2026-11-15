import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  detectGemini4Subfamily,
  formatModelDisplayName,
  isGemini4Model,
  parseUsageOutput
} from "../plugins/quota-dashboard/server.js";

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
  assert.match(serverCode, /DEFAULT_PRIMARY_MODEL = 'Gemini 4 Hydrogen \(Medium\)'/);
  assert.match(serverCode, /gemini-4-hydrogen-medium/);
  assert.match(serverCode, /isSharedGeminiPool/);
  assert.match(serverCode, /gemini4Weekly/);
  assert.match(serverCode, /\/api\/notifications\/settings/);
  assert.match(serverCode, /\/api\/notifications\/test/);
  assert.match(serverCode, /evaluateQuotaAlerts/);
  assert.match(serverCode, /sendOsNotification/);
});

test("quota dashboard server and MCP server define all 3 Gemini 4 models (Carbon, Argon, Hydrogen) and Orchestrator", () => {
  for (const filename of ["server.js", "mcp-server.js"]) {
    const code = readText(filename);
    for (const modelId of [
      "gemini-4-hydrogen-low",
      "gemini-4-hydrogen-medium",
      "gemini-4-hydrogen-high",
      "gemini-4-hydrogen-xhigh",
      "gemini-4-carbon-low",
      "gemini-4-carbon-medium",
      "gemini-4-carbon-high",
      "gemini-4-argon-low",
      "gemini-4-argon-medium",
      "gemini-4-argon-high"
    ]) {
      assert.ok(code.includes(modelId), `${filename} should define ${modelId}`);
    }
    assert.ok(code.includes("Orchestrator (Carbon)"), `${filename} should map Orchestrator (Carbon)`);
    assert.ok(code.includes("Orchestrator (Argon)"), `${filename} should map Orchestrator (Argon)`);
  }
});

test("quota dashboard alerts fire once per quota cycle without cooldown repeats", () => {
  const serverCode = readText("server.js");

  // No periodic re-fire: the cooldown re-arm path must be gone entirely.
  assert.doesNotMatch(serverCode, /isCooldownElapsed/);
  assert.doesNotMatch(serverCode, /cooldownMinutes/);

  // Each level alerts at most once per cycle, re-armed only by a genuine refill.
  assert.match(serverCode, /tracker\.levels\.includes\(currentLevel\)/);
  assert.match(serverCode, /isCycleReset/);

  // Alert state survives server restarts so a restart mid-cycle stays silent.
  assert.match(serverCode, /quota-alert-state\.json/);
  assert.match(serverCode, /loadAlertState/);
  assert.match(serverCode, /saveAlertState/);

  const html = readText("public/index.html");
  assert.doesNotMatch(html, /cooldownInput/);

  const js = readText("public/app.js");
  assert.doesNotMatch(js, /cooldownInput/);
  assert.doesNotMatch(js, /cooldownMinutes/);
});

test("quota dashboard UI includes account cards, notification controls, toast container, and settings modal", () => {
  const html = readText("public/index.html");
  assert.match(html, /rel="icon"/, "index.html should have favicon link");
  assert.match(html, /id="accountName"/, "index.html should have accountName");
  assert.match(html, /id="accountEmail"/, "index.html should have accountEmail");
  assert.match(html, /id="pluginVersion"/, "index.html should have pluginVersion");
  assert.match(html, /id="gemini4Group"/, "index.html should have gemini4Group primary section");
  assert.match(html, /id="gemini4FamilyBar"/, "index.html should have gemini4FamilyBar quick-switch section");
  assert.match(html, /data-subfamily="hydrogen"/, "index.html should include Hydrogen family pill");
  assert.match(html, /data-subfamily="carbon"/, "index.html should include Carbon family pill");
  assert.match(html, /data-subfamily="argon"/, "index.html should include Argon family pill");
  assert.match(html, /data-subfamily="orchestrator"/, "index.html should include Orchestrator family pill");
  assert.match(html, /data-model-cmd="agy --model gemini-4-hydrogen-medium"/, "index.html should include Hydrogen CLI switch command");
  assert.match(html, /data-model-cmd="agy --model gemini-4-carbon-medium"/, "index.html should include Carbon CLI switch command");
  assert.match(html, /data-model-cmd="agy --model gemini-4-argon-medium"/, "index.html should include Argon CLI switch command");
  assert.match(html, /data-model-cmd="agy --model gemini-pro-orchestrator"/, "index.html should include Orchestrator CLI switch command");
  assert.match(html, /data-model-alt-cmd="agy --model gemini-pro-orchestrator-argon"/, "index.html should include Orchestrator Argon alternate CLI switch command");
  assert.match(html, /Orchestrator/, "index.html should include Orchestrator in Gemini 4 family");
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
  assert.match(js, /Gemini 4 Hydrogen \(Medium\)/, "app.js should default to Gemini 4 Hydrogen (Medium)");
  assert.match(js, /useSharedGeminiPool/, "app.js should support shared Gemini quota pool routing");
  assert.match(js, /gemini-4-hydrogen-medium/, "app.js should reference gemini-4-hydrogen-medium");
  assert.match(js, /gemini-4-carbon-low/, "app.js should reference gemini-4-carbon-low");
  assert.match(js, /gemini-4-argon-low/, "app.js should reference gemini-4-argon-low");
  assert.match(js, /gemini-4-hydrogen-low/, "app.js should reference gemini-4-hydrogen-low");
  assert.doesNotMatch(js, /toast\.innerHTML/, "app.js should not use innerHTML for toast content");
  assert.match(js, /copyToClipboard/, "app.js should centralize clipboard writes with failure handling");
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

test("quota dashboard behavioral routing promotes shared Gemini Models pool vs dedicated Gemini 4 and resolves subfamilies", () => {
  const sharedUsage = [
    "Claude and GPT models\tWeekly Limit Remaining\t100%\t2026-11-21T17:17:42Z",
    "Gemini Models\tWeekly Limit Remaining\t94%\t2026-11-21T17:17:42Z",
    "Gemini Models\tFive Hour Limit Remaining\t93%\t2026-11-15T12:00:00Z"
  ].join("\n");

  const sharedParsed = parseUsageOutput(sharedUsage);
  assert.equal(sharedParsed.length, 3);
  assert.equal(sharedParsed[0].category, "Gemini Models");
  assert.equal(sharedParsed[0].isPrimary, true);
  assert.equal(sharedParsed[0].isSharedGeminiPool, true);
  assert.equal(sharedParsed[0].isDedicatedGemini4, false);
  assert.equal(sharedParsed[2].category, "Claude and GPT models");
  assert.equal(sharedParsed[2].isPrimary, false);

  const dedicatedUsage = [
    "Gemini Models\tWeekly Limit Remaining\t88%\t2026-11-21T17:17:42Z",
    "Gemini 4 Carbon\tWeekly Limit Remaining\t75%\t2026-11-21T17:17:42Z"
  ].join("\n");

  const dedicatedParsed = parseUsageOutput(dedicatedUsage);
  assert.equal(dedicatedParsed[0].category, "Gemini 4 Carbon");
  assert.equal(dedicatedParsed[0].isPrimary, true);
  assert.equal(dedicatedParsed[0].isDedicatedGemini4, true);
  assert.equal(dedicatedParsed[1].category, "Gemini Models");
  assert.equal(dedicatedParsed[1].isPrimary, false);
  assert.equal(dedicatedParsed[1].isSharedGeminiPool, false);

  assert.equal(formatModelDisplayName("gemini-4-carbon-medium"), "Gemini 4 Carbon (Medium)");
  assert.equal(formatModelDisplayName("gemini-4-argon-high"), "Gemini 4 Argon (High)");
  assert.equal(formatModelDisplayName("gemini-4-hydrogen-xhigh"), "Gemini 4 Hydrogen (XHigh)");
  assert.equal(formatModelDisplayName("gemini-pro-orchestrator"), "Orchestrator (Carbon)");
  assert.equal(formatModelDisplayName("gemini-pro-orchestrator-argon"), "Orchestrator (Argon)");

  assert.equal(detectGemini4Subfamily("gemini-4-carbon-low"), "carbon");
  assert.equal(detectGemini4Subfamily("gemini-4-argon-medium"), "argon");
  assert.equal(detectGemini4Subfamily("gemini-4-hydrogen-xhigh"), "hydrogen");
  assert.equal(detectGemini4Subfamily("Orchestrator (Carbon)"), "orchestrator");
  assert.equal(detectGemini4Subfamily("Orchestrator (Argon)"), "orchestrator");
  assert.equal(detectGemini4Subfamily("Claude Opus 5.5 (Medium)"), null);

  assert.equal(isGemini4Model("gemini-4-carbon-medium"), true);
  assert.equal(isGemini4Model("Orchestrator (Argon)"), true);
  assert.equal(isGemini4Model("claude-opus-5-5-medium"), false);
});

test("quota dashboard MCP get_quota returns parsed shared-pool quotas and Carbon active subfamily from fake agy", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "quota-mcp-carbon-"));
  const binDir = path.join(tmpDir, "bin");
  const homeDir = path.join(tmpDir, "home");
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(path.join(homeDir, ".gemini", "antigravity-cli"), { recursive: true });
  fs.writeFileSync(
    path.join(homeDir, ".gemini", "antigravity-cli", "settings.json"),
    JSON.stringify({ model: "gemini-4-carbon-medium", runningLightSpeed: "fast" }),
    "utf8"
  );
  const fakeAgy = path.join(binDir, "agy");
  fs.writeFileSync(
    fakeAgy,
    `#!/usr/bin/env node
const prompt = process.argv.join(" ");
if (prompt.includes("/usage")) {
  console.log("Claude and GPT models\\tWeekly Limit Remaining\\t100%\\t2026-11-21T17:17:42Z");
  console.log("Gemini Models\\tWeekly Limit Remaining\\t82%\\t2026-11-21T17:17:42Z");
} else if (prompt.includes("/credits")) {
  console.log("Remaining credits\\t420");
  console.log("Upgrade\\thttps://antigravity.google/g1-upgrade");
}
`,
    "utf8"
  );
  fs.chmodSync(fakeAgy, 0o755);

  const mcpServerPath = path.join(DASHBOARD_DIR, "mcp-server.js");
  const child = spawn(process.execPath, [mcpServerPath], {
    env: {
      ...process.env,
      HOME: homeDir,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`
    },
    stdio: ["pipe", "pipe", "inherit"]
  });

  const responsePromise = new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Timed out waiting for synthetic get_quota"));
    }, 5000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      for (const line of output.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === 3) {
            clearTimeout(timer);
            resolve(parsed);
            return;
          }
        } catch {
          // keep buffering
        }
      }
    });
    child.on("error", reject);
  });

  child.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_quota", arguments: {} }
    }) + "\n"
  );

  const res = await responsePromise;
  child.kill();

  assert.equal(res.result.isError, false);
  const payload = JSON.parse(res.result.content[0].text);
  assert.equal(payload.activeModel, "Gemini 4 Carbon (Medium)");
  assert.equal(payload.activeSubfamily, "carbon");
  assert.equal(payload.isPrimaryModelActive, true);
  assert.equal(payload.credits.remaining, 420);
  assert.equal(payload.quotas[0].category, "Gemini Models");
  assert.equal(payload.quotas[0].isPrimary, true);
  assert.equal(payload.quotas[0].isSharedGeminiPool, true);
  assert.equal(payload.quotas[0].percentage, 82);
});
