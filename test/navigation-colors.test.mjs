import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BASE_PALETTE, DEFAULTS, PALETTES, buildTokenOverrides, resolveTokenModes, validateState } from '../core.js';
import { buildComponentCss, buildFilePreviewCss, buildNavigationCss } from '../backgrounds.js';

// Pure CSS/token policy, source wiring and numeric primary-text contrast only.
// No browser/DOM/React simulation, rendered acceptance, secondary-label AA or
// 3:1 claim about the boundaries between these native-style subtle states.
const UPLOAD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6w4sAAAAASUVORK5CYII=';
const PRESETS = ['original', 'forest', 'sea', 'sand'];
const MODES = ['inherit', 'light', 'dark', 'system'];
const BOOLS = [false, true];
const BACKGROUNDS = ['none', 'forest', 'sea', 'sand', 'upload'];
const ACCENTS = ['', '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FF00FF', '#777777', '#112233'];
const FADES = [0, 37, 80, 100];
const SETTINGS_SCOPE = 'body [data-shortcut-modal="settings"] > nav';
const STRIP_SCOPE = 'body [data-sidebar-right-panel] [data-dockkit-strip-tabs] > [data-dockkit-tab]';
const NAV_ACTIVE = '--dsw-specific-sidebar-nav-item-active';
const NAV_HOVER = '--dsw-specific-sidebar-nav-item-hover';
const TAG_ACTIVE = '--dsw-alias-markdown-tag';
const LOCAL_NAMES = [NAV_ACTIVE, NAV_HOVER, TAG_ACTIVE].sort();
const EXPECTED_RULES = [
  { selector: SETTINGS_SCOPE, paint: {
    [NAV_ACTIVE]: 'var(--dsw-alias-bg-layer-1) !important',
    [NAV_HOVER]: 'color-mix(in srgb, var(--dsw-alias-bg-layer-1) 50%, transparent) !important',
  } },
  { selector: STRIP_SCOPE, paint: {
    [TAG_ACTIVE]: 'var(--dsw-alias-interactive-bg-active) !important',
  } },
];
const GLOBAL_NAMES = [
  '--dsw-alias-bg-base', '--dsw-specific-sidebar-fill',
  '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3', '--dsw-alias-bg-overlay',
  '--dsw-specific-input-major', '--dsw-specific-bubble', '--dsw-specific-menu',
  '--dsw-alias-markdown-code-block', '--dsw-alias-markdown-code-block-banner', '--dsw-alias-markdown-inline-code',
  '--dsw-alias-bg-module-platform', '--dsw-alias-interactive-bg-hover', '--dsw-alias-interactive-bg-active',
  '--dsw-alias-button-ghost-active-fill', '--dsw-alias-button-ghost-active-border',
  '--dsw-alias-button-tool-bar-fill', '--dsw-alias-button-tool-bar-hover',
  '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-border-l3', '--dsw-alias-border-l4',
  '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary',
  '--dsw-alias-label-caption', '--dsw-alias-label-dimmed', '--dsw-alias-brand-primary', '--dsw-alias-switch-thumb',
].sort();
const COMPONENT_SCOPES = [
  'body [data-changed-files]',
  'body [data-presented-file]',
  'body [data-composer-card]',
  'body svg:has(#dsh-wordmark-badge-clip)',
  'body [data-conversation-content]',
  'body [data-menu-material]',
  'body [data-tool="schedule_create"]',
  [
    'body [data-plugin-panel] [data-plugin-package] button[role="switch"][aria-checked="true"]',
    'body [data-plugin-panel] [data-plugin-row] button[role="switch"][aria-checked="true"]',
    'body [data-plugin-panel] [data-plugin-detail] > [data-window-drag] > div > div > button[role="switch"][aria-checked="true"]:last-child',
  ].join(',\n'),
];
const DIFF_SCOPE = 'body [data-changes-hover-preview] [data-review-view],\nbody [data-changes-review] [data-review-view]';
const PREVIEW_SCOPES = [
  DIFF_SCOPE,
  `${DIFF_SCOPE},\nbody [data-code-preview],\nbody [data-document-markdown]`,
  'body [data-document-markdown]',
  'body [data-textpreview-body]:has([data-pdf-preview])',
];

