# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows a lightweight semantic versioning approach.

## [0.0.4] - 2026-05-08

### Added

- Custom `CustomSelect` dropdown component to replace native `<select>`, preventing the dropdown from covering the current selection
- Sticky table headers and zebra-striping for better long-list readability
- Left-border color indicators on diagnostic cards to distinguish warning and info levels
- `:active` press feedback and `:focus-visible` focus rings for improved keyboard accessibility

### Changed

- Full Chinese localization for the options page, popup, error messages, diagnostics, and extension tooltips
- Default resource type for new rules changed from `xmlhttprequest` to `script`
- Rule editor modal header now uses `position: sticky` while the form content scrolls independently
- Match type and redirect type fields now sit side-by-side in a two-column layout
- Helper text font size reduced from `0.88rem` to `0.8rem` for a more restrained visual hierarchy
- Empty state text now centered with softer coloring
- Table action buttons slightly compacted for better fit in narrow columns

### Release Assets

- `releases/request-forwarder-v0.0.4.zip`
- `releases/v0.0.4.md`

## [0.0.3] - 2026-03-27

### Added

- GitHub Actions release workflow triggered by version tags
- GitHub issue templates for bug reports and feature requests
- GitHub release category configuration
- Project changelog maintenance file

### Changed

- Updated popup and options interactions for safer editing and clearer status feedback
- Prevented modal closing when clicking the backdrop
- Removed sensitive placeholder examples from rule editor inputs
- Excluded disabled rules from matched-rule badge counting
- Split project documentation into Chinese main README and English README

### Release Assets

- `releases/request-forwarder-v0.0.3.zip`
- `releases/v0.0.3.md`

## [0.0.2] - 2026-03-27

### Added

- Rule-hit tracking based on DNR feedback
- Badge count feedback on the extension icon
- Grayscale icon state when the global engine is disabled
- Release preparation script for version sync, validation, packaging, and notes generation
- Chinese and English project documentation

### Changed

- Reworked popup layout for quicker rule inspection and global control
- Improved popup scrolling behavior with fixed header and content-only scrolling
- Updated options page editing flow to use modal editing
- Improved rule table visibility and runtime status feedback

### Release Assets

- `releases/request-forwarder-v0.0.2.zip`
- `releases/v0.0.2.md`

## [0.0.1] - 2026-03-26

### Added

- Initial MVP for request forwarding based on Chrome Manifest V3
- Options page rule editor
- Popup quick controls
- DNR dynamic rule synchronization
- Import/export support
