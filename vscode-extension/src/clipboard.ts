import * as vscode from "vscode";
import { setClipboardFiles } from "./server";
import { Logger } from "./logger";

let disposables: vscode.Disposable[] = [];

/**
 * Intercepts file copy commands in VSCode to track copied files.
 * When files are copied in the explorer, we store their paths so the
 * browser extension can access them via the /clipboard endpoint.
 */
export function registerClipboardHandlers(
  context: vscode.ExtensionContext
): void {
  // Register command to copy files from explorer with our tracking
  const copyFromExplorer = vscode.commands.registerCommand(
    "vscode-drop-bridge.copyFilesFromExplorer",
    async (uri: vscode.Uri, uris: vscode.Uri[]) => {
      // Get the selected files - either from the command args or from selection
      let filePaths: string[] = [];

      if (uris && uris.length > 0) {
        // Multiple files selected via context menu or multi-select
        filePaths = uris.map((u) => u.fsPath);
      } else if (uri) {
        // Single file from context menu
        filePaths = [uri.fsPath];
      } else {
        // Try to get from current selection (keyboard shortcut case)
        // VSCode doesn't pass URIs via keyboard shortcuts, so we use workarounds

        // Method 1: Try copyFilePath command which copies path as text
        const clipboardBefore = await vscode.env.clipboard.readText();

        try {
          // copyFilePath copies the focused file's path as text
          await vscode.commands.executeCommand("copyFilePath");
          const clipboardAfter = await vscode.env.clipboard.readText();

          if (clipboardAfter && clipboardAfter !== clipboardBefore) {
            // copyFilePath puts paths separated by newlines for multiple files
            const paths = clipboardAfter
              .split("\n")
              .map((p) => p.trim())
              .filter((p) => p);

            // Verify they're valid file paths
            for (const p of paths) {
              if (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith("/")) {
                try {
                  await vscode.workspace.fs.stat(vscode.Uri.file(p));
                  filePaths.push(p);
                } catch {
                  // Not a valid file
                }
              }
            }
          }
        } catch {
          // copyFilePath failed, continue to fallback methods
        }

        // Method 2: If copyFilePath didn't work, try the native copy + read
        if (filePaths.length === 0) {
          try {
            await vscode.commands.executeCommand("filesExplorer.copy");
            const clipboardAfter2 = await vscode.env.clipboard.readText();

            if (clipboardAfter2 && clipboardAfter2 !== clipboardBefore) {
              const paths = extractFilePaths(clipboardAfter2);
              if (paths.length > 0) {
                filePaths = paths;
              }
            }
          } catch {
            // Ignore
          }
        }

        // Method 3: If still no files, try the active editor's file
        if (filePaths.length === 0) {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor && activeEditor.document.uri.scheme === "file") {
            // Only use if there's no text selection (meaning whole file copy intent)
            if (activeEditor.selection.isEmpty) {
              filePaths = [activeEditor.document.uri.fsPath];
            }
          }
        }

        if (filePaths.length === 0) {
          return;
        }

        // Restore original clipboard if we changed it
        if (clipboardBefore) {
          await vscode.env.clipboard.writeText(clipboardBefore);
        }
      }

      // Verify files exist
      const validPaths: string[] = [];
      for (const p of filePaths) {
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(p));
          validPaths.push(p);
        } catch {
          // File doesn't exist, skip
        }
      }

      if (validPaths.length > 0) {
        setClipboardFiles(validPaths);
        Logger.log(
          "VSCode Drop Bridge: Copied files to clipboard:",
          validPaths
        );

        // Show notification
        vscode.window.setStatusBarMessage(
          `Drop Bridge: ${validPaths.length} file(s) ready for paste`,
          3000
        );
      }

      // Execute the native copy command if we have URIs (context menu case)
      if (uri || (uris && uris.length > 0)) {
        await vscode.commands.executeCommand("filesExplorer.copy");
      }
    }
  );

  disposables.push(copyFromExplorer);
  context.subscriptions.push(...disposables);
}

/**
 * Alternative approach: Monitor the system clipboard for file URIs.
 * Some systems put file:// URIs on the clipboard when copying files.
 */
export function startClipboardMonitor(context: vscode.ExtensionContext): void {
  let lastClipboardContent = "";

  const monitor = setInterval(async () => {
    try {
      const content = await vscode.env.clipboard.readText();

      if (content !== lastClipboardContent) {
        lastClipboardContent = content;

        // Check if it's a file path or file:// URI
        const paths = extractFilePaths(content);

        if (paths.length > 0) {
          // Verify the files exist
          const validPaths: string[] = [];
          for (const p of paths) {
            try {
              await vscode.workspace.fs.stat(vscode.Uri.file(p));
              validPaths.push(p);
            } catch {
              // File doesn't exist
            }
          }

          if (validPaths.length > 0) {
            setClipboardFiles(validPaths);
            Logger.log(
              "VSCode Drop Bridge: Detected file paths in clipboard:",
              validPaths
            );
          }
        }
      }
    } catch {
      // Clipboard access failed, ignore
    }
  }, 500); // Check every 500ms

  context.subscriptions.push({
    dispose: () => clearInterval(monitor),
  });
}

/**
 * Extract file paths from clipboard content.
 */
function extractFilePaths(content: string): string[] {
  const paths: string[] = [];

  // Try to parse as JSON (VSCode sometimes uses this format)
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === "string") {
          const p = fileUriToPath(item);
          if (p) paths.push(p);
        } else if (item && typeof item.fsPath === "string") {
          paths.push(item.fsPath);
        } else if (
          item &&
          item.resource &&
          typeof item.resource.fsPath === "string"
        ) {
          paths.push(item.resource.fsPath);
        }
      }
    }
  } catch {
    // Not JSON - this is expected for most clipboard content
  }

  // Check for file:// URIs
  const fileUriRegex = /file:\/\/[^\s]+/g;
  const uriMatches = content.match(fileUriRegex);
  if (uriMatches) {
    for (const uri of uriMatches) {
      const p = fileUriToPath(uri);
      if (p && !paths.includes(p)) {
        paths.push(p);
      }
    }
  }

  // Check for plain file paths (one per line)
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Mac/Linux path - allow spaces in paths
    if (trimmed.startsWith("/") && trimmed.length > 1) {
      if (!paths.includes(trimmed)) {
        paths.push(trimmed);
      }
    }
    // Windows path - allow spaces in paths
    if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
      if (!paths.includes(trimmed)) {
        paths.push(trimmed);
      }
    }
  }

  return paths;
}

/**
 * Convert a file:// URI to a file system path.
 */
function fileUriToPath(uri: string): string | null {
  if (!uri.startsWith("file://")) return null;

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

export function disposeClipboardHandlers(): void {
  for (const d of disposables) {
    d.dispose();
  }
  disposables = [];
}
