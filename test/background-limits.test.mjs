import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BASE_PALETTE, DEFAULTS, MAX_IMAGE_BYTES, PALETTES, imageInfo, validateState } from '../core.js';
import { backgroundImage, backgroundStyle, buildBackgroundCss, resolveBackgroundBase } from '../backgrounds.js';

const root = new URL('../', import.meta.url);
// Blink's CSSVariableData::kMaxVariableBytes. These are string-policy tests,
// not a browser parser, an image decoder, or visual acceptance of the plugin.
const MAX_VARIABLE_BYTES = 2 * 1024 * 1024;
const fades = [0, 37, 80, 100];

function assertLargePaint(state, assets, url, environment, base) {
  const paint = backgroundImage(state, assets, environment);
  const veil = `color-mix(in srgb, ${base} ${state.fade}%, transparent)`;
  const expected = `linear-gradient(${veil}, ${veil}), url(${JSON.stringify(url)})`;
  assert.ok(paint.length > MAX_VARIABLE_BYTES, 'exercise the real encoded-size boundary');
  assert.ok(paint === expected, 'retain the entire raster and resolve the fade color literally');
  assert.doesNotMatch(paint, /\b(?:var|env|attr)\s*\(/i, 'avoid Blink pending-substitution parsing');
  const style = backgroundStyle(state, assets, environment);
  assert.ok(style.backgroundImage === paint, 'material sample uses the same paint');
  assert.equal(style.backgroundSize, 'cover');
  assert.equal(style.backgroundPosition, 'center');
  const css = buildBackgroundCss(state, assets, environment);
  assert.ok(css.includes(`background-image: ${paint} !important;`), 'conversation uses the identical paint');
  assert.doesNotMatch(css, /\b(?:var|env|attr)\s*\(/i);
}

test('the full bundled watercolor avoids variable substitution at every fade', { timeout: 10000 }, async () => {
  const png = await readFile(new URL('assets/breeze.png', root));
  const url = `data:image/png;base64,${png.toString('base64')}`;
  assert.ok(url.length > MAX_VARIABLE_BYTES);
  const assets = { breeze: url };
  for (const fade of fades) {
    const state = Object.freeze(validateState({ preset: 'forest', mode: 'light', background: 'forest', fade }));
    // Explicit light must stay light even when DSH itself is dark.
    assertLargePaint(state, assets, url, { nativeDark: true, systemDark: true }, PALETTES.forest.light.base);
  }
});

test('a maximum-size permitted upload also avoids substitution at every fade', { timeout: 10000 }, () => {
  // Signature-valid policy-boundary fixture, deliberately not a decoder test.
  // Its padded body exercises exactly the upload byte limit and CSS size cap.
  const bytes = Buffer.alloc(MAX_IMAGE_BYTES);
  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6w4sAAAAASUVORK5CYII=', 'base64');
  tinyPng.copy(bytes);
  const imageData = `data:image/png;base64,${bytes.toString('base64')}`;
  assert.equal(imageInfo(imageData).byteLength, MAX_IMAGE_BYTES);
  const environment = { nativeDark: true, nativeBase: '#123456' };
  for (const fade of fades) {
    const state = Object.freeze(validateState({ background: 'upload', imageData, fade }));
    assertLargePaint(state, {}, imageData, environment, '#123456');
  }
});

test('literal fade bases follow explicit, native and system modes without state writes', () => {
  for (const preset of ['original', 'forest', 'sea', 'sand']) {
    const palette = preset === 'original' ? BASE_PALETTE : PALETTES[preset];
    for (const nativeDark of [false, true]) {
      for (const systemDark of [false, true]) {
        for (const mode of ['light', 'dark', 'inherit', 'system']) {
          const state = Object.freeze(validateState({ preset, mode }));
          const environment = Object.freeze({ nativeDark, systemDark, nativeBase: '#123456' });
          const effective = mode === 'system' ? (systemDark ? 'dark' : 'light')
            : mode === 'inherit' ? (nativeDark ? 'dark' : 'light') : mode;
          const expected = preset === 'original' && mode === 'inherit' ? '#123456' : palette[effective].base;
          assert.equal(resolveBackgroundBase(state, environment), expected, `${preset}/${mode}/${nativeDark}/${systemDark}`);
          assert.equal(state.mode, mode);
          assert.equal(environment.nativeBase, '#123456');
        }
      }
    }
  }
});

test('native base accepts bounded literals but cannot inject CSS or substitution functions', () => {
  for (const nativeBase of ['#abc', '#12345678', 'rgb(12 34 56 / 0.5)', 'oklch(95% 0.02 160)', 'white']) {
    assert.equal(resolveBackgroundBase(DEFAULTS, { nativeBase }), nativeBase);
  }
  for (const nativeBase of [
    undefined, null, '', 'var(--base)', 'env(safe-area-inset-top)', 'attr(data-color)',
    'currentColor', 'inherit', 'initial', 'unset', 'revert', 'revert-layer',
    '#fff); } body { display: none; }', 'url(https://example.com/a)',
    'rgb(var(--color))', 'red; background: none', 'a'.repeat(257),
  ]) {
    for (const nativeDark of [false, true]) {
      assert.equal(resolveBackgroundBase(DEFAULTS, { nativeDark, nativeBase }), BASE_PALETTE[nativeDark ? 'dark' : 'light'].base);
    }
  }
});

test('the generated factory embeds the original PNG and the current localized resources', async () => {
  const [source, png, manifestText, enText, zhText] = await Promise.all([
    readFile(new URL('client.js', root), 'utf8'), readFile(new URL('assets/breeze.png', root)),
    readFile(new URL('package.json', root), 'utf8'), readFile(new URL('locale/en.json', root), 'utf8'),
    readFile(new URL('locale/zh.json', root), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.ok(source.startsWith(`// Generated appearance ${manifest.version}.`));
  // Parse the generated JSON arguments only; never fake window/React/DOM.
  const args = source.match(/^\s*return createAppearancePlugin\(React, (.+)\);\r?$/m);
  assert.ok(args, 'generated factory has explicit dictionary and asset arguments');
  const [dictionaries, assets] = JSON.parse(`[${args[1]}]`);
  assert.deepEqual(dictionaries, { en: JSON.parse(enText).ui, zh: JSON.parse(zhText).ui });
  assert.deepEqual(Object.keys(assets), ['breeze']);
  assert.ok(assets.breeze === `data:image/png;base64,${png.toString('base64')}`, 'package artwork is embedded byte for byte');
});
