# Changelog

All notable changes to the VSCode Drop Bridge extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-05

### Added

- Initial release of VSCode Drop Bridge
- Local HTTP server on port 48369 for file transfers
- Drag and drop support from VSCode file explorer to browsers
- Copy and paste file support with clipboard integration
- Status bar indicator showing server status
- Context menu command "Copy Files (Drop Bridge)"
- Keyboard shortcut (Ctrl+C / Cmd+C) support in file explorer
- Automatic server startup when VSCode opens
- Toggle command to manually start/stop the server
- Security restrictions limiting file access to workspace folders
- Support for files up to 50MB
- Comprehensive MIME type detection

### Security

- Server only accepts localhost connections (127.0.0.1)
- Files must be within workspace folders to be accessible
- Clipboard files expire after 30 seconds
