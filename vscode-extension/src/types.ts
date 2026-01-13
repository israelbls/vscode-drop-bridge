/**
 * Shared type definitions for the VS Code Drop Bridge extension.
 */

/** Represents a file stored in the clipboard with its timestamp */
export interface ClipboardFile {
  path: string;
  timestamp: number;
}

/** Response structure for the /health endpoint */
export interface HealthResponse {
  status: "ok";
  version: string;
}

/** Response structure for successful file retrieval */
export interface FileResponse {
  filename: string;
  mime: string;
  base64: string;
  size: number;
}

/** Response structure for clipboard GET endpoint */
export interface ClipboardGetResponse {
  files: Array<{
    filename: string;
    mime: string;
    base64: string;
    path: string;
  }>;
  source: string;
}

/** Response structure for clipboard POST endpoint */
export interface ClipboardPostResponse {
  success: boolean;
  count: number;
}

/** Response structure for clipboard DELETE endpoint */
export interface ClipboardDeleteResponse {
  success: boolean;
}

/** Generic error response structure */
export interface ErrorResponse {
  error: string;
  message?: string;
}

/** Callback type for server status changes */
export type StatusCallback = (running: boolean) => void;
