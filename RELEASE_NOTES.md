# v0.2.14 — Initial public release

`dsh-minimalist-appearance` (外观 / Appearance) is a persistent DeepSeek Harness plugin for color and conversation-background presets. It preserves native typography, layout, controls, and interactions.

## Included

- Seven one-click choices: Light, Dark, System, Green, Sea, Sand, and Original.
- A large appearance preview and compact theme gallery; selection applies and saves atomically.
- The accepted watercolor background and theme-aware component colors.
- Shared popup-menu color support, including composer model/effort, permissions, command/reference candidates, and upper-right Open In menus.
- English and Chinese display metadata, original bundled artwork, MIT license, source, tests, and a prebuilt Client using the host's React.

## Compatibility and verification

- Verified against DeepSeek Harness **0.2.1-rc.5**. Other versions are not yet verified.
- **96/96** logic, source-policy, and publication-identity tests pass; JavaScript syntax checks pass. These checks are not cross-platform visual acceptance.
- Original removes this plugin's color/background overrides without changing native theme or font preferences.
- Install, enable, disable, and uninstall with the native DSH plugin manager. No manual profile changes are required.

## Installation

Install the versioned GitHub Release package:

```json
{
  "action": "install_bundle",
  "target": "https://github.com/zxbingoo/dsh-minimalist-appearance/releases/download/v0.2.14/dsh-minimalist-appearance-0.2.14.tgz"
}
```

The release package is named **`dsh-minimalist-appearance`**. This is a **GitHub-only release**, not an npm publication; it remains `private: true` to prevent accidental npm publishing. The old npm name `dsh-appearance` belongs to an unrelated project.

Internal configuration, panel, and tool identifiers remain `dsh-appearance` / `dsh_appearance` for compatibility. Do not enable this release alongside the old development package in the same profile. This is a new distribution identity, not a guaranteed automatic migration of development installs: saved overrides may assert the old package name. Any replacement needs a supported plugin-manager/settings migration that preserves saved values. Do not manually edit profile configuration. This publication leaves the existing development installation untouched.

Only the current accepted wallpaper is distributed. Historical artwork backups, local settings, credentials, and conversation data are excluded.

Community marketplace submission is separate from this release and remains subject to its repository-age requirement, CI, and human review.
