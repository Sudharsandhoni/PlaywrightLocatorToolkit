# Changelog

All notable changes to the **Playwright Live Playground** extension will be documented in this file.

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
