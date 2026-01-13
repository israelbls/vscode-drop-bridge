import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as mime from "mime-types";
import { Logger } from "./logger";

const PORT = 48369;
const VERSION = "1.0.0";
const CLIPBOARD_EXPIRY_MS = 30000; // 30 seconds

// Clipboard state
interface ClipboardFile {
  path: string;
  timestamp: number;
}

let clipboardFiles: ClipboardFile[] = [];
let server: http.Server | null = null;
let statusCallback: ((running: boolean) => void) | null = null;

function guessMime(filePath: string): string {
  const lookup = mime.lookup(filePath);
  if (lookup) {
    return lookup;
  }
  return "application/octet-stream";
}

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  data: unknown
): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function cleanExpiredClipboard(): void {
  const now = Date.now();
  clipboardFiles = clipboardFiles.filter(
    (f) => now - f.timestamp < CLIPBOARD_EXPIRY_MS
  );
}

function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): void {
  setCorsHeaders(res);

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // Health check
  if (pathname === "/health" && req.method === "GET") {
    sendJson(res, 200, { status: "ok", version: VERSION });
    return;
  }

  // Get file
  if (pathname === "/file" && req.method === "GET") {
    const filePath = url.searchParams.get("path");

    if (!filePath) {
      sendJson(res, 400, { error: "Missing path parameter" });
      return;
    }

    // Security: Only allow reading files within workspace folders
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let isAllowed = false;

    if (workspaceFolders) {
      const normalizedPath = path.normalize(filePath).toLowerCase();
      for (const folder of workspaceFolders) {
        const folderPath = path.normalize(folder.uri.fsPath).toLowerCase();
        if (normalizedPath.startsWith(folderPath)) {
          isAllowed = true;
          break;
        }
      }
    }

    // Also allow files that were explicitly copied (in clipboard)
    cleanExpiredClipboard();
    if (clipboardFiles.some((f) => f.path === filePath)) {
      isAllowed = true;
    }

    if (!isAllowed) {
      Logger.log(`Access denied for file: ${filePath}`);
      sendJson(res, 403, { error: "File not in workspace or clipboard" });
      return;
    }

    try {
      const stat = fs.statSync(filePath);

      // Limit file size to 50MB
      if (stat.size > 50 * 1024 * 1024) {
        sendJson(res, 413, { error: "File too large (max 50MB)" });
        return;
      }

      const content = fs.readFileSync(filePath);
      const base64 = content.toString("base64");
      const filename = path.basename(filePath);
      const mimeType = guessMime(filePath);

      sendJson(res, 200, { filename, mime: mimeType, base64, size: stat.size });
    } catch (err) {
      Logger.error(`Error reading file ${filePath}`, err);
      const message = err instanceof Error ? err.message : "Unknown error";
      sendJson(res, 404, { error: "File not found", message });
    }
    return;
  }

  // Clipboard operations
  if (pathname === "/clipboard") {
    cleanExpiredClipboard();

    if (req.method === "GET") {
      if (clipboardFiles.length === 0) {
        sendJson(res, 200, { files: [], source: "vscode-drop-bridge" });
        return;
      }

      // Read all clipboard files
      const files: Array<{
        filename: string;
        mime: string;
        base64: string;
        path: string;
      }> = [];

      for (const clipFile of clipboardFiles) {
        try {
          const content = fs.readFileSync(clipFile.path);
          const base64 = content.toString("base64");
          const filename = path.basename(clipFile.path);
          const mimeType = guessMime(clipFile.path);
          files.push({ filename, mime: mimeType, base64, path: clipFile.path });
        } catch (err) {
          Logger.log(`Failed to read clipboard file: ${clipFile.path}`, err);
        }
      }

      sendJson(res, 200, { files, source: "vscode-drop-bridge" });
      return;
    }

    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const data = JSON.parse(body);
          const paths: string[] = Array.isArray(data.paths)
            ? data.paths
            : [data.path];

          clipboardFiles = paths.map((p) => ({
            path: p,
            timestamp: Date.now(),
          }));

          sendJson(res, 200, { success: true, count: clipboardFiles.length });
        } catch {
          sendJson(res, 400, { error: "Invalid JSON" });
        }
      });
      return;
    }

    if (req.method === "DELETE") {
      clipboardFiles = [];
      sendJson(res, 200, { success: true });
      return;
    }
  }

  // Not found
  sendJson(res, 404, { error: "Not found" });
}

export function startServer(
  onStatusChange?: (running: boolean) => void
): Promise<void> {
  statusCallback = onStatusChange || null;

  return new Promise((resolve, reject) => {
    if (server) {
      resolve();
      return;
    }

    server = http.createServer(handleRequest);

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        Logger.log(
          `Port ${PORT} already in use - another VSCode instance may be running the server`
        );
        // Consider this a success - another instance is handling it
        statusCallback?.(true);
        resolve();
      } else {
        Logger.error("Server error:", err);
        statusCallback?.(false);
        reject(err);
      }
    });

    server.listen(PORT, "127.0.0.1", () => {
      Logger.log(
        `VSCode Drop Bridge server running on http://127.0.0.1:${PORT}`
      );
      statusCallback?.(true);
      resolve();
    });
  });
}

export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        server = null;
        statusCallback?.(false);
        resolve();
      });
    } else {
      resolve();
    }
  });
}

export function isServerRunning(): boolean {
  return server !== null && server.listening;
}

export function setClipboardFiles(paths: string[]): void {
  clipboardFiles = paths.map((p) => ({
    path: p,
    timestamp: Date.now(),
  }));
}

export function clearClipboard(): void {
  clipboardFiles = [];
}
