/**
 * Shared constants for the VS Code Drop Bridge browser extension.
 */

const BridgeConstants = {
  /** Local server URL */
  SERVER_URL: 'http://127.0.0.1:48369',

  /** Health check interval in milliseconds */
  HEALTH_CHECK_INTERVAL: 30000,

  /** Server request timeout in milliseconds */
  REQUEST_TIMEOUT: 2000,

  /** Notification display duration in milliseconds */
  NOTIFICATION_DURATION: 4000,

  /** Clipboard polling interval in milliseconds */
  CLIPBOARD_POLL_INTERVAL: 500,

  /** Message source identifiers */
  MESSAGE_SOURCE: {
    CONTENT: 'vscode-drop-bridge-content',
    INJECT: 'vscode-drop-bridge-inject'
  },

  /** VS Code clipboard marker prefix */
  CLIPBOARD_MARKER: 'vscode-drop-bridge:',

  /** Text MIME types that need special handling */
  TEXT_MIME_TYPES: [
    'text/plain',
    'text/markdown',
    'text/x-python',
    'text/javascript',
    'application/javascript',
    'text/typescript',
    'application/typescript',
    'text/html',
    'text/css',
    'text/csv',
    'application/json',
    'text/xml',
    'application/xml',
    'text/yaml',
    'text/x-c',
    'text/x-c++src'
  ]
};

// Make available in both content script and service worker contexts
if (typeof globalThis !== 'undefined') {
  globalThis.BridgeConstants = BridgeConstants;
}
