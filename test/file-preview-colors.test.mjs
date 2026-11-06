import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BASE_PALETTE, DEFAULTS, PALETTES, buildTokenOverrides, resolveTokenModes, validateState } from '../core.js';
import { buildComponentCss, buildFilePreviewCss } from '../backgrounds.js';

// Pure color/CSS policy and source wiring only. These tests neither simulate a
// DOM/React/browser nor establish rendered file/Markdown/PDF visual acceptance.
const UPLOAD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6w4sAAAAASUVORK5CYII=';
const PRESETS = ['original', 'forest', 'sea', 'sand'];
const MODES = ['inherit', 'light', 'dark', 'system'];
const BOOLS = [false, true];
const BACKGROUNDS = ['none', 'forest', 'sea', 'sand', 'upload'];
const ACCENTS = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FF00FF', '#777777', '#112233'];
const DIFF_SCOPE = 'body [data-changes-hover-preview] [data-review-view],\nbody [data-changes-review] [data-review-view]';
const SYNTAX_SCOPE = `${DIFF_SCOPE},\nbody [data-code-preview],\nbody [data-document-markdown]`;
const MARKDOWN_SCOPE = 'body [data-document-markdown]';
// The PDF section inherits its backing from this sole outer reading boundary.
const PDF_SCOPE = 'body [data-textpreview-body]:has([data-pdf-preview])';
const SELECTORS = [DIFF_SCOPE, SYNTAX_SCOPE, MARKDOWN_SCOPE, PDF_SCOPE];
const SHIKI_NAMES = ['constant', 'string', 'comment', 'keyword', 'parameter', 'function', 'string-expression', 'punctuation', 'link'];

// Independent rc.5 source fixtures, not imports of the builder's private seeds.
const DIFF_FILLS = {
  light: { 'added-bg': '#E6F4E7', 'added-gutter': '#EDF7ED', 'deleted-bg': '#FCE6E2', 'deleted-gutter': '#FDECE9' },
  dark: { 'added-bg': '#1F3124', 'added-gutter': '#132016', 'deleted-bg': '#3C1F1B', 'deleted-gutter': '#28130E' },
};
const MARKER_SEEDS = { light: ['#01A241', '#BA2723'], dark: ['#41C977', '#FA423E'] };
const SYNTAX_SEEDS = {
  light: ['#1C7ED6', '#2F9E44', '#868E96', '#D6336C', '#E8590C', '#6741D9', '#2B8A3E', '#495057', '#1971C2'],
  dark: ['#4DABF7', '#69DB7C', '#ADB5BD', '#FAA2C1', '#FFA94D', '#B197FC', '#8CE99A', '#CED4DA', '#74C0FC'],
};
const LINK_SEEDS = { light: '#4176E6', dark: '#7AAAFF' };

// Fixed output fixtures fence the first passing 1% rounded sRGB step. Deliberately
// do not implement the production seed-to-primary interpolation helper here.
const EXPECTED = {
  original: {
    light: {
      markers: ['#0B7E39', '#BA2723'],
      syntax: ['#1E6CB3', '#2C783A', '#656A70', '#C13163', '#B14A13', '#6741D9', '#2A793A', '#495057', '#1A6CB9'],
      muted: '#767676', link: '#4072DC',
    },
    dark: { markers: ['#41C977', '#F9534F'], syntax: SYNTAX_SEEDS.dark, muted: '#A0A0A0', link: '#7AAAFF' },
  },
  forest: {
    light: {
      markers: ['#0F7E3C', '#BA2723'],
      syntax: ['#1F6EAD', '#2D783D', '#5F6C6C', '#BE3464', '#AB5018', '#6741D9', '#2B783B', '#495057', '#1A6CB5'],
      muted: '#586D60', link: '#3E6ECD',
    },
    dark: { markers: ['#41C977', '#F8534F'], syntax: SYNTAX_SEEDS.dark, muted: '#A6B6AB', link: '#7AAAFF' },
  },
  sea: {
    light: {
      markers: ['#0D7E43', '#BA2723'],
      syntax: ['#1E6DB3', '#2B7845', '#5F6C77', '#BD3467', '#AB4F1E', '#6741D9', '#297840', '#495057', '#1A6CB8'],
      muted: '#5C7485', link: '#3D6ED1',
    },
    dark: { markers: ['#41C977', '#F85350'], syntax: SYNTAX_SEEDS.dark, muted: '#A7BAC9', link: '#7AAAFF' },
  },
  sand: {
    light: {
      markers: ['#167E39', '#BA2723'],
      syntax: ['#246DAE', '#35783A', '#696A6A', '#C03362', '#AF4D16', '#6741D9', '#2F783A', '#495057', '#1C6CB6'],
      muted: '#7B6A56', link: '#416ECF',
    },
    dark: { markers: ['#41C977', '#F9534E'], syntax: SYNTAX_SEEDS.dark, muted: '#C2AE98', link: '#7AAAFF' },
  },
};

