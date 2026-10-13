/**
 * Clipboard handling for tracking files copied from VS Code's file explorer.
 * Intercepts copy commands to store file paths for the browser extension.
 */

import * as vscode from "vscode";
import { Logger } from "./logger";
import { setClipboardFiles } from "./server";

let disposables: vscode.Disposable[] = [];

/**
 * Converts a file:// URI to a filesystem path.
 */
function fileUriToPath(uri: string): string | null {
  if (!uri.startsWith("file://")) {
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
}

/**
 * Extracts file paths from various clipboard content formats.
 */
function extractFilePaths(content: string): string[] {
  const paths: string[] = [];

  // Try to parse as JSON (VS Code internal format)
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === "string") {
          const path = fileUriToPath(item);
          if (path) paths.push(path);
        } else if (item?.fsPath) {
          paths.push(item.fsPath);
        } else if (item?.resource?.fsPath) {
          paths.push(item.resource.fsPath);
        }
      }
    }
  } catch {
    // Not JSON - expected for most clipboard content
  }

  // Check for file:// URIs
  const fileUriMatches = content.match(/file:\/\/[^\s]+/g);
  if (fileUriMatches) {
    for (const uri of fileUriMatches) {
      const path = fileUriToPath(uri);
      if (path && !paths.includes(path)) {
        paths.push(path);
      }
    }
  }

  // Check for plain file paths (one per line)
  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Unix path
    if (trimmed.startsWith("/") && trimmed.length > 1 && !paths.includes(trimmed)) {
      paths.push(trimmed);
    }

    // Windows path
    if (/^[A-Za-z]:[\\/]/.test(trimmed) && !paths.includes(trimmed)) {
      paths.push(trimmed);
    }
  }

  return paths;
}

/**
 * Validates that files exist and returns only valid paths.
 */
async function validateFilePaths(paths: string[]): Promise<string[]> {
  const validPaths: string[] = [];

  for (const filePath of paths) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      validPaths.push(filePath);
    } catch {
      // File doesn't exist, skip
    }
  }

  return validPaths;
}

/**
 * Handles the copy command from explorer context menu or keyboard shortcut.
 */
async function handleCopyFromExplorer(
  uri: vscode.Uri | undefined,
  uris: vscode.Uri[] | undefined,
): Promise<void> {
  let filePaths: string[] = [];

  // Get paths from command arguments
  if (uris && uris.length > 0) {
    filePaths = uris.map((u) => u.fsPath);
  } else if (uri) {
    filePaths = [uri.fsPath];
  } else {
    // Keyboard shortcut case - try to get paths from clipboard
    filePaths = await getPathsFromKeyboardShortcut();

    if (filePaths.length === 0) {
      return;
    }
  }

  const validPaths = await validateFilePaths(filePaths);

  if (validPaths.length > 0) {
    setClipboardFiles(validPaths);
    Logger.info(`Copied ${validPaths.length} file(s) to clipboard`);

    vscode.window.setStatusBarMessage(
      `Drop Bridge: ${validPaths.length} file(s) ready for paste`,
      3000,
    );

    // Execute native copy for context menu case
    if (uri || (uris && uris.length > 0)) {
      await vscode.commands.executeCommand("filesExplorer.copy");
    }

    // Write marker for browser extension detection
    await vscode.env.clipboard.writeText(`vscode-drop-bridge:${validPaths.length}`);
  } else if (uri || (uris && uris.length > 0)) {
    // No valid files - execute native copy only
    await vscode.commands.executeCommand("filesExplorer.copy");
  }
}

/**
 * Attempts to get file paths when triggered via keyboard shortcut.
 */
async function getPathsFromKeyboardShortcut(): Promise<string[]> {
  const clipboardBefore = await vscode.env.clipboard.readText();
  let filePaths: string[] = [];

  // Try copyFilePath command
  try {
    await vscode.commands.executeCommand("copyFilePath");
    const clipboardAfter = await vscode.env.clipboard.readText();

    if (clipboardAfter && clipboardAfter !== clipboardBefore) {
      const paths = clipboardAfter
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);

      for (const path of paths) {
        if (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/")) {
          try {
            await vscode.workspace.fs.stat(vscode.Uri.file(path));
            filePaths.push(path);
          } catch {
            // Not a valid file
          }
        }
      }
    }
  } catch {
    // copyFilePath failed
  }

  // Try native copy if copyFilePath didn't work
  if (filePaths.length === 0) {
    try {
      await vscode.commands.executeCommand("filesExplorer.copy");
      const clipboardAfter = await vscode.env.clipboard.readText();

      if (clipboardAfter && clipboardAfter !== clipboardBefore) {
        const paths = extractFilePaths(clipboardAfter);
        if (paths.length > 0) {
          filePaths = await validateFilePaths(paths);
        }
      }
    } catch {
      // Native copy failed
    }
  }

  // Fallback to active editor's file
  if (filePaths.length === 0) {
    const activeEditor = vscode.window.activeTextEditor;
    if (
      activeEditor &&
      activeEditor.document.uri.scheme === "file" &&
      activeEditor.selection.isEmpty
    ) {
      filePaths = [activeEditor.document.uri.fsPath];
    }
  }

  // Restore original clipboard if we changed it
  if (clipboardBefore && filePaths.length > 0) {
    await vscode.env.clipboard.writeText(clipboardBefore);
  }

  return filePaths;
}

/**
 * Registers clipboard command handlers.
 */
export function registerClipboardHandlers(context: vscode.ExtensionContext): void {
  const copyFromExplorer = vscode.commands.registerCommand(
    "vscode-drop-bridge.copyFilesFromExplorer",
    handleCopyFromExplorer,
  );

  disposables.push(copyFromExplorer);
  context.subscriptions.push(...disposables);
}

/**
 * Starts monitoring the clipboard for file paths.
 */
export function startClipboardMonitor(context: vscode.ExtensionContext): void {
  let lastClipboardContent = "";

  const monitor = setInterval(async () => {
    try {
      const content = await vscode.env.clipboard.readText();

      if (content !== lastClipboardContent) {
        lastClipboardContent = content;

        const paths = extractFilePaths(content);
        if (paths.length > 0) {
          const validPaths = await validateFilePaths(paths);

          if (validPaths.length > 0) {
            setClipboardFiles(validPaths);
            Logger.debug(`Detected ${validPaths.length} file path(s) in clipboard`);
          }
        }
      }
    } catch {
      // Clipboard access failed, ignore
    }
  }, 500);

  context.subscriptions.push({
    dispose: () => clearInterval(monitor),
  });
}

/**
 * Disposes of all registered handlers.
 */
export function disposeClipboardHandlers(): void {
  for (const disposable of disposables) {
    disposable.dispose();
  }
  disposables = [];
}
