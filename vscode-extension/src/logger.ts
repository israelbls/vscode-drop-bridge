/**
 * Logger utility for the VS Code Drop Bridge extension.
 * Provides structured logging with different severity levels.
 */

import * as vscode from "vscode";
import { OUTPUT_CHANNEL_NAME } from "./constants";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export class Logger {
  private static outputChannel: vscode.OutputChannel;

  /**
   * Initializes the logger with an output channel.
   */
  public static initialize(context: vscode.ExtensionContext): void {
    this.outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
    context.subscriptions.push(this.outputChannel);
  }

  /**
   * Formats the current timestamp for log entries.
   */
  private static getTimestamp(): string {
    return new Date().toLocaleTimeString();
  }

  /**
   * Formats additional arguments for logging.
   */
  private static formatArgs(args: unknown[]): string {
    if (args.length === 0) {
      return "";
    }

    return (
      " " +
      args
        .map((arg) => {
          if (arg instanceof Error) {
            return `${arg.message}${arg.stack ? `\n${arg.stack}` : ""}`;
          }
          if (typeof arg === "object") {
            return JSON.stringify(arg);
          }
          return String(arg);
        })
        .join(" ")
    );
  }

  /**
   * Writes a log entry to the output channel.
   */
  private static write(level: LogLevel, message: string, args: unknown[]): void {
    if (!this.outputChannel) {
      return;
    }

    const timestamp = this.getTimestamp();
    const formattedArgs = this.formatArgs(args);
    const logLine = `[${timestamp}] [${level}] ${message}${formattedArgs}`;

    this.outputChannel.appendLine(logLine);

    // Show output channel on errors
    if (level === "ERROR") {
      this.outputChannel.show(true);
    }
  }

  /**
   * Logs a debug message. Use for detailed troubleshooting information.
   */
  public static debug(message: string, ...args: unknown[]): void {
    this.write("DEBUG", message, args);
  }

  /**
   * Logs an info message. Use for general operational information.
   */
  public static info(message: string, ...args: unknown[]): void {
    this.write("INFO", message, args);
  }

  /**
   * Logs a warning message. Use for potentially problematic situations.
   */
  public static warn(message: string, ...args: unknown[]): void {
    this.write("WARN", message, args);
  }

  /**
   * Logs an error message. Use for errors and failures.
   */
  public static error(message: string, error?: unknown): void {
    this.write("ERROR", message, error ? [error] : []);
  }

  /**
   * Legacy method for backward compatibility.
   * @deprecated Use info(), debug(), warn(), or error() instead.
   */
  public static log(message: string, ...args: unknown[]): void {
    this.info(message, ...args);
  }
}
