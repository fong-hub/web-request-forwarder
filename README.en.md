# Request Forwarder

Request Forwarder is a Chrome Manifest V3 extension that manages redirect rules
locally in the browser and syncs them into `declarativeNetRequest` dynamic rules.

## Overview

Request Forwarder is designed for local debugging, API forwarding, mock
replacement, and environment switching. It allows you to redirect specific
requests to local, staging, or alternate targets directly from the extension,
without deploying an additional proxy service, changing backend configuration,
or modifying application code.

## Advantages

- Lightweight: no standalone proxy, database, or local daemon is required
- Local-first: rules are stored and executed entirely inside the browser extension
- Easy to deploy: install the extension and start using it immediately
- Low coupling: no code changes are required in the target web application
- Efficient for debugging: quickly switch API targets, mock endpoints, or environments

## Current Capabilities

- Full rule editor in the options page
- Popup quick controls with global switch and rule overview
- Background service worker that syncs dynamic DNR rules on install, startup, and storage updates
- Rule-hit highlighting and per-rule hit counters
- Extension badge feedback for matched rule counts
- JSON import and export
- Lightweight diagnostics for duplicate or conflicting rules
- Basic rule validation
- Vitest coverage for rule validation and DNR conversion

## Architecture

- `src/background/index.ts`: storage bootstrap, DNR sync, icon state, and match feedback
- `src/core/rules.ts`: rule schema, validation, and DNR transformation
- `src/core/storage.ts`: shared storage API for popup, options, and background
- `src/options/*`: full rule management UI
- `src/popup/*`: quick action popup

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run release:prepare -- 0.0.2
```

## Release Flow

Use the release helper to prepare a GitHub release locally:

```bash
npm run release:prepare -- 0.0.2
```

It will:

- sync `package.json`, `package-lock.json`, and `src/manifest.json` to the target version
- run `lint`, `test`, and `build`
- create or update `releases/v<version>.md`
- package `dist/` as `releases/request-forwarder-v<version>.zip`
- print the `gh release create ...` command for GitHub publishing

## Notes

- The MVP uses Chrome's `urlFilter` directly rather than wrapping it in a custom pattern language
- Redirect actions currently focus on absolute URL forwarding
- Host permissions are still broad for now (`<all_urls>`) and can be narrowed later
