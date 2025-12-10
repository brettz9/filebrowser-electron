# CHANGES to filebrowser-electron

## 0.9.0 (unreleased)

- feat: move/copy/cut
- feat: undo/redo
- feat: add breadcrumbs for icon view
- feat: option to drag-and-drop files onto bash or JavaScript files
- feat: preview pane
- feat: Get Info dialog
- feat: Key commands: Shift+Cmd+H for Home, Shift+Cmd+D for Desktop, Shift+Cmd+A for Applications, Shift+Cmd+U for Utilities
- fix: properly restore position after external file/folder creation/deletions
- fix: sticky notes at root
- fix: misc. fixes

## 0.8.0

- Switch to AGPL-3.0-only
- feat: context isolation (though not sandboxed for performance)
- fix: misc. bug fixes
- test: complete coverage

## 0.7.1

- fix: fuller file/folder change detection
- fix: preserve scroll after renames

## 0.7.0

- feat: create new folder
- feat: create text file within a folder
- feat: delete file or folder
- feat: "Open in Finder" for folders
- feat: context menu regular Open
- feat: hit Enter or use context menu to rename files or folders
- feat: listen for external file/folder changes to trigger refreshes
- fix: allow keyboard navigation on columns upon load
- fix: position fixes for context menu
- fix: disable context menu more actively
- fix: ensure context menu visible
- fix: build issues
- fix: max results
- refactor: use ESM in main

## 0.6.0

- feat: Open-With

## 0.5.1

- fix: update miller-columns to avoid keyboard navigation issue; update system-icon2

## 0.5.0

- feat: add stickies
- feat: allow path CLI argument

## 0.4.0

- feat: supporting file opening by double-click or cmd-o
- feat: column browser as well as icon view
- npm: Bump jamilih dep., devDeps

## 0.3.0

- Linting: Avoid `document.write`
- Linting: ash-nazg/sauron-node
- Maintenance: Add `.editorconfig`
- npm: Update deps (core-js-bundle, electron)
- npm: Update electron (and make as dep.), jamilih; add core-js-bundle dep.,
    electron-rebuild devDep; avoid updating electron (requires too high
    of a version of Node for now)
- npm: Use ES6 module version of base64-js
- npm: Update dep and devDeps

## 0.2.0

- Enhancement: Add system icons
- Refactoring: Use Jamilih

## 0.1.0

- First working version
- Linting: Remove "recommended"
- Allow external script modules

## 0.0.2

- npm: Update electron
- Linting: Add ESLint with ignore and rc file, add missing fields
  to `package.json`, add `.remarkrc`

## 0.0.1

- Initial commit (Electron skeleton)
