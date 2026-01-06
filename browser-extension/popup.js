/**
 * popup.js - Popup UI logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot');
  const statusLabel = document.getElementById('statusLabel');
  const statusText = document.getElementById('statusText');
  const enableToggle = document.getElementById('enableToggle');
  const debugToggle = document.getElementById('debugToggle');
  const infoText = document.getElementById('infoText');
  const versionEl = document.getElementById('version');
  
  // Set version
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `v${manifest.version}`;
  
  // Load current settings
  const settings = await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'getSettings' }, resolve);
  });
  
  enableToggle.checked = settings.enabled;
  debugToggle.checked = settings.debugMode;
  
  // Check server status
  async function checkStatus() {
    statusLabel.textContent = 'Checking...';
    statusText.textContent = 'Connecting to VSCode...';
    statusDot.classList.remove('connected');
    
    try {
      const status = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'checkServer' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      if (status.running) {
        statusDot.classList.add('connected');
        statusLabel.textContent = 'Connected';
        statusText.textContent = `VSCode server running (v${status.version || '1.0'})`;
        infoText.textContent = 'Drag files from VSCode\'s explorer to any website, or copy files and paste them into file upload areas.';
      } else {
        statusDot.classList.remove('connected');
        statusLabel.textContent = 'Disconnected';
        statusText.textContent = 'VSCode not detected';
        infoText.textContent = 'Open VSCode with the Drop Bridge extension installed to enable file transfers.';
      }
    } catch (err) {
      statusDot.classList.remove('connected');
      statusLabel.textContent = 'Error';
      statusText.textContent = err.message;
    }
  }
  
  // Initial check
  await checkStatus();
  
  // Refresh status every 5 seconds while popup is open
  const statusInterval = setInterval(checkStatus, 5000);
  
  // Save settings on toggle change
  enableToggle.addEventListener('change', () => {
    chrome.runtime.sendMessage({
      type: 'setSettings',
      settings: { enabled: enableToggle.checked }
    });
  });
  
  debugToggle.addEventListener('change', () => {
    chrome.runtime.sendMessage({
      type: 'setSettings',
      settings: { debugMode: debugToggle.checked }
    });
  });
  
  // Open options page
  document.getElementById('settingsLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  
  // Cleanup on popup close
  window.addEventListener('unload', () => {
    clearInterval(statusInterval);
  });
});
