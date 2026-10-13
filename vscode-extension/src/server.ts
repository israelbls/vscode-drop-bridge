/**
 * HTTP server for the VS Code Drop Bridge extension.
 * Provides endpoints for health checks, file retrieval, and clipboard operations.
 */

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import * as mime from "mime-types";
import { clearClipboard, getClipboardFiles, setClipboardFiles } from "./clipboard-state";
import { EXTENSION_NAME, MAX_FILE_SIZE, MAX_REQUEST_BODY_SIZE, PORT, VERSION } from "./constants";
import { Logger } from "./logger";
import type {
  ClipboardDeleteResponse,
  ClipboardGetResponse,
  ClipboardPostResponse,
  ErrorResponse,
  FileResponse,
  HealthResponse,
  StatusCallback,
} from "./types";

let server: http.Server | null = null;
let statusCallback: StatusCallback | null = null;

/**
 * Determines the MIME type for a file path.
 */
function getMimeType(filePath: string): string {
  return mime.lookup(filePath) || "application/octet-stream";
}

/**
 * Sets CORS headers on the response to allow cross-origin requests.
 */
function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/**
 * Sends a JSON response with the specified status code.
 */
function sendJson<T>(res: http.ServerResponse, statusCode: number, data: T): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * Validates that a file path exists and is accessible.
 */
function isFileAccessAllowed(filePath: string): boolean {
  try {
    // Check if the file exists and is accessible
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Handles the /health endpoint.
 */
function handleHealthCheck(res: http.ServerResponse): void {
  const response: HealthResponse = { status: "ok", version: VERSION };
  sendJson(res, 200, response);
}

/**
 * Handles the /file endpoint for retrieving file contents.
 */
function handleFileRequest(res: http.ServerResponse, url: URL): void {
  const filePath = url.searchParams.get("path");

  if (!filePath) {
    sendJson<ErrorResponse>(res, 400, { error: "Missing path parameter" });
    return;
  }

  if (!isFileAccessAllowed(filePath)) {
    Logger.warn(`Access denied for file: ${filePath}`);
    sendJson<ErrorResponse>(res, 403, {
      error: "File not in workspace or clipboard",
    });
    return;
  }

  try {
    const stat = fs.statSync(filePath);

    if (stat.size > MAX_FILE_SIZE) {
      sendJson<ErrorResponse>(res, 413, {
        error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
      });
      return;
    }

    const content = fs.readFileSync(filePath);
    const response: FileResponse = {
      filename: path.basename(filePath),
      mime: getMimeType(filePath),
      base64: content.toString("base64"),
      size: stat.size,
    };

    sendJson(res, 200, response);
  } catch (err) {
    Logger.error(`Failed to read file: ${filePath}`, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    sendJson<ErrorResponse>(res, 404, { error: "File not found", message });
  }
}

/**
 * Handles GET /clipboard - returns all clipboard files.
 */
function handleClipboardGet(res: http.ServerResponse): void {
  const clipboardFiles = getClipboardFiles();

  if (clipboardFiles.length === 0) {
    const response: ClipboardGetResponse = {
      files: [],
      source: "vscode-drop-bridge",
    };
    sendJson(res, 200, response);
    return;
  }

  const files: ClipboardGetResponse["files"] = [];

  for (const clipFile of clipboardFiles) {
    try {
      const content = fs.readFileSync(clipFile.path);
      files.push({
        filename: path.basename(clipFile.path),
        mime: getMimeType(clipFile.path),
        base64: content.toString("base64"),
        path: clipFile.path,
      });
    } catch (err) {
      Logger.warn(`Failed to read clipboard file: ${clipFile.path}`, err);
    }
  }

  const response: ClipboardGetResponse = {
    files,
    source: "vscode-drop-bridge",
  };
  sendJson(res, 200, response);
}

/**
 * Handles POST /clipboard - sets clipboard files.
 */
function handleClipboardPost(req: http.IncomingMessage, res: http.ServerResponse): void {
  let body = "";
  let bodySize = 0;

  req.on("data", (chunk: Buffer) => {
    bodySize += chunk.length;

    if (bodySize > MAX_REQUEST_BODY_SIZE) {
      req.destroy();
      sendJson<ErrorResponse>(res, 413, {
        error: `Request body too large (max ${MAX_REQUEST_BODY_SIZE / 1024}KB)`,
      });
      return;
    }

    body += chunk.toString();
  });

  req.on("end", () => {
    if (bodySize > MAX_REQUEST_BODY_SIZE) {
      return;
    }

    try {
      const data = JSON.parse(body);
      const paths: string[] = Array.isArray(data.paths) ? data.paths : data.path ? [data.path] : [];

      if (paths.length === 0) {
        sendJson<ErrorResponse>(res, 400, {
          error: "No file paths provided",
        });
        return;
      }

      setClipboardFiles(paths);
      const response: ClipboardPostResponse = {
        success: true,
        count: paths.length,
      };
      sendJson(res, 200, response);
    } catch {
      sendJson<ErrorResponse>(res, 400, { error: "Invalid JSON body" });
    }
  });

  req.on("error", (err) => {
    Logger.error("Error reading request body", err);
    sendJson<ErrorResponse>(res, 500, { error: "Failed to read request" });
  });
}

/**
 * Handles DELETE /clipboard - clears clipboard.
 */
function handleClipboardDelete(res: http.ServerResponse): void {
  clearClipboard();
  const response: ClipboardDeleteResponse = { success: true };
  sendJson(res, 200, response);
}

/**
 * Main request handler for all HTTP requests.
 */
function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (pathname === "/health" && req.method === "GET") {
    handleHealthCheck(res);
    return;
  }

  if (pathname === "/file" && req.method === "GET") {
    handleFileRequest(res, url);
    return;
  }

  if (pathname === "/clipboard") {
    switch (req.method) {
      case "GET":
        handleClipboardGet(res);
        return;
      case "POST":
        handleClipboardPost(req, res);
        return;
      case "DELETE":
        handleClipboardDelete(res);
        return;
    }
  }

  sendJson<ErrorResponse>(res, 404, { error: "Not found" });
}

/**
 * Starts the HTTP server.
 */
export function startServer(onStatusChange?: StatusCallback): Promise<void> {
  statusCallback = onStatusChange || null;

  return new Promise((resolve, reject) => {
    if (server) {
      resolve();
      return;
    }

    server = http.createServer(handleRequest);

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        Logger.info(`Port ${PORT} already in use - another instance may be running`);
        statusCallback?.(true);
        resolve();
      } else {
        Logger.error("Server error", err);
        statusCallback?.(false);
        reject(err);
      }
    });

    server.listen(PORT, "127.0.0.1", () => {
      Logger.info(`${EXTENSION_NAME} server running on http://127.0.0.1:${PORT}`);
      statusCallback?.(true);
      resolve();
    });
  });
}

/**
 * Stops the HTTP server.
 */
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

/**
 * Checks if the server is currently running.
 */
export function isServerRunning(): boolean {
  return server?.listening ?? false;
}

// Re-export clipboard functions for use by clipboard.ts
export { clearClipboard, setClipboardFiles };
