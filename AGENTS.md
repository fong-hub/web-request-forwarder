# AGENTS.md — Request Forwarder

> This file is intended for AI coding agents. It assumes no prior knowledge of the project.

## Project Overview

**Request Forwarder** is a Chrome Manifest V3 browser extension that manages HTTP request redirect rules locally in the browser and syncs them into Chrome's `declarativeNetRequest` (DNR) dynamic rules.

- **Purpose**: Local debugging, API forwarding, mock replacement, and environment switching without deploying a proxy server or modifying application code.
- **Current version**: `0.0.3`
- **License**: See `LICENSE`

## Technology Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript 5.9 (ES2022) |
| UI Framework | React 19 (strict mode) |
| Build Tool | Vite 7 with `@crxjs/vite-plugin` |
| Styling | Tailwind CSS 4 (dependency present) + heavy custom CSS (`src/extension.css`) |
| Testing | Vitest 4 (node environment) |
| Linting | ESLint 9 flat config (`typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`) |
| Package Manager | npm |

The extension has three surface areas:
1. **Background Service Worker** — DNR rule sync, icon/badge state, match feedback.
2. **Options Page** — Full rule management UI (create, edit, delete, import, export, diagnostics).
3. **Popup** — Quick global toggle and rule overview with hit counts.

There is also a development preview page (`src/App.tsx`) rendered at the Vite dev server root.

## Project Structure

```
├── src/
│   ├── manifest.json              # Chrome MV3 manifest (consumed by @crxjs/vite-plugin)
│   ├── chrome.d.ts                # Minimal ambient types for chrome.* APIs
│   ├── index.css                  # Base page styles (gradient background, fonts)
│   ├── extension.css              # Complete custom design system (~860 lines)
│   ├── main.tsx / App.tsx         # Vite dev server preview page
│   ├── background/
│   │   └── index.ts               # Service worker: DNR sync, badge, grayscale icon
│   ├── core/
│   │   ├── rules.ts               # Rule schema, validation, DNR conversion, diagnostics
│   │   ├── rules.test.ts          # Vitest tests for rule logic
│   │   ├── storage.ts             # Storage abstraction + state helpers
│   │   └── storage.test.ts        # Vitest tests for storage (mocked chrome APIs)
│   ├── options/
│   │   ├── index.html             # Options page HTML shell
│   │   ├── main.tsx               # React root for options page
│   │   └── OptionsApp.tsx         # Full rule editor, import/export, diagnostics UI
│   ├── popup/
│   │   ├── index.html             # Popup HTML shell
│   │   ├── frame.css              # Popup window dimension constraints
│   │   ├── main.tsx               # React root for popup
│   │   └── PopupApp.tsx           # Quick toggle + compact rule table
│   └── assets/                    # Icons (16/48/128 PNG) and SVGs
├── scripts/
│   ├── vite-runner.mjs            # Wraps Vite CLI; polyfills `globalThis.File` for CRXJS
│   └── release.mjs                # Version sync, lint/test/build, zip packaging
├── .github/workflows/release.yml  # GitHub Actions: triggered on `v*` tags
├── vite.config.ts                 # Vite + React + CRX plugin
├── vitest.config.ts               # Vitest node environment
├── eslint.config.js               # ESLint flat config
├── tsconfig.json                  # Project references (app + node)
├── tsconfig.app.json              # App TS config (src/, strict, noEmit)
└── tsconfig.node.json             # Node TS config (vite.config.ts only)
```

## Build, Dev, and Test Commands

```bash
# Install dependencies
npm install

# Development server (Vite via custom runner)
npm run dev

# Production build (type-check then Vite build)
npm run build

# Run lint
npm run lint

# Run tests
npm run test

# Preview production build
npm run preview
```

### Custom Build Scripts

- **`scripts/vite-runner.mjs`**: Required polyfill for `@crxjs/vite-plugin` under Node 20+. It shims `globalThis.File` before delegating to the Vite CLI.
- **`scripts/release.mjs -- <semver>`**: Automates the release pipeline:
  1. Updates version in `package.json`, `package-lock.json`, and `src/manifest.json`.
  2. Runs `npm run lint`, `npm test`, `npm run build`.
  3. Creates/updates `releases/v<version>.md` with a template.
  4. Zips `dist/` into `releases/request-forwarder-v<version>.zip`.
  5. Prints the `gh release create` command.

## Code Organization and Conventions

### Module Boundaries

- **`src/core/rules.ts`** — Pure logic. No React, no Chrome APIs. Handles:
  - `RedirectRule` / `RuleDraft` / `DynamicRedirectRule` types
  - `validateRuleDraft()` — client-side validation
  - `toDynamicRule()` — conversion to DNR format
  - `analyzeRules()` — diagnostics (duplicates, same-priority conflicts, invalid targets)
  - `normalizeImportedRules()` — JSON import sanitization and ID deduplication
  - `sortRules()` — descending priority, then ascending creation time

