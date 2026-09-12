/**
 * Content script for VS Code Drop Bridge.
 * Runs in isolated context to detect VS Code drags and handle paste events.
 * Communicates with inject.js via postMessage and background.js via chrome.runtime.
 */

(() => {
  // ============================================================================
  // State
  // ============================================================================

  let enabled = true;
  let debugMode = false;
  let currentDragPaths = [];
  let injectAttempted = false;
  let dragoverLogged = false;

  // ============================================================================
  // Logging
  // ============================================================================

  function log(...args) {
    if (debugMode) {
      console.log("[VSCode Drop Bridge]", ...args);
    }
  }

  // ============================================================================
  // Settings
  // ============================================================================

  chrome.storage.sync.get(["enabled", "debugMode"], (result) => {
    enabled = result.enabled !== false;
    debugMode = result.debugMode === true;
    log("Settings loaded:", { enabled, debugMode });
    sendToInject("setDebugMode", { debugMode });
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
    }
    if (changes.debugMode) {
      debugMode = changes.debugMode.newValue === true;
      sendToInject("setDebugMode", { debugMode });
    }
    log("Settings changed:", { enabled, debugMode });
  });

  // ============================================================================
  // Main-world injection handshake
  // ============================================================================

  function requestInjectionStatus() {
    if (injectAttempted) return;
    injectAttempted = true;
    window.postMessage(
      {
        source: BridgeConstants.MESSAGE_SOURCE.CONTENT,
        type: "ping",
      },
      "*",
    );
    log("Requested inject script handshake");
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  function sendToInject(type, data = {}) {
    window.postMessage(
      {
        source: BridgeConstants.MESSAGE_SOURCE.CONTENT,
        type,
        ...data,
      },
      "*",
    );
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;

    const data = event.data;
    if (!data || data.source !== BridgeConstants.MESSAGE_SOURCE.INJECT) return;

    switch (data.type) {
      case "injected":
        log("Inject script confirmed loaded");
        break;
      case "dropComplete":
        log("Received dropComplete from inject script:", data);
        break;
      case "pasteComplete":
        log("Received pasteComplete from inject script:", data);
        break;
    }
  });

  requestInjectionStatus();

  // ============================================================================
  // Drag Event Handlers
  // ============================================================================

  document.addEventListener(
    "dragenter",
    async (e) => {
      if (!enabled) {
        log("dragenter ignored: extension disabled");
        return;
      }

      const dt = e.dataTransfer;
      if (!dt) {
        log("dragenter received with no DataTransfer");
        return;
      }

      const types = Array.from(dt.types || []);
      log("dragenter:", {
        types,
        files: dt.files?.length ?? 0,
        items: dt.items?.length ?? 0,
        isVSCodeDrag: BridgeUtils.isVSCodeDrag(dt),
      });

      if (!BridgeUtils.isVSCodeDrag(dt)) {
        log("dragenter ignored: not recognised as VS Code drag");
        return;
      }

      log("VS Code drag recognised on dragenter");
      dragoverLogged = false;
      if (currentDragPaths.length === 0) {
        log("Sending dragStart to inject script");
        sendToInject("dragStart", { paths: [] });
      }
    },
    true,
  );

  document.addEventListener(
    "dragover",
    async (e) => {
      if (!enabled) return;

      const dt = e.dataTransfer;
      if (!dt) {
        if (!dragoverLogged) {
          log("dragover received with no DataTransfer");
          dragoverLogged = true;
        }
        return;
      }

      const types = Array.from(dt.types || []);
      const recognised = BridgeUtils.isVSCodeDrag(dt);

      if (!dragoverLogged) {
        log("dragover:", {
          types,
          files: dt.files?.length ?? 0,
          items: dt.items?.length ?? 0,
          isVSCodeDrag: recognised,
          currentDragPaths: currentDragPaths.length,
        });
        dragoverLogged = true;
      }

      if (types.includes("Files") && currentDragPaths.length === 0) {
        log("dragover ignored: native Files drag with no captured VS Code paths");
        return;
      }
      if (!recognised && currentDragPaths.length === 0) {
        log("dragover ignored: not recognised as VS Code drag");
        return;
      }

      e.preventDefault();
      dt.dropEffect = "copy";
      log("dragover accepted; default prevented and dropEffect set to copy");

      if (currentDragPaths.length === 0) {
        for (const item of dt.items) {
          if (item.kind === "string" && item.type === "text/plain") {
            log("Reading text/plain from drag DataTransfer");
            item.getAsString((text) => {
              const paths = BridgeUtils.extractPathsFromDragData(text);
              log("Extracted drag paths:", paths.length, "files");
              if (paths.length > 0 && currentDragPaths.length === 0) {
                currentDragPaths = paths;
                log("Sending dragStart to inject script with", paths.length, "paths");
                sendToInject("dragStart", { paths });
              } else if (paths.length === 0) {
                log("No file paths could be extracted from drag text");
              }
            });
            break;
          }
        }
      }
    },
    true,
  );

  document.addEventListener(
    "drop",
    async (e) => {
      if (!enabled) {
        log("drop ignored: extension disabled");
        return;
      }
      if (e.__vscodeBridgeSynthetic) {
        log("drop ignored: synthetic bridge drop");
        return;
      }

      const dt = e.dataTransfer;
      if (!dt) {
        log("drop received with no DataTransfer");
        return;
      }

      const types = Array.from(dt.types || []);
      const isVSCodeDragDrop = types.some(
        (t) =>
          t.startsWith("code") || t === "resourceurls" || t === "application/vnd.code.uri-list",
      );

      log("drop:", {
        types,
        files: dt.files?.length ?? 0,
        items: dt.items?.length ?? 0,
        isVSCodeDragDrop,
        currentDragPaths: currentDragPaths.length,
        target: e.target?.tagName,
      });

      if (!isVSCodeDragDrop && dt.files && dt.files.length > 0) {
        log("drop ignored: native file drop");
        return;
      }
      if (isVSCodeDragDrop) {
        e.preventDefault();
        log("drop accepted as VS Code drop");
      }

      if (currentDragPaths.length === 0) {
        log("No paths captured during dragover; attempting text/plain fallback on drop");
        const text = dt.getData("text/plain");
        log("Drop text/plain length:", text.length);
        const paths = BridgeUtils.extractPathsFromDragData(text);
        log("Drop fallback extracted paths:", paths.length);
        if (paths.length === 0) {
          log("drop aborted: no file paths found");
          return;
        }
        currentDragPaths = paths;
      }

      log("Handling drop for", currentDragPaths.length, "paths");

      const dropPaths = [...currentDragPaths];
      const dropTarget = e.target;
      const dropX = e.clientX;
      const dropY = e.clientY;

      currentDragPaths = [];
      dragoverLogged = false;
      log("Sending dragEnd to inject script");
      sendToInject("dragEnd");

      // Dispatch dragleave to dismiss overlays
      dispatchDragEndEvents(dropTarget);

      try {
        log("Fetching", dropPaths.length, "files from local bridge server");
        const filePromises = dropPaths.map((path) => BridgeApi.fetchFile(path));
        const filesData = await Promise.all(filePromises);
        log("Files fetched for drop:", filesData.length);

        log("Sending dropFiles to inject script");
        sendToInject("dropFiles", {
          files: filesData,
          target: {
            x: dropX,
            y: dropY,
            tagName: dropTarget?.tagName,
            className: dropTarget?.className,
          },
        });
        log("dropFiles message sent");
      } catch (err) {
        log("Failed to handle drop:", err.message);
        await handleDropError(err);
      }
    },
    true,
  );

  document.addEventListener(
    "dragend",
    () => {
      log("dragend event:", { currentDragPaths: currentDragPaths.length });
      if (currentDragPaths.length > 0) {
        log("Drag ended, cleaning up and sending dragEnd");
        currentDragPaths = [];
        dragoverLogged = false;
        sendToInject("dragEnd");
      }
    },
    true,
  );

  document.addEventListener(
    "dragleave",
    (e) => {
      if (e.relatedTarget === null) {
        log("dragleave document:", { currentDragPaths: currentDragPaths.length });
      }
      if (e.relatedTarget === null && currentDragPaths.length > 0) {
        log("Drag left document, cleaning up and sending dragEnd");
        currentDragPaths = [];
        dragoverLogged = false;
        sendToInject("dragEnd");
      }
    },
    true,
  );

  // ============================================================================
  // Paste Event Handler
  // ============================================================================

  document.addEventListener(
    "paste",
    async (e) => {
      if (!enabled) return;

      const clipboardData = e.clipboardData;
      if (clipboardData?.files?.length > 0) return;

      const clipboardText = clipboardData?.getData("text/plain") || "";
      const hasMarker = clipboardText.startsWith(BridgeConstants.CLIPBOARD_MARKER);
      const hasVSCodeFormat = BridgeUtils.isVSCodeClipboardData(clipboardText);
      const isEmptyClipboard = clipboardText === "";

      if (!hasMarker && !hasVSCodeFormat && !isEmptyClipboard) {
        return;
      }

      log(
        "Detected VS Code clipboard data:",
        hasMarker ? "marker" : hasVSCodeFormat ? "json format" : "empty clipboard",
      );

      const shouldPreventDefault = hasMarker;
      if (shouldPreventDefault) {
        e.preventDefault();
        e.stopPropagation();
      }

      try {
        const data = await BridgeApi.getClipboard();

        if (data.files?.length > 0) {
          log("Found files in VSCode clipboard:", data.files.length);
          sendToInject("pasteFiles", { files: data.files });
          BridgeApi.clearClipboard().catch(() => {});
        }
      } catch (err) {
        log("Clipboard check failed:", err.message);
      }
    },
    true,
  );

  // ============================================================================
  // Helper Functions
  // ============================================================================

  function dispatchDragEndEvents(dropTarget) {
    try {
      if (dropTarget && dropTarget !== document.body) {
        dropTarget.dispatchEvent(
          new DragEvent("dragleave", {
            bubbles: true,
            cancelable: true,
            relatedTarget: null,
          }),
        );
      }

      document.body.dispatchEvent(
        new DragEvent("dragleave", {
          bubbles: true,
          cancelable: true,
          relatedTarget: null,
        }),
      );

      document.dispatchEvent(
        new DragEvent("dragend", {
          bubbles: true,
          cancelable: true,
        }),
      );
    } catch (err) {
      log("Failed to dispatch drag end events:", err.message);
    }
  }

  async function handleDropError(err) {
    const status = await BridgeApi.checkServerHealth();
    if (!status.running) {
      BridgeUtils.showNotification("VSCode Drop Bridge: Please open VSCode to enable file drops");
    } else {
      BridgeUtils.showNotification(`VSCode Drop Bridge: Could not read files - ${err.message}`);
    }
  }

  log("Content script loaded");
})();
