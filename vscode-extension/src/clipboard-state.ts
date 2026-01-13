/**
 * Clipboard state management for tracking files copied from VS Code.
 * Files are stored with timestamps and automatically expire after CLIPBOARD_EXPIRY_MS.
 */

import { CLIPBOARD_EXPIRY_MS } from "./constants";
import { ClipboardFile } from "./types";

let clipboardFiles: ClipboardFile[] = [];

/**
 * Removes expired entries from the clipboard.
 */
export function cleanExpiredClipboard(): void {
  const now = Date.now();
  clipboardFiles = clipboardFiles.filter(
    (file) => now - file.timestamp < CLIPBOARD_EXPIRY_MS
  );
}

/**
 * Returns all non-expired clipboard files.
 */
export function getClipboardFiles(): ClipboardFile[] {
  cleanExpiredClipboard();
  return [...clipboardFiles];
}

/**
 * Sets the clipboard files, replacing any existing entries.
 * @param paths Array of file paths to store
 */
export function setClipboardFiles(paths: string[]): void {
  const timestamp = Date.now();
  clipboardFiles = paths.map((path) => ({ path, timestamp }));
}

/**
 * Clears all clipboard entries.
 */
export function clearClipboard(): void {
  clipboardFiles = [];
}

/**
 * Checks if a specific file path exists in the clipboard (non-expired).
 * @param filePath The file path to check
 */
export function isFileInClipboard(filePath: string): boolean {
  cleanExpiredClipboard();
  return clipboardFiles.some((file) => file.path === filePath);
}
