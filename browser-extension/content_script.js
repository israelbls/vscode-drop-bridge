/**
 * Content script for VS Code Drop Bridge.
 * Runs in isolated context to detect VS Code drags and handle paste events.
 * Communicates with inject.js via postMessage and background.js via chrome.runtime.
 */

(function () {
  'use strict';

  // ============================================================================
  // State
  // ============================================================================

  let enabled = true;
  let debugMode = false;
  let currentDragPaths = [];
  let injected = false;
  let injectAttempted = false;
  let inlineInjectionAttempted = false;
  let scriptExecutedConfirmed = false;

  // ============================================================================
  // Logging
  // ============================================================================

  function log(...args) {
    if (debugMode) {
      console.log('[VSCode Drop Bridge]', ...args);
    }
  }

  // ============================================================================
  // Settings
  // ============================================================================

  chrome.storage.sync.get(['enabled', 'debugMode'], (result) => {
    enabled = result.enabled !== false;
    debugMode = result.debugMode === true;
    log('Settings loaded:', { enabled, debugMode });
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
    }
    if (changes.debugMode) {
      debugMode = changes.debugMode.newValue === true;
    }
    log('Settings changed:', { enabled, debugMode });
  });

  // ============================================================================
  // Script Injection
  // ============================================================================

  function injectScript() {
    if (injectAttempted) return;
    injectAttempted = true;

    const checkInjection = (event) => {
      if (event.data?.source === BridgeConstants.MESSAGE_SOURCE.INJECT &&
        event.data?.type === 'injected') {
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
      .catch(err => {
        log('Failed to inject inline script:', err.message);
      });
  }

  // Inject as early as possible
  injectScript();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectScript);
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  function sendToInject(type, data = {}) {
    window.postMessage({
      source: BridgeConstants.MESSAGE_SOURCE.CONTENT,
      type,
      ...data
    }, '*');
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;

    const data = event.data;
    if (!data || data.source !== BridgeConstants.MESSAGE_SOURCE.INJECT) return;

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

  // ============================================================================
  // Drag Event Handlers
  // ============================================================================

  document.addEventListener('dragenter', async (e) => {
    if (!enabled) return;

    const dt = e.dataTransfer;
    if (!dt || !BridgeUtils.isVSCodeDrag(dt)) return;

    log('Detected potential VSCode drag on dragenter');
    if (currentDragPaths.length === 0) {
      sendToInject('dragStart', { paths: [] });
    }
  }, true);

  document.addEventListener('dragover', async (e) => {
    if (!enabled) return;

    const dt = e.dataTransfer;
    if (!dt) return;

    const types = Array.from(dt.types || []);
    if (types.includes('Files') && currentDragPaths.length === 0) return;
    if (!BridgeUtils.isVSCodeDrag(dt) && currentDragPaths.length === 0) return;

    e.preventDefault();
    dt.dropEffect = 'copy';

    if (currentDragPaths.length === 0) {
      for (const item of dt.items) {
        if (item.kind === 'string' && item.type === 'text/plain') {
          item.getAsString((text) => {
            const paths = BridgeUtils.extractPathsFromDragData(text);
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

  document.addEventListener('drop', async (e) => {
    if (!enabled) return;
    if (e.__vscodeBridgeSynthetic) return;

    const dt = e.dataTransfer;
    if (!dt) return;

    const types = Array.from(dt.types || []);
    const isVSCodeDragDrop = types.some(t =>
      t.startsWith('code') || t === 'resourceurls' || t === 'application/vnd.code.uri-list'
    );

    if (!isVSCodeDragDrop && dt.files && dt.files.length > 0) return;
    if (isVSCodeDragDrop) e.preventDefault();

    if (currentDragPaths.length === 0) {
      const text = dt.getData('text/plain');
      const paths = BridgeUtils.extractPathsFromDragData(text);
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
    dispatchDragEndEvents(dropTarget);

    try {
      const filePromises = dropPaths.map(path => BridgeApi.fetchFile(path));
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
      await handleDropError(err);
    }
  }, true);

  document.addEventListener('dragend', () => {
    if (currentDragPaths.length > 0) {
      log('Drag ended, cleaning up');
      currentDragPaths = [];
      sendToInject('dragEnd');
    }
  }, true);

  document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null && currentDragPaths.length > 0) {
      log('Drag left document, cleaning up');
      currentDragPaths = [];
      sendToInject('dragEnd');
    }
  }, true);

  // ============================================================================
  // Paste Event Handler
  // ============================================================================

  document.addEventListener('paste', async (e) => {
    if (!enabled) return;

    const clipboardData = e.clipboardData;
    if (clipboardData?.files?.length > 0) return;

    const clipboardText = clipboardData?.getData('text/plain') || '';
    const hasMarker = clipboardText.startsWith(BridgeConstants.CLIPBOARD_MARKER);
    const hasVSCodeFormat = BridgeUtils.isVSCodeClipboardData(clipboardText);
    const isEmptyClipboard = clipboardText === '';

    if (!hasMarker && !hasVSCodeFormat && !isEmptyClipboard) {
      return;
    }

    log('Detected VS Code clipboard data:',
      hasMarker ? 'marker' : (hasVSCodeFormat ? 'json format' : 'empty clipboard'));

    const shouldPreventDefault = hasMarker;
    if (shouldPreventDefault) {
      e.preventDefault();
      e.stopPropagation();
    }

    try {
      const data = await BridgeApi.getClipboard();

      if (data.files?.length > 0) {
        log('Found files in VSCode clipboard:', data.files.length);
        sendToInject('pasteFiles', { files: data.files });
        BridgeApi.clearClipboard().catch(() => { });
      }
    } catch (err) {
      log('Clipboard check failed:', err.message);
    }
  }, true);

  // ============================================================================
  // Helper Functions
  // ============================================================================

  function dispatchDragEndEvents(dropTarget) {
    try {
      if (dropTarget && dropTarget !== document.body) {
        dropTarget.dispatchEvent(new DragEvent('dragleave', {
          bubbles: true,
          cancelable: true,
          relatedTarget: null
        }));
      }

      document.body.dispatchEvent(new DragEvent('dragleave', {
        bubbles: true,
        cancelable: true,
        relatedTarget: null
      }));

      document.dispatchEvent(new DragEvent('dragend', {
        bubbles: true,
        cancelable: true
      }));
    } catch (err) {
      log('Failed to dispatch drag end events:', err.message);
    }
  }

  async function handleDropError(err) {
    const status = await BridgeApi.checkServerHealth();
    if (!status.running) {
      BridgeUtils.showNotification('VSCode Drop Bridge: Please open VSCode to enable file drops');
    } else {
      BridgeUtils.showNotification(`VSCode Drop Bridge: Could not read files - ${err.message}`);
    }
  }

  log('Content script loaded');
})();