function* scenarios() {
  for (const preset of PRESETS) for (const mode of MODES) {
    const state = Object.freeze(validateState({ preset, mode }));
    for (const nativeDark of BOOLS) for (const systemDark of BOOLS) {
      const effective = mode === 'inherit' ? (nativeDark ? 'dark' : 'light')
        : mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
      yield {
        state,
        environment: Object.freeze({ nativeDark, systemDark }),
        palette: (preset === 'original' ? BASE_PALETTE : PALETTES[preset])[effective],
        inactive: preset === 'original' && mode === 'inherit',
        label: `${preset}/${mode}/native:${nativeDark}/system:${systemDark}`,
      };
    }
  }
}

function rules(css) {
  assert.equal(typeof css, 'string');
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  const parsed = [...css.matchAll(pattern)];
  assert.equal(css.replace(pattern, '').trim(), '', 'no extra CSS, nested rules or unparsed at-rules');
  return parsed.map(([, selector, body]) => ({ selector: selector.trim(), body }));
}

function navigationRules(css) {
  const parsed = rules(css);
  assert.equal(parsed.length, 2, 'exactly settings nav and right-preview strip owner rules');
  return parsed.map(({ selector, body }) => {
    const pattern = /^\s*(--[a-z0-9-]+): (.+);$/gm;
    const entries = [...body.matchAll(pattern)].map(([, name, value]) => [name, value]);
    assert.equal(body.replace(pattern, '').trim(), '', 'only custom paint variables; no direct paint or other declarations');
    assert.equal(new Set(entries.map(([name]) => name)).size, entries.length, 'no duplicate declarations');
    for (const [name, value] of entries) assert.match(value, / !important$/, `${name} wins only at its verified owner`);
    return { selector, paint: Object.fromEntries(entries) };
  });
}

