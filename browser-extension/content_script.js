/**
 * content_script.js - Runs in isolated context
 * 
 * This script:
 * 1. Injects inject.js into the page context
 * 2. Detects VSCode drag events and extracts file paths
 * 3. Communicates with background.js to fetch file contents
 * 4. Bridges messages between inject.js and background.js
 * 5. Handles paste events to insert files from VSCode clipboard
 */

(function () {
  'use strict';

  // Configuration
  const SERVER_URL = 'http://127.0.0.1:48369';
  let enabled = true;
  let debugMode = false;

  // State
  let currentDragPaths = [];
  let injected = false;

  function log(...args) {
    if (debugMode) {
      console.log('[VSCode Drop Bridge]', ...args);
    }
  }

  // Load settings
  chrome.storage.sync.get(['enabled', 'debugMode'], (result) => {
    enabled = result.enabled !== false;
    debugMode = result.debugMode === true;
    log('Settings loaded:', { enabled, debugMode });
  });

  // Listen for settings changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) enabled = changes.enabled.newValue !== false;
    if (changes.debugMode) debugMode = changes.debugMode.newValue === true;
    log('Settings changed:', { enabled, debugMode });
  });

  /**
   * Inject the inject.js script into the page context
   */
  let injectAttempted = false;
  let scriptExecutedConfirmed = false;

  function injectScript() {
    if (injectAttempted) return;
    injectAttempted = true;

    const checkInjection = (event) => {
      if (event.data?.source === 'vscode-drop-bridge-inject' && event.data?.type === 'injected') {
        scriptExecutedConfirmed = true;
        injected = true;
        window.removeEventListener('message', checkInjection);
      }
    };
    window.addEventListener('message', checkInjection);

    // Try loading from URL first
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function () { this.remove(); };
    script.onerror = function () {
      this.remove();
      injectInlineScript();
    };

    (document.head || document.documentElement).appendChild(script);

    // Fallback to inline injection if URL method fails
    setTimeout(() => {
      window.removeEventListener('message', checkInjection);
      if (!scriptExecutedConfirmed) {
        injectInlineScript();
      }
    }, 300);

    log('Inject script added to page');
  }

  /**
   * Fallback: Inject script code inline
   */
  let inlineInjectionAttempted = false;
  function injectInlineScript() {
    if (inlineInjectionAttempted) return;
    inlineInjectionAttempted = true;

    fetch(chrome.runtime.getURL('inject.js'))
      .then(response => response.text())
      .then(code => {
        const script = document.createElement('script');
        script.textContent = code;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
      })
      .catch(() => { });
  }

  // Inject as early as possible
  injectScript();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectScript);
  }

  /**
   * Convert file:// URI to filesystem path
   */
  function fileUriToPath(uri) {
    if (!uri.startsWith('file://')) return uri;
    try {
      const url = new URL(uri);
      let pathname = decodeURIComponent(url.pathname);
      if (/^\/[A-Za-z]:/.test(pathname)) {
        pathname = pathname.slice(1);
      }
      return pathname;
    } catch {
      return uri;
    }
  }

  /**
   * Extract file paths from VSCode drag data
   */
  function extractPathsFromDragData(text) {
    if (!text || typeof text !== 'string') return [];

    text = text.trim();
    const paths = [];

    // Try JSON format first
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        for (const item of parsed) {
          const resource = item.resource;
          if (resource) {
            let path = resource.fsPath || resource.path || (resource.external && fileUriToPath(resource.external));
            if (path && /^\/[A-Za-z]:/.test(path)) path = path.slice(1);
            if (path) paths.push(path);
          }
        }
        if (paths.length > 0) return paths;
      }
    } catch { }

    // Try file:// URIs and plain paths
    const lines = text.split(/[\r\n]+/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('file://')) {
        const path = fileUriToPath(trimmed);
        if (path) paths.push(path);
      } else if (/^\/[^\/]/.test(trimmed) || /^[A-Za-z]:[\\/]/.test(trimmed)) {
        paths.push(trimmed);
      }
    }

    return paths;
  }

  /**
   * Check if drag data looks like it's from VSCode
   */
  function isVSCodeDrag(dataTransfer) {
    const types = Array.from(dataTransfer.types || []);
    if (types.includes('Files')) return false;
    return types.includes('text/plain');
  }

  /**
   * Fetch file from local server
   */
  async function fetchFile(filePath) {
    const response = await fetch(`${SERVER_URL}/file?path=${encodeURIComponent(filePath)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Check if server is running
   */
  async function checkServer() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`${SERVER_URL}/health`, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Send message to inject.js
   */
  function sendToInject(type, data = {}) {
    window.postMessage({
      source: 'vscode-drop-bridge-content',
      type,
      ...data
    }, '*');
  }

  // Listen for messages from inject.js
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'vscode-drop-bridge-inject') return;

    switch (data.type) {
      case 'injected':
        log('Inject script confirmed loaded');
        break;
      case 'dropComplete':
        log('Drop complete:', data.success);
        break;
      case 'pasteComplete':
        log('Paste complete:', data.success);
        break;
    }
  });

  // Handle dragenter
  document.addEventListener('dragenter', async (e) => {
    if (!enabled) return;
    const dt = e.dataTransfer;
    const isVS = dt ? isVSCodeDrag(dt) : false;
    if (!dt || !isVS) return;

    log('Detected potential VSCode drag on dragenter');
    if (currentDragPaths.length === 0) {
      sendToInject('dragStart', { paths: [] });
    }
  }, true);

  // Handle dragover
  document.addEventListener('dragover', async (e) => {
    if (!enabled) return;
    const dt = e.dataTransfer;
    if (!dt) return;

    if (Array.from(dt.types || []).includes('Files') && currentDragPaths.length === 0) return;
    if (!isVSCodeDrag(dt) && currentDragPaths.length === 0) return;

    e.preventDefault();
    dt.dropEffect = 'copy';

    if (currentDragPaths.length === 0) {
      for (const item of dt.items) {
        if (item.kind === 'string' && item.type === 'text/plain') {
          item.getAsString((text) => {
            const paths = extractPathsFromDragData(text);
            if (paths.length > 0 && currentDragPaths.length === 0) {
              currentDragPaths = paths;
              log('Extracted paths from drag:', paths.length, 'files');
              sendToInject('dragStart', { paths });
            }
          });
          break;
        }
      }
    }
  }, true);

  // Handle drop
  document.addEventListener('drop', async (e) => {
    if (!enabled) return;
    if (e.__vscodeBridgeSynthetic) return;

    const dt = e.dataTransfer;
    if (!dt) return;

    const types = Array.from(dt.types || []);
    const isVSCodeDragDrop = types.some(t => t.startsWith('code') || t === 'resourceurls' || t === 'application/vnd.code.uri-list');
    if (!isVSCodeDragDrop && dt.files && dt.files.length > 0) return;
    if (isVSCodeDragDrop) e.preventDefault();

    if (currentDragPaths.length === 0) {
      const text = dt.getData('text/plain');
      const paths = extractPathsFromDragData(text);
      if (paths.length === 0) return;
      currentDragPaths = paths;
    }

    log('Handling drop for paths:', currentDragPaths.length, 'files');

    const dropPaths = [...currentDragPaths];
    const dropTarget = e.target;
    const dropX = e.clientX;
    const dropY = e.clientY;

    currentDragPaths = [];
    sendToInject('dragEnd');

    // Dispatch dragleave to dismiss overlays
    try {
      // Dispatch on drop target first
      if (dropTarget && dropTarget !== document.body) {
        dropTarget.dispatchEvent(new DragEvent('dragleave', {
          bubbles: true, cancelable: true, relatedTarget: null
        }));
      }
      // Then on document.body
      document.body.dispatchEvent(new DragEvent('dragleave', {
        bubbles: true, cancelable: true, relatedTarget: null
      }));
      // And dragend to signal complete end of drag operation
      document.dispatchEvent(new DragEvent('dragend', {
        bubbles: true, cancelable: true
      }));
    } catch { }

    try {
      const filePromises = dropPaths.map(path => fetchFile(path));
      const filesData = await Promise.all(filePromises);
      log('Files fetched for drop:', filesData.length);

      sendToInject('dropFiles', {
        files: filesData,
        target: {
          x: dropX,
          y: dropY,
          tagName: dropTarget?.tagName,
          className: dropTarget?.className
        }
      });

    } catch (err) {
      log('Failed to handle drop:', err.message);
      const serverRunning = await checkServer();
      if (!serverRunning) {
        showNotification('VSCode Drop Bridge: Please open VSCode to enable file drops');
      } else {
        showNotification(`VSCode Drop Bridge: Could not read files - ${err.message}`);
      }
    }
  }, true);

  // Handle dragend
  document.addEventListener('dragend', () => {
    if (currentDragPaths.length > 0) {
      log('Drag ended, cleaning up');
      currentDragPaths = [];
      sendToInject('dragEnd');
    }
  }, true);

  // Handle dragleave
  document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null && currentDragPaths.length > 0) {
      log('Drag left document, cleaning up');
      currentDragPaths = [];
      sendToInject('dragEnd');
    }
  }, true);

  /**
   * Check if clipboard text looks like VS Code file data
   * Supports: JSON with resources, plain file paths (Windows/Unix)
   */
  function isVSCodeClipboardData(text) {
    if (!text) return false;

    // Check for JSON format with resources
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.some(item =>
          item.resource &&
          (item.resource.$mid !== undefined || item.resource.scheme === 'file')
        );
      }
    } catch {
      // Not JSON - check for plain file paths
    }

    // Check for plain file paths (Windows or Unix)
    const lines = text.split(/[\r\n]+/);
    for (const line of lines) {
      const trimmed = line.trim();
      // Windows path: C:\... or D:\...
      if (/^[A-Za-z]:[\\/]/.test(trimmed)) return true;
      // Unix path: /...
      if (/^\/[^\/]/.test(trimmed)) return true;
      // file:// URI
      if (trimmed.startsWith('file://')) return true;
    }

    return false;
  }

  // Handle paste events
  document.addEventListener('paste', async (e) => {
    if (!enabled) return;

    const clipboardData = e.clipboardData;
    if (clipboardData && clipboardData.files && clipboardData.files.length > 0) return;

    const clipboardText = clipboardData?.getData('text/plain') || '';
    const hasMarker = clipboardText.startsWith('vscode-drop-bridge:');
    const hasVSCodeFormat = isVSCodeClipboardData(clipboardText);
    const isEmptyClipboard = clipboardText === '';

    // Intercept if: has marker, has VSCode JSON format, OR clipboard is empty (server might have files from native copy)
    if (!hasMarker && !hasVSCodeFormat && !isEmptyClipboard) {
      return; // Has text content that's not from VS Code - let normal paste happen
    }

    log('Detected VS Code clipboard data:', hasMarker ? 'marker' : (hasVSCodeFormat ? 'json format' : 'empty clipboard'));

    // Only preventDefault if we're confident it's from VS Code (has marker or format)
    // For empty clipboard, we'll check server but not block the paste
    const shouldPreventDefault = hasMarker || hasVSCodeFormat;
    if (shouldPreventDefault) {
      e.preventDefault();
      e.stopPropagation();
    }

    try {
      const response = await fetch(`${SERVER_URL}/clipboard`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        log('Server returned error, clipboard may have expired');
        return;
      }

      const data = await response.json();

      // Handle if server has files (source check is optional - older servers may not have it)
      if (data.files && data.files.length > 0) {
        log('Found files in VSCode clipboard:', data.files.length);
        sendToInject('pasteFiles', { files: data.files });
        fetch(`${SERVER_URL}/clipboard`, { method: 'DELETE' }).catch(() => { });
      }
    } catch (err) {
      log('Clipboard check failed:', err.message);
    }
  }, true);

  /**
   * Insert text at cursor position
   */
  function insertTextAtCursor(text) {
    const activeElement = document.activeElement;
    if (!activeElement) return;

    const tagName = activeElement.tagName.toLowerCase();

    if (tagName === 'textarea' ||
      (tagName === 'input' && ['text', 'search', 'url', 'email', 'password'].includes(activeElement.type))) {
      const start = activeElement.selectionStart || 0;
      const end = activeElement.selectionEnd || 0;
      const value = activeElement.value || '';
      activeElement.value = value.slice(0, start) + text + value.slice(end);
      activeElement.selectionStart = activeElement.selectionEnd = start + text.length;
      activeElement.dispatchEvent(new Event('input', { bubbles: true }));
      activeElement.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    if (activeElement.isContentEditable || activeElement.contentEditable === 'true') {
      const success = document.execCommand('insertText', false, text);
      if (!success) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(text);
          range.insertNode(textNode);
          range.setStartAfter(textNode);
          range.setEndAfter(textNode);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      activeElement.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    const editableChild = activeElement.querySelector('[contenteditable="true"]') ||
      activeElement.querySelector('textarea') ||
      activeElement.querySelector('input[type="text"]');
    if (editableChild) {
      editableChild.focus();
      insertTextAtCursor(text);
    }
  }

  /**
   * Show notification
   */
  function showNotification(message) {
    const existing = document.getElementById('vscode-drop-bridge-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'vscode-drop-bridge-notification';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #1e1e1e;
      color: #cccccc;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      z-index: 2147483647;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      border: 1px solid #333;
      max-width: 350px;
      animation: vscode-drop-bridge-fade-in 0.2s ease-out;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes vscode-drop-bridge-fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes vscode-drop-bridge-fade-out {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(10px); }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'vscode-drop-bridge-fade-out 0.2s ease-out forwards';
      setTimeout(() => {
        notification.remove();
        style.remove();
      }, 200);
    }, 4000);
  }

  log('Content script loaded');
})();
