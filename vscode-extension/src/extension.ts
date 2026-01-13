/**
 * VS Code Drop Bridge Extension
 * Enables seamless file drag-and-drop and copy-paste between VS Code and web browsers.
 */

import * as vscode from "vscode";
import { startServer, stopServer, isServerRunning } from "./server";
import {
  registerClipboardHandlers,
  startClipboardMonitor,
  disposeClipboardHandlers,
} from "./clipboard";
import { Logger } from "./logger";
import { PORT, EXTENSION_NAME } from "./constants";

let statusBarItem: vscode.StatusBarItem;

/**
 * Updates the status bar item to reflect the server state.
 */
function updateStatusBar(running: boolean): void {
  if (running) {
    statusBarItem.text = "$(cloud-upload) Drop Bridge";
    statusBarItem.tooltip = `${EXTENSION_NAME}: Server running on port ${PORT}\nClick to stop`;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = "$(cloud-offline) Drop Bridge";
    statusBarItem.tooltip = `${EXTENSION_NAME}: Server stopped\nClick to start`;
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  }
  statusBarItem.show();
}

/**
 * Handles the toggle server command.
 */
async function handleToggleServer(): Promise<void> {
  if (isServerRunning()) {
    await stopServer();
    vscode.window.showInformationMessage(`${EXTENSION_NAME}: Server stopped`);
  } else {
    try {
      await startServer(updateStatusBar);
      vscode.window.showInformationMessage(
        `${EXTENSION_NAME}: Server started on port ${PORT}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      vscode.window.showErrorMessage(
        `${EXTENSION_NAME}: Failed to start server - ${message}`
      );
    }
  }
}

/**
 * Extension activation handler.
 */
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  Logger.initialize(context);
  Logger.info("Activating extension");

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "vscode-drop-bridge.toggleServer";
  context.subscriptions.push(statusBarItem);

  // Register toggle command
  const toggleCommand = vscode.commands.registerCommand(
    "vscode-drop-bridge.toggleServer",
    handleToggleServer
  );
  context.subscriptions.push(toggleCommand);

  // Register clipboard handlers
  registerClipboardHandlers(context);

  // Start clipboard monitor
  startClipboardMonitor(context);

  // Auto-start server
  try {
    await startServer(updateStatusBar);
    Logger.info("Server started successfully");
  } catch (err) {
    Logger.error("Failed to start server", err);
    updateStatusBar(false);
  }
}

/**
 * Extension deactivation handler.
 */
export async function deactivate(): Promise<void> {
  Logger.info("Deactivating extension");
  disposeClipboardHandlers();
  await stopServer();
}
