/**
 * Shared constants for the VS Code Drop Bridge extension.
 */

/** HTTP server port for the local bridge server */
export const PORT = 48369;

/** Extension version */
export const VERSION = "1.0.0";

/** Time in milliseconds before clipboard entries expire */
export const CLIPBOARD_EXPIRY_MS = 30000;

/** Maximum file size allowed for transfer (50MB) */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Maximum request body size for POST requests (10KB) */
export const MAX_REQUEST_BODY_SIZE = 10 * 1024;

/** Extension display name used in logs and UI */
export const EXTENSION_NAME = "VSCode Drop Bridge";

/** Output channel name for logging */
export const OUTPUT_CHANNEL_NAME = "VSCode Drop Bridge";
