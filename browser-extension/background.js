/**
 * Background service worker for VS Code Drop Bridge.
 * Handles server health checks, file fetching, and message passing.
 */

// Constants (service worker doesn't have access to content script globals)
const SERVER_URL = "http://127.0.0.1:48369";
const HEALTH_CHECK_INTERVAL = 30000;
const REQUEST_TIMEOUT = 2000;

// Server status cache
let serverStatus = {
  running: false,
  lastCheck: 0,
  version: null,
};

let debugMode = false;

// Initialize debug mode from storage
chrome.storage.sync.get(["debugMode"], (result) => {
  debugMode = result.debugMode === true;
});

// Monitor debug mode changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.debugMode) {
    debugMode = changes.debugMode.newValue === true;
  }
});

/**
 * Logs a message if debug mode is enabled.
 */
function log(...args) {
  if (debugMode) {
    console.log("[VSCode Drop Bridge BG]", ...args);
  }
}

/**
 * Checks if the local server is running.
 */
async function checkServerHealth() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${SERVER_URL}/health`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      serverStatus = {
        running: true,
        lastCheck: Date.now(),
        version: data.version || "1.0",
      };
      return serverStatus;
    }
  } catch {
    // Server not running or error
  }

  serverStatus = {
    running: false,
    lastCheck: Date.now(),
    version: null,
  };

  return serverStatus;
}

/**
 * Fetches a file from the local server.
 */
async function fetchFile(filePath) {
  const response = await fetch(`${SERVER_URL}/file?path=${encodeURIComponent(filePath)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Gets clipboard files from the server.
 */
async function getClipboard() {
  const response = await fetch(`${SERVER_URL}/clipboard`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Failed to get clipboard");
  }

  return response.json();
}

/**
 * Clears the clipboard on the server.
 */
async function clearClipboard() {
  await fetch(`${SERVER_URL}/clipboard`, { method: "DELETE" });
}

/**
 * Handles incoming messages from content scripts and popup.
 */
function handleMessage(message, _sender, sendResponse) {
  if (!message?.type) {
    return false;
  }

  switch (message.type) {
    case "checkServer":
      checkServerHealth().then(sendResponse);
      return true;

    case "getServerStatus":
      // Return cached status if recent
      if (Date.now() - serverStatus.lastCheck < 5000) {
        sendResponse(serverStatus);
        return false;
      }
      checkServerHealth().then(sendResponse);
      return true;

    case "fetchFile":
      fetchFile(message.path)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "getClipboard":
      getClipboard()
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "clearClipboard":
      clearClipboard()
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "getSettings":
      chrome.storage.sync.get(["enabled", "debugMode", "blacklist", "whitelist"], (result) => {
        sendResponse({
          enabled: result.enabled !== false,
          debugMode: result.debugMode === true,
          blacklist: result.blacklist || [],
          whitelist: result.whitelist || [],
        });
      });
      return true;

    case "setSettings":
      chrome.storage.sync.set(message.settings, () => {
        sendResponse({ success: true });
      });
      return true;

    default:
      return false;
  }
}

// Register message listener
chrome.runtime.onMessage.addListener(handleMessage);

// Initial health check
checkServerHealth();

// Periodic health check
setInterval(checkServerHealth, HEALTH_CHECK_INTERVAL);

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.sync.set({
      enabled: true,
      debugMode: false,
      blacklist: [],
      whitelist: [],
    });
    log("Extension installed");
  } else if (details.reason === "update") {
    log("Extension updated to", chrome.runtime.getManifest().version);
  }
});

log("Background service worker started");
