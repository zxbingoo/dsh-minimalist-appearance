import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { performance } from 'node:perf_hooks';
import {
  NS, DEFAULTS, MAX_IMAGE_BYTES, IMAGE_DATA_PATTERN,
  BASE_PALETTE, PALETTES, validateState, summary, imageInfo,
  buildTokenOverrides, resolveTokenModes,
} from '../core.js';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const TOKEN_NAMES = [
  '--dsw-alias-bg-base', '--dsw-specific-sidebar-fill',
  '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-overlay',
  '--dsw-specific-input-major', '--dsw-specific-bubble', '--dsw-specific-menu', '--dsw-alias-markdown-code-block',
  '--dsw-alias-bg-module-platform', '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-border-l3', '--dsw-alias-border-l4',
  '--dsw-alias-label-primary', '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary', '--dsw-alias-label-caption', '--dsw-alias-brand-primary',
].sort();

function raster(mime, size) {
  const bytes = Buffer.alloc(size);
  // A varying body exercises large base64 inputs, not just a repeated A run.
  for (let index = 0; index < size; index += 1) bytes[index] = index % 251;
  if (mime === 'png') bytes.set(PNG_SIGNATURE);
  else if (mime === 'jpeg') bytes.set([255, 216, 255, 224]);
  else {
    bytes.write('RIFF', 0, 'ascii');
    bytes.write('WEBP', 8, 'ascii');
  }
  return `data:image/${mime};base64,${bytes.toString('base64')}`;
}

const PNG = raster('png', 33);
const JPEG = raster('jpeg', 4);
const WEBP = raster('webp', 20);

test('defaults preserve the native interface and return detached state', () => {
  assert.equal(NS, 'dsh-appearance');
  assert.deepEqual(validateState({}), DEFAULTS);
  assert.deepEqual(DEFAULTS, {
    preset: 'original', mode: 'inherit', accent: '', background: 'none', fade: 80, imageData: '',
  });
  const value = validateState({});
  value.preset = 'forest';
  assert.equal(DEFAULTS.preset, 'original');
  assert.deepEqual(buildTokenOverrides(DEFAULTS), {});
});

test('partial patches normalize only supplied values without modifying input', () => {
  const patch = { accent: '#aAbBcC', fade: 0 };
  assert.deepEqual(validateState(patch, { partial: true }), { accent: '#AABBCC', fade: 0 });
  assert.deepEqual(patch, { accent: '#aAbBcC', fade: 0 });
  assert.deepEqual(validateState({}, { partial: true }), {});
  assert.deepEqual(validateState({ background: 'upload' }, { partial: true }), { background: 'upload' });
  assert.throws(() => validateState({ background: 'upload', imageData: '' }, { partial: true }), /requires valid imageData/);
});

test('only the exact seven appearance fields and ordinary records are allowed', () => {
  for (const value of [null, [], new Date(), 'forest', 4, false, undefined, Object.create({ preset: 'forest' })]) {
    assert.throws(() => validateState(value), /plain object/);
  }
  for (const name of ['fontSize', 'fontFamily', 'padding', 'layout', '__proto__', 'constructor', 'extra']) {
    assert.throws(() => validateState(JSON.parse(`{"${name}":"invalid"}`)), /Unknown appearance field/);
  }
  assert.deepEqual(validateState(Object.assign(Object.create(null), { preset: 'sea' })), { ...DEFAULTS, preset: 'sea' });
  assert.throws(() => validateState({ [Symbol('hidden')]: true }), /ordinary JSON/);
  assert.throws(() => validateState(Object.defineProperty({}, 'preset', { value: 'forest' })), /ordinary JSON/);
  assert.throws(() => validateState({ get preset() { throw new Error('must not run getter'); } }), /ordinary JSON/);
});

