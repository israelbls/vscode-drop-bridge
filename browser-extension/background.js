/**
 * background.js - Service Worker for Manifest V3
 *
 * Handles:
 * - Server health checks
 * - File fetching from local server
 * - Message passing between popup/options and content scripts
 * - Extension state management
 */

const SERVER_URL = 'http://127.0.0.1:48369';
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

// Cache server status
let serverStatus = {
  running: false,
  lastCheck: 0,
  version: null
};

let debugMode = false;

// Initialize debug mode
chrome.storage.sync.get(['debugMode'], (result) => {
  debugMode = result.debugMode === true;
});

// Monitor debug mode changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.debugMode) {
    debugMode = changes.debugMode.newValue === true;
  }
});

function log(...args) {
  if (debugMode) {
    console.log('[VSCode Drop Bridge BG]', ...args);
  }
}

/**
 * Check if the local server is running
 */
async function checkServerHealth() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${SERVER_URL}/health`, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      serverStatus = {
        running: true,
        lastCheck: Date.now(),
        version: data.version || '1.0'
      };
      return serverStatus;
    }
  } catch (err) {
    // Server not running or error
  }

  serverStatus = {
    running: false,
    lastCheck: Date.now(),
    version: null
  };

  return serverStatus;
}

/**
 * Fetch a file from the local server
 */
async function fetchFile(filePath) {
  const response = await fetch(`${SERVER_URL}/file?path=${encodeURIComponent(filePath)}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return await response.json();
}

/**
 * Get clipboard files from server
 */
async function getClipboard() {
  const response = await fetch(`${SERVER_URL}/clipboard`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to get clipboard');
  }

  return await response.json();
}

/**
 * Clear clipboard on server
 */
async function clearClipboard() {
  await fetch(`${SERVER_URL}/clipboard`, {
    method: 'DELETE'
  });
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  switch (message.type) {
    case 'checkServer':
      checkServerHealth().then(sendResponse);
      return true; // Async response

    case 'getServerStatus':
      // Return cached status if recent, otherwise check
      if (Date.now() - serverStatus.lastCheck < 5000) {
        sendResponse(serverStatus);
      } else {
        checkServerHealth().then(sendResponse);
        return true;
      }
      break;

    case 'fetchFile':
      fetchFile(message.path)
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'getClipboard':
      getClipboard()
        .then(data => sendResponse({ success: true, data }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'clearClipboard':
      clearClipboard()
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'getSettings':
      chrome.storage.sync.get(['enabled', 'debugMode', 'blacklist', 'whitelist'], (result) => {
        sendResponse({
          enabled: result.enabled !== false,
          debugMode: result.debugMode === true,
          blacklist: result.blacklist || [],
          whitelist: result.whitelist || []
        });
      });
      return true;

    case 'setSettings':
      chrome.storage.sync.set(message.settings, () => {
        sendResponse({ success: true });
      });
      return true;
  }
});

// Initial health check
checkServerHealth();

// Periodic health check
setInterval(checkServerHealth, HEALTH_CHECK_INTERVAL);

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default settings
    chrome.storage.sync.set({
      enabled: true,
      debugMode: false,
      blacklist: [],
      whitelist: []
    });

    log('Extension installed');
  } else if (details.reason === 'update') {
    log('Extension updated to', chrome.runtime.getManifest().version);
  }
});

log('Background service worker started');