- **`src/core/storage.ts`** — Async storage facade. Abstracts `chrome.storage.local` with a `localStorage` fallback for non-extension contexts (dev server).
  - `getAppState()` / `saveRule()` / `deleteRule()` / `setRuleEnabled()` / `setExtensionEnabled()`
  - `recordRuleMatch()` — increments per-rule hit counters
  - `subscribeToState()` — cross-context reactive updates
  - `exportAppStateText()` / `importAppStateText()` — JSON transfer

- **`src/background/index.ts`** — Chrome-specific orchestration only.
  - Listens to `chrome.runtime.onInstalled`, `onStartup`, `storage.onChanged`
  - Calls `chrome.declarativeNetRequest.updateDynamicRules()`
  - Updates action badge/title/icon
  - Listens to `onRuleMatchedDebug` for hit tracking

- **`src/options/OptionsApp.tsx`** and **`src/popup/PopupApp.tsx`** — React UI pages. Both read/write state exclusively through `src/core/storage.ts` APIs.

### Storage Keys

All local storage keys are prefixed with `request-forwarder.`:
- `request-forwarder.extension-enabled`
- `request-forwarder.rules`
- `request-forwarder.sync`
- `request-forwarder.matches`

### TypeScript Conventions

- Strict mode enabled (`strict: true`)
- `noUnusedLocals: true`, `noUnusedParameters: true`
- `verbatimModuleSyntax: true` — use `import type { ... }` for type-only imports
- `allowImportingTsExtensions: true` — imports use `.ts`/`.tsx` extensions
- `noEmit: true` — TSC only checks; Vite handles bundling

### CSS Conventions

The project uses a **custom CSS design system** in `src/extension.css` rather than Tailwind utility classes. Key patterns:
- CSS custom properties (`--bg`, `--panel`, `--accent`, `--success`, `--danger`, etc.)
- BEM-like naming: `.app-shell`, `.hero-panel`, `.rule-table`, `.popup-board`, `.toggle-button`, `.button-row`
- Popup dimensions are hardcoded to `800px × 516px` (`src/popup/frame.css` + inline JS styles)
- Responsive breakpoints at `900px` and `600px`

## Testing Strategy

- **Runner**: Vitest with `environment: 'node'`
- **Test files**: Co-located with source (`*.test.ts` alongside `*.ts`)
- **`src/core/rules.test.ts`** — Unit tests for validation, DNR conversion, import normalization, and diagnostics
- **`src/core/storage.test.ts`** — Integration-style tests using a mocked `chrome.storage.local` (via `vi.stubGlobal`). Includes a concurrency test for concurrent `setRuleEnabled` + `recordRuleMatch` to verify pending-write ordering.

Run tests:
```bash
npm test
```

## Security and Permission Considerations

- **Manifest permissions**: `storage`, `declarativeNetRequest`, `declarativeNetRequestFeedback`
- **Host permissions**: `<all_urls>` (broad by design for a debugging proxy; can be narrowed)
- **Content Security Policy**: Default CSP from Manifest V3; no remote scripts
- **Data locality**: All rules and match records stay in `chrome.storage.local`; no remote servers
- **Input validation**: Rule drafts are validated before persistence. Imported JSON is normalized and deduplicated. Redirect URLs must be absolute `http:` or `https:`.
- **Regex safety**: Regex patterns are validated via `new RegExp()` before being accepted. Regex substitutions normalize `$1` syntax to Chrome's `\1` DNR syntax.

## Release and Deployment

### Manual Release
```bash
npm run release:prepare -- 0.0.4
```
This updates versions, validates, builds, and packages. Then run the printed `gh release create` command.

### Automated Release (GitHub Actions)
Push a version tag:
```bash
git tag -a v0.0.4 -m "Release v0.0.4"
git push origin v0.0.4
```
The workflow (`.github/workflows/release.yml`) triggers on `v*` tags, runs `release:prepare`, and creates a GitHub Release with the zip asset.

## Notes for Agents

- **Do not change the popup dimensions** (`800px × 516px`) without also updating `src/popup/frame.css`, `PopupApp.tsx` inline styles, and `extension.css` media queries.
- **Always keep `manifest.json` version in sync** with `package.json` when bumping versions. The release script does this automatically; manual edits must stay consistent.
- **DNR rule IDs** (`dnrId`) are 1-based integers recomputed on every rule mutation (sort + renumber). Do not rely on `dnrId` stability across edits.
- **The `chrome.d.ts` file is minimal and hand-written.** If you need additional Chrome APIs, add them there rather than installing `@types/chrome` (which is not currently a dependency).
- **Avoid adding heavy external UI libraries.** The project already has a cohesive custom CSS system.
- **State changes must flow through `src/core/storage.ts`** so that all contexts (options, popup, background) stay synchronized via `chrome.storage.onChanged`.