test('enum, fade, and accent constraints reject coercion and CSS injection', () => {
  for (const patch of [
    { preset: 'Forest' }, { preset: undefined }, { mode: 'auto' }, { background: 'https://example.test/wallpaper.png' },
    { fade: -1 }, { fade: 101 }, { fade: 1.5 }, { fade: '80' }, { fade: NaN }, { fade: Infinity },
    { accent: 'red' }, { accent: '#fff' }, { accent: '#12345678' }, { accent: '#12345Z' },
    { accent: ' #123456' }, { accent: '#123456\n' }, { accent: '\n' }, { accent: null },
    { accent: 'url(https://example.test)' }, { accent: '#123456;display:none' },
  ]) assert.throws(() => validateState(patch));
  for (const fade of [0, 1, 50, 99, 100]) assert.equal(validateState({ fade }).fade, fade);
  assert.equal(validateState({ accent: '#abcdef' }).accent, '#ABCDEF');
  assert.equal(validateState({ accent: '' }).accent, '');
  assert.throws(() => validateState({}, { partial: 'yes' }), /partial must be a boolean/);
});

test('raster data URLs validate in both core and serializable Host regexp', () => {
  for (const [input, mimeType, byteLength] of [[PNG, 'image/png', 33], [JPEG, 'image/jpeg', 4], [WEBP, 'image/webp', 20]]) {
    assert.equal(IMAGE_DATA_PATTERN.test(input), true);
    assert.deepEqual(imageInfo(input), { mimeType, byteLength });
    assert.equal(validateState({ background: 'upload', imageData: input }).imageData, input);
  }
  assert.equal(imageInfo(''), null);
  assert.equal(IMAGE_DATA_PATTERN.test(''), true);
  assert.throws(() => validateState({ background: 'upload' }), /requires valid imageData/);
  assert.throws(() => imageInfo(null), /must be a string/);
});

test('URLs, SVG, MIME mismatches, malformed padding, and active data are rejected', () => {
  const invalid = [
    'https://example.test/image.png', 'file:///tmp/image.png', 'blob:https://example.test/id',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:text/html;base64,PHNjcmlwdD4=', 'data:image/gif;base64,R0lGODlh',
    'data:image/png,raw', 'data:image/PNG;base64,' + PNG.split(',')[1],
    PNG.replace('image/png', 'image/jpeg'), JPEG.replace('image/jpeg', 'image/png'),
    WEBP.replace('image/webp', 'image/png'),
    PNG + '\n', PNG + '\r', PNG + '\u2028', PNG + ' ', PNG + ';', PNG + '"',
    PNG.slice(0, -1), PNG + '=', JPEG.replace(/==$/, '==='),
    JPEG.replace(/A==$/, 'B=='), // Nonzero unused base64 bits.
    'data:image/png;base64,' + Buffer.from(PNG_SIGNATURE).toString('base64'),
    'data:image/webp;base64,' + Buffer.from('RIFF0000WEBP').toString('base64'),
  ];
  for (const input of invalid) {
    assert.equal(IMAGE_DATA_PATTERN.test(input), false, `Host pattern accepted ${input.slice(0, 60)}`);
    assert.throws(() => imageInfo(input));
  }
  const wrongMagic = Buffer.alloc(33);
  assert.throws(() => imageInfo('data:image/png;base64,' + wrongMagic.toString('base64')));
});

test('two MiB decoded boundary is exact and largest malformed values terminate', { timeout: 10000 }, () => {
  const start = performance.now();
  for (const mime of ['png', 'jpeg', 'webp']) {
    const largest = raster(mime, MAX_IMAGE_BYTES);
    const below = raster(mime, MAX_IMAGE_BYTES - 1);
    const above = raster(mime, MAX_IMAGE_BYTES + 1);
    assert.equal(largest.length, above.length, 'boundary tests the same encoded length');
    assert.equal(IMAGE_DATA_PATTERN.test(largest), true);
    assert.equal(IMAGE_DATA_PATTERN.test(below), true);
    assert.equal(imageInfo(largest).byteLength, MAX_IMAGE_BYTES);
    assert.equal(imageInfo(below).byteLength, MAX_IMAGE_BYTES - 1);
    assert.equal(IMAGE_DATA_PATTERN.test(above), false);
    assert.throws(() => imageInfo(above));
    for (const malformed of [
      largest.slice(0, -1) + '!',
      largest.slice(0, 1000000) + '!' + largest.slice(1000001),
      largest + '\n',
      largest.slice(0, -1),
    ]) {
      assert.equal(IMAGE_DATA_PATTERN.test(malformed), false);
      assert.throws(() => imageInfo(malformed));
    }
  }
  const elapsed = performance.now() - start;
  console.log(`2 MiB boundary and malformed-image checks: ${Math.round(elapsed)} ms`);
  assert.ok(elapsed < 9000, 'maximum-size validation must finish promptly');
});

