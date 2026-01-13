# VSCode Drop Bridge

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=Israelbls.vscode-drop-bridge)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-green?logo=google-chrome)](https://chromewebstore.google.com/detail/vscode-drop-bridge/kagincebnlbiomnbklklgpibdcmiafmd)

**Seamlessly drag and drop or copy-paste files from VSCode to web browsers.**

<p align="center">
<img width="640" height="400" alt="127 0 0 1_5500_i html (2) (2)" src="https://github.com/user-attachments/assets/c974826a-cbf4-495d-bbd3-c5f16b04b39d" />
</p>

## The Problem

When you drag a file from VSCode's file explorer to a web browser (like Claude, ChatGPT, Gemini, or Grok), the browser doesn't recognize it as a file drop — it only receives the file path as text. This is because VSCode (an Electron app) sends drag data differently than the native file explorer.

## The Solution

VSCode Drop Bridge consists of two extensions that work together:

| Component             | Description                                                                           |
| --------------------- | ------------------------------------------------------------------------------------- |
| **VSCode Extension**  | Runs a local server that provides secure file access                                  |
| **Browser Extension** | Intercepts drag/drop and copy/paste events to convert them into proper file transfers |

## Features

- 🖱️ **Drag & Drop** — Drag files directly from VSCode to any website
- 📋 **Copy & Paste** — Copy files in VSCode, paste them into web upload areas
- 🔒 **Secure** — Only serves files from your workspace folders
- ⚡ **Fast** — Local transfers with no cloud dependency
- 🌐 **AI Chat Support** — Works with ChatGPT, Claude, Gemini, and Grok

## Installation

### Step 1: Install the VSCode Extension

**From Marketplace:**

1. Open VSCode
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "VSCode Drop Bridge"
4. Click **Install**

**Manual Installation:**

```bash
cd vscode-extension
npm install
npm run package
# Install the generated .vsix file via "Extensions: Install from VSIX"
```

### Step 2: Install the Browser Extension

**Chrome Web Store:**

1. Visit the [Chrome Web Store](https://chrome.google.com/webstore) and search for "VSCode Drop Bridge"
2. Click **Add to Chrome**

**Manual Installation (Developer Mode):**

1. Go to `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `browser-extension` folder

## Usage

### Drag and Drop

1. Make sure VSCode is open (the extension starts automatically)
2. Drag a file from VSCode's file explorer
3. Drop it on any website's file upload area
4. The drop zone will highlight and accept the file

### Copy and Paste

1. Select a file in VSCode's file explorer
2. Copy it (`Ctrl+C` / `Cmd+C`)
3. Go to a website with a file upload area
4. Paste (`Ctrl+V` / `Cmd+V`)
5. The file will be uploaded

## How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  VSCode         │     │  Local Server    │     │  Browser        │
│  Extension      │────▶│  (port 48369)    │◀────│  Extension      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │                        │
        │  Monitors clipboard    │  Serves file content   │  Intercepts drags
        │  for file copies       │  via HTTP              │  and pastes
        └────────────────────────┴────────────────────────┘
```

1. When VSCode opens, the extension starts a local HTTP server on port 48369
2. When you drag a file from VSCode, the browser extension detects the file path
3. The browser extension fetches the file content from the local server
4. The browser extension creates a proper File object and dispatches it to the website

## Configuration

### Browser Extension Popup

Click the extension icon in your browser to:

- Enable/disable the extension
- Toggle debug mode for console logging
- Check server connection status

### Options Page

Go to the extension options to:

- Add domains to **blacklist** (disable on specific sites)
- Add domains to **whitelist** (only enable on specific sites)

## Security

| Feature                   | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| **Localhost Only**        | The server only accepts connections from `127.0.0.1` |
| **Workspace Restriction** | Files must be within your VSCode workspace folders   |
| **Session Limited**       | Server only runs when VSCode is open                 |
| **Size Limit**            | Maximum file size of 50MB                            |
| **Clipboard Expiry**      | Copied file references expire after 30 seconds       |

## Troubleshooting

### "VSCode not detected" in browser extension popup

- Make sure VSCode is open
- Verify the VSCode Drop Bridge extension is installed and enabled
- Check if another application is using port 48369

### Files not uploading

- Enable debug mode in the browser extension popup
- Check the browser console (F12) for error messages
- Ensure the file is within your VSCode workspace

### Drop zones not highlighting

- Some websites use custom drop zone implementations
- Try the copy-paste method as an alternative

## Supported Websites

VSCode Drop Bridge currently supports the following AI assistant websites:

- **ChatGPT** (chat.openai.com)
- **Claude** (claude.ai)
- **Gemini** (gemini.google.com)
- **Grok** (grok.com)

*More websites may be added in future updates.*

## Development

### Prerequisites

- Node.js 18.x or higher
- VSCode 1.74.0 or higher
- Chrome or Edge browser

### VSCode Extension

```bash
cd vscode-extension
npm install
npm run compile
```

### Browser Extension

Load the `browser-extension` folder as an unpacked extension in Chrome/Edge.

### Generate Icons

```bash
npm install sharp
node scripts/generate-icons.js
```

## Contributing

Contributions are welcome!

## License

[MIT](LICENSE) © VSCode Drop Bridge

---

<p align="center">
  <sub>Built with ❤️ for developers who drag files</sub>
</p>
