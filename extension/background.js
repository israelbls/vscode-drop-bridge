chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.cmd !== 'readFile') return;
    const path = msg.path;
    if (!path) { sendResponse({ error: 'no_path' }); return; }


    chrome.runtime.sendNativeMessage('com.vscode.draghelper', { path }, (resp) => {
        if (chrome.runtime.lastError) {
            console.error('native messaging error', chrome.runtime.lastError);
            sendResponse({ error: chrome.runtime.lastError.message });
            return;
        }
        if (!resp || resp.error) {
            sendResponse({ error: (resp && resp.error) || 'no_response' });
            return;
        }


        // forward file data to the content script in the sender tab
        if (sender && sender.tab && sender.tab.id) {
            chrome.tabs.sendMessage(sender.tab.id, { type: 'fileData', filename: resp.filename, mime: resp.mime, base64: resp.base64 }, (ack) => {
                sendResponse({ ok: true });
            });
        } else {
            sendResponse({ error: 'no_sender_tab' });
        }
    });


    // indicate we will respond asynchronously
    return true;
});