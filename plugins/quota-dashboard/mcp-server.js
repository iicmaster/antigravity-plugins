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
    ).version || '0.5.0';
  } catch {
    return '0.5.0';
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

const DEFAULT_PRIMARY_MODEL = 'Gemini 4 Argon (Medium)';

function isGemini4Category(category = '') {
  return /^Gemini 4\b/i.test(String(category).trim());
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
        resetAt,
        isPrimary: isGemini4Category(category)
      });
    }
  }

  results.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
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

function getAccountInfo() {
  const logDir = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'log');
  const cliLogSymlink = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'cli.log');
  const googleAccountsPath = path.join(os.homedir(), '.gemini', 'google_accounts.json');
  const oauthCredsPath = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
  const browserPrefPath = path.join(os.homedir(), '.gemini', 'antigravity-browser-profile', 'Default', 'Preferences');
  const chromeBaseDir = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  const tokenPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'antigravity-oauth-token');

  let authMethod = 'Consumer';
  let accountName = '';
  let email = '';
  let expiry = null;
  let tokenType = 'Bearer';
  let pictureUrl = null;

  const targetLogs = [];
  if (fs.existsSync(cliLogSymlink)) {
    try {
      const real = fs.realpathSync(cliLogSymlink);
      targetLogs.push(real);
    } catch {}
  }
  if (fs.existsSync(logDir)) {
    try {
      const files = fs.readdirSync(logDir)
        .filter(f => f.startsWith('cli-') && f.endsWith('.log'))
        .map(f => ({ full: path.join(logDir, f), mtime: fs.statSync(path.join(logDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      for (const f of files.slice(0, 5)) {
        if (!targetLogs.includes(f.full)) targetLogs.push(f.full);
      }
    } catch {}
  }

  for (const logPath of targetLogs) {
    try {
      const content = fs.readFileSync(logPath, 'utf8');
      const authMatch = content.match(/applyAuthResult:\s*email=([^\s,]+)(?:,\s*authMethod=([^\s,]+))?/);
      if (authMatch) {
        email = authMatch[1].trim();
        if (authMatch[2]) authMethod = authMatch[2].trim();
        break;
      }
      const oauthSuccess = content.match(/OAuth:\s*authenticated successfully as ([^\s\r\n]+)/);
      if (oauthSuccess) {
        email = oauthSuccess[1].trim();
        break;
      }
    } catch {}
  }

  if (!email) {
    try {
      if (fs.existsSync(googleAccountsPath)) {
        const parsed = JSON.parse(fs.readFileSync(googleAccountsPath, 'utf8'));
        if (parsed.active && typeof parsed.active === 'string') {
          email = parsed.active;
        }
      }
    } catch (e) {}
  }

  try {
    if (fs.existsSync(oauthCredsPath)) {
      const creds = JSON.parse(fs.readFileSync(oauthCredsPath, 'utf8'));
      if (creds.token_type) tokenType = creds.token_type;
      if (creds.expiry_date) expiry = new Date(creds.expiry_date).toISOString();

      if (creds.id_token) {
        const parts = creds.id_token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (!email && payload.email) email = payload.email;
          if (email === payload.email) {
            if (payload.name) accountName = payload.name;
            else if (payload.given_name) accountName = payload.given_name;
            if (payload.picture) pictureUrl = payload.picture;
            if (payload.exp && !expiry) expiry = new Date(payload.exp * 1000).toISOString();
          }
        }
      }
    }
  } catch (e) {}

  const prefCandidates = [browserPrefPath];
  if (fs.existsSync(chromeBaseDir)) {
    try {
      const entries = fs.readdirSync(chromeBaseDir);
      for (const entry of entries) {
        if (entry === 'Default' || entry.startsWith('Profile ')) {
          prefCandidates.push(path.join(chromeBaseDir, entry, 'Preferences'));
        }
      }
    } catch {}
  }

  for (const prefFile of prefCandidates) {
    if ((accountName && pictureUrl) || !fs.existsSync(prefFile)) continue;
    try {
      const json = JSON.parse(fs.readFileSync(prefFile, 'utf8'));
      if (Array.isArray(json.account_info) && json.account_info.length > 0) {
        const matched = email ? json.account_info.find(a => a.email && a.email.toLowerCase() === email.toLowerCase()) : json.account_info[0];
        if (matched) {
          if (!accountName && (matched.full_name || matched.given_name)) {
            accountName = matched.full_name || matched.given_name;
          }
          if (!pictureUrl && (matched.picture_url || matched.last_downloaded_image_url_with_size)) {
            pictureUrl = matched.picture_url || matched.last_downloaded_image_url_with_size;
          }
        }
      }
    } catch {}
  }

  try {
    if (fs.existsSync(tokenPath)) {
      const content = fs.readFileSync(tokenPath, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed.auth_method) authMethod = parsed.auth_method;
      if (!email && (parsed.email || parsed.user_email || parsed.account)) {
        email = parsed.email || parsed.user_email || parsed.account;
      }
      if (!accountName && (parsed.name || parsed.account_name || parsed.user_name)) {
        accountName = parsed.name || parsed.account_name || parsed.user_name;
      }
      if (parsed.token?.expiry && !expiry) expiry = parsed.token.expiry;
      if (parsed.token?.token_type && !tokenType) tokenType = parsed.token.token_type;
    }
  } catch (e) {}

  const sysUser = os.userInfo().username || process.env.USER || 'User';
  if (!email) {
    email = `${sysUser}@${os.hostname().replace(/\.local$/, '')}`;
  }
  if (!accountName) {
    accountName = email.includes('@') ? email.split('@')[0] : sysUser;
  }

  return {
    accountName,
    email,
    username: sysUser,
    authMethod: authMethod.charAt(0).toUpperCase() + authMethod.slice(1),
    expiry,
    tokenType,
    pictureUrl
  };
}

function getTokenInfo() {
  const acc = getAccountInfo();
  return {
    authMethod: acc.authMethod,
    expiry: acc.expiry,
    tokenType: acc.tokenType,
    accountName: acc.accountName,
    email: acc.email,
    pictureUrl: acc.pictureUrl
  };
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

    const activeModel = settings.model || DEFAULT_PRIMARY_MODEL;

    const payload = {
      success: true,
      version: PLUGIN_VERSION,
      timestamp: new Date().toISOString(),
      activeModel,
      primaryModel: DEFAULT_PRIMARY_MODEL,
      isPrimaryModelActive: isGemini4Category(activeModel),
      runningSpeed: settings.runningLightSpeed || 'fast',
      account: getAccountInfo(),
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
