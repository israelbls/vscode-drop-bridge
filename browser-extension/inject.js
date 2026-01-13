/**
 * inject.js - Runs in the page context to modify DataTransfer prototype
 * 
 * This script is injected into the page to override DataTransfer.types and
 * DataTransfer.files getters. This allows us to make drop zones recognize
 * VSCode drags as file drags, even though they only contain text data.
 */


(function () {
  'use strict';

  // Avoid double injection
  if (window.__vscodeBridgeInjected && window.__vscodeDragActive !== undefined) {
    return;
  }
  window.__vscodeBridgeInjected = true;

  // State for tracking VSCode drags
  window.__vscodeDragActive = false;
  window.__vscodeDragFile = null;
  window.__vscodeDragPath = null;

  /**
   * Check if drag data looks like it's from VSCode (synchronous check)
   */
  function isVSCodeDragData(dataTransfer) {
    const types = Array.from(dataTransfer.types || []);
    if (types.includes('Files')) return false;
    if (!types.includes('text/plain')) return false;
    // VSCode includes these custom types
    return types.includes('codeeditors') || types.includes('codefiles') || types.includes('application/vnd.code.uri-list');
  }

  // Direct drag detection in MAIN world (runs BEFORE async message handling)
  document.addEventListener('dragenter', function(e) {
    if (e.dataTransfer && isVSCodeDragData(e.dataTransfer)) {
      window.__vscodeDragActive = true;
      window.__vscodeDragDetectedAt = Date.now();
    }
  }, true); // capture phase - runs first!

  document.addEventListener('dragend', function() {
    window.__vscodeDragActive = false;
    window.__vscodeDragFile = null;
    window.__vscodeDragPath = null;
  }, true);

  document.addEventListener('drop', function(e) {
    // Immediately reset on native drop so sites don't see placeholder file
    // Our synthetic drop will provide the real files
    if (!e.__vscodeBridgeSynthetic) {
      window.__vscodeDragActive = false;
      window.__vscodeDragFile = null;
      window.__vscodeDragPath = null;
    }
  }, true);

  // Store original property descriptors
  const originalTypesDescriptor = Object.getOwnPropertyDescriptor(DataTransfer.prototype, 'types');
  const originalFilesDescriptor = Object.getOwnPropertyDescriptor(DataTransfer.prototype, 'files');
  const originalItemsDescriptor = Object.getOwnPropertyDescriptor(DataTransfer.prototype, 'items');

  /**
   * Create a fake DOMStringList that includes 'Files'
   */
  function createTypesWithFiles(originalTypes) {
    const typesArray = originalTypes ? Array.from(originalTypes) : [];
    if (!typesArray.includes('Files')) {
      typesArray.push('Files');
    }

    return new Proxy(typesArray, {
      get(target, prop) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          return target[parseInt(prop, 10)];
        }
        if (prop === 'length') return target.length;
        if (prop === 'contains') return (value) => target.includes(value);
        if (prop === 'includes') return (value) => target.includes(value);
        if (prop === 'item') return (index) => target[index] || null;
        if (prop === 'indexOf') return (value) => target.indexOf(value);
        if (prop === Symbol.iterator) {
          return function* () {
            for (const item of target) yield item;
          };
        }
        if (prop === 'forEach') return (callback, thisArg) => target.forEach(callback, thisArg);
        return target[prop];
      },
      has(target, prop) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          return parseInt(prop, 10) < target.length;
        }
        return prop in target || ['contains', 'includes', 'item', 'length'].includes(prop);
      }
    });
  }

  /**
   * Create a fake FileList containing our file
   */
  function createFileList(file) {
    const files = file ? [file] : [];
    return new Proxy(files, {
      get(target, prop) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          return target[parseInt(prop, 10)];
        }
        if (prop === 'length') return target.length;
        if (prop === 'item') return (index) => target[index] || null;
        if (prop === Symbol.iterator) {
          return function* () {
            for (const item of target) yield item;
          };
        }
        return target[prop];
      }
    });
  }

  // Override DataTransfer.types
  if (originalTypesDescriptor) {
    Object.defineProperty(DataTransfer.prototype, 'types', {
      get() {
        const originalTypes = originalTypesDescriptor.get.call(this);
        const typesArray = originalTypes ? Array.from(originalTypes) : [];
        
        // Check if this looks like VS Code drag data (has VS Code custom types but no 'Files')
        const hasVSCodeTypes = typesArray.includes('codeeditors') || typesArray.includes('codefiles');
        const alreadyHasFiles = typesArray.includes('Files');
        
        // ALWAYS add 'Files' to types when VS Code types are present
        // This ensures drop zones recognize VS Code drags as file drags immediately
        if (hasVSCodeTypes && !alreadyHasFiles) {
          window.__vscodeDragActive = true; // Set flag for files/items getters
          return createTypesWithFiles(originalTypes);
        }
        return originalTypes;
      },
      configurable: true,
      enumerable: true
    });
  }

  // Override DataTransfer.files
  // Note: We don't use a placeholder file - just return empty files during drag
  // Sites should detect file drags via types.includes('Files'), not files.length
  
  if (originalFilesDescriptor) {
    Object.defineProperty(DataTransfer.prototype, 'files', {
      get() {
        const originalFiles = originalFilesDescriptor.get.call(this);
        
        // Check VS Code types directly (in case types getter wasn't called first)
        if (!window.__vscodeDragActive && originalTypesDescriptor) {
          const types = originalTypesDescriptor.get.call(this);
          const typesArray = types ? Array.from(types) : [];
          if ((typesArray.includes('codeeditors') || typesArray.includes('codefiles')) && !typesArray.includes('Files')) {
            window.__vscodeDragActive = true;
          }
        }
        
        // Only return our file when we actually have one (during synthetic drop)
        if (window.__vscodeDragActive && window.__vscodeDragFile) {
          return createFileList(window.__vscodeDragFile);
        }
        // During drag, return original (empty) files - highlighting uses types check
        return originalFiles;
      },
      configurable: true,
      enumerable: true
    });
  }

  /**
   * Create a fake DataTransferItemList with file items
   */
  function createItemsWithFile(originalItems, file) {
    const fakeItem = {
      kind: 'file',
      type: file.type || 'text/plain',
      getAsFile: () => file,
      getAsString: () => null,
      webkitGetAsEntry: () => null
    };
    
    // Build array: original items + our fake file item
    const itemsArray = originalItems ? Array.from(originalItems) : [];
    // Only add fake item if there are no file items already
    const hasFileItem = itemsArray.some(item => item.kind === 'file');
    if (!hasFileItem) {
      itemsArray.push(fakeItem);
    }
    
    return new Proxy(itemsArray, {
      get(target, prop) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) {
          return target[parseInt(prop, 10)];
        }
        if (prop === 'length') return target.length;
        if (prop === Symbol.iterator) {
          return function* () {
            for (const item of target) yield item;
          };
        }
        if (prop === 'add') return () => {}; // No-op
        if (prop === 'remove') return () => {}; // No-op
        if (prop === 'clear') return () => {}; // No-op
        return target[prop];
      }
    });
  }

  // Override DataTransfer.items (some sites check items instead of types/files)
  if (originalItemsDescriptor) {
    Object.defineProperty(DataTransfer.prototype, 'items', {
      get() {
        const originalItems = originalItemsDescriptor.get.call(this);
        
        // Check VS Code types directly (in case types getter wasn't called first)
        if (!window.__vscodeDragActive && originalTypesDescriptor) {
          const types = originalTypesDescriptor.get.call(this);
          const typesArray = types ? Array.from(types) : [];
          if ((typesArray.includes('codeeditors') || typesArray.includes('codefiles')) && !typesArray.includes('Files')) {
            window.__vscodeDragActive = true;
          }
        }
        
        // Only return modified items when we have actual file (during synthetic drop)
        if (window.__vscodeDragActive && window.__vscodeDragFile) {
          return createItemsWithFile(originalItems, window.__vscodeDragFile);
        }
        // During drag, return original items - highlighting uses types check
        return originalItems;
      },
      configurable: true,
      enumerable: true
    });
  }

  // Text MIME types that need special handling for ChatGPT
  const textMimes = ['text/plain', 'text/markdown', 'text/x-python', 'text/javascript',
    'application/javascript', 'text/typescript', 'application/typescript',
    'text/html', 'text/css', 'text/csv', 'application/json', 'text/xml',
    'application/xml', 'text/yaml', 'text/x-c', 'text/x-c++src'];

  /**
   * Get effective MIME type (empty for text files on ChatGPT)
   */
  function getEffectiveMime(mime) {
    if (window.location.hostname.includes('chatgpt.com') && textMimes.includes(mime)) {
      return '';
    }
    return mime;
  }

  /**
   * Convert base64 file data to File object
   */
  function createFileFromData(fileData) {
    const byteString = atob(fileData.base64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i);
    }
    return new File([bytes], fileData.filename, {
      type: getEffectiveMime(fileData.mime),
      lastModified: Date.now()
    });
  }

  /**
   * Find suitable file input (skip image-only inputs on ChatGPT)
   */
  function findSuitableFileInput() {
    const fileInputs = document.querySelectorAll('input[type="file"]');
    if (fileInputs.length === 0) return null;

    if (window.location.hostname.includes('chatgpt.com')) {
      for (const input of fileInputs) {
        if (input.id === 'upload-camera' || input.accept?.startsWith('image/')) {
          continue;
        }
        return input;
      }
      return null;
    }
    return fileInputs[fileInputs.length - 1];
  }

  /**
   * Set files on a file input element
   */
  function setFilesOnInput(fileInput, files) {
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
 * Find main chat input - simply get the last editable element
 */
  function findMainInput() {
    const inputs = document.querySelectorAll(
      'textarea:not([readonly]):not([disabled]), [contenteditable="true"]'
    );

    if (inputs.length === 0) showNotification('No text area elements found');
    // Chat inputs are rendered last (bottom of page)
    return inputs[inputs.length - 1] || document.body;
  }

  /**
   * Dispatch synthetic drop event with files
   */
  function dispatchSyntheticDrop(files, targetX, targetY) {
    const targetElement = document.elementFromPoint(targetX, targetY);
    const dispatchTarget = targetElement || document;

    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));

    // Simulate full drag sequence
    dispatchTarget.dispatchEvent(new DragEvent('dragenter', {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: targetX, clientY: targetY
    }));

    dispatchTarget.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: targetX, clientY: targetY
    }));

    const dropEvent = new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: targetX, clientY: targetY
    });
    dropEvent.__vscodeBridgeSynthetic = true;

    const dispatched = dispatchTarget.dispatchEvent(dropEvent);

    // Fallback to paste if drop was rejected
    if (!dispatched || dropEvent.defaultPrevented) {
      const clipboardData = new DataTransfer();
      files.forEach(f => clipboardData.items.add(f));

      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true, cancelable: true, clipboardData: clipboardData
      });
      Object.defineProperty(pasteEvent, 'clipboardData', {
        get() { return clipboardData; }
      });

      const pasteTarget = findMainInput();
      pasteTarget.focus();
      pasteTarget.dispatchEvent(pasteEvent);
      return 'fallbackPaste';
    }

    return 'elementDrop';
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

  // Listen for messages from content script
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;

    const data = event.data;
    if (!data || data.source !== 'vscode-drop-bridge-content') return;

    switch (data.type) {
      case 'dragStart':
        window.__vscodeDragActive = true;
        window.__vscodeDragPath = data.path;
        window.__vscodeDragFile = null;
        break;

      case 'dragEnd':
        window.__vscodeDragActive = false;
        window.__vscodeDragPath = null;
        window.__vscodeDragFile = null;
        break;

      case 'fileReady':
        if (data.file) {
          try {
            window.__vscodeDragFile = createFileFromData(data.file);
          } catch (err) {
            console.error('VSCode Drop Bridge: Failed to create file:', err);
          }
        }
        break;

      case 'pasteFiles':
        if (data.files && data.files.length > 0) {
          try {
            const files = data.files.map(createFileFromData);
            const fileInput = findSuitableFileInput();

            if (fileInput) {
              setFilesOnInput(fileInput, files);
              window.postMessage({
                source: 'vscode-drop-bridge-inject',
                type: 'pasteComplete',
                success: true,
                method: 'fileInput',
                count: files.length
              }, '*');
              return;
            }

            // Fallback: dispatch paste event
            const clipboardData = new DataTransfer();
            files.forEach(f => clipboardData.items.add(f));

            const pasteEvent = new ClipboardEvent('paste', {
              bubbles: true, cancelable: true, clipboardData: clipboardData
            });
            Object.defineProperty(pasteEvent, 'clipboardData', {
              get() { return clipboardData; }
            });

            const target = document.activeElement || document.body;
            target.dispatchEvent(pasteEvent);

            window.postMessage({
              source: 'vscode-drop-bridge-inject',
              type: 'pasteComplete',
              success: true,
              method: 'pasteEvent',
              count: files.length
            }, '*');

          } catch (err) {
            console.error('VSCode Drop Bridge: Failed to paste files:', err);
            window.postMessage({
              source: 'vscode-drop-bridge-inject',
              type: 'pasteComplete',
              success: false,
              error: err.message
            }, '*');
          }
        }
        break;

      case 'dropFiles':
        if (data.files && data.files.length > 0 && data.target) {
          try {
            const files = data.files.map(createFileFromData);
            const fileInput = findSuitableFileInput();

            if (fileInput) {
              setFilesOnInput(fileInput, files);
              window.postMessage({
                source: 'vscode-drop-bridge-inject',
                type: 'dropComplete',
                success: true,
                method: 'fileInput',
                count: files.length
              }, '*');
              return;
            }

            // Use synthetic drop
            const method = dispatchSyntheticDrop(files, data.target.x, data.target.y);

            window.postMessage({
              source: 'vscode-drop-bridge-inject',
              type: 'dropComplete',
              success: true,
              method: method,
              count: files.length
            }, '*');

          } catch (err) {
            console.error('VSCode Drop Bridge: Failed to drop files:', err);
            window.postMessage({
              source: 'vscode-drop-bridge-inject',
              type: 'dropComplete',
              success: false,
              error: err.message
            }, '*');
          }
        }
        break;
    }
  });

  // Notify content script that injection is complete
  window.postMessage({
    source: 'vscode-drop-bridge-inject',
    type: 'injected'
  }, '*');
})();
