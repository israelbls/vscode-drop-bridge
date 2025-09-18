

function fileUriToFsPath(uri) {
    try {
        if (!uri.startsWith('file://')) return uri;
        const u = new URL(uri);
        let p = decodeURIComponent(u.pathname);
        if (p.length >= 3 && p[0] === '/' && /^[A-Za-z]:/.test(p.slice(1, 3))) {
            p = p.slice(1);
        }
        return p;
    } catch (e) {
        return uri;
    }
}


function extractPathFromVscodeDragString(s) {
    s = s.trim();
    try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr) && arr.length > 0) {
            const res = arr[0].resource || null;
            if (res) {
                if (res.fsPath) return res.fsPath;
                if (res.path) return res.path.startsWith('/') && /^[A-Za-z]:/.test(res.path.slice(1, 3)) ? res.path.slice(1) : res.path;
                if (res.external) return fileUriToFsPath(res.external);
            }
        }
    } catch (e) {
        // not JSON
    }
    if (s.startsWith('file://')) return fileUriToFsPath(s);
    return s;
}


function base64ToUint8Array(base64) {
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
}


function attachFileToFirstInput(filename, mime, base64) {
    const bytes = base64ToUint8Array(base64);
    const file = new File([bytes], filename, { type: mime || 'application/octet-stream', lastModified: Date.now() });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.querySelector('input[type=file]');
    if (input) {
        try {
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        } catch (e) {
            console.warn('assigning files failed', e);
        }
    }
    return false;
}


// listener for messages from background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'fileData') {
        // received file content from native host
        const ok = attachFileToFirstInput(msg.filename || 'file', msg.mime || 'application/octet-stream', msg.base64 || '');
        sendResponse({ ok });
    }
});

// handle drop events
document.addEventListener('dragover', e => {
    // Check if the drag contains string data, which is how VSCode sends file paths.
    const hasStringData = Array.from(e.dataTransfer.items).some(item => item.kind === 'string');

    console.log(e)
    if (hasStringData) {
        // This is the crucial part. By setting dropEffect, we signal
        // that this is a valid drop target for a copy operation.
        // This makes most websites show their "drop zone" UI.
        e.dataTransfer.dropEffect = 'copy';

        e.preventDefault();
    }
});


document.addEventListener('drop', e => {
    // // We must stop the event synchronously to prevent the browser from handling it.
    e.preventDefault();
    // e.stopPropagation();

    let vscodeDragHandled = false;
    const items = Array.from(e.dataTransfer.items);

    for (const item of items) {
        if (item.kind === 'string') {
            item.getAsString((s) => {
                // Only process the first valid path found.
                if (vscodeDragHandled) return;

                const fsPath = extractPathFromVscodeDragString(s);

                // Browser-compatible check for a file path.
                if (fsPath && (fsPath.includes('/') || fsPath.includes('\\'))) {
                    vscodeDragHandled = true;

                    // ADDED try...catch block to handle the race condition.
                    try {
                        chrome.runtime.sendMessage({ cmd: 'readFile', path: fsPath }, (resp) => {
                            // This response callback can also fail if the page navigates away.
                            if (chrome.runtime.lastError) {
                                console.log(`VSCode Drag Helper: ${chrome.runtime.lastError.message}`);
                                return;
                            }
                            if (resp && resp.error) {
                                console.error('background/native error', resp.error);
                            }
                        });
                    } catch (error) {
                        if (error.message.includes('Extension context invalidated')) {
                            console.log('VSCode Drag Helper: Message not sent because page navigated away.');
                        } else {
                            console.error('VSCode Drag Helper error:', error);
                        }
                    }
                }
            });
        }
    }

}, true); // Use capture phase for reliability.