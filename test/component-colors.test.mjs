import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_PALETTE, DEFAULTS, PALETTES, buildTokenOverrides, resolveTokenModes, validateState } from '../core.js';
import { buildChromeCss, buildComponentCss } from '../backgrounds.js';

// Token/CSS-policy and numeric contrast checks only. No DOM, React, interaction
// simulation or claim of browser rendering/visual acceptance lives in this file.
const UPLOAD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6w4sAAAAASUVORK5CYII=';
const PRESETS = ['original', 'forest', 'sea', 'sand'];
const MODES = ['inherit', 'light', 'dark', 'system'];
const BACKGROUNDS = ['none', 'forest', 'sea', 'sand', 'upload'];
const BOOLS = [false, true];
const DIRECT_FIELDS = {
  '--dsw-alias-bg-base': 'base',
  '--dsw-specific-sidebar-fill': 'sidebar',
  '--dsw-alias-bg-layer-1': 'surface',
  '--dsw-alias-bg-layer-2': 'nested',
  '--dsw-alias-bg-layer-3': 'surface',
  '--dsw-alias-bg-overlay': 'surface',
  '--dsw-specific-input-major': 'surface',
  '--dsw-specific-menu': 'surface',
  '--dsw-specific-bubble': 'nested',
  '--dsw-alias-markdown-code-block': 'surface',
  '--dsw-alias-markdown-code-block-banner': 'nested',
  '--dsw-alias-markdown-inline-code': 'nested',
  '--dsw-alias-bg-module-platform': 'nested',
  '--dsw-alias-interactive-bg-hover': 'nested',
  '--dsw-alias-interactive-bg-active': 'border',
  '--dsw-alias-button-ghost-active-fill': 'nested',
  '--dsw-alias-button-ghost-active-border': 'secondary',
  '--dsw-alias-button-tool-bar-fill': 'surface',
  '--dsw-alias-button-tool-bar-hover': 'nested',
  '--dsw-alias-border-l1': 'border',
  '--dsw-alias-border-l2': 'border',
  '--dsw-alias-border-l3': 'border',
  '--dsw-alias-border-l4': 'border',
  '--dsw-alias-label-primary': 'text',
  '--dsw-alias-label-secondary': 'secondary',
  '--dsw-alias-label-tertiary': 'secondary',
  '--dsw-alias-label-caption': 'secondary',
  '--dsw-alias-label-dimmed': 'secondary',
  '--dsw-alias-brand-primary': 'accent',
};
const EXPECTED_NAMES = [...Object.keys(DIRECT_FIELDS), '--dsw-alias-switch-thumb'].sort();
const LOCAL_ONLY = [
  '--dsw-specific-selector', '--dsw-alias-interactive-bg-hover-solid',
  '--dsw-alias-label-primary-inverted', '--dsw-menu-surface-fill',
  '--dsw-alias-menu-icon', '--dsw-alias-menu-group-header-fill',
  '--dsw-alias-button-floating-fill', '--dsw-alias-button-floating-hover',
  '--dsw-alias-label-primary-foreground', '--dsw-alias-button-primary-hover',
];
const SWITCH_SELECTORS = [
  'body [data-plugin-panel] [data-plugin-package] button[role="switch"][aria-checked="true"]',
  'body [data-plugin-panel] [data-plugin-row] button[role="switch"][aria-checked="true"]',
  'body [data-plugin-panel] [data-plugin-detail] > [data-window-drag] > div > div > button[role="switch"][aria-checked="true"]:last-child',
];

