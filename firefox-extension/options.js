/**
 * Options page logic for VS Code Drop Bridge.
 */

document.addEventListener("DOMContentLoaded", async () => {
  // ============================================================================
  // DOM Elements
  // ============================================================================

  const elements = {
    enableToggle: document.getElementById("enableToggle"),
    debugToggle: document.getElementById("debugToggle"),
    blacklistInput: document.getElementById("blacklistInput"),
    addBlacklistBtn: document.getElementById("addBlacklist"),
    blacklistTags: document.getElementById("blacklistTags"),
    whitelistInput: document.getElementById("whitelistInput"),
    addWhitelistBtn: document.getElementById("addWhitelist"),
    whitelistTags: document.getElementById("whitelistTags"),
    resetBtn: document.getElementById("resetBtn"),
    statusMessage: document.getElementById("statusMessage"),
    version: document.getElementById("version"),
  };

  // ============================================================================
  // State
  // ============================================================================

  const DEFAULT_SETTINGS = {
    enabled: true,
    debugMode: false,
    blacklist: [],
    whitelist: [],
  };

  let settings = { ...DEFAULT_SETTINGS };

  // ============================================================================
  // Initialization
  // ============================================================================

  // Set version from manifest
  const manifest = chrome.runtime.getManifest();
  elements.version.textContent = `v${manifest.version}`;

  // Load settings
  await loadSettings();

  // ============================================================================
  // Settings Management
  // ============================================================================

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["enabled", "debugMode", "blacklist", "whitelist"], (result) => {
        settings = {
          enabled: result.enabled !== false,
          debugMode: result.debugMode === true,
          blacklist: result.blacklist || [],
          whitelist: result.whitelist || [],
        };

        elements.enableToggle.checked = settings.enabled;
        elements.debugToggle.checked = settings.debugMode;
        renderDomainTags("blacklist");
        renderDomainTags("whitelist");
        resolve();
      });
    });
  }

  async function saveSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.set(settings, resolve);
    });
  }

  // ============================================================================
  // Domain List Management
  // ============================================================================

  function normalizeDomain(domain) {
    domain = domain.trim().toLowerCase();
    domain = domain.replace(/^https?:\/\//, "");
    domain = domain.split("/")[0];
    domain = domain.split(":")[0];
    return domain;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function renderDomainTags(listType) {
    const container = listType === "blacklist" ? elements.blacklistTags : elements.whitelistTags;
    const domains = settings[listType];

    if (domains.length === 0) {
      const emptyMsg =
        listType === "blacklist"
          ? "No domains blacklisted"
          : "No domains whitelisted (works on all sites)";
      container.innerHTML = `<span class="empty-message">${emptyMsg}</span>`;
      return;
    }

    container.innerHTML = domains
      .map(
        (domain, index) => `
      <span class="domain-tag">
        ${escapeHtml(domain)}
        <button data-index="${index}" data-list="${listType}" title="Remove">&times;</button>
      </span>
    `,
      )
      .join("");

    // Add remove handlers
    container.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => handleRemoveDomain(btn));
    });
  }

  async function handleAddDomain(listType) {
    const input = listType === "blacklist" ? elements.blacklistInput : elements.whitelistInput;
    const domain = normalizeDomain(input.value);

    if (!domain) {
      return;
    }

    if (settings[listType].includes(domain)) {
      showStatus(`Domain already in ${listType}`, "error");
      return;
    }

    settings[listType].push(domain);
    await saveSettings();
    renderDomainTags(listType);
    input.value = "";
    showStatus(`Domain added to ${listType}`);
  }

  async function handleRemoveDomain(button) {
    const index = parseInt(button.dataset.index, 10);
    const listType = button.dataset.list;

    settings[listType].splice(index, 1);
    await saveSettings();
    renderDomainTags(listType);
    showStatus("Domain removed");
  }

  // ============================================================================
  // Status Messages
  // ============================================================================

  function showStatus(message, type = "success") {
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status-message ${type} visible`;

    setTimeout(() => {
      elements.statusMessage.classList.remove("visible");
    }, 3000);
  }

  // ============================================================================
  // Event Listeners
  // ============================================================================

  // Toggle handlers
  elements.enableToggle.addEventListener("change", async () => {
    settings.enabled = elements.enableToggle.checked;
    await saveSettings();
    showStatus(settings.enabled ? "Extension enabled" : "Extension disabled");
  });

  elements.debugToggle.addEventListener("change", async () => {
    settings.debugMode = elements.debugToggle.checked;
    await saveSettings();
    showStatus(settings.debugMode ? "Debug mode enabled" : "Debug mode disabled");
  });

  // Blacklist handlers
  elements.addBlacklistBtn.addEventListener("click", () => handleAddDomain("blacklist"));
  elements.blacklistInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleAddDomain("blacklist");
  });

  // Whitelist handlers
  elements.addWhitelistBtn.addEventListener("click", () => handleAddDomain("whitelist"));
  elements.whitelistInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleAddDomain("whitelist");
  });

  // Reset handler
  elements.resetBtn.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to reset all settings to defaults?")) {
      return;
    }

    settings = { ...DEFAULT_SETTINGS };
    await saveSettings();

    elements.enableToggle.checked = true;
    elements.debugToggle.checked = false;
    renderDomainTags("blacklist");
    renderDomainTags("whitelist");

    showStatus("Settings reset to defaults");
  });
});
