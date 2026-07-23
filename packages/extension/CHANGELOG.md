# Changelog

All notable changes to the **Playwright Live Playground** extension will be documented in this file.

## [0.2.2] - 2026-07-23

### Fixed
- **Playwright Core packaging issue**: Added automatic copying of the `playwright-core` module to the local `node_modules` during the build/prepublish phase if it is hoisted in an npm workspace. This resolves the runtime launch error where the extension couldn't open because `playwright-core` was missing from the packaged VSIX.

## [0.2.1] - 2026-07-22

### Fixed
- **Duplicate `expect` import in CDP-attach mode**: When a user's script already contained `import { test, expect } from '@playwright/test'`, the generated sandbox spec would re-declare `expect` from the injected header, causing a `SyntaxError: Identifier 'expect' has already been declared`. The engine now strips symbols already provided by the generated header from user imports before writing the file.
- **Open in Editor — save dialog & path resolution**: "Open in Editor" now shows a native VS Code **Save Dialog** so users can choose the exact filename and location. Previously the file was silently written to an auto-detected directory, which could place it outside the intended spec folder. The specific file path is now correctly tracked for subsequent "Run in Workspace" syncing.
- **Editor sync tracking**: Corrected a map key mismatch (`editorId` vs `filePath`) that caused the workspace-script runner to miss code changes made in the opened editor file.

### Added
- **`tempDir` VS Code setting**: New `playwright-locator-toolkit.tempDir` configuration option to specify a fixed folder for all temporary playground files (absolute or relative to workspace root).
- **Restart command**: Added `playwright-locator-toolkit.restart` command to cleanly reconnect the extension without reloading the window.
- **`stop-editor-sync` message**: Webview can now explicitly stop tracking a particular editor tab, clearing its file mapping.

---

## [0.2.0] - 2026-07-16

### Added
- **Visual & Structural Redesign**: Renamed the extension to **Playwright Live Playground** with major UX enhancements.
- **Element Interaction Panel**:
  - **Quick Actions**: One-click operations (`Click`, `Hover`, `Focus`, etc.) and inputs (`Fill`, `Select Option`, `Press Key`) against target locators.
  - **Element Scripting**: Sandboxed multi-line JavaScript editor to run async scripts against the matched element.
- **Free-Form Browser Scripting Tab**: Run custom Playwright scripts directly using a sandboxed `page` variable without a test framework.
- **Run in Workspace Tab**: Execute tests (`npx playwright test`) or scripts (`npx tsx`) in the local workspace, with support for automated CDP connection wrappers and relative directory paths.
- **Diagnostics & Recommendations**: Interactive match navigator (e.g. `3 of 22`), alternative locator recommendation list sorted by confidence score, and failure analyzer identifying where chaining breaks.
- **UI Intelligence Scanner**: Inspect accessible trees, run accessibility audits, and export Page Object Model (POM) and SDK classes.

### Changed
- **Execution Sandbox**: Replaced standard eval-based dynamic execution with a custom tokenizer and recursive descent AST parser, restricting executions to a strict whitelist of Playwright methods to block security breakouts.

---

## [0.1.1] - 2026-07-16

### Fixed
- Addressed template interpolation issue where spec variables in script generation were not resolving correctly.
- Corrected TSConfig compiler compatibility flags (`ignoreDeprecations: "5.0"`).

---

## [0.1.0] - 2026-07-16

### Added
- Initial beta release of the Playwright Locator Toolkit.
