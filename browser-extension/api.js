/**
 * API client for communicating with the VS Code Drop Bridge server.
 *
 * Local-server requests are deliberately routed through the extension
 * service worker.  Content scripts must not fetch localhost directly,
 * because that causes Chrome to treat the request as page-origin loopback
 * network access and can prompt the user separately for each website.
 */

const BridgeApi = {
  /**
   * Sends a request to the extension service worker.
   * @param {string} type - Background message type
   * @param {Object} [payload] - Additional message fields
   * @returns {Promise<Object>}
   */
  async sendBackgroundMessage(type, payload = {}) {
    const response = await chrome.runtime.sendMessage({
      type,
      ...payload,
    });

    if (!response) {
      throw new Error("No response from extension background service");
    }

    if (response.success === false) {
      throw new Error(response.error || `Background request failed: ${type}`);
    }

    return response.data !== undefined ? response.data : response;
  },

  /**
   * Checks if the local server is running.
   * @returns {Promise<{running: boolean, version: string|null, lastCheck: number}>}
   */
  async checkServerHealth() {
    return this.sendBackgroundMessage("checkServer");
  },

  /**
   * Fetches a file from the local server through the extension service worker.
   * @param {string} filePath - The path to the file to fetch
   * @returns {Promise<{filename: string, mime: string, base64: string, size: number}>}
   * @throws {Error} If the file cannot be fetched
   */
  async fetchFile(filePath) {
    return this.sendBackgroundMessage("fetchFile", { path: filePath });
  },

  /**
   * Gets clipboard files from the server through the extension service worker.
   * @returns {Promise<{files: Array, source: string}>}
   * @throws {Error} If the clipboard cannot be retrieved
   */
  async getClipboard() {
    return this.sendBackgroundMessage("getClipboard");
  },

  /**
   * Clears the clipboard on the server through the extension service worker.
   * @returns {Promise<void>}
   */
  async clearClipboard() {
    await this.sendBackgroundMessage("clearClipboard");
  },

  /**
   * Sets clipboard files on the server through the extension service worker.
   * @param {string[]} paths - Array of file paths to set
   * @returns {Promise<{success: boolean, count: number}>}
   */
  async setClipboard(paths) {
    return this.sendBackgroundMessage("setClipboard", { paths });
  },
};

// Make available globally
if (typeof globalThis !== "undefined") {
  globalThis.BridgeApi = BridgeApi;
}
