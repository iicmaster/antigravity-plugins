#!/usr/bin/env node

import { exec, spawn } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_VERSION = (() => {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, 'plugin.json'), 'utf8')
    ).version || '1.0.0';
  } catch {
    return '1.0.0';
  }
})();

function runCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ error: error.message, stdout: '', stderr });
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

function parseUsageOutput(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];
  
  for (const line of lines) {
    const parts = line.split('\t').map(p => p.trim());
    if (parts.length >= 3) {
      const category = parts[0];
      const limitType = parts[1];
      const percentStr = parts[2].replace('%', '');
      const percentage = parseInt(percentStr, 10);
      const resetAt = parts[3] || null;

      results.push({
        category,
        limitType,
        percentage: isNaN(percentage) ? 0 : percentage,
        resetAt
      });
    }
  }
  return results;
}

function parseCreditsOutput(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  let remaining = 0;
  let upgradeUrl = 'https://antigravity.google/g1-upgrade';

  for (const line of lines) {
    const parts = line.split('\t').map(p => p.trim());
    if (parts[0] === 'Remaining credits' && parts[1]) {
      remaining = parseInt(parts[1], 10) || 0;
    } else if (parts[0] === 'Upgrade' && parts[1]) {
      upgradeUrl = parts[1];
    }
  }

  return { remaining, upgradeUrl };
}

function getLocalSettings() {
  const settingsPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Error reading settings.json:', e);
  }
  return {};
}

function getTokenInfo() {
  const tokenPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'antigravity-oauth-token');
  try {
    if (fs.existsSync(tokenPath)) {
      const content = fs.readFileSync(tokenPath, 'utf8');
      const parsed = JSON.parse(content);
      return {
        authMethod: parsed.auth_method || 'consumer',
        expiry: parsed.token?.expiry || null,
        tokenType: parsed.token?.token_type || 'Bearer'
      };
    }
  } catch (e) {
    console.error('Error reading token:', e);
  }
  return {};
}

function isPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(400);

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      resolve(false);
    });

    socket.connect(port, host);
  });
}

async function startDashboardServer(port = 3838) {
  const serverPath = path.join(__dirname, 'server.js');
  const child = spawn(process.execPath, [serverPath], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(port) }
  });
  child.unref();

  // Poll until server port is ready (up to 3 seconds)
  const startTime = Date.now();
  while (Date.now() - startTime < 3000) {
    await new Promise((r) => setTimeout(r, 200));
    const inUse = await isPortInUse(port);
    if (inUse) {
      return true;
    }
  }
  return false;
}

function launchBrowser(url) {
  return new Promise((resolve) => {
    let cmd = '';
    let args = [];

    if (process.platform === 'darwin') {
      cmd = 'open';
      args = [url];
    } else if (process.platform === 'win32') {
      cmd = 'cmd';
      args = ['/c', 'start', '""', url];
    } else {
      cmd = 'xdg-open';
      args = [url];
    }

    try {
      const proc = spawn(cmd, args, { detached: true, stdio: 'ignore' });
      proc.on('error', (err) => {
        resolve({ opened: false, error: err.message });
      });
      proc.unref();
      resolve({ opened: true });
    } catch (err) {
      resolve({ opened: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

const tools = [
  {
    name: "get_quota",
    description: "Get the current AI Premium Credits and Usage Quotas.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    }
  },
  {
    name: "open_dashboard",
    description: "Ensure the Quota Dashboard server is running and optionally open it in the default browser.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        port: {
          type: "number",
          description: "Port number for the dashboard web server (default: 3838)."
        },
        openBrowser: {
          type: "boolean",
          description: "Whether to open the dashboard URL in the default web browser (default: true)."
        }
      }
    }
  }
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleTool(name, args = {}) {
  if (name === 'get_quota') {
    const [usageRes, creditsRes] = await Promise.all([
      runCommand('agy -p "/usage"'),
      runCommand('agy -p "/credits"')
    ]);

    const quotas = parseUsageOutput(usageRes.stdout);
    const credits = parseCreditsOutput(creditsRes.stdout);
    const settings = getLocalSettings();
    const token = getTokenInfo();

    const payload = {
      success: true,
      timestamp: new Date().toISOString(),
      activeModel: settings.model || 'Gemini 3.6 Flash (High)',
      runningSpeed: settings.runningLightSpeed || 'fast',
      quotas,
      credits,
      token
    };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      isError: false
    };
  }

  if (name === 'open_dashboard') {
    const rawPort = args?.port != null ? parseInt(args.port, 10) : 3838;
    const port = isNaN(rawPort) || rawPort < 1024 || rawPort > 65535 ? 3838 : rawPort;
    const openBrowser = args?.openBrowser !== false;
    const url = `http://localhost:${port}`;

    let status = 'already_running';
    let running = await isPortInUse(port);

    if (!running) {
      const started = await startDashboardServer(port);
      if (started) {
        status = 'started';
        running = true;
      } else {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Failed to start Quota Dashboard server on port ${port}`,
              url,
              port
            }, null, 2)
          }],
          isError: true
        };
      }
    }

    let browserResult = { opened: false };
    if (openBrowser) {
      browserResult = await launchBrowser(url);
    }

    const payload = {
      success: true,
      status,
      port,
      url,
      browserOpened: browserResult.opened,
      ...(browserResult.error ? { browserError: browserResult.error } : {}),
      message: `Quota Dashboard is active at ${url}`
    };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      isError: false
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function handle(message) {
  const { id, method, params } = message;
  if (id == null) return;

  try {
    switch (method) {
      case "initialize":
        sendResult(id, {
          protocolVersion: params?.protocolVersion ?? "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "quota-dashboard", version: PLUGIN_VERSION }
        });
        break;
      case "ping":
        sendResult(id, {});
        break;
      case "tools/list":
        sendResult(id, { tools });
        break;
      case "tools/call":
        const result = await handleTool(params?.name, params?.arguments);
        sendResult(id, result);
        break;
      default:
        sendError(id, -32601, `Method not found: ${method}`);
        break;
    }
  } catch (error) {
    sendError(id, -32602, error instanceof Error ? error.message : String(error));
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf("\n");
    if (newline === -1) break;
    
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    
    if (!line) continue;
    
    try {
      void handle(JSON.parse(line));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
  }
});
