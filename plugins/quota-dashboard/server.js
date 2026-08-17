import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec, execFile } from 'node:child_process';
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

function getAccountInfo() {
  const tokenPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'antigravity-oauth-token');
  const browserPrefPath = path.join(os.homedir(), '.gemini', 'antigravity-browser-profile', 'Default', 'Preferences');
  const chromePrefPath = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Preferences');

  let authMethod = 'Consumer (Google One)';
  let accountName = '';
  let email = '';
  let expiry = null;
  let tokenType = 'Bearer';
  let pictureUrl = null;

  // 1. Primary: Check Antigravity Browser Profile Preferences for logged-in Google Account
  try {
    if (fs.existsSync(browserPrefPath)) {
      const content = fs.readFileSync(browserPrefPath, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.account_info) && parsed.account_info.length > 0) {
        const acc = parsed.account_info[0];
        if (acc.email) email = acc.email;
        if (acc.full_name) accountName = acc.full_name;
        else if (acc.given_name) accountName = acc.given_name;
        if (acc.picture_url) pictureUrl = acc.picture_url;
      }
    }
  } catch (e) {
    console.error('Error reading browser preferences:', e);
  }

  // 2. Secondary: Try OAuth Token file
  try {
    if (fs.existsSync(tokenPath)) {
      const content = fs.readFileSync(tokenPath, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed.auth_method) authMethod = parsed.auth_method;
      if (parsed.token?.expiry) expiry = parsed.token.expiry;
      if (parsed.token?.token_type) tokenType = parsed.token.token_type;
      if (!email && (parsed.email || parsed.user_email || parsed.account)) {
        email = parsed.email || parsed.user_email || parsed.account;
      }
      if (!accountName && (parsed.name || parsed.account_name || parsed.user_name)) {
        accountName = parsed.name || parsed.account_name || parsed.user_name;
      }
    }
  } catch (e) {
    console.error('Error reading token:', e);
  }

  // 3. Fallback: Chrome Preferences
  if (!email && fs.existsSync(chromePrefPath)) {
    try {
      const content = fs.readFileSync(chromePrefPath, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.account_info) && parsed.account_info.length > 0) {
        const acc = parsed.account_info[0];
        if (acc.email) email = acc.email;
        if (!accountName && acc.full_name) accountName = acc.full_name;
      }
    } catch {}
  }

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
    authMethod,
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

const NOTIFICATION_SETTINGS_PATH = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'quota-notifications.json');

const defaultNotificationSettings = {
  enabled: true,
  soundEnabled: true,
  browserPushEnabled: true,
  osNativeEnabled: true,
  warningThreshold: 30,
  criticalThreshold: 15,
  cooldownMinutes: 15,
  notifyOnReset: true
};

function getNotificationSettings() {
  try {
    if (fs.existsSync(NOTIFICATION_SETTINGS_PATH)) {
      const content = fs.readFileSync(NOTIFICATION_SETTINGS_PATH, 'utf8');
      return { ...defaultNotificationSettings, ...JSON.parse(content) };
    }
  } catch (e) {
    console.error('Error reading notification settings:', e);
  }
  return { ...defaultNotificationSettings };
}

