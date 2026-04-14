/**
 * Shared utility functions for the VS Code Drop Bridge browser extension.
 */

const BridgeUtils = {
  /**
   * Converts a file:// URI to a filesystem path.
   * @param {string} uri - The file:// URI to convert
   * @returns {string|null} The filesystem path or null if invalid
   */
  fileUriToPath(uri) {
    if (!uri.startsWith('file://')) {
      return null;
    }

    try {
      const url = new URL(uri);
      let pathname = decodeURIComponent(url.pathname);

      // Windows: remove leading slash from /C:/...
      if (/^\/[A-Za-z]:/.test(pathname)) {
        pathname = pathname.slice(1);
      }

      return pathname;
    } catch {
      return null;
    }
  },

  /**
   * Extracts file paths from VS Code drag data.
   * Handles JSON format, file:// URIs, and plain paths.
   * @param {string} text - The clipboard/drag text content
   * @returns {string[]} Array of extracted file paths
   */
  extractPathsFromDragData(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    text = text.trim();
    const paths = [];

    // Try JSON format first (VS Code internal format)
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        for (const item of parsed) {
          const resource = item.resource;
          if (resource) {
            let path = resource.fsPath ||
              resource.path ||
              (resource.external && this.fileUriToPath(resource.external));

            // Fix Windows paths with leading slash
            if (path && /^\/[A-Za-z]:/.test(path)) {
              path = path.slice(1);
            }

            if (path) {
              paths.push(path);
            }
          }
        }
        if (paths.length > 0) {
          return paths;
        }
      }
    } catch {
      // Not JSON - expected for most content
    }

    // Check for file:// URIs and plain paths
    const lines = text.split(/[\r\n]+/);
    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('file://')) {
        const path = this.fileUriToPath(trimmed);
        if (path && !paths.includes(path)) {
          paths.push(path);
        }
      } else if (/^\/[^\/]/.test(trimmed)) {
        // Unix path
        if (!paths.includes(trimmed)) {
          paths.push(trimmed);
        }
      } else if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
        // Windows path
        if (!paths.includes(trimmed)) {
          paths.push(trimmed);
        }
      }
    }

    return paths;
  },

  /**
   * Checks if clipboard text looks like VS Code file data.
   * @param {string} text - The clipboard text to check
   * @returns {boolean} True if the text appears to be from VS Code
   */
  isVSCodeClipboardData(text) {
    if (!text) {
      return false;
    }

    // Only match VS Code's specific internal JSON format with resource objects.
    // Plain file paths are intentionally excluded to avoid false positives when
    // terminal output or other text happens to contain path-like strings.
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.some(item =>
          item.resource &&
          (item.resource.$mid !== undefined || item.resource.scheme === 'file')
        );
      }
    } catch {
      // Not VS Code JSON format
    }

    return false;
  },

  /**
   * Checks if drag data appears to be from VS Code.
   * @param {DataTransfer} dataTransfer - The DataTransfer object to check
   * @returns {boolean} True if the drag appears to be from VS Code
   */
  isVSCodeDrag(dataTransfer) {
    const types = Array.from(dataTransfer.types || []);

    // If it already has Files, it's a native file drag
    if (types.includes('Files')) {
      return false;
    }

    return types.includes('text/plain');
  },

  /**
   * Shows a notification toast in the page.
   * @param {string} message - The message to display
   */
  showNotification(message) {
    const existing = document.getElementById('vscode-drop-bridge-notification');
    if (existing) {
      existing.remove();
    }

    const notification = document.createElement('div');
    notification.id = 'vscode-drop-bridge-notification';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #1e1e1e;
      color: #cccccc;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      z-index: 2147483647;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      border: 1px solid #333;
      max-width: 350px;
      animation: vscode-drop-bridge-fade-in 0.2s ease-out;
    `;

    // Add animation styles if not already present
    if (!document.getElementById('vscode-drop-bridge-styles')) {
      const style = document.createElement('style');
      style.id = 'vscode-drop-bridge-styles';
      style.textContent = `
        @keyframes vscode-drop-bridge-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes vscode-drop-bridge-fade-out {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(10px); }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    const duration = (typeof BridgeConstants !== 'undefined')
      ? BridgeConstants.NOTIFICATION_DURATION
      : 4000;

    setTimeout(() => {
      notification.style.animation = 'vscode-drop-bridge-fade-out 0.2s ease-out forwards';
      setTimeout(() => notification.remove(), 200);
    }, duration);
  }
};

// Make available globally
if (typeof globalThis !== 'undefined') {
  globalThis.BridgeUtils = BridgeUtils;
}