function* scenarios() {
  for (const preset of PRESETS) for (const mode of MODES) {
    const state = Object.freeze(validateState({ preset, mode }));
    for (const nativeDark of BOOLS) for (const systemDark of BOOLS) {
      const effective = mode === 'inherit' ? (nativeDark ? 'dark' : 'light')
        : mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
      yield {
        preset, mode, effective, state,
        environment: Object.freeze({ nativeDark, systemDark }),
        palette: (preset === 'original' ? BASE_PALETTE : PALETTES[preset])[effective],
        inactive: preset === 'original' && mode === 'inherit',
        label: `${preset}/${mode}/native:${nativeDark}/system:${systemDark}`,
      };
    }
  }
}

function previewRules(css) {
  assert.equal(typeof css, 'string');
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  const groups = [...css.matchAll(rulePattern)];
  assert.equal(groups.length, 4, 'exactly diff, syntax, Markdown link and outer PDF rules');
  assert.equal(css.replace(rulePattern, '').trim(), '', 'no extra CSS or unparsed at-rules');
  return groups.map(([, selector, body], index) => {
    assert.equal(selector.trim(), SELECTORS[index], 'exact owner-local scope, including selector order and newlines');
    const declarationPattern = /^\s*(--[a-z0-9-]+): (.+);$/gm;
    const entries = [...body.matchAll(declarationPattern)];
    assert.equal(body.replace(declarationPattern, '').trim(), '', 'only custom color variables, no other declarations');
    assert.equal(new Set(entries.map(([, name]) => name)).size, entries.length, 'no duplicate declarations');
    const paint = Object.fromEntries(entries.map(([, name, value]) => {
      assert.match(value, / !important$/, `${name} must win locally, independently of CSS order`);
      const color = value.slice(0, -' !important'.length);
      assert.match(color, /^(?:#[0-9A-F]{6}|var\(--[a-z0-9-]+\))$/, 'only uppercase opaque hex or a confirmed color alias');
      return [name, color];
    }));
    return { selector: selector.trim(), paint };
  });
}

function expectedRules(preset, mode) {
  const fixture = EXPECTED[preset][mode];
  const diff = Object.fromEntries(Object.entries(DIFF_FILLS[mode]).map(([name, color]) => [`--dsw-alias-file-diff-${name}`, color]));
  return [
    { selector: DIFF_SCOPE, paint: {
      ...diff,
      '--dsw-alias-file-diff-added-marker': fixture.markers[0],
      '--dsw-alias-file-diff-deleted-marker': fixture.markers[1],
      '--dsw-alias-label-secondary': 'var(--dsw-alias-label-primary)',
      '--dsw-alias-label-tertiary': fixture.muted,
    } },
    { selector: SYNTAX_SCOPE, paint: {
      '--shiki-foreground': 'var(--dsw-alias-label-primary)',
      '--shiki-background': 'var(--dsw-alias-markdown-code-block)',
      ...Object.fromEntries(SHIKI_NAMES.map((name, index) => [`--shiki-token-${name}`, fixture.syntax[index]])),
    } },
    { selector: MARKDOWN_SCOPE, paint: { '--dsw-alias-link': fixture.link } },
    { selector: PDF_SCOPE, paint: { '--dsw-alias-bg-document-preview': 'var(--dsw-alias-bg-layer-2)' } },
  ];
}

// Independent WCAG relative luminance. This computes contrast only, not a color
// adjustment; expected colors above do not depend on any production helper.
function luminance(hex) {
  assert.match(hex, /^#[0-9A-F]{6}$/);
  const rgb = Number.parseInt(hex.slice(1), 16);
  const [red, green, blue] = [(rgb >>> 16) & 255, (rgb >>> 8) & 255, rgb & 255].map((byte) => {
    const channel = byte / 255;
    return channel > 0.04045 ? ((channel + 0.055) / 1.055) ** 2.4 : channel / 12.92;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(ink, paint) {
  const left = luminance(ink);
  const right = luminance(paint);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

function assertReadable(ink, paints, label) {
  for (const paint of paints) {
    const ratio = contrast(ink, paint);
    assert.ok(ratio >= 4.5, `${label}: ${ink} on ${paint} is ${ratio.toFixed(6)}:1, below 4.5:1`);
  }
}

test('null, undefined and Original/inherit stay inactive with accent, every background, upload and fade', () => {
  for (const state of [null, undefined, DEFAULTS]) {
    assert.equal(buildFilePreviewCss(state), '');
    assert.equal(buildFilePreviewCss(state, { nativeDark: 'invalid', systemDark: 'invalid' }), '', 'the inactive gate precedes environment validation');
  }
  for (const background of BACKGROUNDS) for (const fade of [0, 37, 80, 100]) for (const accent of ['', ...ACCENTS]) {
    const state = Object.freeze(validateState({ ...DEFAULTS, accent, background, fade, imageData: UPLOAD }));
    const before = { ...state };
    for (const nativeDark of BOOLS) for (const systemDark of BOOLS) {
      const environment = Object.freeze({ nativeDark, systemDark });
      assert.equal(buildFilePreviewCss(state, environment), '', `${background}/${fade}/${accent}/${nativeDark}/${systemDark}`);
      assert.equal(buildFilePreviewCss(state, environment), buildComponentCss(state, environment), 'preview and component palette gates agree');
    }
    assert.deepEqual(state, before, 'no changes to accent, wallpaper bytes, fade or any saved field');
  }
});

test('all 64 preset/mode/native/system combinations use exact fixed colors in exactly four scoped rules without writes', () => {
  let count = 0;
  let enabled = 0;
  for (const { preset, effective, state, environment, inactive, label } of scenarios()) {
    count += 1;
    const before = { ...state };
    const environmentBefore = { ...environment };
    const css = buildFilePreviewCss(state, environment);
    if (inactive) assert.equal(css, '', label);
    else {
      enabled += 1;
      assert.deepEqual(previewRules(css), expectedRules(preset, effective), label);
    }
    assert.deepEqual(state, before, `${label}: frozen state remains unchanged`);
    assert.deepEqual(environment, environmentBefore, `${label}: frozen environment remains unchanged`);
  }
  assert.equal(count, 64);
  assert.equal(enabled, 60);
});

test('enabled palettes validate boolean flags and default systemDark to nativeDark without guessing preferences', () => {
  for (const preset of PRESETS) for (const mode of MODES) {
    if (preset === 'original' && mode === 'inherit') continue;
    const state = Object.freeze(validateState({ preset, mode }));
    for (const invalid of [null, 0, 1, 'dark', 'false', [], {}]) {
      assert.throws(() => buildFilePreviewCss(state, { nativeDark: invalid }), { name: 'TypeError', message: 'nativeDark must be a boolean' });
      assert.throws(() => buildFilePreviewCss(state, { systemDark: invalid }), { name: 'TypeError', message: 'systemDark must be a boolean' });
    }
    assert.equal(buildFilePreviewCss(state), buildFilePreviewCss(state, { nativeDark: false, systemDark: false }));
    for (const nativeDark of BOOLS) {
      assert.equal(buildFilePreviewCss(state, { nativeDark }), buildFilePreviewCss(state, { nativeDark, systemDark: nativeDark }));
    }
  }
});

test('independent WCAG checks reach 4.5:1 on every contracted syntax, marker, muted and Markdown target', () => {
  assert.equal(contrast('#000000', '#FFFFFF'), 21);
  assert.equal(contrast('#868E96', '#868E96'), 1);
  for (const { state, environment, palette, inactive, label } of scenarios()) {
    if (inactive) continue;
    const [diff, syntax, markdown] = previewRules(buildFilePreviewCss(state, environment)).map(({ paint }) => paint);
    const neutral = [palette.base, palette.surface];
    const diffBodies = [diff['--dsw-alias-file-diff-added-bg'], diff['--dsw-alias-file-diff-deleted-bg']];
    for (const name of SHIKI_NAMES) assertReadable(syntax[`--shiki-token-${name}`], [...neutral, ...diffBodies], `${label}: Shiki ${name}`);
    for (const kind of ['added', 'deleted']) {
      assertReadable(diff[`--dsw-alias-file-diff-${kind}-marker`], [diff[`--dsw-alias-file-diff-${kind}-bg`], diff[`--dsw-alias-file-diff-${kind}-gutter`]], `${label}: ${kind} marker`);
    }
    assertReadable(palette.text, diffBodies, `${label}: plain primary/context text on both diff bodies`);
    assertReadable(palette.text, neutral, `${label}: plain source/Markdown primary text`);
    assertReadable(diff['--dsw-alias-label-tertiary'], neutral, `${label}: muted line labels on neutral surfaces`);
    assertReadable(markdown['--dsw-alias-link'], neutral, `${label}: Markdown link`);
  }
});

test('already-readable rc.5 seeds remain byte-for-byte unchanged rather than flattening all hues to primary', () => {
  let unchanged = 0;
  let adjusted = 0;
  const check = (seed, actual, paints, label) => {
    if (paints.every((paint) => contrast(seed, paint) >= 4.5)) {
      unchanged += 1;
      assert.equal(actual, seed, `${label}: a readable seed must not be adjusted`);
    } else {
      adjusted += 1;
      assert.notEqual(actual, seed, `${label}: an unreadable seed must be improved`);
    }
  };
  for (const { state, environment, effective, palette, inactive, label } of scenarios()) {
    if (inactive) continue;
    const [diff, syntax, markdown] = previewRules(buildFilePreviewCss(state, environment)).map(({ paint }) => paint);
    const neutral = [palette.base, palette.surface];
    const syntaxPaints = [...neutral, DIFF_FILLS[effective]['added-bg'], DIFF_FILLS[effective]['deleted-bg']];
    for (const [index, name] of SHIKI_NAMES.entries()) check(SYNTAX_SEEDS[effective][index], syntax[`--shiki-token-${name}`], syntaxPaints, `${label}/${name}`);
    for (const [index, kind] of ['added', 'deleted'].entries()) {
      check(MARKER_SEEDS[effective][index], diff[`--dsw-alias-file-diff-${kind}-marker`], [DIFF_FILLS[effective][`${kind}-bg`], DIFF_FILLS[effective][`${kind}-gutter`]], `${label}/${kind} marker`);
    }
    check(palette.secondary, diff['--dsw-alias-label-tertiary'], neutral, `${label}/muted`);
    check(LINK_SEEDS[effective], markdown['--dsw-alias-link'], neutral, `${label}/Markdown link`);
  }
  assert.ok(unchanged > 0 && adjusted > 0, 'both preservation and repair paths are exercised');
});

test('fixed adjacent 1% boundary fixtures reject under-adjustment, overshoot and luminance-space mixing', () => {
  // [preset, mode, target, token/kind, last-failing percent, its RGB, first-passing RGB].
  // These are fixed observations, not a second interpolation/search implementation.
  const boundaries = [
    ['original', 'light', 'syntax', 'constant', 19, '#1E6DB4', '#1E6CB3'],
    ['forest', 'light', 'marker', 'added', 35, '#0F7F3C', '#0F7E3C'],
    ['sea', 'light', 'syntax', 'comment', 38, '#606D78', '#5F6C77'],
    ['sand', 'light', 'syntax', 'parameter', 33, '#B14D16', '#AF4D16'],
    ['original', 'light', 'muted', '', 19, '#777777', '#767676'],
    // B palette's forest secondary seed is already readable (covered above);
    // it no longer has a failing-to-passing interpolation boundary.
    ['original', 'light', 'link', '', 4, '#4073DE', '#4072DC'],
    ['forest', 'light', 'link', '', 13, '#3E6FCF', '#3E6ECD'],
    ['sea', 'light', 'link', '', 12, '#3D6FD3', '#3D6ED1'],
    ['sand', 'light', 'link', '', 11, '#416FD1', '#416ECF'],
    ['original', 'dark', 'marker', 'deleted', 9, '#F9514E', '#F9534F'],
    ['forest', 'dark', 'marker', 'deleted', 9, '#F8514D', '#F8534F'],
    ['sea', 'dark', 'marker', 'deleted', 9, '#F8514E', '#F85350'],
    ['sand', 'dark', 'marker', 'deleted', 9, '#F9514C', '#F9534E'],
  ];
  for (const [preset, mode, target, name, failingPercent, previous, expected] of boundaries) {
    const state = Object.freeze(validateState({ preset, mode }));
    const palette = (preset === 'original' ? BASE_PALETTE : PALETTES[preset])[mode];
    // Deliberately make native and effective modes disagree.
    const [diff, syntax, markdown] = previewRules(buildFilePreviewCss(state, { nativeDark: mode === 'light', systemDark: mode === 'light' })).map(({ paint }) => paint);
    const neutral = [palette.base, palette.surface];
    const paints = target === 'syntax' ? [...neutral, DIFF_FILLS[mode]['added-bg'], DIFF_FILLS[mode]['deleted-bg']]
      : target === 'marker' ? [DIFF_FILLS[mode][`${name}-bg`], DIFF_FILLS[mode][`${name}-gutter`]] : neutral;
    const actual = target === 'syntax' ? syntax[`--shiki-token-${name}`]
      : target === 'marker' ? diff[`--dsw-alias-file-diff-${name}-marker`]
        : target === 'muted' ? diff['--dsw-alias-label-tertiary'] : markdown['--dsw-alias-link'];
    const label = `${preset}/${mode}/${target}/${name}`;
    assert.equal(actual, expected, `${label}: exact ${failingPercent + 1}% rounded-sRGB fixture, not an unnecessary larger step`);
    assert.ok(paints.some((paint) => contrast(previous, paint) < 4.5), `${label}: fixed ${failingPercent}% step still fails at least one required surface`);
    assertReadable(actual, paints, `${label}: first-passing fixed step`);
  }
});

test('extreme custom accents and wallpaper/background/fade/upload combinations never alter preview CSS or inputs', () => {
  for (const { state, environment, label } of scenarios()) {
    const baseline = buildFilePreviewCss(state, environment);
    const variants = [
      ...ACCENTS.map((accent) => validateState({ ...state, accent })),
      ...BACKGROUNDS.flatMap((background) => [0, 37, 80, 100].map((fade) => validateState({ ...state, accent: '#FF00FF', background, fade, imageData: UPLOAD }))),
    ];
    for (const candidate of variants) {
      const frozen = Object.freeze(candidate);
      const before = { ...frozen };
      assert.equal(buildFilePreviewCss(frozen, environment), baseline, `${label}/${frozen.accent}/${frozen.background}/${frozen.fade}`);
      assert.deepEqual(frozen, before, 'paint calculation must not write saved accent, wallpaper bytes or fade');
    }
  }
});

test('preview aliases never enter the global 30-token layer or expand the existing eight component repairs', () => {
  const localOnly = /--shiki-|--dsw-alias-(?:file-diff-|link\b|bg-document-preview\b)/;
  for (const { state, environment, inactive, label } of scenarios()) for (const accent of ['', '#000000', '#FFFFFF', '#FF00FF']) {
    const frozen = Object.freeze(validateState({ ...state, accent, background: 'upload', imageData: UPLOAD, fade: 37 }));
    const tokenPairs = buildTokenOverrides(frozen);
    const resolved = resolveTokenModes(frozen, environment.systemDark);
    const componentCss = buildComponentCss(frozen, environment);
    buildFilePreviewCss(frozen, environment);
    assert.deepEqual(resolveTokenModes(frozen, environment.systemDark), resolved, `${label}: preview building cannot affect global resolution`);
    assert.equal(buildComponentCss(frozen, environment), componentCss, `${label}: preview building cannot affect existing component CSS`);
    for (const tokens of [tokenPairs, resolved]) {
      assert.equal(Object.keys(tokens).length, inactive ? (accent ? 1 : 0) : 30, `${label}: no new global tokens`);
      assert.doesNotMatch(Object.keys(tokens).join('\n'), localOnly, 'diff, syntax, Markdown link and PDF backing remain local');
      assert.doesNotMatch(Object.keys(tokens).join('\n'), /--dsw-static-|--dsw-alias-state-/);
    }
    assert.doesNotMatch(componentCss, localOnly, 'preview rules are not appended to the existing component builder');
    assert.equal([...componentCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].length, inactive ? 0 : 8, 'all eight accepted component rules remain separate');
  }
});

test('preview builder has no DOM/native-preference access and CSS cannot escape explicit file scopes', () => {
  const source = buildFilePreviewCss.toString();
  assert.doesNotMatch(source, /\b(?:window|document|navigator|localStorage|sessionStorage|screen)\s*(?:\.|\[)/);
  assert.doesNotMatch(source, /\b(?:matchMedia|getComputedStyle|MutationObserver|ResizeObserver|IntersectionObserver|requestAnimationFrame|setPreference|setColorScheme|querySelector(?:All)?|appendChild|setAttribute|fetch|XMLHttpRequest|WebSocket)\s*\(/);
  assert.doesNotMatch(source, /\b(?:font|width|height|padding|margin|opacity|filter|transform|geometry)\s*:/i);
  for (const { state, environment, inactive } of scenarios()) {
    if (inactive) continue;
    const css = buildFilePreviewCss(state, environment);
    const selectors = previewRules(css).map(({ selector }) => selector).join('\n');
    assert.doesNotMatch(selectors, /\b(?:html|iframe|canvas|img|excel|spreadsheet|span)\b|\[role\b|\.[a-zA-Z_-]|\*|::|@/i);
    assert.doesNotMatch(css, /data-ds-dark-theme|prefers-color-scheme|@(?:media|supports)|--dsw-static-|--dsw-alias-state-/);
  }
});

test('source Client wiring includes the pure preview builder in the shared visual paint path without requiring a built Client', async () => {
  const client = await readFile(new URL('../src/client.js', import.meta.url), 'utf8');
  const build = await readFile(new URL('../build.mjs', import.meta.url), 'utf8');
  const imports = client.match(/^import \{([^}]+)\} from ['"]\.\.\/backgrounds\.js['"];$/m);
  assert.ok(imports, 'Client imports the shared paint builders');
  assert.ok(imports[1].split(',').map((name) => name.trim()).includes('buildFilePreviewCss'));
  const start = client.indexOf('function VisualLayer(');
  const end = client.indexOf('function AppearancePage(', start);
  assert.ok(start >= 0 && end > start, 'inspect the existing visual layer, not a replacement UI');
  const visual = client.slice(start, end);
  const paintPath = visual.match(/\bconst css\s*=\s*React\.useMemo\(\(\)\s*=>\s*state\s*\?\s*\[([\s\S]*?)\]\.filter\(Boolean\)\.join\(['"]\\n['"]\)/);
  assert.ok(paintPath, 'the existing state-gated stylesheet composes the pure builders');
  assert.match(paintPath[1], /buildFilePreviewCss\(state,\s*\{\s*nativeDark,\s*systemDark:\s*dark\s*\}\)/);
  assert.equal([...visual.matchAll(/\bbuildFilePreviewCss\s*\(/g)].length, 1, 'one shared paint call for accepted state or live-preview state');
  const modules = build.match(/const modules = \[([^\]]+)\]/);
  assert.ok(modules, 'the existing build declares local source modules');
  assert.ok(modules[1].includes("'backgrounds.js'") && modules[1].includes("'src/client.js'"));
  assert.ok(modules[1].indexOf("'backgrounds.js'") < modules[1].indexOf("'src/client.js'"), 'the builder is bundled before its source consumer');
});