function saveNotificationSettings(settings) {
  try {
    const dir = path.dirname(NOTIFICATION_SETTINGS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const merged = { ...getNotificationSettings(), ...settings };
    fs.writeFileSync(NOTIFICATION_SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  } catch (e) {
    console.error('Error saving notification settings:', e);
    return defaultNotificationSettings;
  }
}

// In-memory alert state tracker for transition detection & cooldown
const alertStateTracker = {
  geminiWeekly: { level: 'normal', lastAlertTime: 0, lastPercentage: 100 },
  gemini5h: { level: 'normal', lastAlertTime: 0, lastPercentage: 100 },
  claudeWeekly: { level: 'normal', lastAlertTime: 0, lastPercentage: 100 },
  claude5h: { level: 'normal', lastAlertTime: 0, lastPercentage: 100 }
};

function sendOsNotification(title, message, soundName = 'Ping') {
  if (process.platform !== 'darwin') return;

  const cleanTitle = title.replace(/["\\]/g, '\\$&');
  const cleanMessage = message.replace(/["\\]/g, '\\$&');
  const script = `display notification "${cleanMessage}" with title "${cleanTitle}" sound name "${soundName}"`;

  execFile('osascript', ['-e', script], { timeout: 3000 }, (err) => {
    if (err) console.error('OS notification error:', err.message);
  });
}

function evaluateQuotaAlerts(quotas, settings) {
  if (!settings.enabled) return [];

  const alerts = [];
  const now = Date.now();
  const cooldownMs = (settings.cooldownMinutes || 15) * 60 * 1000;

  for (const q of quotas) {
    let key = '';
    let categoryLabel = q.category;
    let limitLabel = q.limitType;

    if (q.category === 'Gemini Models') {
      if (q.limitType.includes('Weekly')) key = 'geminiWeekly';
      else if (q.limitType.includes('Five Hour')) key = 'gemini5h';
    } else if (q.category === 'Claude and GPT models') {
      if (q.limitType.includes('Weekly')) key = 'claudeWeekly';
      else if (q.limitType.includes('Five Hour')) key = 'claude5h';
    }

    if (!key) continue;

    const percent = q.percentage;
    const tracker = alertStateTracker[key] || { level: 'normal', lastAlertTime: 0, lastPercentage: percent };
    const prevLevel = tracker.level;
    let currentLevel = 'normal';

    if (percent <= settings.criticalThreshold) {
      currentLevel = 'critical';
    } else if (percent <= settings.warningThreshold) {
      currentLevel = 'warning';
    } else {
      currentLevel = 'normal';
    }

    const isTransition = currentLevel !== prevLevel;
    const isCooldownElapsed = now - tracker.lastAlertTime >= cooldownMs;
    const isReset = prevLevel !== 'normal' && currentLevel === 'normal' && percent > tracker.lastPercentage;

    let alertEvent = null;

    if (isReset && settings.notifyOnReset) {
      alertEvent = {
        key,
        type: 'reset',
        level: 'success',
        title: `โควตา ${categoryLabel} รีเซ็ตเต็มแล้ว`,
        message: `${limitLabel} ฟื้นฟูเป็น ${percent}% พร้อมใช้งานต่อ`,
        timestamp: new Date().toISOString()
      };
    } else if ((isTransition || isCooldownElapsed) && currentLevel !== 'normal') {
      if (currentLevel === 'critical') {
        alertEvent = {
          key,
          type: 'critical',
          level: 'critical',
          title: `⚠️ โควตาวิกฤต: ${categoryLabel}`,
          message: `${limitLabel} เหลือเพียง ${percent}% (รีเซ็ตใน ${q.resetAt || 'เร็วๆ นี้'})`,
          timestamp: new Date().toISOString()
        };
      } else if (currentLevel === 'warning') {
        alertEvent = {
          key,
          type: 'warning',
          level: 'warning',
          title: `โควตาใกล้หมด: ${categoryLabel}`,
          message: `${limitLabel} เหลือ ${percent}% (รีเซ็ตใน ${q.resetAt || 'เร็วๆ นี้'})`,
          timestamp: new Date().toISOString()
        };
      }
    }

    if (alertEvent) {
      tracker.lastAlertTime = now;
      alerts.push(alertEvent);

      if (settings.osNativeEnabled) {
        const sound = currentLevel === 'critical' ? 'Basso' : 'Ping';
        sendOsNotification(alertEvent.title, alertEvent.message, sound);
      }
    }

    tracker.level = currentLevel;
    tracker.lastPercentage = percent;
    alertStateTracker[key] = tracker;
  }

  return alerts;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/api/notifications/settings') {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') {
      const settings = getNotificationSettings();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, settings }));
      return;
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const saved = saveNotificationSettings(parsed);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, settings: saved }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
        }
      });
      return;
    }
  }

  if (url.pathname === '/api/notifications/test' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    const settings = getNotificationSettings();
    const testAlert = {
      key: 'test',
      type: 'test',
      level: 'warning',
      title: '🧪 ทดสอบระบบแจ้งเตือน Quota Monitor',
      message: 'ระบบแจ้งเตือนเสียงและ Browser Push พร้อมทำงานอย่างสมบูรณ์แบบ!',
      timestamp: new Date().toISOString()
    };

    if (settings.osNativeEnabled) {
      sendOsNotification(testAlert.title, testAlert.message, 'Hero');
    }

    res.writeHead(200);
    res.end(JSON.stringify({ success: true, alert: testAlert }));
    return;
  }

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
      const account = getAccountInfo();
      const notifSettings = getNotificationSettings();
      const alerts = evaluateQuotaAlerts(quotas, notifSettings);

      const payload = {
        success: true,
        timestamp: new Date().toISOString(),
        activeModel: settings.model || 'Gemini 3.6 Flash (High)',
        runningSpeed: settings.runningLightSpeed || 'fast',
        account,
        quotas,
        credits,
        token,
        alerts,
        notificationSettings: notifSettings,
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
