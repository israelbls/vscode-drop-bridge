import * as vscode from "vscode";
import { startServer, stopServer, isServerRunning } from "./server";
import {
  registerClipboardHandlers,
  startClipboardMonitor,
  disposeClipboardHandlers,
} from "./clipboard";
import { Logger } from "./logger";

let statusBarItem: vscode.StatusBarItem;

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  Logger.initialize(context);
  Logger.log("VSCode Drop Bridge: Activating extension");

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "vscode-drop-bridge.toggleServer";
  context.subscriptions.push(statusBarItem);

  // Update status bar based on server state
  const updateStatusBar = (running: boolean) => {
    if (running) {
      statusBarItem.text = "$(cloud-upload) Drop Bridge";
      statusBarItem.tooltip =
        "VSCode Drop Bridge: Server running on port 48369\nClick to stop";
      statusBarItem.backgroundColor = undefined;
    } else {
      statusBarItem.text = "$(cloud-offline) Drop Bridge";
      statusBarItem.tooltip =
        "VSCode Drop Bridge: Server stopped\nClick to start";
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    }
    statusBarItem.show();
  };

  // Register toggle command
  const toggleCommand = vscode.commands.registerCommand(
    "vscode-drop-bridge.toggleServer",
    async () => {
      if (isServerRunning()) {
        await stopServer();
        vscode.window.showInformationMessage(
          "VSCode Drop Bridge: Server stopped"
        );
      } else {
        try {
          await startServer(updateStatusBar);
          vscode.window.showInformationMessage(
            "VSCode Drop Bridge: Server started on port 48369"
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          vscode.window.showErrorMessage(
            `VSCode Drop Bridge: Failed to start server - ${message}`
          );
        }
      }
    }
  );
  context.subscriptions.push(toggleCommand);

  // Register clipboard handlers
  registerClipboardHandlers(context);

  // Start clipboard monitor
  startClipboardMonitor(context);

  // Auto-start server
  try {
    await startServer(updateStatusBar);
    Logger.log("VSCode Drop Bridge: Server started successfully");
  } catch (err) {
    Logger.error("VSCode Drop Bridge: Failed to start server:", err);
    updateStatusBar(false);
  }
}

export async function deactivate(): Promise<void> {
  Logger.log("VSCode Drop Bridge: Deactivating extension");

  disposeClipboardHandlers();
  await stopServer();
}
