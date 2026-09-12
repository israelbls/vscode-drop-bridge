/**
 * Popup UI logic for VS Code Drop Bridge.
 */

document.addEventListener("DOMContentLoaded", async () => {
  // ============================================================================
  // DOM Elements
  // ============================================================================

  const elements = {
    statusDot: document.getElementById("statusDot"),
    statusLabel: document.getElementById("statusLabel"),
    statusText: document.getElementById("statusText"),
    enableToggle: document.getElementById("enableToggle"),
    debugToggle: document.getElementById("debugToggle"),
    infoText: document.getElementById("infoText"),
    version: document.getElementById("version"),
    settingsLink: document.getElementById("settingsLink"),
  };

  // ============================================================================
  // Initialization
  // ============================================================================

  // Set version from manifest
  const manifest = chrome.runtime.getManifest();
  elements.version.textContent = `v${manifest.version}`;

  // Load current settings
  const settings = await loadSettings();
  elements.enableToggle.checked = settings.enabled;
  elements.debugToggle.checked = settings.debugMode;

  // ============================================================================
  // Server Status
  // ============================================================================

  async function checkStatus() {
    updateStatusDisplay("checking");

    try {
      const status = await sendMessage({ type: "checkServer" });
      updateStatusDisplay(status.running ? "connected" : "disconnected", status.version);
    } catch (err) {
      updateStatusDisplay("error", null, err.message);
    }
  }

  function updateStatusDisplay(state, version = null, errorMessage = null) {
    const { statusDot, statusLabel, statusText, infoText } = elements;

    switch (state) {
      case "checking":
        statusLabel.textContent = "Checking...";
        statusText.textContent = "Connecting to VSCode...";
        statusDot.classList.remove("connected");
        break;

      case "connected":
        statusDot.classList.add("connected");
        statusLabel.textContent = "Connected";
        statusText.textContent = `VSCode server running (v${version || "1.0"})`;
        infoText.textContent =
          "Drag files from VSCode's explorer to any website, or copy files and paste them into file upload areas.";
        break;

      case "disconnected":
        statusDot.classList.remove("connected");
        statusLabel.textContent = "Disconnected";
        statusText.textContent = "VSCode not detected";
        infoText.textContent =
          "Open VSCode with the Drop Bridge extension installed to enable file transfers.";
        break;

      case "error":
        statusDot.classList.remove("connected");
        statusLabel.textContent = "Error";
        statusText.textContent = errorMessage || "Unknown error";
        break;
    }
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  async function loadSettings() {
    return sendMessage({ type: "getSettings" });
  }

  async function saveSetting(key, value) {
    await sendMessage({
      type: "setSettings",
      settings: { [key]: value },
    });
  }

  // ============================================================================
  // Event Listeners
  // ============================================================================

  elements.enableToggle.addEventListener("change", () => {
    saveSetting("enabled", elements.enableToggle.checked);
  });

  elements.debugToggle.addEventListener("change", () => {
    saveSetting("debugMode", elements.debugToggle.checked);
  });

  elements.settingsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Cleanup on popup close
  let statusInterval;

  window.addEventListener("unload", () => {
    if (statusInterval) {
      clearInterval(statusInterval);
    }
  });

  // ============================================================================
  // Start
  // ============================================================================

  // Initial status check
  await checkStatus();

  // Refresh status every 5 seconds while popup is open
  statusInterval = setInterval(checkStatus, 5000);
});
