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

  // Store original property descriptors
  const originalTypesDescriptor = Object.getOwnPropertyDescriptor(DataTransfer.prototype, 'types');
  const originalFilesDescriptor = Object.getOwnPropertyDescriptor(DataTransfer.prototype, 'files');

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
        if (window.__vscodeDragActive) {
          return createTypesWithFiles(originalTypes);
        }
        return originalTypes;
      },
      configurable: true,
      enumerable: true
    });
  }

  // Override DataTransfer.files
  if (originalFilesDescriptor) {
    Object.defineProperty(DataTransfer.prototype, 'files', {
      get() {
        const originalFiles = originalFilesDescriptor.get.call(this);
        if (window.__vscodeDragActive && window.__vscodeDragFile) {
          return createFileList(window.__vscodeDragFile);
        }
        if (window.__vscodeDragActive) {
          return createFileList(null);
        }
        return originalFiles;
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

      const pasteTarget = document.activeElement || document.body;
      pasteTarget.dispatchEvent(pasteEvent);
      return 'fallbackPaste';
    }

    return 'elementDrop';
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
