/**
 * API client for communicating with the VS Code Drop Bridge server.
 */

const BridgeApi = {
  /**
   * Gets the server URL from constants or uses default.
   * @returns {string} The server base URL
   */
  getServerUrl() {
    return (typeof BridgeConstants !== 'undefined')
      ? BridgeConstants.SERVER_URL
      : 'http://127.0.0.1:48369';
  },

  /**
   * Gets the request timeout from constants or uses default.
   * @returns {number} Timeout in milliseconds
   */
  getTimeout() {
    return (typeof BridgeConstants !== 'undefined')
      ? BridgeConstants.REQUEST_TIMEOUT
      : 2000;
  },

  /**
   * Checks if the local server is running.
   * @returns {Promise<{running: boolean, version: string|null, lastCheck: number}>}
   */
  async checkServerHealth() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.getTimeout());

      const response = await fetch(`${this.getServerUrl()}/health`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        return {
          running: true,
          version: data.version || '1.0',
          lastCheck: Date.now()
        };
      }
    } catch {
      // Server not running or error
    }

    return {
      running: false,
      version: null,
      lastCheck: Date.now()
    };
  },

  /**
   * Fetches a file from the local server.
   * @param {string} filePath - The path to the file to fetch
   * @returns {Promise<{filename: string, mime: string, base64: string, size: number}>}
   * @throws {Error} If the file cannot be fetched
   */
  async fetchFile(filePath) {
    const response = await fetch(
      `${this.getServerUrl()}/file?path=${encodeURIComponent(filePath)}`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  },

  /**
   * Gets clipboard files from the server.
   * @returns {Promise<{files: Array, source: string}>}
   * @throws {Error} If the clipboard cannot be retrieved
   */
  async getClipboard() {
    const response = await fetch(`${this.getServerUrl()}/clipboard`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Failed to get clipboard');
    }

    return response.json();
  },

  /**
   * Clears the clipboard on the server.
   * @returns {Promise<void>}
   */
  async clearClipboard() {
    await fetch(`${this.getServerUrl()}/clipboard`, {
      method: 'DELETE'
    });
  },

  /**
   * Sets clipboard files on the server.
   * @param {string[]} paths - Array of file paths to set
   * @returns {Promise<{success: boolean, count: number}>}
   */
  async setClipboard(paths) {
    const response = await fetch(`${this.getServerUrl()}/clipboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths })
    });

    if (!response.ok) {
      throw new Error('Failed to set clipboard');
    }

    return response.json();
  }
};

// Make available globally
if (typeof globalThis !== 'undefined') {
  globalThis.BridgeApi = BridgeApi;
}
