/**
 * Inject script for VS Code Drop Bridge.
 * Runs in the page context to override DataTransfer prototype.
 * Enables drop zones to recognize VS Code drags as file drags.
 */

(() => {
  // ============================================================================
  // Constants
  // ============================================================================

  const MESSAGE_SOURCE = {
    CONTENT: "vscode-drop-bridge-content",
    INJECT: "vscode-drop-bridge-inject",
  };

  const TEXT_MIME_TYPES = [
    "text/plain",
    "text/markdown",
    "text/x-python",
    "text/javascript",
    "application/javascript",
    "text/typescript",
    "application/typescript",
    "text/html",
    "text/css",
    "text/csv",
    "application/json",
    "text/xml",
    "application/xml",
    "text/yaml",
    "text/x-c",
    "text/x-c++src",
  ];

  let debugMode = false;

  function log(...args) {
    if (debugMode) {
      console.log("[VSCode Drop Bridge INJECT]", ...args);
    }
  }

  // ============================================================================
  // State
  // ============================================================================

  // Prevent double injection
  if (window.__vscodeBridgeInjected && window.__vscodeDragActive !== undefined) {
    return;
  }
  window.__vscodeBridgeInjected = true;
  window.__vscodeDragActive = false;
  window.__vscodeDragFile = null;
  window.__vscodeDragPath = null;

  // ============================================================================
  // VS Code Drag Detection
  // ============================================================================

  /**
   * Checks if DataTransfer contains VS Code drag data.
   */
  function hasVSCodeDragTypes(dataTransfer) {
    const types = Array.from(dataTransfer.types || []);
    if (types.includes("Files")) return false;
    return (
      types.includes("text/plain") ||
      types.includes("text/uri-list") ||
      types.includes("text/x-moz-url") ||
      types.includes("codeeditors") ||
      types.includes("codefiles") ||
      types.includes("application/vnd.code.uri-list")
    );
  }

  // Direct drag detection in page context (runs before async message handling)
  document.addEventListener(
    "dragenter",
    (e) => {
      if (e.dataTransfer && hasVSCodeDragTypes(e.dataTransfer)) {
        window.__vscodeDragActive = true;
        window.__vscodeDragDetectedAt = Date.now();
      }
    },
    true,
  );

  document.addEventListener(
    "dragend",
    () => {
      window.__vscodeDragActive = false;
      window.__vscodeDragFile = null;
      window.__vscodeDragPath = null;
    },
    true,
  );

  document.addEventListener(
    "drop",
    (e) => {
      // Reset on native drop so sites don't see placeholder file
      if (!e.__vscodeBridgeSynthetic) {
        window.__vscodeDragActive = false;
        window.__vscodeDragFile = null;
        window.__vscodeDragPath = null;
      }
    },
    true,
  );

  // ============================================================================
  // DataTransfer Prototype Overrides
  // ============================================================================

  const originalTypesDescriptor = Object.getOwnPropertyDescriptor(DataTransfer.prototype, "types");
  const originalFilesDescriptor = Object.getOwnPropertyDescriptor(DataTransfer.prototype, "files");
  const originalItemsDescriptor = Object.getOwnPropertyDescriptor(DataTransfer.prototype, "items");

  /**
   * Creates a proxy that mimics DOMStringList with 'Files' added.
   */
  function createTypesWithFiles(originalTypes) {
    const typesArray = originalTypes ? Array.from(originalTypes) : [];
    if (!typesArray.includes("Files")) {
      typesArray.push("Files");
    }

    return new Proxy(typesArray, {
      get(target, prop) {
        if (typeof prop === "string" && /^\d+$/.test(prop)) {
          return target[parseInt(prop, 10)];
        }
        if (prop === "length") return target.length;
        if (prop === "contains") return (value) => target.includes(value);
        if (prop === "includes") return (value) => target.includes(value);
        if (prop === "item") return (index) => target[index] || null;
        if (prop === "indexOf") return (value) => target.indexOf(value);
        if (prop === "forEach") return (callback, thisArg) => target.forEach(callback, thisArg);
        if (prop === Symbol.iterator) {
          return function* () {
            for (const item of target) yield item;
          };
        }
        return target[prop];
      },
      has(target, prop) {
        if (typeof prop === "string" && /^\d+$/.test(prop)) {
          return parseInt(prop, 10) < target.length;
        }
        return prop in target || ["contains", "includes", "item", "length"].includes(prop);
      },
    });
  }

  /**
   * Creates a proxy that mimics FileList.
   */
  function createFileList(file) {
    const files = file ? [file] : [];
    return new Proxy(files, {
      get(target, prop) {
        if (typeof prop === "string" && /^\d+$/.test(prop)) {
          return target[parseInt(prop, 10)];
        }
        if (prop === "length") return target.length;
        if (prop === "item") return (index) => target[index] || null;
        if (prop === Symbol.iterator) {
          return function* () {
            for (const item of target) yield item;
          };
        }
        return target[prop];
      },
    });
  }

  /**
   * Creates a proxy that mimics DataTransferItemList with a file item.
   */
  function createItemsWithFile(originalItems, file) {
    const fakeItem = {
      kind: "file",
      type: file.type || "text/plain",
      getAsFile: () => file,
      getAsString: () => null,
      webkitGetAsEntry: () => null,
    };

    const itemsArray = originalItems ? Array.from(originalItems) : [];
    const hasFileItem = itemsArray.some((item) => item.kind === "file");
    if (!hasFileItem) {
      itemsArray.push(fakeItem);
    }

    return new Proxy(itemsArray, {
      get(target, prop) {
        if (typeof prop === "string" && /^\d+$/.test(prop)) {
          return target[parseInt(prop, 10)];
        }
        if (prop === "length") return target.length;
        if (prop === "add") return () => {};
        if (prop === "remove") return () => {};
        if (prop === "clear") return () => {};
        if (prop === Symbol.iterator) {
          return function* () {
            for (const item of target) yield item;
          };
        }
        return target[prop];
      },
    });
  }

  /**
   * Checks types and sets VS Code drag flag if needed.
   */
  function checkAndSetVSCodeDragFlag(dataTransfer) {
    if (!window.__vscodeDragActive && originalTypesDescriptor) {
      const types = originalTypesDescriptor.get.call(dataTransfer);
      const typesArray = types ? Array.from(types) : [];
      if (hasVSCodeDragTypes({ types: typesArray }) && !typesArray.includes("Files")) {
        window.__vscodeDragActive = true;
      }
    }
  }

  // Override DataTransfer.types
  if (originalTypesDescriptor) {
    Object.defineProperty(DataTransfer.prototype, "types", {
      get() {
        const originalTypes = originalTypesDescriptor.get.call(this);
        const typesArray = originalTypes ? Array.from(originalTypes) : [];

        const hasVSCodeTypes = hasVSCodeDragTypes({ types: typesArray });
        const alreadyHasFiles = typesArray.includes("Files");

        if (hasVSCodeTypes && !alreadyHasFiles) {
          window.__vscodeDragActive = true;
          return createTypesWithFiles(originalTypes);
        }
        return originalTypes;
      },
      configurable: true,
      enumerable: true,
    });
  }

  // Override DataTransfer.files
  if (originalFilesDescriptor) {
    Object.defineProperty(DataTransfer.prototype, "files", {
      get() {
        const originalFiles = originalFilesDescriptor.get.call(this);
        checkAndSetVSCodeDragFlag(this);

        if (window.__vscodeDragActive && window.__vscodeDragFile) {
          return createFileList(window.__vscodeDragFile);
        }
        return originalFiles;
      },
      configurable: true,
      enumerable: true,
    });
  }

  // Override DataTransfer.items
  if (originalItemsDescriptor) {
    Object.defineProperty(DataTransfer.prototype, "items", {
      get() {
        const originalItems = originalItemsDescriptor.get.call(this);
        checkAndSetVSCodeDragFlag(this);

        if (window.__vscodeDragActive && window.__vscodeDragFile) {
          return createItemsWithFile(originalItems, window.__vscodeDragFile);
        }
        return originalItems;
      },
      configurable: true,
      enumerable: true,
    });
  }

  // ============================================================================
  // File Creation Utilities
  // ============================================================================

  /**
   * Gets effective MIME type (empty for text files on ChatGPT).
   */
  function getEffectiveMime(mime) {
    if (window.location.hostname.includes("chatgpt.com") && TEXT_MIME_TYPES.includes(mime)) {
      return "";
    }
    return mime;
  }

  /**
   * Creates a File object from base64 file data.
   */
  function createFileFromData(fileData) {
    const byteString = atob(fileData.base64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i);
    }
    return new File([bytes], fileData.filename, {
      type: getEffectiveMime(fileData.mime),
      lastModified: Date.now(),
    });
  }

  // ============================================================================
  // File Input Utilities
  // ============================================================================

  /**
   * Finds a suitable file input (skips image-only inputs on ChatGPT).
   */
  function findSuitableFileInput() {
    const fileInputs = document.querySelectorAll('input[type="file"]');
    if (fileInputs.length === 0) return null;

    if (window.location.hostname.includes("chatgpt.com")) {
      for (const input of fileInputs) {
        if (input.id === "upload-camera" || input.accept?.startsWith("image/")) {
          continue;
        }
        return input;
      }
      return null;
    }
    return fileInputs[fileInputs.length - 1];
  }

  /**
   * Sets files on a file input element.
   */
  function setFilesOnInput(fileInput, files) {
    const dt = new DataTransfer();
    files.forEach((f) => {
      dt.items.add(f);
    });
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /**
   * Finds the main chat input element.
   */
  function findMainInput() {
    const inputs = document.querySelectorAll(
      'textarea:not([readonly]):not([disabled]), [contenteditable="true"]',
    );
    return inputs[inputs.length - 1] || document.body;
  }

  // ============================================================================
  // Drop/Paste Dispatch
  // ============================================================================

  /**
   * Dispatches a synthetic drop event with files.
   */
  function dispatchSyntheticDrop(files, targetX, targetY) {
    const targetElement = document.elementFromPoint(targetX, targetY);
    const dispatchTarget = targetElement || document;

    const dt = new DataTransfer();
    files.forEach((f) => {
      dt.items.add(f);
    });

    dispatchTarget.dispatchEvent(
      new DragEvent("dragenter", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: targetX,
        clientY: targetY,
      }),
    );

    dispatchTarget.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: targetX,
        clientY: targetY,
      }),
    );

    const dropEvent = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt,
      clientX: targetX,
      clientY: targetY,
    });
    dropEvent.__vscodeBridgeSynthetic = true;

    const dispatched = dispatchTarget.dispatchEvent(dropEvent);

    // Fallback to paste if drop was rejected
    if (!dispatched || dropEvent.defaultPrevented) {
      return dispatchPasteFallback(files);
    }

    return "elementDrop";
  }

  /**
   * Dispatches a paste event as fallback.
   */
  function dispatchPasteFallback(files) {
    const clipboardData = new DataTransfer();
    files.forEach((f) => {
      clipboardData.items.add(f);
    });

    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboardData,
    });
    Object.defineProperty(pasteEvent, "clipboardData", {
      get() {
        return clipboardData;
      },
    });

    const pasteTarget = findMainInput();
    pasteTarget.focus();
    pasteTarget.dispatchEvent(pasteEvent);
    return "fallbackPaste";
  }

  // ============================================================================
  // Notification
  // ============================================================================
  /**
   * Shows a notification toast (needed in page context, can't use shared utils).
   */
  function _showNotification(message) {
    const existing = document.getElementById("vscode-drop-bridge-notification");
    if (existing) existing.remove();

    const notification = document.createElement("div");
    notification.id = "vscode-drop-bridge-notification";
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

    if (!document.getElementById("vscode-drop-bridge-styles")) {
      const style = document.createElement("style");
      style.id = "vscode-drop-bridge-styles";
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
    }

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = "vscode-drop-bridge-fade-out 0.2s ease-out forwards";
      setTimeout(() => notification.remove(), 200);
    }, NOTIFICATION_DURATION);
  }

  // ============================================================================
  // Message Handlers
  // ============================================================================

  /**
   * Handles files for paste operation.
   */
  function handlePasteFiles(filesData) {
    try {
      const files = filesData.map(createFileFromData);
      const fileInput = findSuitableFileInput();

      if (fileInput) {
        setFilesOnInput(fileInput, files);
        sendResponse("pasteComplete", true, "fileInput", files.length);
        return;
      }

      dispatchPasteFallback(files);
      sendResponse("pasteComplete", true, "pasteEvent", files.length);
    } catch (err) {
      console.error("VSCode Drop Bridge: Failed to paste files:", err);
      sendResponse("pasteComplete", false, null, 0, err.message);
    }
  }

  /**
   * Handles files for drop operation.
   */
  function handleDropFiles(filesData, target) {
    try {
      log("Creating", filesData.length, "File objects");
      const files = filesData.map(createFileFromData);
      log(
        "Created File objects:",
        files.map((file) => file.name),
      );
      const fileInput = findSuitableFileInput();

      if (fileInput) {
        log("Using file input:", fileInput);
        setFilesOnInput(fileInput, files);
        sendResponse("dropComplete", true, "fileInput", files.length);
        return;
      }

      log("Dispatching synthetic drop at:", target.x, target.y);
      const method = dispatchSyntheticDrop(files, target.x, target.y);
      log("Synthetic drop dispatched via:", method);
      sendResponse("dropComplete", true, method, files.length);
    } catch (err) {
      console.error("VSCode Drop Bridge: Failed to drop files:", err);
      sendResponse("dropComplete", false, null, 0, err.message);
    }
  }

  /**
   * Sends a response message to content script.
   */
  function sendResponse(type, success, method, count, error) {
    window.postMessage(
      {
        source: MESSAGE_SOURCE.INJECT,
        type,
        success,
        method,
        count,
        error,
      },
      "*",
    );
  }

  // Listen for messages from content script
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    const data = event.data;
    if (!data || data.source !== MESSAGE_SOURCE.CONTENT) return;

    switch (data.type) {
      case "setDebugMode":
        debugMode = data.debugMode === true;
        break;
      case "ping":
        log("Received ping");
        sendResponse("injected", true, "handshake", 0);
        break;
      case "dragStart":
        log("Received dragStart:", {
          paths: Array.isArray(data.paths) ? data.paths.length : 0,
        });
        window.__vscodeDragActive = true;
        window.__vscodeDragPath = Array.isArray(data.paths) ? data.paths[0] : data.path;
        window.__vscodeDragFile = null;
        break;

      case "dragEnd":
        log("Received dragEnd");
        window.__vscodeDragActive = false;
        window.__vscodeDragPath = null;
        window.__vscodeDragFile = null;
        break;

      case "fileReady":
        if (data.file) {
          try {
            window.__vscodeDragFile = createFileFromData(data.file);
          } catch (err) {
            console.error("VSCode Drop Bridge: Failed to create file:", err);
          }
        }
        break;

      case "pasteFiles":
        if (data.files?.length > 0) {
          handlePasteFiles(data.files);
        }
        break;

      case "dropFiles":
        log("Received dropFiles:", {
          files: data.files?.length ?? 0,
          target: data.target,
        });
        if (data.files?.length > 0 && data.target) {
          handleDropFiles(data.files, data.target);
        } else {
          log("dropFiles ignored: missing files or target");
        }
        break;
    }
  });

  // ============================================================================
  // Initialization
  // ============================================================================

  // Notify content script that injection is complete
  window.postMessage(
    {
      source: MESSAGE_SOURCE.INJECT,
      type: "injected",
    },
    "*",
  );
})();
