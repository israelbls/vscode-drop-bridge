import * as vscode from "vscode";

export class Logger {
  private static _outputChannel: vscode.OutputChannel;

  public static initialize(context: vscode.ExtensionContext): void {
    this._outputChannel = vscode.window.createOutputChannel("VSCode Drop Bridge");
    context.subscriptions.push(this._outputChannel);
  }

  public static log(message: string, ...args: any[]): void {
    if (!this._outputChannel) return;

    const timestamp = new Date().toLocaleTimeString();
    let formattedMessage = `[${timestamp}] ${message}`;

    if (args.length > 0) {
      formattedMessage += " " + args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(" ");
    }

    this._outputChannel.appendLine(formattedMessage);
  }

  public static error(message: string, error?: any): void {
    if (!this._outputChannel) return;

    const timestamp = new Date().toLocaleTimeString();
    let errorMessage = `[${timestamp}] [ERROR] ${message}`;

    if (error) {
      if (error instanceof Error) {
        errorMessage += `: ${error.message}`;
        if (error.stack) {
          errorMessage += `\n${error.stack}`;
        }
      } else {
        errorMessage += `: ${String(error)}`;
      }
    }

    this._outputChannel.appendLine(errorMessage);
    this._outputChannel.show(true); // Show channel on error
  }
}