// Independent fixed fixtures: [accent, higher-contrast black/white foreground].
// The adjacent #757575/#767676 cases fence the foreground-choice crossover.
const ACCENT_FIXTURES = [
  ['#4D6BFE', '#000000'],
  ['#8094FF', '#000000'],
  ['#3D8057', '#FFFFFF'],
  ['#76B891', '#000000'],
  ['#316F96', '#FFFFFF'],
  ['#7EB5DC', '#000000'],
  ['#95653F', '#FFFFFF'],
  ['#DBAA78', '#000000'],
  ['#000000', '#FFFFFF'],
  ['#FFFFFF', '#000000'],
  ['#FF0000', '#000000'],
  ['#00FF00', '#000000'],
  ['#0000FF', '#FFFFFF'],
  ['#757575', '#FFFFFF'],
  ['#767676', '#000000'],
  ['#777777', '#000000'],
  ['#808080', '#000000'],
  ['#112233', '#FFFFFF'],
  ['#ABCDEF', '#000000'],
  ['#AABBCC', '#000000'],
];
const CONTROL_EXPECTATIONS = new Map(ACCENT_FIXTURES);
const CUSTOM_ACCENTS = ACCENT_FIXTURES.slice(8).map(([accent]) => accent);

function expectedPairs(palette, accent = '') {
  const tokens = Object.fromEntries(Object.entries(DIRECT_FIELDS).map(([token, field]) => [token, {
    light: field === 'accent' && accent ? accent : palette.light[field],
    dark: field === 'accent' && accent ? accent : palette.dark[field],
  }]));
  tokens['--dsw-alias-switch-thumb'] = { light: palette.light.surface, dark: palette.dark.secondary };
  return tokens;
}

function expectedResolved(pairs, mode, systemDark) {
  if (mode === 'inherit') return pairs;
  const selected = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
  return Object.fromEntries(Object.entries(pairs).map(([name, values]) => [name, { light: values[selected], dark: values[selected] }]));
}

