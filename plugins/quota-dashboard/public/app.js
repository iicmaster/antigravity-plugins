document.addEventListener('DOMContentLoaded', () => {
  // Top bar controls
  const refreshBtn = document.getElementById('refreshBtn');
  const autoRefreshToggle = document.getElementById('autoRefreshToggle');
  const connectionStatus = document.getElementById('connectionStatus');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const upgradeLinkEl = document.getElementById('upgradeLink');
  const pluginVersionEl = document.getElementById('pluginVersion');

  // Metadata strip elements
  const activeModelEl = document.getElementById('activeModel');
  const accountNameEl = document.getElementById('accountName');
  const accountEmailEl = document.getElementById('accountEmail');
  const accountAvatarEl = document.getElementById('accountAvatar');
  const accountAvatarFallbackEl = document.getElementById('accountAvatarFallback');
  const runningSpeedTextEl = document.getElementById('runningSpeedText');
  const remainingCreditsEl = document.getElementById('remainingCredits');
  const authMethodEl = document.getElementById('authMethod');
  const lastUpdatedEl = document.getElementById('lastUpdated');

  // Primary Gemini 4 elements
  const gemini4GroupEl = document.getElementById('gemini4Group');
  const gemini4GroupTitleEl = document.getElementById('gemini4GroupTitle');
  const gemini4ActiveBadgeEl = document.getElementById('gemini4ActiveBadge');
  const copySwitchGemini4Btn = document.getElementById('copySwitchGemini4Btn');
  const gemini4MetersContainerEl = document.getElementById('gemini4MetersContainer');
  const gemini4WeeklyTitleEl = document.getElementById('gemini4WeeklyTitle');
  const meterGemini45hEl = document.getElementById('meter-gemini4-5h');

  // Drawer elements
  const toggleJsonBtn = document.getElementById('toggleJsonBtn');
  const jsonDrawer = document.getElementById('jsonDrawer');
  const jsonCode = document.getElementById('jsonCode');
  const copyJsonBtn = document.getElementById('copyJsonBtn');

  // Notification elements
  const notifBtn = document.getElementById('notifBtn');
  const notifBadge = document.getElementById('notifBadge');
  const notifModal = document.getElementById('notifModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelModalBtn = document.getElementById('cancelModalBtn');
  const saveNotifBtn = document.getElementById('saveNotifBtn');
  const testNotifBtn = document.getElementById('testNotifBtn');
  const toastContainer = document.getElementById('toastContainer');

  const notifMasterToggle = document.getElementById('notifMasterToggle');
  const notifSoundToggle = document.getElementById('notifSoundToggle');
  const notifBrowserToggle = document.getElementById('notifBrowserToggle');
  const notifOsToggle = document.getElementById('notifOsToggle');
  const notifResetToggle = document.getElementById('notifResetToggle');
  const warningThresholdInput = document.getElementById('warningThresholdInput');
  const criticalThresholdInput = document.getElementById('criticalThresholdInput');
  const cooldownInput = document.getElementById('cooldownInput');

  let autoRefreshInterval = null;
  let countdownTimers = {};
  let currentRawData = null;
  let audioCtx = null;
  let notificationSettings = {
    enabled: true,
    soundEnabled: true,
    browserPushEnabled: true,
    osNativeEnabled: true,
    warningThreshold: 30,
    criticalThreshold: 15,
    cooldownMinutes: 15,
    notifyOnReset: true
  };

  // Quota Session History (for Sparklines and Burn Rate computation)
  const quotaHistory = {
    gemini4Weekly: [],
    gemini45h: [],
    geminiWeekly: [],
    gemini5h: [],
    claudeWeekly: [],
    claude5h: []
  };

  // ==========================================================================
  // 1. Theme Management (Light / Dark Ambient)
  // ==========================================================================
  function initTheme() {
    const savedTheme = localStorage.getItem('antigravity_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');

    setTheme(initialTheme);

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
      });
    }
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('antigravity_theme', theme);

    if (themeToggleBtn) {
      const lightIcon = themeToggleBtn.querySelector('.theme-icon-light');
      const darkIcon = themeToggleBtn.querySelector('.theme-icon-dark');
      if (lightIcon && darkIcon) {
        if (theme === 'dark') {
          lightIcon.classList.add('hidden');
          darkIcon.classList.remove('hidden');
        } else {
          lightIcon.classList.remove('hidden');
          darkIcon.classList.add('hidden');
        }
      }
    }
  }

  // ==========================================================================
  // 2. Web Audio API Chime Synthesizer
  // ==========================================================================
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playChime(type = 'warning') {
    if (!notificationSettings.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'critical') {
        // Urgent 3-tone chord (587Hz -> 440Hz -> 330Hz)
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(440.00, now + 0.12); // A4
        osc.frequency.setValueAtTime(329.63, now + 0.24); // E4
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === 'reset' || type === 'success') {
        // Melodic upward chord (440Hz -> 554Hz -> 659Hz)
        osc.frequency.setValueAtTime(440.00, now); // A4
        osc.frequency.setValueAtTime(554.37, now + 0.12); // C#5
        osc.frequency.setValueAtTime(659.25, now + 0.24); // E5
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else {
        // Warm 2-tone warning chord (440Hz -> 523Hz)
        osc.frequency.setValueAtTime(440.00, now); // A4
        osc.frequency.setValueAtTime(523.25, now + 0.15); // C5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch (e) {
      console.warn('Audio chime error:', e);
    }
  }

  // ==========================================================================
  // 3. Browser Push & Toast System
  // ==========================================================================
  function requestBrowserPushPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function showBrowserPush(title, message, type = 'warning') {
    if (!notificationSettings.browserPushEnabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    try {
      const notif = new Notification(title, {
        body: message,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234F46E5"><circle cx="12" cy="12" r="10"/></svg>',
        silent: true
      });
      setTimeout(() => notif.close(), 6000);
    } catch (e) {
      console.warn('Browser push error:', e);
    }
  }

  function showToast(type, title, message) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = '🔔';
    if (type === 'critical') icon = '⚠️';
    else if (type === 'success') icon = '✨';
    else if (type === 'warning') icon = '⚡';

    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" aria-label="Close">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => dismissToast(toast));

    toastContainer.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      dismissToast(toast);
    }, 6000);
  }

  function dismissToast(toast) {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 350);
  }

  function handleAlerts(alerts) {
    if (!alerts || !alerts.length) return;

    alerts.forEach(alert => {
      playChime(alert.level);
      showBrowserPush(alert.title, alert.message, alert.level);
      showToast(alert.level, alert.title, alert.message);
    });

    if (notifBadge) notifBadge.classList.remove('hidden');
  }

  // ==========================================================================
  // 4. Notification Settings Modal
  // ==========================================================================
  async function fetchNotificationSettings() {
    try {
      const res = await fetch('/api/notifications/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.settings) {
          notificationSettings = { ...notificationSettings, ...data.settings };
          applySettingsToModal(notificationSettings);
        }
      }
    } catch (e) {
      console.warn('Error fetching notification settings:', e);
    }
  }

  function applySettingsToModal(settings) {
    if (notifMasterToggle) notifMasterToggle.checked = !!settings.enabled;
    if (notifSoundToggle) notifSoundToggle.checked = !!settings.soundEnabled;
    if (notifBrowserToggle) notifBrowserToggle.checked = !!settings.browserPushEnabled;
    if (notifOsToggle) notifOsToggle.checked = !!settings.osNativeEnabled;
    if (notifResetToggle) notifResetToggle.checked = !!settings.notifyOnReset;
    if (warningThresholdInput) warningThresholdInput.value = settings.warningThreshold ?? 30;
    if (criticalThresholdInput) criticalThresholdInput.value = settings.criticalThreshold ?? 15;
    if (cooldownInput) cooldownInput.value = settings.cooldownMinutes ?? 15;
  }

  async function saveSettingsFromModal() {
    const updated = {
      enabled: notifMasterToggle.checked,
      soundEnabled: notifSoundToggle.checked,
      browserPushEnabled: notifBrowserToggle.checked,
      osNativeEnabled: notifOsToggle.checked,
      notifyOnReset: notifResetToggle.checked,
      warningThreshold: parseInt(warningThresholdInput.value, 10) || 30,
      criticalThreshold: parseInt(criticalThresholdInput.value, 10) || 15,
      cooldownMinutes: parseInt(cooldownInput.value, 10) || 15
    };

    try {
      const res = await fetch('/api/notifications/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.settings) {
          notificationSettings = data.settings;
          showToast('success', 'บันทึกการตั้งค่าแล้ว', 'อัปเดตการตั้งค่าการแจ้งเตือนเรียบร้อย');
          closeNotifModal();
        }
      }
    } catch (e) {
      console.error('Failed to save settings:', e);
      showToast('critical', 'บันทึกไม่สำเร็จ', 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    }
  }

  async function triggerTestAlert() {
    playChime('warning');
    showBrowserPush('🧪 ทดสอบการแจ้งเตือน', 'เสียงและ Browser Notification ทำงานได้อย่างสมบูรณ์แบบ', 'warning');
    showToast('warning', '🧪 ทดสอบระบบแจ้งเตือน', 'เสียงแจ้งเตือนและ Toast พร้อมใช้งาน 100%');

    try {
      await fetch('/api/notifications/test', { method: 'POST' });
    } catch (e) {
      console.warn('Backend test alert error:', e);
    }
  }

  function openNotifModal() {
    applySettingsToModal(notificationSettings);
    if (notifModal) notifModal.classList.remove('hidden');
    if (notifBadge) notifBadge.classList.add('hidden');
    requestBrowserPushPermission();
  }

  function closeNotifModal() {
    if (notifModal) notifModal.classList.add('hidden');
  }

  // ==========================================================================
  // 5. Data Fetching & UI Rendering
  // ==========================================================================
  async function fetchQuotaData() {
    setLoadingState(true);

    try {
      const response = await fetch('/api/quota');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      currentRawData = data;

      if (data.success) {
        updateUI(data);
        setConnectionStatus(true, 'Connected');
        if (data.alerts && data.alerts.length) {
          handleAlerts(data.alerts);
        }
      } else {
        throw new Error(data.error || 'Failed to fetch quota data');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setConnectionStatus(false, 'Disconnected');
    } finally {
      setLoadingState(false);
    }
  }

  function setLoadingState(isLoading) {
    if (!refreshBtn) return;
    const spinIcon = refreshBtn.querySelector('.spin-icon');
    if (isLoading) {
      if (spinIcon) spinIcon.classList.add('spinning');
      refreshBtn.disabled = true;
    } else {
      if (spinIcon) spinIcon.classList.remove('spinning');
      refreshBtn.disabled = false;
    }
  }

  function setConnectionStatus(isOnline, text) {
    if (!connectionStatus) return;
    const pulseDot = connectionStatus.querySelector('.pulse-dot');
    const statusText = connectionStatus.querySelector('.status-text');

    if (statusText) statusText.textContent = text;
    if (pulseDot) {
      if (isOnline) {
        pulseDot.classList.remove('error');
      } else {
        pulseDot.classList.add('error');
      }
    }
  }

  function updateUI(data) {
    // 1. Account Details
    const email = data.account?.email || '';
    const name = data.account?.accountName || data.account?.username || 'Google User';

    if (accountEmailEl) {
      accountEmailEl.textContent = email || name;
      accountEmailEl.title = email || name;
    }
    if (accountNameEl) {
      accountNameEl.textContent = name;
      accountNameEl.title = name;
    }
    if (accountAvatarEl && accountAvatarFallbackEl) {
      if (data.account?.pictureUrl) {
        accountAvatarEl.onerror = () => {
          accountAvatarEl.classList.add('hidden');
          accountAvatarFallbackEl.classList.remove('hidden');
        };
        accountAvatarEl.onload = () => {
          accountAvatarEl.classList.remove('hidden');
          accountAvatarFallbackEl.classList.add('hidden');
        };
        accountAvatarEl.src = data.account.pictureUrl;
      } else {
        accountAvatarEl.classList.add('hidden');
        accountAvatarFallbackEl.classList.remove('hidden');
      }
    }
    if (runningSpeedTextEl && data.runningSpeed) {
      runningSpeedTextEl.textContent = `SPEED: ${data.runningSpeed.toUpperCase()}`;
    }

    // 2. Header & Info Card values
    if (pluginVersionEl && data.version) {
      pluginVersionEl.textContent = data.version.startsWith('v') ? data.version : `v${data.version}`;
      pluginVersionEl.title = `Plugin Version ${data.version}`;
    }

    const modelName = data.activeModel || 'Gemini 4 Argon (Medium)';
    const isPrimaryActive = /^Gemini 4\b/i.test(modelName) || Boolean(data.isPrimaryModelActive);

    if (activeModelEl) {
      activeModelEl.textContent = modelName;
      activeModelEl.title = modelName;
    }

    if (gemini4ActiveBadgeEl) {
      if (isPrimaryActive) {
        gemini4ActiveBadgeEl.textContent = `● ACTIVE · ${modelName}`;
        gemini4ActiveBadgeEl.classList.remove('standby');
        if (copySwitchGemini4Btn) copySwitchGemini4Btn.classList.add('hidden');
      } else {
        gemini4ActiveBadgeEl.textContent = 'STANDBY · PRIMARY TIER';
        gemini4ActiveBadgeEl.classList.add('standby');
        if (copySwitchGemini4Btn) copySwitchGemini4Btn.classList.remove('hidden');
      }
    }

    if (remainingCreditsEl) {
      remainingCreditsEl.textContent = `${data.credits?.remaining ?? 0} Credits`;
    }
    if (authMethodEl) {
      authMethodEl.textContent = (data.account?.authMethod || data.token?.authMethod || 'Consumer').toUpperCase();
    }

    if (data.credits?.upgradeUrl && upgradeLinkEl) {
      upgradeLinkEl.href = data.credits.upgradeUrl;
    }

    const now = new Date();
    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = now.toLocaleTimeString('en-GB', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }

    // 3. Raw JSON Drawer
    if (jsonCode) {
      jsonCode.textContent = JSON.stringify(data, null, 2);
    }

    // 4. Process Quotas & Render Meters
    const quotas = data.quotas || [];
    let hasGemini45h = false;

    quotas.forEach(q => {
      let targetPrefix = '';

      if (/^Gemini 4\b/i.test(q.category)) {
        if (gemini4GroupTitleEl && q.category) {
          gemini4GroupTitleEl.textContent = q.category;
        }
        if (q.limitType.includes('Five Hour') || q.limitType.includes('5-Hour')) {
          targetPrefix = 'gemini45h';
          hasGemini45h = true;
        } else {
          targetPrefix = 'gemini4Weekly';
          if (gemini4WeeklyTitleEl && q.limitType) {
            gemini4WeeklyTitleEl.textContent = q.limitType;
          }
        }
      } else if (q.category === 'Gemini Models') {
        if (q.limitType.includes('Weekly')) targetPrefix = 'geminiWeekly';
        else if (q.limitType.includes('Five Hour')) targetPrefix = 'gemini5h';
      } else if (q.category === 'Claude and GPT models') {
        if (q.limitType.includes('Weekly')) targetPrefix = 'claudeWeekly';
        else if (q.limitType.includes('Five Hour')) targetPrefix = 'claude5h';
      }

      if (targetPrefix) {
        updateMeterCard(targetPrefix, q.percentage, q.resetAt, q.category);
      }
    });

    if (meterGemini45hEl && gemini4MetersContainerEl) {
      if (hasGemini45h) {
        meterGemini45hEl.classList.remove('hidden');
        gemini4MetersContainerEl.classList.add('two-cols');
      } else {
        meterGemini45hEl.classList.add('hidden');
        gemini4MetersContainerEl.classList.remove('two-cols');
      }
    }
  }

  function updateMeterCard(prefix, percent, resetAt, category) {
    const percentEl = document.getElementById(`${prefix}Percent`);
    const fillEl = document.getElementById(`${prefix}Fill`);
    const badgeEl = document.getElementById(`${prefix}Badge`);
    const timerEl = document.getElementById(`${prefix}Timer`);
    const burnRateEl = document.getElementById(`${prefix}BurnRate`);
    const sparklineEl = document.getElementById(`${prefix}Sparkline`);
    const actionsEl = document.getElementById(`${prefix}Actions`);

    if (!percentEl || !fillEl || !badgeEl || !timerEl) return;

    percentEl.textContent = `${percent}%`;
    fillEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;

    // Clear old fill classes
    fillEl.className = 'progress-bar-fill';
    badgeEl.className = 'status-badge';

    const warningThresh = notificationSettings.warningThreshold ?? 30;
    const criticalThresh = notificationSettings.criticalThreshold ?? 15;

    if (percent > warningThresh) {
      fillEl.classList.add('fill-healthy');
      badgeEl.classList.add('badge-healthy');
      badgeEl.textContent = 'Healthy';
    } else if (percent > criticalThresh) {
      fillEl.classList.add('fill-warning');
      badgeEl.classList.add('badge-warning');
      badgeEl.textContent = 'Warning';
    } else {
      fillEl.classList.add('fill-critical');
      badgeEl.classList.add('badge-critical');
      badgeEl.textContent = 'Critical';
    }

    // Record History & Calculate Burn Rate
    recordQuotaHistory(prefix, percent);
    updateBurnRateBadge(prefix, burnRateEl);
    renderSparkline(prefix, sparklineEl);

    // Render Contextual Quick Actions
    renderContextualActions(prefix, percent, actionsEl, category);

    startCountdownTimer(prefix, resetAt, timerEl);
  }

  // ==========================================================================
  // 6. Quota Velocity, Burn Rate & Sparklines
  // ==========================================================================
  function recordQuotaHistory(key, percent) {
    if (!quotaHistory[key]) quotaHistory[key] = [];
    const now = Date.now();

    // Prevent duplicate entries within 5 seconds
    const last = quotaHistory[key][quotaHistory[key].length - 1];
    if (last && now - last.time < 5000) {
      last.percent = percent;
      return;
    }

    quotaHistory[key].push({ time: now, percent });
    // Keep last 10 points
    if (quotaHistory[key].length > 10) {
      quotaHistory[key].shift();
    }
  }

  function updateBurnRateBadge(key, element) {
    if (!element) return;
    const history = quotaHistory[key] || [];

    if (history.length < 2) {
      element.className = 'burn-rate-badge rate-stable';
      element.textContent = '🟢 Stable';
      return;
    }

    const first = history[0];
    const latest = history[history.length - 1];
    const deltaPercent = first.percent - latest.percent;
    const elapsedHours = (latest.time - first.time) / (1000 * 60 * 60);

    if (latest.percent === 100 && deltaPercent <= 0) {
      element.className = 'burn-rate-badge rate-stable';
      element.textContent = '✨ 100% Quota';
    } else if (deltaPercent > 0 && elapsedHours > 0.001) {
      const burnRatePerHour = Math.round(deltaPercent / Math.max(elapsedHours, 0.1));
      if (burnRatePerHour >= 15) {
        element.className = 'burn-rate-badge rate-rapid';
        element.textContent = `🔥 ~${burnRatePerHour}%/hr`;
      } else {
        element.className = 'burn-rate-badge rate-moderate';
        element.textContent = `⚡ ~${burnRatePerHour}%/hr`;
      }
    } else {
      element.className = 'burn-rate-badge rate-stable';
      element.textContent = '🟢 Stable';
    }
  }

  function renderSparkline(key, container) {
    if (!container) return;
    const history = quotaHistory[key] || [];
    if (history.length < 2) {
      container.innerHTML = '<span style="font-size: 0.6875rem; color: var(--text-muted);">Collecting session telemetry...</span>';
      return;
    }

    const width = container.clientWidth || 220;
    const height = 28;
    const points = history.map((item, idx) => {
      const x = (idx / (history.length - 1)) * (width - 12) + 6;
      const y = height - (item.percent / 100) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const pathData = `M ${points.split(' ').join(' L ')}`;
    const areaData = `${pathData} L ${width - 6},${height} L 6,${height} Z`;

    container.innerHTML = `
      <svg class="sparkline-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        <path d="${areaData}" fill="var(--sparkline-fill)" />
        <path d="${pathData}" fill="none" stroke="var(--sparkline-stroke)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;
  }

  function renderContextualActions(prefix, percent, container, category) {
    if (!container) return;
    const warningThresh = notificationSettings.warningThreshold ?? 30;
    const criticalThresh = notificationSettings.criticalThreshold ?? 15;
    const isGemini4Card = prefix.startsWith('gemini4');

    if (percent <= criticalThresh) {
      container.classList.remove('hidden');
      const primaryActionCmd = isGemini4Card ? 'agy --model gemini-4-argon-low' : 'agy --model gemini-4-argon-medium';
      const primaryActionLabel = isGemini4Card ? '💎 Use Gemini 4 (Low)' : '💎 Switch to Gemini 4';

      container.innerHTML = `
        <div class="quick-action-header">
          <span>⚠️ Quota Critical (<${criticalThresh}%) - Recommended Actions:</span>
        </div>
        <div class="quick-action-btns">
          <button class="quick-action-btn" data-action="switch-primary">
            <span>${primaryActionLabel}</span>
          </button>
          <button class="quick-action-btn" data-action="switch-flash">
            <span>⚡ Use Gemini 3.8 Flash</span>
          </button>
          <a href="https://antigravity.google/g1-upgrade" target="_blank" class="quick-action-btn">
            <span>👑 Upgrade Plan ↗</span>
          </a>
        </div>
      `;

      const primaryBtn = container.querySelector('[data-action="switch-primary"]');
      if (primaryBtn) {
        primaryBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(primaryActionCmd);
          showToast('success', 'Model Switch Command Copied', `Copied: \`${primaryActionCmd}\` to clipboard`);
        });
      }

      const switchBtn = container.querySelector('[data-action="switch-flash"]');
      if (switchBtn) {
        switchBtn.addEventListener('click', () => {
          navigator.clipboard.writeText('agy --model gemini-3.8-flash-high');
          showToast('success', 'Model Switch Command Copied', 'Copied: `agy --model gemini-3.8-flash-high` to clipboard');
        });
      }
    } else if (percent <= warningThresh) {
      container.classList.remove('hidden');
      container.innerHTML = `
        <div class="quick-action-header" style="color: var(--accent-amber);">
          <span>⚡ Quota Warning (<${warningThresh}%)</span>
        </div>
        <div class="quick-action-btns">
          <span style="font-size: 0.75rem; color: var(--text-secondary);">
            Tip: Compress prompts or avoid running unconstrained autonomous background loops.
          </span>
        </div>
      `;
    } else {
      container.classList.add('hidden');
      container.innerHTML = '';
    }
  }

  // ==========================================================================
  // 7. Relative Countdown Timers
  // ==========================================================================
  function startCountdownTimer(key, resetAtStr, element) {
    if (countdownTimers[key]) {
      clearInterval(countdownTimers[key]);
    }

    if (!resetAtStr) {
      element.textContent = 'Active';
      return;
    }

    const resetDate = new Date(resetAtStr);
    if (isNaN(resetDate.getTime())) {
      element.textContent = resetAtStr;
      return;
    }

    const exactFormatted = resetDate.toLocaleTimeString('en-GB', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      day: 'numeric'
    });

    function updateClock() {
      const now = new Date();
      const diff = resetDate.getTime() - now.getTime();

      if (diff <= 0) {
        element.textContent = `${exactFormatted} (Resetting...)`;
        clearInterval(countdownTimers[key]);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const remHours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const remMins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const remSecs = Math.floor((diff % (1000 * 60)) / 1000);

      let remText = '';
      if (days > 0) {
        remText = `in ${days}d ${remHours}h`;
      } else if (remHours > 0) {
        remText = `in ${remHours}h ${remMins}m`;
      } else {
        remText = `in ${remMins}m ${remSecs}s`;
      }

      element.textContent = `${exactFormatted} (${remText})`;
    }

    updateClock();
    countdownTimers[key] = setInterval(updateClock, 1000);
  }

  // ==========================================================================
  // 8. Event Listeners & Initialization
  // ==========================================================================
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchQuotaData();
    });
  }

  if (copySwitchGemini4Btn) {
    copySwitchGemini4Btn.addEventListener('click', () => {
      navigator.clipboard.writeText('agy --model gemini-4-argon-medium');
      showToast('success', 'Primary Model Command Copied', 'Copied: `agy --model gemini-4-argon-medium` to clipboard');
    });
  }

  if (notifBtn) notifBtn.addEventListener('click', openNotifModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeNotifModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeNotifModal);
  if (saveNotifBtn) saveNotifBtn.addEventListener('click', saveSettingsFromModal);
  if (testNotifBtn) testNotifBtn.addEventListener('click', triggerTestAlert);

  if (notifBrowserToggle) {
    notifBrowserToggle.addEventListener('change', (e) => {
      if (e.target.checked) requestBrowserPushPermission();
    });
  }

  if (notifModal) {
    notifModal.addEventListener('click', (e) => {
      if (e.target === notifModal) closeNotifModal();
    });
  }

  if (autoRefreshToggle) {
    autoRefreshToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        startAutoRefresh();
      } else {
        stopAutoRefresh();
      }
    });
  }

  if (toggleJsonBtn && jsonDrawer) {
    toggleJsonBtn.addEventListener('click', () => {
      jsonDrawer.classList.toggle('hidden');
      toggleJsonBtn.classList.toggle('active');
    });
  }

  if (copyJsonBtn) {
    copyJsonBtn.addEventListener('click', () => {
      if (currentRawData) {
        navigator.clipboard.writeText(JSON.stringify(currentRawData, null, 2));
        copyJsonBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyJsonBtn.textContent = 'Copy JSON';
        }, 2000);
      }
    });
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(fetchQuotaData, 30000);
  }

  function stopAutoRefresh() {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  }

  // Initialize
  initTheme();
  fetchNotificationSettings();
  fetchQuotaData();
  if (autoRefreshToggle && autoRefreshToggle.checked) {
    startAutoRefresh();
  }
});
