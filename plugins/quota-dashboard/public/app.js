document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refreshBtn');
  const autoRefreshToggle = document.getElementById('autoRefreshToggle');
  const connectionStatus = document.getElementById('connectionStatus');
  const activeModelEl = document.getElementById('activeModel');
  const accountNameEl = document.getElementById('accountName');
  const accountEmailEl = document.getElementById('accountEmail');
  const accountAvatarEl = document.getElementById('accountAvatar');
  const accountAvatarFallbackEl = document.getElementById('accountAvatarFallback');
  const runningSpeedTextEl = document.getElementById('runningSpeedText');
  const remainingCreditsEl = document.getElementById('remainingCredits');
  const upgradeLinkEl = document.getElementById('upgradeLink');
  const authMethodEl = document.getElementById('authMethod');
  const lastUpdatedEl = document.getElementById('lastUpdated');
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

  // Web Audio API Chime Synthesizer
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
        // Urgent 3-tone chime (587Hz -> 440Hz -> 330Hz)
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(440.00, now + 0.12); // A4
        osc.frequency.setValueAtTime(329.63, now + 0.24); // E4
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === 'reset' || type === 'success') {
        // Melodic upward chime (440Hz -> 554Hz -> 659Hz)
        osc.frequency.setValueAtTime(440.00, now); // A4
        osc.frequency.setValueAtTime(554.37, now + 0.12); // C#5
        osc.frequency.setValueAtTime(659.25, now + 0.24); // E5
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else {
        // Warm 2-tone warning chime (440Hz -> 523Hz)
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

  // Browser Push Notifications
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
        silent: true // Audio handled by Web Audio API
      });
      setTimeout(() => notif.close(), 6000);
    } catch (e) {
      console.warn('Browser push error:', e);
    }
  }

  // Toast System
  function showToast(type, title, message) {
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

    // Auto dismiss after 6s
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

  // Handle incoming alert events
  function handleAlerts(alerts) {
    if (!alerts || !alerts.length) return;

    alerts.forEach(alert => {
      playChime(alert.level);
      showBrowserPush(alert.title, alert.message, alert.level);
      showToast(alert.level, alert.title, alert.message);
    });

    notifBadge.classList.remove('hidden');
  }

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
    notifMasterToggle.checked = !!settings.enabled;
    notifSoundToggle.checked = !!settings.soundEnabled;
    notifBrowserToggle.checked = !!settings.browserPushEnabled;
    notifOsToggle.checked = !!settings.osNativeEnabled;
    notifResetToggle.checked = !!settings.notifyOnReset;
    warningThresholdInput.value = settings.warningThreshold ?? 30;
    criticalThresholdInput.value = settings.criticalThreshold ?? 15;
    cooldownInput.value = settings.cooldownMinutes ?? 15;
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
    notifModal.classList.remove('hidden');
    notifBadge.classList.add('hidden');
    requestBrowserPushPermission();
  }

  function closeNotifModal() {
    notifModal.classList.add('hidden');
  }

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
      setConnectionStatus(false, 'Connection Error');
    } finally {
      setLoadingState(false);
    }
  }

  function setLoadingState(isLoading) {
    const spinIcon = refreshBtn.querySelector('.spin-icon');
    if (isLoading) {
      spinIcon.classList.add('spinning');
      refreshBtn.disabled = true;
    } else {
      spinIcon.classList.remove('spinning');
      refreshBtn.disabled = false;
    }
  }

  function setConnectionStatus(isOnline, text) {
    const pulseDot = connectionStatus.querySelector('.pulse-dot');
    const statusText = connectionStatus.querySelector('.status-text');

    statusText.textContent = text;
    if (isOnline) {
      pulseDot.classList.remove('error');
    } else {
      pulseDot.classList.add('error');
    }
  }

  function updateUI(data) {
    // Account details (Display Google Email prominently)
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
      runningSpeedTextEl.textContent = `Speed: ${data.runningSpeed.toUpperCase()}`;
    }

    // Header & Info cards
    const modelName = data.activeModel || 'Gemini 3.6 Flash (High)';
    activeModelEl.textContent = modelName;
    activeModelEl.title = modelName;
    remainingCreditsEl.textContent = `${data.credits?.remaining ?? 0} Credits`;
    authMethodEl.textContent = (data.account?.authMethod || data.token?.authMethod || 'Consumer').toUpperCase();

    if (data.credits?.upgradeUrl) {
      upgradeLinkEl.href = data.credits.upgradeUrl;
    }

    const now = new Date();
    lastUpdatedEl.textContent = now.toLocaleTimeString('en-US');

    // Update raw JSON
    jsonCode.textContent = JSON.stringify(data, null, 2);

    // Process Quotas
    const quotas = data.quotas || [];

    quotas.forEach(q => {
      let targetPrefix = '';

      if (q.category === 'Gemini Models') {
        if (q.limitType.includes('Weekly')) targetPrefix = 'geminiWeekly';
        else if (q.limitType.includes('Five Hour')) targetPrefix = 'gemini5h';
      } else if (q.category === 'Claude and GPT models') {
        if (q.limitType.includes('Weekly')) targetPrefix = 'claudeWeekly';
        else if (q.limitType.includes('Five Hour')) targetPrefix = 'claude5h';
      }

      if (targetPrefix) {
        updateMeterCard(targetPrefix, q.percentage, q.resetAt);
      }
    });
  }

  function updateMeterCard(prefix, percent, resetAt) {
    const percentEl = document.getElementById(`${prefix}Percent`);
    const fillEl = document.getElementById(`${prefix}Fill`);
    const badgeEl = document.getElementById(`${prefix}Badge`);
    const timerEl = document.getElementById(`${prefix}Timer`);

    if (!percentEl || !fillEl || !badgeEl || !timerEl) return;

    percentEl.textContent = `${percent}%`;
    fillEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;

    // Clear old fill classes
    fillEl.className = 'progress-bar-fill';
    badgeEl.className = 'status-badge';

    if (percent > (notificationSettings.warningThreshold ?? 30)) {
      fillEl.classList.add('fill-healthy');
      badgeEl.classList.add('badge-healthy');
      badgeEl.textContent = 'Healthy';
    } else if (percent > (notificationSettings.criticalThreshold ?? 15)) {
      fillEl.classList.add('fill-warning');
      badgeEl.classList.add('badge-warning');
      badgeEl.textContent = 'Warning';
    } else {
      fillEl.classList.add('fill-critical');
      badgeEl.classList.add('badge-critical');
      badgeEl.textContent = 'Critical';
    }

    startCountdownTimer(prefix, resetAt, timerEl);
  }

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

    const exactFormatted = resetDate.toLocaleTimeString('en-US', {
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

  // Event Listeners
  refreshBtn.addEventListener('click', () => {
    fetchQuotaData();
  });

  notifBtn.addEventListener('click', openNotifModal);
  closeModalBtn.addEventListener('click', closeNotifModal);
  cancelModalBtn.addEventListener('click', closeNotifModal);
  saveNotifBtn.addEventListener('click', saveSettingsFromModal);
  testNotifBtn.addEventListener('click', triggerTestAlert);

  notifBrowserToggle.addEventListener('change', (e) => {
    if (e.target.checked) requestBrowserPushPermission();
  });

  notifModal.addEventListener('click', (e) => {
    if (e.target === notifModal) closeNotifModal();
  });

  autoRefreshToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });

  toggleJsonBtn.addEventListener('click', () => {
    jsonDrawer.classList.toggle('hidden');
    toggleJsonBtn.classList.toggle('active');
  });

  copyJsonBtn.addEventListener('click', () => {
    if (currentRawData) {
      navigator.clipboard.writeText(JSON.stringify(currentRawData, null, 2));
      copyJsonBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyJsonBtn.textContent = 'Copy JSON';
      }, 2000);
    }
  });

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

  // Initial load
  fetchNotificationSettings();
  fetchQuotaData();
  if (autoRefreshToggle.checked) {
    startAutoRefresh();
  }
});
