const fs = require('fs');
const pathModule = require('path');


function readMessage() {
    const buffer = Buffer.alloc(4);
    const bytes = fs.readSync(0, buffer, 0, 4, null);
    if (bytes === 0) return null;
    const len = buffer.readUInt32LE(0);
    const dataBuf = Buffer.alloc(len);
    fs.readSync(0, dataBuf, 0, len, null);
    return JSON.parse(dataBuf.toString('utf8'));
}


function sendMessage(msg) {
    const s = JSON.stringify(msg);
    const buf = Buffer.alloc(4 + Buffer.byteLength(s));
    buf.writeUInt32LE(Buffer.byteLength(s), 0);
    buf.write(s, 4);
    fs.writeSync(1, buf);
}


function guessMime(filename) {
    const ext = pathModule.extname(filename).toLowerCase();
    const map = {
        '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json', '.js': 'application/javascript',
        '.ts': 'application/typescript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.pdf': 'application/pdf'
    };
    return map[ext] || 'application/octet-stream';
}


// main loop
while (true) {
    const msg = readMessage();
    if (!msg) break;
    if (msg.path) {
        try {
            const b = fs.readFileSync(msg.path);
            const base64 = b.toString('base64');
            const filename = pathModule.basename(msg.path);
            const mime = guessMime(filename);
            sendMessage({ filename, mime, base64 });
        } catch (e) {
            sendMessage({ error: 'read_error', message: String(e) });
        }
    } else {
        sendMessage({ error: 'invalid_request' });
    }
}