#!/usr/bin/env node

import { exec } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

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

const tools = [
  {
    name: "get_quota",
    description: "Get the current AI Premium Credits and Usage Quotas.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
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

async function handleTool(name) {
  if (name !== 'get_quota') {
    throw new Error(`Unknown tool: ${name}`);
  }

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

async function handle(message) {
  const { id, method, params } = message;
  if (id == null) return;

  try {
    switch (method) {
      case "initialize":
        sendResult(id, {
          protocolVersion: params?.protocolVersion ?? "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "quota-dashboard", version: "1.0.0" }
        });
        break;
      case "ping":
        sendResult(id, {});
        break;
      case "tools/list":
        sendResult(id, { tools });
        break;
      case "tools/call":
        const result = await handleTool(params?.name);
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
