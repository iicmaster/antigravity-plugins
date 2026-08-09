import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3838;
const PUBLIC_DIR = path.join(__dirname, 'public');

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/quota') {
    res.setHeader('Content-Type', 'application/json');

    try {
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
        token,
        raw: {
          usage: usageRes.stdout,
          credits: creditsRes.stdout
        }
      };

      res.writeHead(200);
      res.end(JSON.stringify(payload, null, 2));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Static file handler
  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  
  // Security check to prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png'
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 Not Found</h1>');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Antigravity Quota Dashboard running at http://localhost:${PORT}`);
});
