import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BASE_PALETTE, DEFAULTS, PALETTES, buildTokenOverrides, resolveTokenModes, validateState } from '../core.js';
import { buildBackgroundCss, buildChromeCss, buildComponentCss, buildFilePreviewCss, buildNavigationCss, buildHistoryCss, buildQuestionBadgeCss } from '../backgrounds.js';

// Pure token/CSS policy, numeric opaque-paint contrast and static source wiring.
// No DOM/React/browser simulation, rasterization or rendered acceptance. History
// contrast is BEFORE native disabled opacity .6, not a disabled/wallpaper claim;
// neither builder promises 3:1 boundaries between these subtle native states.
const UPLOAD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6w4sAAAAASUVORK5CYII=';
const PRESETS = ['original', 'forest', 'sea', 'sand'];
const MODES = ['inherit', 'light', 'dark', 'system'];
const BOOLS = [false, true];
const BACKGROUNDS = ['none', 'forest', 'sea', 'sand', 'upload'];
const ACCENTS = ['', '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FF00FF', '#777777', '#112233'];
const FADES = [0, 37, 80, 100];
const HISTORY_OWNER = 'body [data-conversation-content] [data-chat-flow] > div:has(+ [data-slot="conversation.chat.flow"]) > button';
const LEGACY_BADGE_OWNER = 'body [data-question-key] > section > [data-question-scroll] > div:is([role="radiogroup"],[role="group"]) > button:is([role="radio"],[role="checkbox"]) > span:nth-child(2) > span';
const CURRENT_BADGE_OWNER = 'body [data-question-key] [data-option-row] > button:is([role="radio"],[role="checkbox"]) > span > [data-option-line]';
const BADGE_OWNER = `${LEGACY_BADGE_OWNER},\n${CURRENT_BADGE_OWNER}`;
const HOVER_SOLID = '--dsw-alias-interactive-bg-hover-solid';
const SECONDARY = '--dsw-alias-label-secondary';
const BADGE_BG = '--dsw-specific-sidebar-nav-item-active-accent';
const BADGE_INK = '--dsw-alias-button-info-fill';
const CONTRACTS = [
  [buildHistoryCss, [
    { selector: HISTORY_OWNER, paint: {
      [HOVER_SOLID]: 'var(--dsw-alias-bg-layer-1) !important',
      [SECONDARY]: 'var(--dsw-alias-label-primary) !important',
    } },
    { selector: `${HISTORY_OWNER}:hover:not(:disabled)`, paint: {
      [HOVER_SOLID]: 'var(--dsw-alias-interactive-bg-hover) !important',
    } },
  ]],
  [buildQuestionBadgeCss, [{ selector: BADGE_OWNER, paint: {
    [BADGE_BG]: 'var(--dsw-alias-bg-layer-2) !important',
    [BADGE_INK]: 'var(--dsw-alias-label-primary) !important',
  } }]],
];
const NEUTRAL_NAMES = ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-interactive-bg-hover', '--dsw-alias-label-primary', SECONDARY, '--dsw-alias-label-tertiary'];
const GLOBAL_NAMES = [
  '--dsw-alias-bg-base', '--dsw-specific-sidebar-fill',
  '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3', '--dsw-alias-bg-overlay',
  '--dsw-specific-input-major', '--dsw-specific-bubble', '--dsw-specific-menu',
  '--dsw-alias-markdown-code-block', '--dsw-alias-markdown-code-block-banner', '--dsw-alias-markdown-inline-code',
  '--dsw-alias-bg-module-platform', '--dsw-alias-interactive-bg-hover', '--dsw-alias-interactive-bg-active',
  '--dsw-alias-button-ghost-active-fill', '--dsw-alias-button-ghost-active-border',
  '--dsw-alias-button-tool-bar-fill', '--dsw-alias-button-tool-bar-hover',
  '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-border-l3', '--dsw-alias-border-l4',
  '--dsw-alias-label-primary', SECONDARY, '--dsw-alias-label-tertiary',
  '--dsw-alias-label-caption', '--dsw-alias-label-dimmed', '--dsw-alias-brand-primary', '--dsw-alias-switch-thumb',
].sort();
const COMPONENT_SCOPES = [
  'body [data-changed-files]', 'body [data-presented-file]', 'body [data-composer-card]',
  'body svg:has(#dsh-wordmark-badge-clip)', 'body [data-conversation-content]',
  'body [data-menu-material]', 'body [data-tool="schedule_create"]',
  [
    'body [data-plugin-panel] [data-plugin-package] button[role="switch"][aria-checked="true"]',
    'body [data-plugin-panel] [data-plugin-row] button[role="switch"][aria-checked="true"]',
    'body [data-plugin-panel] [data-plugin-detail] > [data-window-drag] > div > div > button[role="switch"][aria-checked="true"]:last-child',
  ].join(',\n'),
];
const DIFF_SCOPE = 'body [data-changes-hover-preview] [data-review-view],\nbody [data-changes-review] [data-review-view]';
const EARLIER = [
  [buildComponentCss, COMPONENT_SCOPES],
  [buildFilePreviewCss, [DIFF_SCOPE, `${DIFF_SCOPE},\nbody [data-code-preview],\nbody [data-document-markdown]`, 'body [data-document-markdown]', 'body [data-textpreview-body]:has([data-pdf-preview])']],
  [buildNavigationCss, ['body [data-shortcut-modal="settings"] > nav', 'body [data-sidebar-right-panel] [data-dockkit-strip-tabs] > [data-dockkit-tab]']],
];

