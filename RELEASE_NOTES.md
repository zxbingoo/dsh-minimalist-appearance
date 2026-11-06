# v0.2.18 — DSH compatibility and clearer Green text

- Includes the 0.2.15–0.2.18 theme compatibility repairs: scoped plugin-manager switches, schedule cards, file previews, settings navigation, docked tabs, history button and recommended badges.
- Supports the audited DSH 0.2.2-rc.1 question option-row/option-line structure while retaining the older badge path; schemastery peer supports ~3.18.5 or ~3.19.0.
- Green light palette uses approved B text colors: primary `#293D33`, secondary `#586D60`. Wallpaper and fade, fonts, sizes, weights, layout, other palettes and native interactions remain unchanged. Derived preview ink is recalculated for contrast.
- Plugin Manager: 外观(dsh-minimalist-appearance); sidebar: 外观.
- Build, syntax and 131 logic/source-policy/publication tests pass. Runtime interfaces and registrations were checked against DSH 0.2.2-rc.1 in the development install; full authenticated-page/cross-platform visual acceptance is not claimed.
- Install archive: https://github.com/zxbingoo/dsh-minimalist-appearance/releases/download/v0.2.18/dsh-minimalist-appearance-0.2.18.tgz . Check SHA256SUMS beside the archive.
- The package identity is dsh-minimalist-appearance; internal configuration/panel/tool addresses remain dsh-appearance / dsh_appearance. Do not enable it alongside the development package. Existing development settings with package assertions require a supported migration; publishing this release does not change the current profile.
- GitHub-only distribution; no npm publication. Historical v0.2.14 tag and archive are not replaced. See COMPATIBILITY.md for upgrade checks and graceful fallback limits.

---

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
