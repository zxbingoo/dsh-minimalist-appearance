import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { DEFAULTS, validateState, resolveTokenModes, BASE_PALETTE, PALETTES } from '../core.js';
import { BACKGROUND_ART, backgroundUrl, backgroundImage, backgroundStyle, buildBackgroundCss, buildChromeCss, buildComponentCss } from '../backgrounds.js';
import { sameAppearance, decodeSaved, appearanceOps, THEME_CHOICES, themeChoiceId, chooseTheme } from '../src/editor.js';
import { PAGE_CSS } from '../src/styles.js';
import { themePreviewPaint } from '../src/preview.js';

const root = new URL('../', import.meta.url);
const text = (name) => readFile(new URL(name, root), 'utf8');
const UPLOAD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6w4sAAAAASUVORK5CYII=';

test('default and incomplete backgrounds add no paint', () => {
  assert.equal(buildBackgroundCss(DEFAULTS), '');
  assert.equal(backgroundImage(DEFAULTS), 'none');
  assert.deepEqual(backgroundStyle(DEFAULTS), {
    backgroundImage: 'none', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
  });
  for (const imageData of ['', 'https://example.com/image.png', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>', '\");}body{display:none}']) {
    const state = { background: 'upload', imageData };
    assert.equal(backgroundUrl(state), '');
    assert.equal(backgroundStyle(state).backgroundImage, 'none');
    assert.equal(buildBackgroundCss(state), '');
  }
});

test('forest uses the bundled watercolor PNG inlined from assets instead of vector geometry', async () => {
  const wallpaper = await readFile(new URL('assets/breeze.png', root));
  assert.deepEqual([...wallpaper.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(wallpaper.length >= 33 && wallpaper.length <= 4 * 1024 * 1024);
  assert.equal(Object.hasOwn(BACKGROUND_ART, 'forest'), false);
  const url = `data:image/png;base64,${wallpaper.toString('base64')}`;
  const state = validateState({ background: 'forest', fade: 0 });
  assert.equal(backgroundUrl(state, { breeze: url }), url);
  assert.ok(backgroundImage(state, { breeze: url }).includes(`url(${JSON.stringify(url)})`));
  assert.equal(backgroundUrl(state), '');
  assert.equal(buildBackgroundCss(state), '');
  for (const breeze of ['', 'https://example.com/breeze.png', 'data:image/svg+xml,<svg/>', UPLOAD + '\n']) {
    assert.equal(backgroundUrl(state, { breeze }), '');
  }
  const build = await text('build.mjs');
  assert.match(build, /new URL\('assets\/breeze\.png', root\)/);
  assert.match(build, /wallpaper\.toString\('base64'\)/);
});

test('alternative backgrounds remain encoded package-owned vector artwork', () => {
  assert.deepEqual(Object.keys(BACKGROUND_ART).sort(), ['sand', 'sea']);
  for (const name of ['sea', 'sand']) {
    const state = validateState({ background: name });
    assert.equal(decodeURIComponent(backgroundUrl(state).split(',')[1]), BACKGROUND_ART[name]);
    assert.doesNotMatch(BACKGROUND_ART[name], /<script|<foreignObject|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i);
  }
});

test('background paints the full main frame once and clears only the body, scroll and composer-seat paint', () => {
  const assets = { breeze: UPLOAD };
  const frame = 'div[data-phase]:has([data-conversation-content])';
  for (const name of ['forest', 'sea', 'sand', 'upload']) {
    const state = validateState({ background: name, imageData: UPLOAD, fade: 80 });
    const css = buildBackgroundCss(state, assets);
    assert.ok(css.includes('80%, transparent)'));
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    assert.equal(rules.length, 2);
    assert.equal(rules[0][1].trim(), frame);
    assert.deepEqual(rules[1][1].trim().split(/,\s*\n/), [
      `${frame} [data-conversation-content]`,
      `${frame} [data-conversation-scroll]`,
      `${frame} [data-composer-seat]`,
    ]);
    const properties = (body) => [...body.matchAll(/(?:^|[;\n])\s*([a-z-]+)\s*:/g)].map((match) => match[1]);
    assert.deepEqual(properties(rules[0][2]), ['background-image', 'background-size', 'background-position', 'background-repeat']);
    assert.deepEqual(properties(rules[1][2]), ['background-color', 'background-image']);
    assert.match(rules[1][2], /^\s*background-color: transparent !important;\s*background-image: none !important;\s*$/);
    // Encoded SVG artwork itself contains url(#gradient); count only the
    // outer data URL paint, not those references inside its quoted payload.
    assert.equal((css.match(/url\("data:/g) ?? []).length, 1, 'one image avoids transcript/footer tiling seams');
    assert.doesNotMatch(rules.map((rule) => rule[1]).join('\n'), /::|\*/);
    assert.doesNotMatch(rules[1][1], /data-composer-card|data-changed-files|data-testid/);
  }
});

test('material samples and conversation CSS share exactly the same background paint', () => {
  const assets = { breeze: UPLOAD };
  for (const background of ['forest', 'sea', 'sand', 'upload']) {
    for (const fade of [0, 37, 80, 100]) {
      const state = Object.freeze(validateState({ background, imageData: UPLOAD, fade }));
      const style = backgroundStyle(state, assets);
      assert.deepEqual(style, {
        backgroundImage: backgroundImage(state, assets),
        backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
      });
      assert.ok(style.backgroundImage.includes(`${fade}%, transparent)`));
      const css = buildBackgroundCss(state, assets);
      const paint = css.slice(css.indexOf('{') + 1, css.indexOf('}'));
      const declarations = Object.fromEntries([...paint.matchAll(/^\s*([a-z-]+): (.+?)(?: !important)?;$/gm)]
        .map(([, property, value]) => [property, value]));
      const expected = Object.fromEntries(Object.entries(style).map(([property, value]) => [
        property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value,
      ]));
      assert.deepEqual(declarations, expected, `${background}, fade ${fade}`);
    }
  }
});

test('chrome CSS only paints the macOS sidebar opaquely when sidebar tokens are overridden', () => {
  for (const state of [null, DEFAULTS, { accent: '#123456' }, { background: 'sea' }, { mode: 'inherit', accent: '#123456' }]) {
    assert.equal(buildChromeCss(state), '');
  }
  for (const preset of ['original', 'forest', 'sea', 'sand']) {
    for (const mode of ['inherit', 'light', 'dark', 'system']) {
      if (preset === 'original' && mode === 'inherit') continue;
      const css = buildChromeCss(validateState({ preset, mode }));
      const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
      assert.equal(rules.length, 1);
      assert.equal(rules[0][1].trim(), 'html[data-platform="darwin"] div:has(> [data-shell-overlay]) > div:first-child');
      assert.match(rules[0][2], /^\s*background: var\(--dsw-specific-sidebar-fill\) !important;\s*$/);
      assert.doesNotMatch(css, /\.[a-z_-][\w-]*|font|width|height|padding|margin|display|position|opacity|transform|::/i);
    }
  }
});

test('local component repair is a no-op for native, accent-only and background-only appearance', () => {
  for (const state of [null, DEFAULTS, { accent: '#123456' }, { background: 'sea' }, { mode: 'inherit', accent: '#123456' }]) {
    assert.equal(buildComponentCss(state), '');
  }
});

test('changed-file and delivered-file fills rebind only scoped paint variables, not the static or semantic palette', () => {
  for (const preset of ['original', 'forest', 'sea', 'sand']) {
    for (const mode of ['inherit', 'light', 'dark', 'system']) {
      if (preset === 'original' && mode === 'inherit') continue;
      const css = buildComponentCss(validateState({ preset, mode }));
      const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
      assert.deepEqual(rules.map((rule) => rule[1].trim()), [
        'body [data-changed-files]', 'body [data-presented-file]', 'body [data-composer-card]',
        'body svg:has(#dsh-wordmark-badge-clip)', 'body [data-conversation-content]',
        'body [data-menu-material]',
      ]);
      for (const [index, prefix] of ['changes', 'deliverable'].entries()) {
        const declarations = Object.fromEntries([...rules[index][2].matchAll(/^\s*([-a-z0-9]+): (.+);$/gm)]
          .map(([, property, value]) => [property, value]));
        assert.deepEqual(declarations, {
          [`--${prefix}-fill`]: 'var(--dsw-alias-bg-layer-1) !important',
          [`--${prefix}-hover`]: 'var(--dsw-alias-interactive-bg-hover) !important',
        });
      }
      assert.match(rules[2][2], /^\s*--dsw-specific-selector: var\(--dsw-alias-bg-base\) !important;\s*--dsw-alias-interactive-bg-hover-solid: var\(--dsw-alias-interactive-bg-hover\) !important;\s*$/);
      assert.match(rules[3][2], /^\s*--dsw-alias-label-primary-inverted: var\(--dsw-alias-bg-base\) !important;\s*$/);
      const floating = Object.fromEntries([...rules[4][2].matchAll(/^\s*([-a-z0-9]+): (.+);$/gm)]
        .map(([, property, value]) => [property, value]));
      assert.deepEqual(floating, {
        '--dsw-alias-button-floating-fill': 'var(--dsw-alias-bg-layer-1) !important',
        '--dsw-alias-button-floating-hover': 'var(--dsw-alias-interactive-bg-hover) !important',
      });
      assert.doesNotMatch(css, /--dsw-static-|--dsw-alias-(?:state|file-diff)-|data-ds-dark-theme|\.[a-zA-Z_-]|::/);
    }
  }
});

test('shared popup repair changes only three local paint variables and reaches body portals', () => {
  const expected = {
    '--dsw-menu-surface-fill': 'var(--dsw-alias-bg-overlay) !important',
    '--dsw-alias-menu-icon': 'var(--dsw-alias-label-primary) !important',
    '--dsw-alias-menu-group-header-fill': 'color-mix(in srgb, var(--dsw-alias-bg-overlay) 94%, transparent) !important',
  };
  for (const preset of ['original', 'forest', 'sea', 'sand']) {
    for (const mode of ['inherit', 'light', 'dark', 'system']) {
      if (preset === 'original' && mode === 'inherit') continue;
      const state = Object.freeze(validateState({ preset, mode, background: 'upload', imageData: UPLOAD, fade: 37 }));
      const before = { ...state };
      const css = buildComponentCss(state);
      const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
      const menuRules = rules.filter(([, , body]) => Object.keys(expected).some((name) => body.includes(`${name}:`)));
      assert.equal(menuRules.length, 1, 'all shared menu paint stays in one consumer-local scope');
      const [, selector, body] = menuRules[0];
      assert.equal(selector.trim(), 'body [data-menu-material]', 'model, effort, permission, attachment, command and open-in-app menus share the portal-safe material hook');
      assert.doesNotMatch(selector, /data-composer-(?:card|seat)|data-platform|data-ds-dark-theme|aria-|role|::|\.[a-zA-Z_-]/, 'do not depend on composer ancestry, roles, locale, platform or hashed classes');
      const declarations = [...body.matchAll(/^\s*([-a-z0-9]+): (.+);$/gm)].map(([, name, value]) => [name, value]);
      assert.equal(declarations.length, 3);
      assert.deepEqual(Object.fromEntries(declarations), expected);
      assert.equal(body.replace(/^\s*([-a-z0-9]+): (.+);$/gm, '').trim(), '', 'no extra paint, geometry, typography, blur, backing or interaction declarations');
      assert.doesNotMatch(css, /--dsw-static-|--dsw-alias-(?:state|file-diff)-|data-menu-backing|--dsw-menu-backdrop-filter|@(?:media|supports)/, 'semantic colors and native material behavior stay unchanged');
      assert.deepEqual(state, before, 'menu repair must not modify saved appearance or wallpaper');
    }
  }
});

test('popup paint follows every effective theme without global menu overrides and Original remains a no-op', () => {
  // Resolve token policy only; this does not emulate MenuSurface or claim visual acceptance.
  for (const preset of ['original', 'forest', 'sea', 'sand']) {
    const palette = preset === 'original' ? BASE_PALETTE : PALETTES[preset];
    for (const mode of ['inherit', 'light', 'dark', 'system']) {
      const state = Object.freeze(validateState({ preset, mode }));
      const before = { ...state };
      for (const nativeDark of [false, true]) for (const systemDark of [false, true]) {
        const nativeMode = nativeDark ? 'dark' : 'light';
        const tokens = resolveTokenModes(state, systemDark);
        for (const name of ['--dsw-menu-surface-fill', '--dsw-alias-menu-icon', '--dsw-alias-menu-group-header-fill']) {
          assert.equal(Object.hasOwn(tokens, name), false, `${name} must remain a local consumer repair`);
        }
        assert.doesNotMatch(Object.keys(tokens).join('\n'), /--dsw-static-|--dsw-alias-(?:state|file-diff)-/);
        if (preset === 'original' && mode === 'inherit') {
          assert.equal(buildComponentCss(state), '');
          assert.deepEqual(tokens, {}, 'Original leaves the native palette and all menu materials untouched');
          continue;
        }
        const effective = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode === 'inherit' ? nativeMode : mode;
        const colors = palette[effective];
        for (const [name, field] of [
          ['--dsw-alias-bg-overlay', 'surface'], ['--dsw-specific-menu', 'surface'],
          ['--dsw-alias-bg-base', 'base'], ['--dsw-alias-interactive-bg-hover', 'nested'],
          ['--dsw-alias-label-primary', 'text'], ['--dsw-alias-label-secondary', 'secondary'],
          ['--dsw-alias-label-tertiary', 'secondary'], ['--dsw-alias-label-caption', 'secondary'],
          ['--dsw-alias-border-l1', 'border'], ['--dsw-alias-border-l3', 'border'],
        ]) {
          assert.equal(tokens[name][nativeMode], colors[field], `${preset}/${mode}/${nativeMode}/${systemDark}: ${name}`);
        }
      }
      assert.deepEqual(state, before);
    }
  }
  for (const { id } of THEME_CHOICES) {
    const state = Object.freeze(chooseTheme(DEFAULTS, id));
    const css = buildComponentCss(state);
    if (id === 'original') assert.equal(css, '');
    else assert.match(css, /body \[data-menu-material\]\s*\{/);
  }
  for (const background of ['none', 'forest', 'sea', 'sand', 'upload']) {
    assert.equal(buildComponentCss(validateState({ ...DEFAULTS, background, imageData: UPLOAD })), '', 'background choice alone never activates a menu repair');
  }
});

test('popup repair remains CSS-only and its exact local rule is included in the distributed Client', async () => {
  const source = await text('backgrounds.js');
  const component = source.match(/export function buildComponentCss\(state\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(component, 'the compatibility repair stays in the existing component CSS builder');
  assert.doesNotMatch(component, /\b(?:document|window)\s*\.|\b(?:MutationObserver|ResizeObserver|setTimeout|setInterval)\b|\.(?:addEventListener|removeEventListener|setAttribute|removeAttribute|appendChild)\s*\(|\bon(?:Click|Change|Input|KeyDown|MouseDown|PointerDown)\s*:|aria-|\brole\s*[:=]/, 'no DOM access, events, focus, menu state or accessibility rewrites');
  const css = buildComponentCss(validateState({ preset: 'forest', mode: 'light' }));
  const repair = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, selector]) => selector.trim() === 'body [data-menu-material]')?.[0].trim();
  assert.ok(repair, 'the shared material repair must exist before checking the build');
  const generated = await text('client.js');
  assert.equal(generated.split(repair.replaceAll('\n', '\\n')).length - 1, 1, 'rebuild the distributed Client after changing the exact shared popup rule');
  const manifest = JSON.parse(await text('package.json'));
  assert.ok(generated.startsWith(`// Generated appearance ${manifest.version}.`), 'the build and manifest generations must agree');
});

test('button compatibility does not restore rejected reading backings in source or build', async () => {
  // The user now explicitly requests the button repair, not reading panels.
  const removed = /buildReadabilityCss|data-conversation-header-leading|data-chat-flow-kind|data-turn-process|data-chat-running/;
  for (const file of ['backgrounds.js', 'src/client.js', 'client.js']) {
    assert.doesNotMatch(await text(file), removed, file);
  }
  for (const mode of ['inherit', 'light', 'dark', 'system']) {
    for (const background of ['none', 'forest', 'sea', 'sand', 'upload']) {
      const state = Object.freeze(validateState({ preset: 'forest', mode, background, fade: 0, imageData: UPLOAD }));
      const before = { ...state };
      const css = [buildBackgroundCss(state, { breeze: UPLOAD }), buildChromeCss(state), buildComponentCss(state)].join('\n');
      assert.doesNotMatch(css, removed);
      assert.deepEqual(state, before, 'rollback must not alter the selected theme or fade');
    }
  }
});

test('brand inverse ink and composer add fills remain paired in either native scheme', () => {
  // Numeric palette regression only, not a DOM renderer or visual acceptance.
  function luminance(hex) {
    const channels = hex.slice(1).match(/../g).map((pair) => Number.parseInt(pair, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  function contrast(left, right) {
    const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  }
  for (const preset of ['original', 'forest', 'sea', 'sand']) {
    const palette = preset === 'original' ? BASE_PALETTE : PALETTES[preset];
    for (const mode of ['light', 'dark', 'system', 'inherit']) {
      if (preset === 'original' && mode === 'inherit') continue;
      for (const nativeDark of [false, true]) for (const systemDark of [false, true]) {
        const nativeMode = nativeDark ? 'dark' : 'light';
        const effective = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode === 'inherit' ? nativeMode : mode;
        const tokens = resolveTokenModes({ preset, mode }, systemDark);
        const text = tokens['--dsw-alias-label-primary'][nativeMode];
        const base = tokens['--dsw-alias-bg-base'][nativeMode];
        const hover = tokens['--dsw-alias-interactive-bg-hover'][nativeMode];
        assert.equal(text, palette[effective].text);
        assert.equal(base, palette[effective].base);
        assert.equal(hover, palette[effective].nested);
        assert.ok(contrast(base, text) >= 4.5, `${preset}/${mode}: badge ink and add rest`);
        assert.ok(contrast(hover, text) >= 4.5, `${preset}/${mode}: add hover`);
        // Inverse-label and selector-fill tokens stay untouched globally:
        // the scoped CSS alone rebinds the confirmed consumers.
        for (const name of ['--dsw-alias-label-primary-inverted', '--dsw-specific-selector', '--dsw-alias-interactive-bg-hover-solid']) {
          assert.equal(Object.hasOwn(tokens, name), false);
        }
      }
    }
  }
});

test('jump-to-bottom arrow contrasts with rest and hover fills in every effective scheme without global floating overrides', () => {
  // Numeric palette and CSS policy only, not browser or scroll verification.
  function luminance(hex) {
    const channels = hex.slice(1).match(/../g).map((pair) => Number.parseInt(pair, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  function contrast(left, right) {
    const [high, low] = [luminance(left), luminance(right)].sort((a, b) => b - a);
    return (high + 0.05) / (low + 0.05);
  }
  for (const preset of ['original', 'forest', 'sea', 'sand']) {
    const palette = preset === 'original' ? BASE_PALETTE : PALETTES[preset];
    for (const mode of ['inherit', 'light', 'dark', 'system']) {
      if (preset === 'original' && mode === 'inherit') continue;
      const state = Object.freeze(validateState({ preset, mode, background: 'none' }));
      const before = { ...state };
      const css = buildComponentCss(state);
      const floatRules = [...css.matchAll(/([^{}]+)\{([^{}]*--dsw-alias-button-floating-[^{}]*)\}/g)];
      assert.equal(floatRules.length, 1, 'one local scope, no body-wide floating override');
      assert.equal(floatRules[0][1].trim(), 'body [data-conversation-content]');
      assert.doesNotMatch(floatRules[0][2], /\b(?:width|height|padding|margin|position|display|opacity|transform|pointer-events|box-shadow|outline|font|color)\s*:/);
      for (const nativeDark of [false, true]) for (const systemDark of [false, true]) {
        const nativeMode = nativeDark ? 'dark' : 'light';
        const effective = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode === 'inherit' ? nativeMode : mode;
        const tokens = resolveTokenModes(state, systemDark);
        const ink = tokens['--dsw-alias-label-primary'][nativeMode];
        const rest = tokens['--dsw-alias-bg-layer-1'][nativeMode];
        const hover = tokens['--dsw-alias-interactive-bg-hover'][nativeMode];
        assert.equal(rest, palette[effective].surface);
        assert.equal(hover, palette[effective].nested);
        assert.equal(tokens['--dsw-alias-border-l3'][nativeMode], palette[effective].border);
        assert.ok(contrast(rest, ink) >= 4.5, `${preset}/${mode}: floating arrow at rest`);
        assert.ok(contrast(hover, ink) >= 4.5, `${preset}/${mode}: floating arrow on hover`);
        for (const name of ['--dsw-alias-button-floating-fill', '--dsw-alias-button-floating-hover']) {
          assert.equal(Object.hasOwn(tokens, name), false, 'do not recolor unrelated floating controls globally');
        }
      }
      assert.deepEqual(state, before, 'button repair must not change saved appearance');
    }
  }
});

test('the live visual layer includes scoped component paint and uses the manifest generation marker', async () => {
  const source = await text('src/client.js');
  const manifest = JSON.parse(await text('package.json'));
  assert.match(source, /import\s*\{[^}]*\bbuildComponentCss\b[^}]*\}\s*from ['"]\.\.\/backgrounds\.js['"]/);
  assert.match(source, /buildBackgroundCss\(state,[^\n]+buildChromeCss\(state\), buildComponentCss\(state\)/);
  assert.ok(source.includes('id: `${NS}-visual-' + manifest.version + '`'));
  const markers = [...source.matchAll(/'data-dsha-version': '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(markers, [manifest.version, manifest.version]);
});

test('settings illustrations and thumbnails retain the exact shared palette and wallpaper paint', async () => {
  const source = await text('src/preview.js');
  assert.match(source, /import\s*\{[^}]*\bresolveTokenModes\b[^}]*\}\s*from ['"]\.\.\/core\.js['"]/);
  assert.match(source, /import\s*\{[^}]*\bbackgroundStyle\b[^}]*\}\s*from ['"]\.\.\/backgrounds\.js['"]/);
  assert.doesNotMatch(source, /#[\dA-Fa-f]{3,8}\b|\b(?:rgb|hsl)a?\s*\(/, 'no independent preview palette');
  assert.doesNotMatch(source, /\bh\s*\(\s*['"](?:textarea|input|button|a|iframe|canvas|foreignObject)['"]/, 'the settings illustration uses static spans/divs rather than interactive controls');
  assert.doesNotMatch(source, /\bon(?:Click|Change|Input|Submit|KeyDown|PointerDown)\b|\b(?:tabIndex|contentEditable)\b/);
  assert.doesNotMatch(source, /ctx\.|\b(?:useSessions|useSessionStatus|useResource|usePanelInfo)\b|data-conversation-content|data-composer-card|document\.|innerHTML|dangerouslySetInnerHTML|createRoot\(/, 'no native Session, slots, DOM writes or second renderer');
  assert.doesNotMatch(source, /\bmodeIcon\b|className: 'dsha-mode-icon'/, 'base thumbnails use static window skeletons, not sun/moon mode icons');
  assert.match(source, /\bvariant\s*===\s*['"]stage['"]/, 'the large illustration is an explicit settings-only variant');
  assert.match(source, /role: ['"]img['"]/);
  assert.match(source, /['"]aria-label['"]: t\('previewIllustration'\)/, 'the stage explicitly labels itself as an appearance illustration');
  assert.match(source, /className: 'dsha-stage-badge'/);
  assert.match(source, /function thumbnailWindow\(\)/);
  assert.match(source, /state\.background === 'none' \? thumbnailWindow\(\) : null/, 'landscape thumbnails retain wallpaper without a skeleton overlay');
  assert.match(source, /className: 'dsha-mode-split'/);
  assert.match(source, /\['light', 'dark'\]\.map\(\(mode\)/);
  assert.match(source, /themePreviewPaint\(\{ \.\.\.state, mode \}, assets, environment\)/);
  const assets = Object.freeze({ breeze: UPLOAD });
  for (const { id } of THEME_CHOICES) {
    const state = Object.freeze(chooseTheme(DEFAULTS, id));
    const before = { ...state };
    for (const nativeDark of [false, true]) for (const systemDark of [false, true]) {
      const environment = Object.freeze({ nativeDark, systemDark, nativeBase: '#123456' });
      const tokens = resolveTokenModes(state, systemDark);
      const expected = {
        ...Object.fromEntries(Object.entries(tokens).map(([name, pair]) => [name, pair[nativeDark ? 'dark' : 'light']])),
        ...backgroundStyle(state, assets, environment),
        backgroundColor: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
      };
      assert.deepEqual(themePreviewPaint(state, assets, environment), expected, `${id}/${nativeDark}/${systemDark}`);
    }
    assert.deepEqual(state, before);
  }
});

test('settings stage keeps a 2:1 ratio while compact gallery thumbnails keep 3:2 and five responsive columns', () => {
  // CSS declaration policy only, not browser layout or visual acceptance.
  const rules = [...PAGE_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const name of ['dsha-theme-thumb', 'dsha-material-preview']) {
    const body = rules.find(([, selector]) => selector.trim() === `.${name}`)?.[2];
    assert.ok(body, `${name} is styled`);
    assert.match(body, /\baspect-ratio:\s*3\s*\/\s*2\s*;/);
    assert.match(body, /\bwidth:\s*100%\s*;/);
    assert.match(body, /\boverflow:\s*hidden\s*;/);
    assert.doesNotMatch(body, /\b(?:height|min-height|max-height)\s*:/, 'thumbnail size follows its aspect ratio');
  }
  const stage = rules.find(([, selector, body]) => /\.dsha-[\w-]*stage\b/.test(selector) && /aspect-ratio:\s*2\s*\/\s*1\s*;/.test(body));
  assert.ok(stage, 'a dedicated large stage uses a 2:1 box');
  const gallery = rules.find(([, selector]) => selector.trim() === '.dsha-theme-grid')?.[2];
  assert.ok(gallery);
  assert.match(gallery, /display:\s*grid\s*;/);
  assert.match(gallery, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)\s*;/);
  assert.match(PAGE_CSS, /@(?:container|media)\s*\(max-width:\s*\d+px\)/, 'narrow allocations have explicit breakpoints');
  const responsiveColumns = rules.filter(([, selector]) => selector.trim() === '.dsha-theme-grid').slice(1).map(([, , body]) => body);
  assert.ok(responsiveColumns.some((body) => /grid-template-columns:\s*(?:repeat\([1-4],|minmax\(0,\s*1fr\))/.test(body)), 'gallery columns reduce for small widths');
  const selection = rules.filter(([, selector]) => /\.dsha-theme-card\[data-selected=['"]true['"]\]/.test(selector)).map(([, , body]) => body).join('\n');
  assert.match(selection, /(?:border-color|outline|box-shadow):[^;]*var\(--dsw-alias-label-primary\)/, 'selection uses the primary ink outline rather than a brand-colored card');
  assert.doesNotMatch(selection, /--dsw-alias-brand-primary/);
  assert.doesNotMatch(PAGE_CSS, /\.dsha-(?:theme-upload|theme-soon|card-description|footer)\b/);
});

test('material paint retains the full bundled PNG at all fades even beyond Blink variable-substitution size', async () => {
  // String and shared-policy regression only, never an image decoder or renderer.
  const png = await readFile(new URL('assets/breeze.png', root));
  const url = `data:image/png;base64,${png.toString('base64')}`;
  const assets = { breeze: url };
  assert.ok(url.length > 2 * 1024 * 1024, 'exercise the actual large bundled artwork without re-encoding or padding');
  for (const fade of [0, 37, 80, 100]) {
    const state = Object.freeze(validateState({ preset: 'forest', mode: 'light', background: 'forest', fade }));
    const environment = { nativeDark: true, systemDark: true };
    const material = themePreviewPaint(state, assets, environment);
    assert.equal(material.backgroundImage, backgroundImage(state, assets, environment));
    assert.ok(material.backgroundImage.endsWith(`url(${JSON.stringify(url)})`));
    assert.doesNotMatch(material.backgroundImage, /\b(?:var|env|attr)\s*\(/i, 'variable-based colors stay in separate small declarations');
    assert.equal(material.backgroundSize, 'cover');
    assert.equal(material.backgroundPosition, 'center');
    assert.equal(material.backgroundRepeat, 'no-repeat');
  }
});

test('safe editor repair does not apply malformed uploads or unknown fields', () => {
  const invalid = { ...DEFAULTS, preset: 'forest', background: 'upload', imageData: 'https://example.com/not-allowed', unknown: 'x' };
  const result = decodeSaved(invalid);
  assert.equal(result.invalid, true);
  assert.equal(result.state.preset, 'forest');
  assert.equal(result.state.background, 'none');
  assert.equal(result.state.imageData, '');
  assert.doesNotThrow(() => validateState(result.state));
  assert.equal(sameAppearance(DEFAULTS, { ...DEFAULTS }), true);
  assert.equal(sameAppearance(DEFAULTS, { ...DEFAULTS, fade: 0 }), false);
});

test('the single theme gallery retains all seven existing preset definitions including Original', () => {
  assert.deepEqual(THEME_CHOICES, [
    { id: 'light', preset: 'original', mode: 'light', background: 'none', fade: 80 },
    { id: 'dark', preset: 'original', mode: 'dark', background: 'none', fade: 80 },
    { id: 'system', preset: 'original', mode: 'system', background: 'none', fade: 80 },
    { id: 'breeze', preset: 'forest', mode: 'light', background: 'forest', fade: 0 },
    { id: 'sea', preset: 'sea', mode: 'light', background: 'sea', fade: 10 },
    { id: 'sand', preset: 'sand', mode: 'light', background: 'sand', fade: 10 },
    { id: 'original', preset: 'original', mode: 'inherit', background: 'none', fade: 80 },
  ]);
  assert.equal(Object.isFrozen(THEME_CHOICES), true);
  assert.ok(THEME_CHOICES.every(Object.isFrozen));
  assert.equal(new Set(THEME_CHOICES.map((choice) => choice.id)).size, THEME_CHOICES.length);
  for (const mode of ['light', 'dark', 'system']) {
    assert.deepEqual(chooseTheme(DEFAULTS, mode), { ...DEFAULTS, mode });
  }
  assert.deepEqual(chooseTheme(DEFAULTS, 'breeze'), {
    ...DEFAULTS, preset: 'forest', mode: 'light', background: 'forest', fade: 0,
  });
  assert.deepEqual(chooseTheme(DEFAULTS, 'original'), DEFAULTS);
  for (const id of ['unknown', 'upload', 'custom']) assert.throws(() => chooseTheme(DEFAULTS, id), /Unknown theme choice/);
});

test('preset recognition requires exact accent and fade but ignores a valid dormant legacy image', () => {
  for (const { id } of THEME_CHOICES) {
    const state = Object.freeze(chooseTheme(DEFAULTS, id));
    assert.equal(themeChoiceId(state), id);
    assert.equal(themeChoiceId({ ...state, imageData: UPLOAD }), id);
    assert.equal(themeChoiceId({ ...state, accent: '#123456' }), '', `${id}: an explicit accent is a legacy appearance`);
    assert.equal(themeChoiceId({ ...state, fade: state.fade === 0 ? 1 : state.fade - 1 }), '', `${id}: fade must match exactly`);
    assert.equal(themeChoiceId({ ...state, fade: undefined }), '');
    assert.equal(themeChoiceId({ ...state, accent: undefined }), '');
  }
  assert.equal(themeChoiceId(null), '');
  assert.equal(themeChoiceId(undefined), '');
  assert.equal(themeChoiceId({ ...DEFAULTS, background: 'upload', imageData: UPLOAD }), '');
  assert.equal(themeChoiceId(validateState({ ...chooseTheme(DEFAULTS, 'breeze'), accent: PALETTES.forest.light.accent })), '', 'even the preset color written explicitly is not its default accent');
});

test('selecting any preset including Original preserves an existing uploaded image without mutating state', () => {
  const current = Object.freeze(validateState({
    preset: 'sand', mode: 'dark', accent: '#123456', background: 'upload', fade: 37, imageData: UPLOAD,
  }));
  const before = { ...current };
  for (const { id, ...patch } of THEME_CHOICES) {
    const state = chooseTheme(current, id);
    assert.deepEqual(state, { ...current, ...patch, accent: '' });
    assert.notEqual(state, current);
    assert.equal(state.imageData, UPLOAD);
    assert.equal(themeChoiceId(state), id);
    assert.equal(sameAppearance(state, { ...state, imageData: '' }), false, 'the dormant field still participates in draft equality and save conflict handling');
  }
  assert.deepEqual(current, before);
  assert.equal(themeChoiceId(DEFAULTS), 'original');
  assert.equal(themeChoiceId({ ...current, preset: 'original', mode: 'inherit' }), '', 'an active upload remains a non-preset legacy choice');
});

test('configuration page provides one stage and one seven-theme gallery without grouped cards, save footer or real-conversation preview navigation', async () => {
  // Inspect source policy only; do not execute React or synthesize a page tree.
  const source = await text('src/client.js');
  const pageStart = source.indexOf('function AppearancePage()');
  const page = source.slice(pageStart, source.indexOf("ctx.slots.inject('main'"));
  assert.ok(pageStart >= 0);
  assert.deepEqual(THEME_CHOICES.map(({ id }) => id), ['light', 'dark', 'system', 'breeze', 'sea', 'sand', 'original']);
  assert.equal((page.match(/THEME_CHOICES\.map\(card\)/g) ?? []).length, 1, 'all themes share one gallery rather than filtered groups');
  assert.doesNotMatch(page, /THEME_CHOICES\.filter\(|\bh\s*\(\s*['"](?:fieldset|legend|footer)['"]/);
  assert.match(page, /variant: ['"]stage['"]/);
  assert.match(page, /variant: ['"]thumbnail['"]/);
  assert.match(page, /'data-theme-choice': choice\.id, 'data-selected': checked, 'aria-pressed': checked/);
  assert.match(page, /\bdisabled:\s*[^\n]*\bbusy\b[^\n]*\bconflict\b/, 'pending saves and conflicts disable gallery selection');
  const card = page.match(/function card\(choice\) \{([\s\S]*?)\n        \}/)?.[1];
  assert.ok(card, 'one shared thumbnail and outside-name renderer');
  assert.match(card, /className: 'dsha-theme-thumb'/);
  assert.match(card, /className: 'dsha-card-name'/);
  assert.ok(card.indexOf("className: 'dsha-card-name'") > card.indexOf('h(ThemePreview'), 'theme name follows the thumbnail rather than an overlaid caption');
  assert.doesNotMatch(page, /editor\.(?:startPreview|save)\(|ctx\.layout\.selectPanel\(|previewConversation|canSave|canPreview/);
  assert.doesNotMatch(page, /\bt\(['"](?:restore|restoreHint|save|previewConversation|basicThemes|landscapeThemes|intro|selectHint|previewNote|persistence)['"]\)|themeNote\./);
  assert.doesNotMatch(page, /\bh\s*\(\s*['"](?:input|select|option|textarea|details)['"]|\btype:\s*['"](?:color|range|file)['"]/);
  assert.doesNotMatch(page, /FileReader|new Image\s*\(|fileInput|chooseFile|uploadInfo|validAccent|t\(['"](?:customize|upload|accent|background|fade|comingSoon)['"]\)/);
  assert.doesNotMatch(page, /\bdsha-(?:footer|card-copy|card-description|theme-upload|theme-soon|details|controls)\b/);
});

test('save and restore issue one complete set-only operation batch using original defaults', () => {
  const ops = appearanceOps(DEFAULTS);
  assert.equal(ops.length, Object.keys(DEFAULTS).length);
  assert.ok(ops.every((op) => op.op === 'set' && op.path.length === 1));
  const restored = Object.fromEntries(ops.map((op) => [op.path[0], op.value]));
  assert.deepEqual(restored, DEFAULTS);
  assert.equal(restored.preset, 'original');
  assert.equal(restored.mode, 'inherit');
  assert.equal(restored.background, 'none');
  assert.equal(restored.imageData, '');
  assert.throws(() => appearanceOps({ ...DEFAULTS, background: 'upload' }));
});

test('client sources cannot mutate original typography, DOM or native preference', async () => {
  const source = await text('src/client.js');
  for (const file of ['src/client.js', 'src/editor.js', 'src/preview.js', 'src/live-preview.js', 'backgrounds.js']) {
    const content = file === 'src/client.js' ? source : await text(file);
    assert.doesNotMatch(content, /\.setFontSize\s*\(|\.setTheme\s*\(|document\.|localStorage|innerHTML|dangerouslySetInnerHTML/, file);
    assert.doesNotMatch(content, /require\(['"]@deepseek|from ['"]@deepseek/, file);
  }
  assert.match(source, /\bctx\.theme\.overrideTokens\s*\(\s*NS\s*,/);
  assert.match(source, /\beditor\.apply\(choice\.id, form\)/);
  assert.doesNotMatch(source, /\bform\.mutate\s*\(/, 'the gallery delegates persistence to the plugin-owned controller');
  assert.match(await text('src/live-preview.js'), /\bform\.mutate\s*\(\s*appearanceOps\(value\), revision\)/);
  // Only the owned page/illustration may size its text. No rule targets native
  // DOM, changes the original family, or drives native font preferences.
  const rules = [...PAGE_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const [, selector, body] of rules) {
    if (selector.trim().startsWith('@')) continue;
    const selectors = selector.split(',').map((entry) => entry.trim());
    for (const entry of selectors) assert.match(entry, /^\.dsha-/, 'every selector branch stays plugin-owned');
    if (/\bfont-(?:size|weight)\s*:/.test(body)) {
      assert.ok(selectors.every((entry) => !entry.startsWith('.dsha-live-notice')), 'redesign typography is restricted to the settings page and its static illustration');
    }
    for (const shorthand of body.matchAll(/\bfont\s*:\s*([^;{}]+);/g)) assert.equal(shorthand[1].trim(), 'inherit');
    for (const family of body.matchAll(/\bfont-family\s*:\s*([^;{}]+);/g)) assert.equal(family[1].trim(), 'inherit');
  }
});

test('plugin-owned drafts survive page navigation and transport disconnects only stop temporary paint', async () => {
  // Source integration policy only; controller behavior is exercised separately.
  const source = await text('src/client.js');
  const pageStart = source.indexOf('function AppearancePage()');
  const setup = source.slice(0, source.indexOf('function useText()'));
  const page = source.slice(pageStart, source.indexOf("ctx.slots.inject('main'"));
  assert.equal((source.match(/createAppearanceEditor\(\)/g) ?? []).length, 1);
  assert.ok(source.indexOf('const editor = createAppearanceEditor();') < pageStart);
  assert.match(setup, /form\.subscribe\(sync\)/);
  assert.match(setup, /return \(\) => \{ unsubscribe\(\); editor\.clear\(\); \}/);
  assert.doesNotMatch(page, /editor\.clear\(|useState\(/, 'page lifetime must not own the draft or pending save');
  for (const name of ['backToConversation', 'backToAppearance']) {
    const body = source.match(new RegExp(`function ${name}\\(\\) \\{([^}]+)\\}`))?.[1];
    assert.ok(body);
    assert.match(body, /editor\.stopPreview\(\)/);
    assert.doesNotMatch(body, /editor\.(?:clear|save)|form\.mutate/);
  }
  assert.match(source, /onClick: editor\.stopPreview/);
  assert.match(source, /inject: \[[^\]]*'connection'/);
  assert.match(setup, /ctx\.connection\.state\.subscribe\(listener\)/);
  assert.match(setup, /ctx\.connection\.state\.getSnapshot\(\)/);
  assert.match(setup, /const syncConnection = \(\) => \{ if \(readConnection\(\) !== 'connected'\) editor\.stopPreview\(\); \}/);
  assert.match(setup, /subscribeConnection\(syncConnection\)/);
  assert.doesNotMatch(setup, /startPreview\(/, 'reconnect must not implicitly resume paint');
  assert.match(source, /const preview = connected && activePanelId === null \? currentPreview\(draft, snapshot\) : null/);
  assert.match(page, /editor\.apply\(choice\.id, form\)/, 'an authorized gallery click uses one atomic select-and-save operation');
  assert.match(page, /editor\.select\(choice\.id\)/, 'read-only/offline choice stays local to the settings illustration');
  assert.match(page, /(?:readConnection\(\) === 'connected'|connected)\s*&&\s*(?:current|snapshot)\.writable/, 'only connected writable clients choose the persistent path');
  assert.match(page, /(?:busy[^;\n]*conflict|conflict[^;\n]*busy)/, 'selection is fenced while busy or conflicted');
  assert.doesNotMatch(page, /editor\.startPreview\(|previewConversation|ctx\.layout\.selectPanel\(/, 'the settings page has no jump-to-real-conversation preview flow');
});

test('the client build includes the dependency-free appearance editor', async () => {
  const build = await text('build.mjs');
  assert.match(build, /['"]src\/live-preview\.js['"]/);
});

test('metadata is bilingual and all linked distribution resources exist', async () => {
  const manifest = JSON.parse(await text('package.json'));
  const en = JSON.parse(await text('locale/en.json'));
  const zh = JSON.parse(await text('locale/zh.json'));
  assert.deepEqual(Object.keys(en.ui).sort(), Object.keys(zh.ui).sort());
  assert.equal(zh.ui['theme.breeze'], '绿色');
  assert.equal(en.ui['theme.breeze'], 'Green');
  for (const resource of [en, zh]) {
    assert.ok(resource.meta.title && resource.meta.description);
    assert.ok(Object.values(resource.ui).every((value) => typeof value === 'string' && value.length > 0));
  }
  assert.equal(manifest.dsh.client.immediately, true);
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'));
  assert.ok(manifest.peerDependencies['@deepseek-ai/schemastery']);
  for (const file of ['index.js', 'core.js', 'backgrounds.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'README.md', 'LICENSE', 'build.mjs', 'src/client.js', 'src/editor.js', 'src/styles.js', 'src/preview.js', 'src/live-preview.js', 'assets/breeze.png', 'locale/en.json', 'locale/zh.json']) {
    assert.ok((await stat(new URL(file, root))).isFile(), file);
    assert.ok(manifest.files.some((pattern) => new RegExp(`^${pattern.replaceAll('.', '\\.').replaceAll('*', '[^/]*')}$`).test(file)), `${file} is distributed`);
  }
  const icon = await text('icon.svg');
  assert.match(icon, /<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.ok(Buffer.byteLength(icon) <= 256 * 1024);
  assert.doesNotMatch(icon, /<script|<foreignObject|href=/i);
});
