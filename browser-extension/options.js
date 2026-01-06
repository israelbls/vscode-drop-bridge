/**
 * options.js - Settings page logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  const enableToggle = document.getElementById('enableToggle');
  const debugToggle = document.getElementById('debugToggle');
  const blacklistInput = document.getElementById('blacklistInput');
  const addBlacklistBtn = document.getElementById('addBlacklist');
  const blacklistTags = document.getElementById('blacklistTags');
  const whitelistInput = document.getElementById('whitelistInput');
  const addWhitelistBtn = document.getElementById('addWhitelist');
  const whitelistTags = document.getElementById('whitelistTags');
  const resetBtn = document.getElementById('resetBtn');
  const statusMessage = document.getElementById('statusMessage');
  const versionEl = document.getElementById('version');
  
  // State
  let settings = {
    enabled: true,
    debugMode: false,
    blacklist: [],
    whitelist: []
  };
  
  // Set version
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `v${manifest.version}`;
  
  // Show status message
  function showStatus(message, type = 'success') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type} visible`;
    
    setTimeout(() => {
      statusMessage.classList.remove('visible');
    }, 3000);
  }
  
  // Save settings
  async function saveSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.set(settings, () => {
        resolve();
      });
    });
  }
  
  // Render domain tags
  function renderDomainTags(container, domains, listType) {
    if (domains.length === 0) {
      const emptyMsg = listType === 'blacklist' 
        ? 'No domains blacklisted' 
        : 'No domains whitelisted (works on all sites)';
      container.innerHTML = `<span class="empty-message">${emptyMsg}</span>`;
      return;
    }
    
    container.innerHTML = domains.map((domain, index) => `
      <span class="domain-tag">
        ${escapeHtml(domain)}
        <button data-index="${index}" data-list="${listType}" title="Remove">&times;</button>
      </span>
    `).join('');
    
    // Add remove handlers
    container.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const index = parseInt(btn.dataset.index, 10);
        const list = btn.dataset.list;
        
        settings[list].splice(index, 1);
        await saveSettings();
        renderDomainTags(container, settings[list], list);
        showStatus('Domain removed');
      });
    });
  }
  
  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Normalize domain
  function normalizeDomain(domain) {
    domain = domain.trim().toLowerCase();
    // Remove protocol if present
    domain = domain.replace(/^https?:\/\//, '');
    // Remove path
    domain = domain.split('/')[0];
    // Remove port
    domain = domain.split(':')[0];
    return domain;
  }
  
  // Load settings
  chrome.storage.sync.get(['enabled', 'debugMode', 'blacklist', 'whitelist'], (result) => {
    settings = {
      enabled: result.enabled !== false,
      debugMode: result.debugMode === true,
      blacklist: result.blacklist || [],
      whitelist: result.whitelist || []
    };
    
    enableToggle.checked = settings.enabled;
    debugToggle.checked = settings.debugMode;
    renderDomainTags(blacklistTags, settings.blacklist, 'blacklist');
    renderDomainTags(whitelistTags, settings.whitelist, 'whitelist');
  });
  
  // Toggle handlers
  enableToggle.addEventListener('change', async () => {
    settings.enabled = enableToggle.checked;
    await saveSettings();
    showStatus(settings.enabled ? 'Extension enabled' : 'Extension disabled');
  });
  
  debugToggle.addEventListener('change', async () => {
    settings.debugMode = debugToggle.checked;
    await saveSettings();
    showStatus(settings.debugMode ? 'Debug mode enabled' : 'Debug mode disabled');
  });
  
  // Add to blacklist
  async function addToBlacklist() {
    const domain = normalizeDomain(blacklistInput.value);
    if (!domain) return;
    
    if (settings.blacklist.includes(domain)) {
      showStatus('Domain already in blacklist', 'error');
      return;
    }
    
    settings.blacklist.push(domain);
    await saveSettings();
    renderDomainTags(blacklistTags, settings.blacklist, 'blacklist');
    blacklistInput.value = '';
    showStatus('Domain added to blacklist');
  }
  
  addBlacklistBtn.addEventListener('click', addToBlacklist);
  blacklistInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addToBlacklist();
  });
  
  // Add to whitelist
  async function addToWhitelist() {
    const domain = normalizeDomain(whitelistInput.value);
    if (!domain) return;
    
    if (settings.whitelist.includes(domain)) {
      showStatus('Domain already in whitelist', 'error');
      return;
    }
    
    settings.whitelist.push(domain);
    await saveSettings();
    renderDomainTags(whitelistTags, settings.whitelist, 'whitelist');
    whitelistInput.value = '';
    showStatus('Domain added to whitelist');
  }
  
  addWhitelistBtn.addEventListener('click', addToWhitelist);
  whitelistInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addToWhitelist();
  });
  
  // Reset settings
  resetBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset all settings to defaults?')) {
      return;
    }
    
    settings = {
      enabled: true,
      debugMode: false,
      blacklist: [],
      whitelist: []
    };
    
    await saveSettings();
    
    enableToggle.checked = true;
    debugToggle.checked = false;
    renderDomainTags(blacklistTags, [], 'blacklist');
    renderDomainTags(whitelistTags, [], 'whitelist');
    
    showStatus('Settings reset to defaults');
  });
});
