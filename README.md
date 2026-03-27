# Request Forwarder

Request Forwarder is a Chrome Manifest V3 extension that stores redirect rules in
extension storage and syncs them into `declarativeNetRequest` dynamic rules.

## Current MVP

- Rule editor in the options page
- Popup with a global enable/disable switch
- Background service worker that syncs dynamic DNR rules on install, startup,
  and storage updates
- JSON import/export for rule migration
- Lightweight diagnostics for duplicate/conflicting filters
- Minimal validation for redirect rules
- Vitest coverage for rule validation and DNR conversion

## Architecture

- `src/background/index.ts`: storage bootstrap + DNR sync
- `src/core/rules.ts`: rule schema, validation, and DNR transformer
- `src/core/storage.ts`: storage API shared by popup/options/background
- `src/options/*`: full rules editor
- `src/popup/*`: quick controls

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run release:prepare -- 1.1.0
```

## Release Flow

Use the release helper to prepare a GitHub release locally:

```bash
npm run release:prepare -- 1.1.0
```

It will:

- sync `package.json`, `package-lock.json`, and `src/manifest.json` to the target version
- run `lint`, `test`, and `build`
- create/update `releases/v<version>.md`
- package `dist/` as `releases/request-forwarder-v<version>.zip`
- print the `gh release create ...` command for GitHub publishing

## Notes

- The MVP uses Chrome's `urlFilter` directly rather than wrapping it in a custom
  pattern language.
- Redirect rules currently support a single action type: absolute URL redirect.
- Host permissions are intentionally broad for now (`<all_urls>`) and should be
  narrowed once the target domains are clearer.