test('summary never includes image contents or a data URL', () => {
  const value = summary({ preset: 'forest', background: 'upload', imageData: PNG, accent: '#abcdef' });
  assert.deepEqual(value, {
    preset: 'forest', mode: 'inherit', accent: '#ABCDEF', background: 'upload', fade: 80,
    image: { mimeType: 'image/png', byteLength: 33 },
  });
  assert.equal(Object.hasOwn(value, 'imageData'), false);
  assert.equal(JSON.stringify(value).includes('base64'), false);
  assert.equal(summary(DEFAULTS).image, null);
});

test('palettes have exactly the agreed color fields in both modes', () => {
  assert.deepEqual(Object.keys(PALETTES).sort(), ['forest', 'sand', 'sea']);
  const fields = ['base', 'sidebar', 'surface', 'nested', 'border', 'text', 'secondary', 'accent'].sort();
  assert.equal(Object.isFrozen(PALETTES), true);
  for (const palette of [BASE_PALETTE, ...Object.values(PALETTES)]) {
    assert.equal(Object.isFrozen(palette), true);
    assert.deepEqual(Object.keys(palette).sort(), ['dark', 'light']);
    for (const values of Object.values(palette)) {
      assert.deepEqual(Object.keys(values).sort(), fields);
      for (const color of Object.values(values)) assert.match(color, /^#[0-9A-F]{6}$/);
      assert.equal(Object.isFrozen(values), true);
    }
  }
});

test('base colors and WorkBuddy forest light palette remain stable without changing forest dark', () => {
  assert.deepEqual(BASE_PALETTE, {
    light: {
      base: '#FFFFFF', sidebar: '#F5F5F5', surface: '#FFFFFF', nested: '#F0F0F0',
      border: '#E5E5E5', text: '#252525', secondary: '#8A8A8A', accent: '#4D6BFE',
    },
    dark: {
      base: '#1B1B1B', sidebar: '#202020', surface: '#2B2B2B', nested: '#333333',
      border: '#3D3D3D', text: '#ECECEC', secondary: '#A0A0A0', accent: '#8094FF',
    },
  });
  assert.deepEqual(PALETTES.forest, {
    light: {
      base: '#F5F8F5', sidebar: '#E5EDE6', surface: '#FFFFFF', nested: '#D3E2D1',
      border: '#CAD9CD', text: '#34453D', secondary: '#78877D', accent: '#3D8057',
    },
    dark: {
      base: '#151D19', sidebar: '#1B2921', surface: '#202E26', nested: '#27372D',
      border: '#384C40', text: '#E6EEE8', secondary: '#A6B6AB', accent: '#76B891',
    },
  });
});

test('token overrides contain confirmed color tokens and no typography or geometry', () => {
  for (const preset of ['original', 'forest', 'sea', 'sand']) {
    const palette = preset === 'original' ? BASE_PALETTE : PALETTES[preset];
    const tokens = buildTokenOverrides({ preset, mode: 'system' });
    assert.deepEqual(Object.keys(tokens).sort(), TOKEN_NAMES);
    for (const [token, values] of Object.entries(tokens)) {
      assert.doesNotMatch(token, /font|size|width|height|padding|margin|radius|layout|spacing/i);
      assert.deepEqual(Object.keys(values).sort(), ['dark', 'light']);
      assert.match(values.light, /^#[0-9A-F]{6}$/);
      assert.match(values.dark, /^#[0-9A-F]{6}$/);
    }
    assert.equal(tokens['--dsw-alias-bg-base'].light, palette.light.base);
    assert.equal(tokens['--dsw-specific-sidebar-fill'].dark, palette.dark.sidebar);
  }
  assert.deepEqual(buildTokenOverrides({ accent: '#123abc' }), {
    '--dsw-alias-brand-primary': { light: '#123ABC', dark: '#123ABC' },
  });
  assert.deepEqual(buildTokenOverrides({ preset: 'original', mode: 'inherit' }), {});
});

test('base and colored modes resolve light, dark, and system without changing input state', () => {
  for (const preset of ['original', 'forest', 'sea', 'sand']) {
    const automatic = buildTokenOverrides({ preset, mode: 'system' });
    const inherited = preset === 'original' ? {} : automatic;
    for (const systemDark of [false, true]) {
      assert.deepEqual(resolveTokenModes({ preset, mode: 'inherit' }, systemDark), inherited);
    }
    for (const mode of ['light', 'dark', 'system']) {
      const state = Object.freeze(validateState({ preset, mode }));
      assert.deepEqual(buildTokenOverrides(state), automatic);
      for (const systemDark of [false, true]) {
        const selected = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
        const resolved = resolveTokenModes(state, systemDark);
        assert.deepEqual(Object.keys(resolved).sort(), TOKEN_NAMES);
        for (const token of TOKEN_NAMES) {
          assert.deepEqual(resolved[token], { light: automatic[token][selected], dark: automatic[token][selected] });
        }
        const accented = resolveTokenModes({ ...state, accent: '#112233' }, systemDark);
        assert.deepEqual(accented, {
          ...resolved,
          '--dsw-alias-brand-primary': { light: '#112233', dark: '#112233' },
        });
      }
      assert.deepEqual(state, validateState({ preset, mode }));
    }
  }
  assert.deepEqual(resolveTokenModes({ preset: 'original', mode: 'inherit', accent: '#112233' }), {
    '--dsw-alias-brand-primary': { light: '#112233', dark: '#112233' },
  });
  assert.deepEqual(resolveTokenModes(DEFAULTS, false), {});
  assert.deepEqual(resolveTokenModes(DEFAULTS, true), {});
  assert.throws(() => resolveTokenModes(DEFAULTS, 'dark'), /systemDark must be a boolean/);
});

test('explicit light replaces native-dark composer, bubble, menu, tool, hover and label fills', () => {
  const aliases = {
    '--dsw-specific-input-major': 'surface',
    '--dsw-specific-bubble': 'nested',
    '--dsw-specific-menu': 'surface',
    '--dsw-alias-markdown-code-block': 'surface',
    '--dsw-alias-bg-module-platform': 'nested',
    '--dsw-alias-interactive-bg-hover': 'nested',
    '--dsw-alias-border-l3': 'border',
    '--dsw-alias-border-l4': 'border',
    '--dsw-alias-label-tertiary': 'secondary',
    '--dsw-alias-label-caption': 'secondary',
  };
  assert.equal(TOKEN_NAMES.length, 20);
  for (const preset of ['original', 'forest', 'sea', 'sand']) {
    const palette = preset === 'original' ? BASE_PALETTE : PALETTES[preset];
    const automatic = buildTokenOverrides({ preset, mode: 'system' });
    for (const [token, field] of Object.entries(aliases)) {
      assert.deepEqual(automatic[token], { light: palette.light[field], dark: palette.dark[field] }, `${preset}: ${token}`);
    }
    for (const systemDark of [false, true]) {
      const explicitLight = resolveTokenModes({ preset, mode: 'light' }, systemDark);
      for (const [token, field] of Object.entries(aliases)) {
        // A native-dark host consumes the dark entry even for explicit light.
        assert.deepEqual(explicitLight[token], { light: palette.light[field], dark: palette.light[field] }, `${preset}: ${token}`);
      }
    }
  }
});

test('inlined core works without Buffer, DOM, theme service, or Node imports', async () => {
  const source = (await readFile(new URL('../core.js', import.meta.url), 'utf8')).replace(/^export\s+/gm, '');
  const sandbox = {};
  for (const name of ['document', 'window', 'Buffer', 'process', 'localStorage']) {
    Object.defineProperty(sandbox, name, { get() { throw new Error(`core must not read ${name}`); } });
  }
  sandbox.dataURL = PNG;
  const result = runInNewContext(`${source}\nJSON.stringify({tokens:resolveTokenModes({preset:'forest',mode:'dark'}), base:resolveTokenModes({preset:'original',mode:'system'},true), image:imageInfo(dataURL)})`, sandbox);
  const value = JSON.parse(result);
  assert.equal(value.tokens['--dsw-alias-bg-base'].light, PALETTES.forest.dark.base);
  assert.deepEqual(value.base['--dsw-alias-bg-base'], { light: BASE_PALETTE.dark.base, dark: BASE_PALETTE.dark.base });
  assert.equal(value.image.byteLength, 33);
});
