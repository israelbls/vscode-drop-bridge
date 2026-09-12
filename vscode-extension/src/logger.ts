/**
 * Logger utility for the VS Code Drop Bridge extension.
 * Provides structured logging with different severity levels.
 */

import * as vscode from "vscode";
import { OUTPUT_CHANNEL_NAME } from "./constants";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

let outputChannel: vscode.OutputChannel | undefined;

function initialize(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  context.subscriptions.push(outputChannel);
}

function getTimestamp(): string {
  return new Date().toLocaleTimeString();
}

function formatArgs(args: unknown[]): string {
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

function write(level: LogLevel, message: string, args: unknown[]): void {
  if (!outputChannel) {
    return;
  }

  const timestamp = getTimestamp();
  const formattedArgs = formatArgs(args);
  const logLine = `[${timestamp}] [${level}] ${message}${formattedArgs}`;

  outputChannel.appendLine(logLine);

  if (level === "ERROR") {
    outputChannel.show(true);
  }
}

function debug(message: string, ...args: unknown[]): void {
  write("DEBUG", message, args);
}

function info(message: string, ...args: unknown[]): void {
  write("INFO", message, args);
}

function warn(message: string, ...args: unknown[]): void {
  write("WARN", message, args);
}

function error(message: string, error?: unknown): void {
  write("ERROR", message, error ? [error] : []);
}

/** @deprecated Use info(), debug(), warn(), or error() instead. */
function log(message: string, ...args: unknown[]): void {
  info(message, ...args);
}

export const Logger = { initialize, debug, info, warn, error, log };