function* scenarios() {
  for (const preset of PRESETS) for (const mode of MODES) {
    const state = Object.freeze(validateState({ preset, mode }));
    for (const nativeDark of BOOLS) for (const systemDark of BOOLS) {
      const effective = mode === 'inherit' ? (nativeDark ? 'dark' : 'light')
        : mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
      yield {
        state, environment: Object.freeze({ nativeDark, systemDark }),
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

function paintRules(css) {
  return rules(css).map(({ selector, body }) => {
    const pattern = /^\s*(--[a-z0-9-]+): (.+);$/gm;
    const entries = [...body.matchAll(pattern)].map(([, name, value]) => [name, value]);
    assert.equal(body.replace(pattern, '').trim(), '', 'only custom paint aliases, never direct leaf paint, geometry, typography or native effects');
    assert.equal(new Set(entries.map(([name]) => name)).size, entries.length, 'no duplicate declarations');
    for (const [name, value] of entries) assert.match(value, / !important$/, `${name} wins only at its owner`);
    return { selector, paint: Object.fromEntries(entries) };
  });
}

function luminance(hex) {
  assert.match(hex, /^#[0-9A-F]{6}$/);
  const linear = hex.slice(1).match(/../g).map((pair) => {
    const value = Number.parseInt(pair, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(ink, paint) {
  const [high, low] = [luminance(ink), luminance(paint)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

function aliasPaint(declaration, values) {
  const alias = declaration.match(/^var\((--[a-z0-9-]+)\) !important$/)?.[1];
  assert.ok(alias && Object.hasOwn(values, alias), 'local paint resolves an existing global alias');
  return values[alias];
}

const chatCss = (state) => CONTRACTS.map(([build]) => build(state));
const neutralPairs = (state) => {
  const tokens = buildTokenOverrides(state);
  return NEUTRAL_NAMES.map((name) => tokens[name]);
};

test('null, undefined, native Original, accent-only, background-only and accent+background share the full-palette gate', () => {
  const states = [null, undefined, DEFAULTS, Object.freeze({}), Object.freeze({ accent: '#112233' })];
  for (const background of BACKGROUNDS) for (const fade of FADES) for (const accent of ['', '#FF00FF']) {
    states.push(Object.freeze(validateState({ background, fade, accent, imageData: UPLOAD })));
  }
  for (const state of states) {
    const before = state && { ...state };
    if (state) assert.equal(Object.hasOwn(buildTokenOverrides(state), '--dsw-alias-bg-layer-1'), false);
    assert.deepEqual(chatCss(state), ['', '']);
    if (state) assert.deepEqual(state, before, 'inactive builders cannot write native/saved appearance fields');
  }
});

test('all 64 preset/mode/native/system cases retain 60 active, fixed, owner-local alias-only policies', () => {
  let count = 0;
  let enabled = 0;
  let activeCss;
  for (const { state, inactive, label } of scenarios()) {
    count += 1;
    const before = { ...state };
    assert.equal(Object.hasOwn(buildTokenOverrides(state), '--dsw-alias-bg-layer-1'), !inactive, label);
    const css = chatCss(state);
    if (inactive) assert.deepEqual(css, ['', ''], label);
    else {
      enabled += 1;
      for (const [index, [build, expected]] of CONTRACTS.entries()) {
        assert.deepEqual(paintRules(css[index]), expected, `${label}/${build.name}: exact selectors, properties and RHS allowlist`);
      }
      activeCss ??= css;
      assert.deepEqual(css, activeCss, `${label}: aliases, not native/effective mode, determine the CSS`);
    }
    assert.deepEqual(state, before, 'frozen appearance input remains unchanged');
  }
  assert.equal(count, 64);
  assert.equal(enabled, 60);
});

test('accent, background, fade and active/dormant upload bytes cannot activate or alter either policy or its neutral colors', () => {
  for (const { state, label } of scenarios()) {
    const baseline = chatCss(state);
    const neutral = neutralPairs(state);
    for (const accent of ACCENTS) for (const background of BACKGROUNDS) for (const fade of FADES) {
      for (const imageData of background === 'upload' ? [UPLOAD] : ['', UPLOAD]) {
        const candidate = Object.freeze(validateState({ ...state, accent: accent.toLowerCase(), background, fade, imageData }));
        const before = { ...candidate };
        assert.deepEqual(chatCss(candidate), baseline, `${label}/${accent}/${background}/${fade}/image:${Boolean(imageData)}`);
        assert.deepEqual(neutralPairs(candidate), neutral, 'all history/badge paint and inherited label/description aliases stay independent of accent/wallpaper');
        assert.deepEqual(candidate, before, 'uploaded bytes, fade, accent and native mode are preserved');
      }
    }
  }
});

test('history rest/enabled-hover ink and recommended badge ink meet 4.5:1 on their resolved opaque fills', () => {
  assert.equal(contrast('#000000', '#FFFFFF'), 21);
  assert.equal(contrast('#777777', '#777777'), 1);
  for (const { state, environment, palette, inactive, label } of scenarios()) {
    if (inactive) continue;
    const values = Object.fromEntries(Object.entries(resolveTokenModes(state, environment.systemDark)).map(([name, pair]) => [name, pair[environment.nativeDark ? 'dark' : 'light']]));
    assert.deepEqual(NEUTRAL_NAMES.map((name) => values[name]), [palette.surface, palette.nested, palette.nested, palette.text, palette.secondary, palette.secondary], label);
    const [rest, hover] = paintRules(buildHistoryCss(state)).map(({ paint }) => paint);
    const [badge] = paintRules(buildQuestionBadgeCss(state)).map(({ paint }) => paint);
    // Native .older consumes hover-solid and secondary ink, with no native hover
    // rule. Keep disabled opacity .6 native; only enabled hover gains feedback.
    const historyInk = aliasPaint(rest[SECONDARY], values);
    const historyRest = aliasPaint(rest[HOVER_SOLID], values);
    const historyHover = aliasPaint(hover[HOVER_SOLID], values);
    const badgeInk = aliasPaint(badge[BADGE_INK], values);
    const badgeFill = aliasPaint(badge[BADGE_BG], values);
    assert.equal(historyInk, palette.text);
    assert.equal(historyRest, palette.surface);
    assert.equal(historyHover, palette.nested);
    assert.equal(badgeInk, palette.text);
    assert.equal(badgeFill, palette.nested);
    for (const [name, ink, fill] of [['history rest', historyInk, historyRest], ['history enabled hover', historyInk, historyHover], ['badge', badgeInk, badgeFill]]) {
      assert.ok(contrast(ink, fill) >= 4.5, `${label}/${name}: ink must reach 4.5:1 before disabled opacity`);
    }
    assert.notEqual(historyRest, historyHover, 'enabled hover paint differs; no 3:1 state-boundary claim');
  }
});

test('30 global tokens and component8/preview4/navigation2 owners remain isolated from the new controls', () => {
  assert.equal(GLOBAL_NAMES.length, 30);
  assert.deepEqual(EARLIER.map(([, scopes]) => scopes.length), [8, 4, 2]);
  for (const { state, environment, palette, inactive, label } of scenarios()) for (const accent of ['', '#000000', '#FFFFFF', '#FF00FF']) {
    const candidate = Object.freeze(validateState({ ...state, accent, background: 'upload', imageData: UPLOAD, fade: 37 }));
    const before = { ...candidate };
    const tokens = buildTokenOverrides(candidate);
    const resolved = resolveTokenModes(candidate, environment.systemDark);
    const earlierCss = EARLIER.map(([build, scopes]) => {
      const css = build(candidate, environment);
      assert.deepEqual(rules(css).map(({ selector }) => selector), inactive ? [] : scopes, `${label}/${build.name}: exact existing owners`);
      return css;
    });
    const otherCss = [buildChromeCss(candidate), buildBackgroundCss(candidate, {}, environment)];
    for (const global of [tokens, resolved]) {
      assert.deepEqual(Object.keys(global).sort(), inactive ? (accent ? ['--dsw-alias-brand-primary'] : []) : GLOBAL_NAMES, label);
      for (const name of [HOVER_SOLID, BADGE_BG, BADGE_INK]) assert.equal(Object.hasOwn(global, name), false, `${name} remains owner-local`);
    }
    if (!inactive) {
      const sourcePalette = candidate.preset === 'original' ? BASE_PALETTE : PALETTES[candidate.preset];
      assert.deepEqual(tokens[SECONDARY], { light: sourcePalette.light.secondary, dark: sourcePalette.dark.secondary }, 'history promotes secondary only locally, never in the global mapping');
      assert.equal(resolved[SECONDARY][environment.nativeDark ? 'dark' : 'light'], palette.secondary);
      assert.notEqual(palette.secondary, palette.text, 'global secondary is not silently promoted to primary');
      const composer = paintRules(earlierCss[0]).find(({ selector }) => selector === 'body [data-composer-card]');
      assert.equal(composer.paint[HOVER_SOLID], 'var(--dsw-alias-interactive-bg-hover) !important', 'the unrelated existing composer hover-solid remains valid');
    }
    assert.doesNotMatch([...earlierCss, ...otherCss].join('\n'), /data-chat-flow|data-slot="conversation\.chat\.flow"|data-question-(?:key|scroll)|--dsw-specific-sidebar-nav-item-active-accent|--dsw-alias-button-info-fill/, 'no new history/question scopes or badge aliases leak into earlier builders');
    chatCss(candidate);
    assert.deepEqual(buildTokenOverrides(candidate), tokens);
    assert.deepEqual(resolveTokenModes(candidate, environment.systemDark), resolved);
    for (const [index, [build]] of EARLIER.entries()) assert.equal(build(candidate, environment), earlierCss[index]);
    assert.deepEqual([buildChromeCss(candidate), buildBackgroundCss(candidate, {}, environment)], otherCss);
    assert.deepEqual(candidate, before, 'compatibility builders leave every persisted field intact');
  }
});

test('single-argument builders read no DOM, app state or native preferences and emit no direct paint or effects', () => {
  for (const [build, expected] of CONTRACTS) {
    const source = build.toString();
    assert.equal(build.length, 1);
    assert.match(source, new RegExp(`^function\\s+${build.name}\\s*\\(\\s*state\\s*\\)\\s*\\{`));
    assert.match(source, /Object\.hasOwn\(\s*buildTokenOverrides\(\s*state\s*\),\s*['"]--dsw-alias-bg-layer-1['"]\s*\)/);
    assert.doesNotMatch(source, /\b(?:window|document|navigator|localStorage|sessionStorage|screen|globalThis|React|ctx|form|editor)\s*(?:\.|\[)/);
    assert.doesNotMatch(source, /\bstate\s*(?:\.|\[|\?\.)|\b(?:nativeDark|systemDark|nativeBase|environment|colorScheme)\b/);
    assert.doesNotMatch(source, /\b(?:matchMedia|getComputedStyle|MutationObserver|ResizeObserver|IntersectionObserver|requestAnimationFrame|setTimeout|setInterval|setPreference|setColorScheme|setTheme|setFontSize|querySelector(?:All)?|appendChild|setAttribute|fetch|XMLHttpRequest|WebSocket)\s*\(/);
    const css = build(Object.freeze(validateState({ preset: 'forest' })));
    assert.deepEqual(paintRules(css), expected, 'exact owner-local custom aliases exclude opacity, layout, direct leaf paint and semantic recoloring');
    assert.doesNotMatch(css, /data-ds-dark-theme|prefers-color-scheme|@(?:media|supports)|--dsw-static-|--dsw-alias-(?:state|file-diff)-|data-question-footer|data-plan-review/);
  }
  // optionLine contains label, optional badge and optional description; without
  // a recommendation the second leaf can be description. Only the native badge
  // reads these two aliases: label inherits primary, description reads tertiary,
  // and the preceding sibling indicator/checkbox stays outside this owner.
  assert.equal(CONTRACTS[1][1][0].selector, BADGE_OWNER);
  assert.deepEqual(Object.keys(CONTRACTS[1][1][0].paint).sort(), [BADGE_BG, BADGE_INK].sort());
});

test('source Client composes both builders once with state in the existing shared 0.2.18 chat-controls VisualLayer', async () => {
  const [client, build, manifestText] = await Promise.all([
    readFile(new URL('../src/client.js', import.meta.url), 'utf8'),
    readFile(new URL('../build.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.version, '0.2.18');
  const imports = client.match(/^import \{([^}]+)\} from ['"]\.\.\/backgrounds\.js['"];$/m);
  assert.ok(imports, 'both builders belong to the existing shared backgrounds module');
  const start = client.indexOf('function VisualLayer(');
  const end = client.indexOf('function AppearancePage(', start);
  assert.ok(start >= 0 && end > start);
  const visual = client.slice(start, end);
  const paintPath = visual.match(/\bconst css\s*=\s*React\.useMemo\(\(\)\s*=>\s*state\s*\?\s*\[([\s\S]*?)\]\.filter\(Boolean\)\.join\(['"]\\n['"]\)/);
  assert.ok(paintPath, 'accepted and live-preview state use the original state-gated CSS composition');
  for (const [builder] of CONTRACTS) {
    const name = builder.name;
    assert.equal(imports[1].split(',').map((part) => part.trim()).filter((part) => part === name).length, 1);
    assert.match(paintPath[1], new RegExp(`\\b${name}\\(\\s*state\\s*\\)`), 'state only, no environment argument');
    assert.equal([...client.matchAll(new RegExp(`\\b${name}\\s*\\(`, 'g'))].length, 1, 'no duplicate, page-local or imperative invocation');
  }
  for (const name of ['buildBackgroundCss', 'buildChromeCss', ...EARLIER.map(([builder]) => builder.name), ...CONTRACTS.map(([builder]) => builder.name)]) {
    assert.equal([...paintPath[1].matchAll(new RegExp(`\\b${name}\\s*\\(`, 'g'))].length, 1, `${name} participates once in the shared stylesheet`);
  }
  const mounts = [...visual.matchAll(/\bcss\s*&&\s*h\(\s*(['"])style\1\s*,\s*\{([^{}]*)\}\s*,\s*css\s*\)/g)];
  assert.equal(mounts.length, 1, 'no additional history/badge stylesheet mount');
  assert.match(mounts[0][2], /['"]data-dsha-background['"]:\s*['"]['"]/);
  assert.match(mounts[0][2], /['"]data-dsha-version['"]:\s*['"]0\.2\.18['"]/);
  assert.equal([...client.matchAll(/['"]data-dsha-background['"]\s*:/g)].length, 1);
  assert.deepEqual([...client.matchAll(/['"]data-dsha-version['"]:\s*['"]([^'"]+)['"]/g)].map(([, version]) => version), [manifest.version, manifest.version]);
  assert.ok(client.includes('id: `${NS}-visual-0.2.18-chat-controls`'));
  assert.equal([...client.matchAll(/ctx\.slots\.inject\(['"]shell\.overlay['"]/g)].length, 1);
  const modules = build.match(/const modules = \[([^\]]+)\]/)?.[1];
  assert.ok(modules);
  assert.deepEqual(modules.split(',').map((part) => part.trim().slice(1, -1)), ['core.js', 'backgrounds.js', 'src/editor.js', 'src/styles.js', 'src/preview.js', 'src/live-preview.js', 'src/client.js'], 'shared backgrounds precedes Client in the existing build; no extra module');
});