function rgb(hex) {
  assert.match(hex, /^#[0-9A-F]{6}$/);
  return hex.slice(1).match(/../g).map((pair) => Number.parseInt(pair, 16));
}

function luminance(color) {
  const linear = (typeof color === 'string' ? rgb(color) : color).map((byte) => {
    const value = byte / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(ink, paint) {
  const left = luminance(ink);
  const right = luminance(paint);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

function aliasPaint(declaration, values) {
  const alias = declaration.match(/^var\((--[a-z0-9-]+)\) !important$/)?.[1];
  assert.ok(alias && Object.hasOwn(values, alias), 'direct local paint resolves an existing global color alias');
  return values[alias];
}

test('null, undefined, native Original and accent/wallpaper-only states share the inactive component gate', () => {
  const states = [null, undefined, DEFAULTS, Object.freeze({}), Object.freeze({ accent: '#112233' })];
  for (const background of BACKGROUNDS) for (const accent of ['', '#FF00FF']) {
    states.push(Object.freeze({ background, accent, imageData: UPLOAD, fade: 37 }));
  }
  for (const state of states) {
    const before = state && { ...state };
    assert.equal(buildNavigationCss(state), '');
    assert.equal(buildNavigationCss(state), buildComponentCss(state), 'only full palettes can activate either compatibility layer');
    if (state) assert.deepEqual(state, before, 'native/accent/wallpaper gates cannot write saved fields');
  }
});

test('all 64 preset/mode/native/system combinations retain exactly two fixed alias-only rules without state writes', () => {
  let count = 0;
  let enabled = 0;
  let enabledCss;
  for (const { state, environment, inactive, label } of scenarios()) {
    count += 1;
    const before = { ...state };
    const css = buildNavigationCss(state);
    assert.equal(Boolean(css), Boolean(buildComponentCss(state, environment)), `${label}: the palette gates agree`);
    if (inactive) assert.equal(css, '', label);
    else {
      enabled += 1;
      assert.deepEqual(navigationRules(css), EXPECTED_RULES, label);
      enabledCss ??= css;
      assert.equal(css, enabledCss, `${label}: native/system/effective mode never changes alias-only CSS`);
    }
    assert.deepEqual(state, before, `${label}: frozen input remains unchanged`);
  }
  assert.equal(count, 64);
  assert.equal(enabled, 60);
});

test('custom accents and all background/fade/upload combinations cannot activate or alter navigation CSS', () => {
  for (const { state, label } of scenarios()) {
    const baseline = buildNavigationCss(state);
    for (const accent of ACCENTS) for (const background of BACKGROUNDS) for (const fade of FADES) {
      const images = background === 'upload' ? [UPLOAD] : ['', UPLOAD];
      for (const imageData of images) {
        const candidate = Object.freeze(validateState({ ...state, accent: accent.toLowerCase(), background, fade, imageData }));
        const before = { ...candidate };
        assert.equal(buildNavigationCss(candidate), baseline, `${label}/${accent}/${background}/${fade}/image:${Boolean(imageData)}`);
        assert.deepEqual(candidate, before, 'neither active nor dormant uploaded bytes, accent or fade are changed');
      }
    }
  }
});

test('effective aliases keep primary ink at least 4.5:1 and retain distinct settings and ordinary nonquiet preview-tab states', () => {
  assert.equal(contrast('#000000', '#FFFFFF'), 21);
  assert.equal(contrast('#777777', '#777777'), 1);
  for (const { state, environment, palette, inactive, label } of scenarios()) {
    if (inactive) continue;
    const before = { ...state };
    const [nav, strip] = navigationRules(buildNavigationCss(state)).map(({ paint }) => paint);
    const nativeMode = environment.nativeDark ? 'dark' : 'light';
    const values = Object.fromEntries(Object.entries(resolveTokenModes(state, environment.systemDark)).map(([name, pair]) => [name, pair[nativeMode]]));
    const surface = values['--dsw-alias-bg-layer-1'];
    const nested = values['--dsw-alias-bg-layer-2'];
    const border = values['--dsw-alias-interactive-bg-active'];
    const text = values['--dsw-alias-label-primary'];
    assert.deepEqual({ surface, nested, border, text }, {
      surface: palette.surface, nested: palette.nested, border: palette.border, text: palette.text,
    }, `${label}: existing aliases, not native preference, supply the effective colors`);
    const settingsDefault = nested;
    const settingsActive = aliasPaint(nav[NAV_ACTIVE], values);
    assert.equal(settingsActive, surface);
    assert.equal(nav[NAV_HOVER], EXPECTED_RULES[0].paint[NAV_HOVER]);
    // color-mix(surface 50%, transparent) has 0.5 alpha. Composite its sRGB
    // channels over the settings nav's nested backing, without byte rounding.
    const settingsHover = rgb(surface).map((byte, index) => (byte + rgb(nested)[index]) / 2);
    // Dockkit's non-floating tabHost paints bg-base; the strip and a default
    // chip are transparent, rather than drawing a layer-1 surface. The three
    // states below describe ordinary nonquiet chips only. Native quiet means
    // exactly one unclosable tab and stays transparent even selected/hovered;
    // a lone closable tab is still ordinary. Floating titles are out of scope.
    // This numeric policy check does not simulate those native selector rules.
    const stripDefault = values['--dsw-alias-bg-base'];
    assert.equal(stripDefault, palette.base);
    const stripHover = values['--dsw-alias-interactive-bg-hover'];
    const stripActive = aliasPaint(strip[TAG_ACTIVE], values);
    assert.equal(stripHover, nested);
    assert.equal(stripActive, border);
    for (const [stateName, paint] of Object.entries({ settingsDefault, settingsHover, settingsActive, stripDefault, stripHover, stripActive })) {
      const ratio = contrast(text, paint);
      assert.ok(ratio >= 4.5, `${label}/${stateName}: primary ink is ${ratio.toFixed(6)}:1, below 4.5:1`);
    }
    assert.notDeepEqual(rgb(settingsDefault), rgb(settingsActive), `${label}: settings selection differs from default`);
    assert.notDeepEqual(settingsHover, rgb(settingsDefault), `${label}: settings hover differs from default`);
    assert.notDeepEqual(settingsHover, rgb(settingsActive), `${label}: settings hover differs from active`);
    assert.equal(new Set([stripDefault, stripHover, stripActive]).size, 3, `${label}: ordinary nonquiet preview default, hover and active stay distinct`);
    assert.deepEqual(state, before, 'numeric color checks leave frozen input unchanged');
  }
});

test('the exact three local variables stay out of all global tokens and the existing eight/four compatibility rules', () => {
  assert.equal(GLOBAL_NAMES.length, 30);
  for (const { state, environment, inactive, label } of scenarios()) for (const accent of ['', '#000000', '#FFFFFF', '#FF00FF']) {
    const candidate = Object.freeze(validateState({ ...state, accent, background: 'upload', imageData: UPLOAD, fade: 37 }));
    const before = { ...candidate };
    const tokens = buildTokenOverrides(candidate);
    const resolved = resolveTokenModes(candidate, environment.systemDark);
    const components = buildComponentCss(candidate, environment);
    const previews = buildFilePreviewCss(candidate, environment);
    const css = buildNavigationCss(candidate);
    for (const names of [Object.keys(tokens).sort(), Object.keys(resolved).sort()]) {
      assert.deepEqual(names, inactive ? (accent ? ['--dsw-alias-brand-primary'] : []) : GLOBAL_NAMES, `${label}: exact global token allowlist remains unchanged`);
      for (const name of LOCAL_NAMES) assert.equal(names.includes(name), false, `${name} never escapes its owner`);
    }
    assert.deepEqual(rules(components).map(({ selector }) => selector), inactive ? [] : COMPONENT_SCOPES, `${label}: all eight existing component owners remain separate`);
    assert.deepEqual(rules(previews).map(({ selector }) => selector), inactive ? [] : PREVIEW_SCOPES, `${label}: all four existing file-preview owners remain separate`);
    assert.doesNotMatch(`${components}\n${previews}`, /--dsw-specific-sidebar-nav-item-(?:active|hover)|--dsw-alias-markdown-tag|data-shortcut-modal|data-dockkit-strip-tabs|data-sidebar-right-tab/);
    if (!inactive) {
      const parsed = navigationRules(css);
      assert.deepEqual(parsed.flatMap(({ paint }) => Object.keys(paint)).sort(), LOCAL_NAMES, 'exact declaration allowlist, not new global tokens or direct paints');
      const aliases = [...new Set([...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(([, name]) => name))].sort();
      assert.deepEqual(aliases, ['--dsw-alias-bg-layer-1', '--dsw-alias-interactive-bg-active']);
    }
    assert.deepEqual(buildTokenOverrides(candidate), tokens, 'navigation building cannot change the token pairs');
    assert.deepEqual(resolveTokenModes(candidate, environment.systemDark), resolved, 'navigation building cannot change mode resolution');
    assert.equal(buildComponentCss(candidate, environment), components, 'navigation building cannot alter existing component CSS');
    assert.equal(buildFilePreviewCss(candidate, environment), previews, 'navigation building cannot alter file-preview CSS');
    assert.deepEqual(candidate, before, 'every persisted field remains intact');
  }
});

test('the single-argument builder has no DOM/native-preference access and cannot override typography, geometry or native effects', () => {
  const source = buildNavigationCss.toString();
  assert.equal(buildNavigationCss.length, 1);
  assert.match(source, /^function\s+buildNavigationCss\s*\(\s*state\s*\)\s*\{/, 'there is no environment parameter: existing aliases resolve all colors');
  assert.doesNotMatch(source, /\b(?:window|document|navigator|localStorage|sessionStorage|screen|globalThis)\s*(?:\.|\[)/);
  assert.doesNotMatch(source, /\b(?:matchMedia|getComputedStyle|MutationObserver|ResizeObserver|IntersectionObserver|requestAnimationFrame|setTimeout|setInterval|setPreference|setColorScheme|setTheme|setFontSize|querySelector(?:All)?|appendChild|setAttribute|fetch|XMLHttpRequest|WebSocket)\s*\(/);
  for (const { state, inactive } of scenarios()) {
    if (inactive) continue;
    const css = buildNavigationCss(state);
    assert.deepEqual(navigationRules(css), EXPECTED_RULES);
    const selectors = rules(css).map(({ selector }) => selector).join('\n');
    assert.doesNotMatch(selectors, /\b(?:html|iframe|canvas|img|span)\b|\[(?:role|aria-[\w-]+)\b|[.#][a-zA-Z_-]|\*|::|:has\(|@/i);
    assert.doesNotMatch(css, /data-sidebar-right-tab|data-ds-dark-theme|prefers-color-scheme|@(?:media|supports)|--dsw-static-|--dsw-alias-(?:state|file-diff)-/);
    assert.doesNotMatch(css, /(?:^|[;{\n])\s*(?:color|background(?:-[\w-]+)?|font(?:-[\w-]+)?|width|height|padding|margin|position|display|opacity|filter|backdrop-filter|transform|pointer-events|box-shadow|outline)\s*:/im);
  }
});

test('source Client composes navigation once into the existing shared VisualLayer stylesheet and chat-controls generation', async () => {
  const [client, build, manifestText] = await Promise.all([
    readFile(new URL('../src/client.js', import.meta.url), 'utf8'),
    readFile(new URL('../build.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.version, '0.2.18');
  const imports = client.match(/^import \{([^}]+)\} from ['"]\.\.\/backgrounds\.js['"];$/m);
  assert.ok(imports, 'source Client imports the existing shared paint module');
  assert.equal(imports[1].split(',').map((name) => name.trim()).filter((name) => name === 'buildNavigationCss').length, 1);
  const start = client.indexOf('function VisualLayer(');
  const end = client.indexOf('function AppearancePage(', start);
  assert.ok(start >= 0 && end > start, 'retain the original VisualLayer rather than a second renderer');
  const visual = client.slice(start, end);
  const paintPath = visual.match(/\bconst css\s*=\s*React\.useMemo\(\(\)\s*=>\s*state\s*\?\s*\[([\s\S]*?)\]\.filter\(Boolean\)\.join\(['"]\\n['"]\)/);
  assert.ok(paintPath, 'one existing state-gated CSS composition serves accepted state and live-preview state');
  assert.match(paintPath[1], /\bbuildNavigationCss\(state\s*\)/, 'no environment argument or alternate navigation style path');
  for (const name of ['buildBackgroundCss', 'buildChromeCss', 'buildComponentCss', 'buildFilePreviewCss', 'buildNavigationCss']) {
    assert.equal([...paintPath[1].matchAll(new RegExp(`\\b${name}\\s*\\(`, 'g'))].length, 1, `${name} participates once in the shared composition`);
  }
  assert.equal([...client.matchAll(/\bbuildNavigationCss\s*\(/g)].length, 1, 'no page-local, duplicate or imperative invocation');
  const mounts = [...visual.matchAll(/\bcss\s*&&\s*h\(\s*(['"])style\1\s*,\s*\{([^{}]*)\}\s*,\s*css\s*\)/g)];
  assert.equal(mounts.length, 1, 'one shared stylesheet mount, not an additional navigation stylesheet');
  assert.match(mounts[0][2], /['"]data-dsha-background['"]:\s*['"]['"]/);
  assert.match(mounts[0][2], /['"]data-dsha-version['"]:\s*['"]0\.2\.18['"]/);
  assert.equal([...client.matchAll(/['"]data-dsha-background['"]\s*:/g)].length, 1);
  assert.ok(client.includes('id: `${NS}-visual-0.2.18-chat-controls`'), 'visual registration uses the requested chat-controls generation');
  assert.equal([...client.matchAll(/ctx\.slots\.inject\(['"]shell\.overlay['"]/g)].length, 1, 'retain the original single overlay registration');
  const markers = [...client.matchAll(/['"]data-dsha-version['"]:\s*['"]([^'"]+)['"]/g)].map(([, version]) => version);
  assert.deepEqual(markers, [manifest.version, manifest.version]);
  const modules = build.match(/const modules = \[([^\]]+)\]/)?.[1];
  assert.ok(modules?.includes("'backgrounds.js'") && modules.includes("'src/client.js'"));
  assert.ok(modules.indexOf("'backgrounds.js'") < modules.indexOf("'src/client.js'"), 'the existing source build includes the shared builder before its consumer');
});
