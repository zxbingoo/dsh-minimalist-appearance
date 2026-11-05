# v0.2.14 — Initial public release

外观 / Appearance is a persistent DeepSeek Harness plugin for color and conversation-background presets. It preserves native typography, layout, controls, and interactions.

## Included

- Seven one-click choices: Light, Dark, System, Green, Sea, Sand, and Original.
- A large appearance preview and compact theme gallery; selection applies and saves atomically.
- The accepted watercolor background and theme-aware component colors.
- Shared popup-menu color support, including composer model/effort, permissions, command/reference candidates, and upper-right Open In menus.
- English and Chinese display metadata, original bundled artwork, MIT license, source, tests, and a prebuilt Client using the host's React.

## Compatibility and verification

- Verified against DeepSeek Harness **0.2.1-rc.5**. Other versions are not yet verified.
- **93/93** logic and source-policy tests pass; JavaScript syntax checks pass. These checks are not cross-platform visual acceptance.
- Original removes this plugin's color/background overrides without changing native theme or font preferences.
- Install, enable, disable, and uninstall with the native DSH plugin manager. No manual profile changes are required.

## Installation

Install the versioned GitHub Release package:

```json
{
  "action": "install_bundle",
  "target": "https://github.com/zxbingoo/dsh-appearance/releases/download/v0.2.14/dsh-appearance-0.2.14.tgz"
}
```

This is a **GitHub-only release**, not an npm publication. The npm name `dsh-appearance` belongs to an unrelated project. The package remains `private: true` to prevent accidental npm publishing.

Only the current accepted wallpaper is distributed. Historical artwork backups, local settings, credentials, and conversation data are excluded.

Community marketplace submission is separate from this release and remains subject to its repository-age requirement, CI, and human review.
