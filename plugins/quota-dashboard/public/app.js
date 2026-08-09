document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refreshBtn');
  const autoRefreshToggle = document.getElementById('autoRefreshToggle');
  const connectionStatus = document.getElementById('connectionStatus');
  const activeModelEl = document.getElementById('activeModel');
  const remainingCreditsEl = document.getElementById('remainingCredits');
  const upgradeLinkEl = document.getElementById('upgradeLink');
  const authMethodEl = document.getElementById('authMethod');
  const lastUpdatedEl = document.getElementById('lastUpdated');
  const toggleJsonBtn = document.getElementById('toggleJsonBtn');
  const jsonDrawer = document.getElementById('jsonDrawer');
  const jsonCode = document.getElementById('jsonCode');
  const copyJsonBtn = document.getElementById('copyJsonBtn');

  let autoRefreshInterval = null;
  let countdownTimers = {};
  let currentRawData = null;

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
    // Header & Info cards
    const modelName = data.activeModel || 'Gemini 3.6 Flash (High)';
    activeModelEl.textContent = modelName;
    activeModelEl.title = modelName;
    remainingCreditsEl.textContent = `${data.credits?.remaining ?? 0} Credits`;
    authMethodEl.textContent = (data.token?.authMethod || 'Consumer').toUpperCase();
    
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

    // Percent Text & Progress Fill
    percentEl.textContent = `${percent}%`;
    const clampedPercent = Math.max(0, Math.min(100, percent));
    
    // Set width directly for 100% reliable progress bar display
    fillEl.style.width = `${clampedPercent}%`;
    fillEl.style.transform = `scaleX(1)`;

    // Colors & Status
    fillEl.className = 'progress-bar-fill';
    percentEl.className = 'meter-percent';
    badgeEl.className = 'status-badge';

    if (percent >= 50) {
      fillEl.classList.add('fill-healthy');
      percentEl.classList.add('text-healthy');
      badgeEl.classList.add('badge-healthy');
      badgeEl.textContent = 'Healthy';
    } else if (percent >= 20) {
      fillEl.classList.add('fill-warning');
      percentEl.classList.add('text-warning');
      badgeEl.classList.add('badge-warning');
      badgeEl.textContent = 'Warning (Low)';
    } else {
      fillEl.classList.add('fill-critical');
      percentEl.classList.add('text-critical');
      badgeEl.classList.add('badge-critical');
      badgeEl.textContent = 'Critical (Very Low)';
    }

    // Countdown Timer
    startCountdown(prefix, resetAt, timerEl);
  }

  function startCountdown(key, resetAtIso, element) {
    if (countdownTimers[key]) {
      clearInterval(countdownTimers[key]);
    }

    if (!resetAtIso) {
      element.textContent = 'N/A';
      return;
    }

    const resetDate = new Date(resetAtIso);
    if (isNaN(resetDate.getTime())) {
      element.textContent = 'N/A';
      return;
    }

    function updateClock() {
      const now = new Date().getTime();
      const resetTimeMs = resetDate.getTime();
      const diff = resetTimeMs - now;

      // English Date & Time formatting
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const day = resetDate.getDate();
      const month = months[resetDate.getMonth()];
      const year = resetDate.getFullYear();
      const hours = String(resetDate.getHours()).padStart(2, '0');
      const mins = String(resetDate.getMinutes()).padStart(2, '0');
      const secs = String(resetDate.getSeconds()).padStart(2, '0');

      const exactFormatted = `${day} ${month} ${year} ${hours}:${mins}:${secs}`;

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
  fetchQuotaData();
  if (autoRefreshToggle.checked) {
    startAutoRefresh();
  }
});