function luminance(hex) {
  const bytes = hex.slice(1).match(/../g).map((pair) => Number.parseInt(pair, 16) / 255);
  const linear = bytes.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(left, right) {
  const [high, low] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

function assertAllowedTokens(tokens) {
  assert.deepEqual(Object.keys(tokens).sort(), EXPECTED_NAMES);
  assert.equal(EXPECTED_NAMES.length, 30);
  for (const [name, values] of Object.entries(tokens)) {
    assert.doesNotMatch(name, /--dsw-static-|--dsw-alias-(?:state|file-diff)-|font|size|width|height|padding|margin|radius|layout|spacing/i);
    assert.deepEqual(Object.keys(values).sort(), ['dark', 'light']);
    for (const value of Object.values(values)) assert.match(value, /^#[0-9A-F]{6}$/);
  }
  for (const name of LOCAL_ONLY) assert.equal(Object.hasOwn(tokens, name), false, `${name} remains consumer-local`);
}

function rules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
}

function declarations(body) {
  const entries = [...body.matchAll(/^\s*([-a-z0-9]+): (.+);$/gm)].map(([, name, value]) => [name, value]);
  assert.equal(new Set(entries.map(([name]) => name)).size, entries.length, 'no duplicate declarations');
  assert.equal(body.replace(/^\s*([-a-z0-9]+): (.+);$/gm, '').trim(), '', 'no unparsed declarations');
  return Object.fromEntries(entries);
}

test('30 confirmed colors follow every preset, explicit/inherited/system mode and native scheme without state writes', () => {
  for (const preset of PRESETS) for (const mode of MODES) {
    const palette = preset === 'original' ? BASE_PALETTE : PALETTES[preset];
    const state = Object.freeze(validateState({ preset, mode, background: 'upload', imageData: UPLOAD, fade: 37 }));
    const before = { ...state };
    const inactive = preset === 'original' && mode === 'inherit';
    const expected = inactive ? {} : expectedPairs(palette);
    assert.deepEqual(buildTokenOverrides(state), expected);
    for (const nativeDark of BOOLS) for (const systemDark of BOOLS) {
      const label = `${preset}/${mode}/native:${nativeDark}/system:${systemDark}`;
      const tokens = resolveTokenModes(state, systemDark);
      assert.deepEqual(tokens, inactive ? {} : expectedResolved(expected, mode, systemDark), label);
      if (inactive) {
        assert.equal(buildComponentCss(state), '', label);
        continue;
      }
      assertAllowedTokens(tokens);
      const nativeMode = nativeDark ? 'dark' : 'light';
      const effective = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode === 'inherit' ? nativeMode : mode;
      for (const [name, field] of Object.entries(DIRECT_FIELDS)) {
        assert.equal(tokens[name][nativeMode], palette[effective][field], `${label}: ${name}`);
      }
      assert.equal(tokens['--dsw-alias-switch-thumb'][nativeMode], effective === 'light' ? palette.light.surface : palette.dark.secondary, `${label}: off thumb`);
    }
    assert.deepEqual(state, before, 'mode resolution must preserve wallpaper, fade and every saved field');
  }
});

test('native Original, accent-only and every background-only combination leave component/chrome paint inactive', () => {
  for (const state of [null, undefined, DEFAULTS]) {
    assert.equal(buildComponentCss(state), '');
    assert.equal(buildChromeCss(state), '');
  }
  for (const background of BACKGROUNDS) for (const fade of [0, 37, 80, 100]) for (const accent of ['', '#AABBCC']) {
    const state = Object.freeze(validateState({ ...DEFAULTS, background, fade, accent, imageData: UPLOAD }));
    const before = { ...state };
    const expected = accent ? { '--dsw-alias-brand-primary': { light: accent, dark: accent } } : {};
    assert.deepEqual(buildTokenOverrides(state), expected);
    assert.equal(buildComponentCss(state), '', `${background}/${fade}/${accent}: no component repair`);
    assert.equal(buildChromeCss(state), '', `${background}/${fade}/${accent}: no sidebar repair`);
    for (const nativeDark of BOOLS) for (const systemDark of BOOLS) {
      const tokens = resolveTokenModes(state, systemDark);
      assert.deepEqual(tokens, expected, `${background}/${fade}/${accent}/${nativeDark}/${systemDark}`);
      assert.equal(buildComponentCss(state, { nativeDark, systemDark }), '', 'environment changes cannot activate a background-only repair');
      for (const name of ['--dsw-alias-label-primary-foreground', '--dsw-alias-button-primary-hover', '--dsw-alias-switch-thumb']) {
        assert.equal(Object.hasOwn(tokens, name), false, 'accent alone cannot activate a paired-control repair');
      }
    }
    assert.deepEqual(state, before);
  }
});

test('shared neutral consumers retain primary ink contrast and distinct off-switch paint without semantic overrides', () => {
  for (const preset of PRESETS) for (const mode of MODES) {
    if (preset === 'original' && mode === 'inherit') continue;
    const state = Object.freeze(validateState({ preset, mode }));
    for (const nativeDark of BOOLS) for (const systemDark of BOOLS) {
      const values = Object.fromEntries(Object.entries(resolveTokenModes(state, systemDark)).map(([name, pair]) => [name, pair[nativeDark ? 'dark' : 'light']]));
      const ink = values['--dsw-alias-label-primary'];
      for (const token of [
        '--dsw-alias-bg-layer-3', '--dsw-alias-markdown-inline-code', '--dsw-alias-markdown-code-block-banner',
        '--dsw-alias-button-tool-bar-fill', '--dsw-alias-button-tool-bar-hover',
        '--dsw-alias-button-ghost-active-fill', '--dsw-alias-interactive-bg-active',
        '--dsw-alias-bg-layer-1', '--dsw-alias-interactive-bg-hover',
      ]) assert.ok(contrast(ink, values[token]) >= 4.5, `${preset}/${mode}: primary ink against ${token}`);
      assert.notEqual(values['--dsw-alias-bg-layer-3'], values['--dsw-alias-bg-module-platform'], 'selected segment paint stays distinct from its track');
      assert.notEqual(values['--dsw-alias-button-tool-bar-fill'], values['--dsw-alias-button-tool-bar-hover'], 'toolbar retains hover feedback');
      assert.notEqual(values['--dsw-alias-interactive-bg-hover'], values['--dsw-alias-interactive-bg-active'], 'pressed neutral feedback remains distinct');
      const offThumb = values['--dsw-alias-switch-thumb'];
      const offTrack = values['--dsw-alias-border-l3'];
      assert.ok(luminance(offThumb) > luminance(offTrack), 'off thumb remains lighter than its track, not another nearly identical raised/nested pair');
      // Light off switches deliberately retain a subtle native-style neutral
      // pair; this is not a 3:1 claim for that pair or for secondary labels.
      assert.ok(contrast(offThumb, offTrack) > 1);
    }
  }
});

test('plugin-manager on-switches alone choose readable actual-accent ink across native and effective modes', () => {
  for (const preset of PRESETS) for (const mode of MODES) for (const accent of ['', ...CUSTOM_ACCENTS]) {
    const palette = preset === 'original' ? BASE_PALETTE : PALETTES[preset];
    const state = Object.freeze(validateState({ preset, mode, accent: accent.toLowerCase(), background: 'upload', imageData: UPLOAD, fade: 37 }));
    const before = { ...state };
    const inactive = preset === 'original' && mode === 'inherit';
    const expected = inactive ? (accent ? { '--dsw-alias-brand-primary': { light: accent, dark: accent } } : {}) : expectedPairs(palette, accent);
    assert.deepEqual(buildTokenOverrides(state), expected);
    for (const nativeDark of BOOLS) for (const systemDark of BOOLS) {
      const tokens = resolveTokenModes(state, systemDark);
      assert.deepEqual(tokens, inactive ? expected : expectedResolved(expected, mode, systemDark));
      const css = buildComponentCss(state, { nativeDark, systemDark });
      if (inactive) {
        assert.equal(css, '', 'native/accent-only/background-only states cannot activate switch repair');
        continue;
      }
      assertAllowedTokens(tokens);
      const nativeMode = nativeDark ? 'dark' : 'light';
      const actualAccent = tokens['--dsw-alias-brand-primary'][nativeMode];
      const label = `${preset}/${mode}/${nativeDark}/${systemDark}/${actualAccent}`;
      const foregroundRules = rules(css).filter(({ body }) => /--dsw-alias-label-primary-foreground\s*:/.test(body));
      assert.equal(foregroundRules.length, 1, 'foreground is declared in one exact owner-local rule, not on body/cards/status markers');
      const rule = foregroundRules[0];
      assert.deepEqual(rule.selector.split(/,\s*\n/), SWITCH_SELECTORS, 'only verified native enable-switch owners; trailing detail control excludes action contributions');
      const expectedInk = CONTROL_EXPECTATIONS.get(actualAccent);
      assert.ok(expectedInk, 'every expected actual accent has a fixed fixture');
      assert.deepEqual(declarations(rule.body), { '--dsw-alias-label-primary-foreground': `${expectedInk} !important` });
      // Source-confirmed Switch(on) uses brand-primary directly and this local
      // alias for its thumb. No primary Button or StateDot contrast claim.
      assert.ok(contrast(expectedInk, actualAccent) >= 4.5, `${label}: enabled thumb/track, before native disabled opacity`);
      assert.ok(contrast(expectedInk, actualAccent) >= contrast('#000000', actualAccent), `${label}: no lower-contrast ink than black`);
      assert.ok(contrast(expectedInk, actualAccent) >= contrast('#FFFFFF', actualAccent), `${label}: no lower-contrast ink than white`);
      assert.doesNotMatch(css, /--dsw-alias-button-primary-hover\s*:|\[data-state|--dsw-alias-state-/);
      assert.equal(tokens['--dsw-alias-switch-thumb'][nativeMode], expectedResolved(expected, mode, systemDark)['--dsw-alias-switch-thumb'][nativeMode], 'custom accent does not recolor off thumbs');
    }
    assert.deepEqual(state, before, 'custom accent calculations cannot mutate the original state or wallpaper');
  }
});

test('accent-specific switch ink cannot replace native StateDot foreground or primary-button hover', () => {
  // Matching ui-theme 0.2.1-rc.5 constants. Native-dark done steps pair this
  // dark ink with fixed green; a global white accent foreground would regress
  // that glyph below 3:1. This checks token/CSS policy, not a rendered status.
  const nativeForeground = { light: '#FFFFFF', dark: '#0F1115' };
  const success = '#22C55E';
  assert.ok(contrast(nativeForeground.dark, success) > 8);
  assert.ok(contrast('#FFFFFF', success) < 3);
  for (const preset of PRESETS) for (const mode of MODES) for (const accent of ['', ...CUSTOM_ACCENTS]) {
    const state = validateState({ preset, mode, accent });
    for (const nativeDark of BOOLS) for (const systemDark of BOOLS) {
      const tokens = resolveTokenModes(state, systemDark);
      assert.equal(Object.hasOwn(tokens, '--dsw-alias-label-primary-foreground'), false);
      assert.equal(Object.hasOwn(tokens, '--dsw-alias-button-primary-hover'), false);
      assert.equal(Object.hasOwn(tokens, '--dsw-alias-state-success-primary'), false);
      const foregroundRules = rules(buildComponentCss(state, { nativeDark, systemDark })).filter(({ body }) => /--dsw-alias-label-primary-foreground\s*:/.test(body));
      for (const rule of foregroundRules) assert.deepEqual(rule.selector.split(/,\s*\n/), SWITCH_SELECTORS, 'no foreground override on ancestors or unrelated semantic consumers');
    }
  }
});

test('local switch paint validates environment flags without mutating or guessing modes', () => {
  const state = Object.freeze(validateState({ preset: 'forest', mode: 'inherit' }));
  assert.throws(() => buildComponentCss(state, { nativeDark: 'dark' }), /nativeDark must be a boolean/);
  assert.throws(() => buildComponentCss(state, { systemDark: 'dark' }), /systemDark must be a boolean/);
  for (const nativeDark of BOOLS) {
    assert.equal(buildComponentCss(state, { nativeDark }), buildComponentCss(state, { nativeDark, systemDark: nativeDark }));
  }
});

test('schedule-create repair adds exactly two local paints without controls, reading backings or a global card palette', () => {
  const expected = {
    '--card-fill': 'var(--dsw-alias-bg-layer-1) !important',
    '--card-hover': 'var(--dsw-alias-interactive-bg-hover) !important',
  };
  for (const preset of PRESETS) for (const mode of MODES) {
    if (preset === 'original' && mode === 'inherit') continue;
    const state = Object.freeze(validateState({ preset, mode, accent: '#767676', background: 'upload', imageData: UPLOAD, fade: 37 }));
    const before = { ...state };
    const css = buildComponentCss(state);
    const parsed = rules(css);
    assert.equal(parsed.length, 8, 'six accepted local repairs plus schedule-create and scoped enable-switch paint');
    const cardRules = parsed.filter(({ body }) => /--card-(?:fill|hover)\s*:/.test(body));
    assert.equal(cardRules.length, 1, 'card colors cannot leak into body or unrelated cards');
    assert.equal(cardRules[0].selector, 'body [data-tool="schedule_create"]');
    assert.deepEqual(declarations(cardRules[0].body), expected);
    assert.equal(parsed.filter(({ selector }) => selector.includes('data-tool')).length, 1, 'no broader tool-card repair');
    assert.doesNotMatch(css, /--dsw-static-|--dsw-alias-(?:state|file-diff)-|data-ds-dark-theme|data-menu-backing|--dsw-menu-backdrop-filter|@(?:media|supports)|\.[a-zA-Z_-]|::/);
    assert.doesNotMatch(css, /buildReadabilityCss|data-conversation-header-leading|data-chat-flow-kind|data-turn-process|data-chat-running/);
    for (const { body } of parsed) {
      assert.ok(Object.keys(declarations(body)).every((name) => name.startsWith('--')), 'consumer repairs contain only custom paint variables, no geometry, typography, native opacity or interaction declarations');
    }
    assert.deepEqual(state, before, 'schedule repair preserves the saved theme, accent, wallpaper and fade');
  }
});
