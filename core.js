/** Shared, dependency-free appearance policy. No font or layout values live here. */
export const NS = 'dsh-appearance';

export const DEFAULTS = Object.freeze({
  preset: 'original',
  mode: 'inherit',
  accent: '',
  background: 'none',
  fade: 80,
  imageData: '',
});

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
export const MAX_IMAGE_DATA_LENGTH = 'data:image/webp;base64,'.length + MAX_IMAGE_BASE64_LENGTH;

const PRESETS = ['original', 'forest', 'sea', 'sand'];
const MODES = ['inherit', 'light', 'dark', 'system'];
const BACKGROUNDS = ['none', 'forest', 'sea', 'sand', 'upload'];
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_BODY = '(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/][AQgw]==|[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048]=)?';

// All alternatives are ordinary serializable RegExp constraints for Host forms.
// The negative lookahead excludes the only over-limit decoded length at the
// maximum encoded length (2 MiB + 1 byte, encoded without padding).
function imagePattern(mime, magic, minimumBytes) {
  const minimumLength = Math.ceil(minimumBytes / 3) * 4;
  return `data:image/${mime};base64,(?=.{${minimumLength},${MAX_IMAGE_BASE64_LENGTH}}$)(?![A-Za-z0-9+/]{${MAX_IMAGE_BASE64_LENGTH}}$)(?=${magic})${BASE64_BODY}`;
}

export const IMAGE_DATA_PATTERN = new RegExp(`^(?:$|${[
  imagePattern('png', 'iVBORw0KGg[opqr]', 33),
  imagePattern('jpeg', '/9j/', 4),
  imagePattern('webp', 'UklGR[ghijklmnopqrstuv][A-Za-z0-9+/]{4}[BFJNRVZdhlptx159]XRUJQ', 20),
].join('|')})$(?![\\s\\S])`);

function ownRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor?.enumerable || !('value' in descriptor)) {
      throw new TypeError(`${label} must contain ordinary JSON fields`);
    }
  }
}

function inEnum(value, choices, name) {
  if (typeof value !== 'string' || !choices.includes(value)) {
    throw new TypeError(`${name} must be one of: ${choices.join(', ')}`);
  }
  return value;
}

// Read only the bytes needed for file signatures, without Buffer, atob, or an
// image decoder. MIME sniffing is not a claim that an entire image was decoded.
function base64Byte(payload, byteIndex) {
  const group = Math.floor(byteIndex / 3) * 4;
  const a = BASE64_ALPHABET.indexOf(payload[group]);
  const b = BASE64_ALPHABET.indexOf(payload[group + 1]);
  const c = BASE64_ALPHABET.indexOf(payload[group + 2]);
  const d = BASE64_ALPHABET.indexOf(payload[group + 3]);
  if (byteIndex % 3 === 0) return (a << 2) | (b >>> 4);
  if (byteIndex % 3 === 1) return ((b & 15) << 4) | (c >>> 2);
  return ((c & 3) << 6) | d;
}

function hasBytes(payload, offset, expected) {
  return expected.every((value, index) => base64Byte(payload, offset + index) === value);
}

/** Validate a raster data URL and answer bounded metadata, never image bytes. */
export function imageInfo(imageData) {
  if (typeof imageData !== 'string') throw new TypeError('imageData must be a string');
  if (imageData === '') return null;
  if (imageData.length > MAX_IMAGE_DATA_LENGTH) {
    throw new RangeError('Uploaded background must be at most 2 MiB decoded');
  }
  if (!IMAGE_DATA_PATTERN.test(imageData)) {
    throw new TypeError('imageData must be a valid PNG, JPEG, or WebP base64 data URL (at most 2 MiB decoded)');
  }
  const comma = imageData.indexOf(',');
  const payload = imageData.slice(comma + 1);
  const mimeType = imageData.slice(5, imageData.indexOf(';'));
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const byteLength = (payload.length / 4) * 3 - padding;
  if (!Number.isInteger(byteLength) || byteLength > MAX_IMAGE_BYTES) {
    throw new RangeError('Uploaded background must be at most 2 MiB decoded');
  }
  const validMagic = mimeType === 'image/png'
    ? byteLength >= 33 && hasBytes(payload, 0, [137, 80, 78, 71, 13, 10, 26, 10])
    : mimeType === 'image/jpeg'
      ? byteLength >= 4 && hasBytes(payload, 0, [255, 216, 255])
      : mimeType === 'image/webp' && byteLength >= 20
        && hasBytes(payload, 0, [82, 73, 70, 70])
        && hasBytes(payload, 8, [87, 69, 66, 80]);
  if (!validMagic) throw new TypeError('Uploaded background MIME type does not match its file signature');
  return { mimeType, byteLength };
}

/**
 * Resolve defaults and strictly validate a complete appearance state.
 * `partial: true` validates and normalizes only supplied patch fields; merge it
 * with a current state and call again without `partial` before committing.
 */
export function validateState(input, { partial = false } = {}) {
  ownRecord(input, 'Appearance state');
  if (typeof partial !== 'boolean') throw new TypeError('partial must be a boolean');
  const state = partial ? {} : { ...DEFAULTS };
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(DEFAULTS, key)) throw new TypeError(`Unknown appearance field: ${key}`);
    const value = input[key];
    if (key === 'preset') state.preset = inEnum(value, PRESETS, key);
    else if (key === 'mode') state.mode = inEnum(value, MODES, key);
    else if (key === 'background') state.background = inEnum(value, BACKGROUNDS, key);
    else if (key === 'fade') {
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        throw new RangeError('fade must be an integer from 0 to 100');
      }
      state.fade = value;
    } else if (key === 'accent') {
      if (typeof value !== 'string' || (value.length !== 0 && value.length !== 7) || !/^(?:|#[0-9A-Fa-f]{6})$/.test(value)) {
        throw new TypeError('accent must be empty or a #RRGGBB color');
      }
      state.accent = value.toUpperCase();
    } else {
      imageInfo(value);
      state.imageData = value;
    }
  }
  if (state.background === 'upload' && (!partial || Object.hasOwn(state, 'imageData')) && !state.imageData) {
    throw new TypeError('An uploaded background requires valid imageData');
  }
  return state;
}

/** A bounded public/tool view; uploaded image contents never enter the result. */
export function summary(input) {
  const state = validateState(input);
  return {
    preset: state.preset,
    mode: state.mode,
    accent: state.accent,
    background: state.background,
    fade: state.fade,
    image: imageInfo(state.imageData),
  };
}

function freezePalette(light, dark) {
  return Object.freeze({ light: Object.freeze(light), dark: Object.freeze(dark) });
}

/** Neutral base colors for explicit light/dark/system appearance choices. */
export const BASE_PALETTE = freezePalette({
  base: '#FFFFFF', sidebar: '#F5F5F5', surface: '#FFFFFF', nested: '#F0F0F0',
  border: '#E5E5E5', text: '#252525', secondary: '#8A8A8A', accent: '#4D6BFE',
}, {
  base: '#1B1B1B', sidebar: '#202020', surface: '#2B2B2B', nested: '#333333',
  border: '#3D3D3D', text: '#ECECEC', secondary: '#A0A0A0', accent: '#8094FF',
});

export const PALETTES = Object.freeze({
  forest: freezePalette({
    base: '#F5F8F5', sidebar: '#E5EDE6', surface: '#FFFFFF', nested: '#D3E2D1',
    border: '#CAD9CD', text: '#293D33', secondary: '#586D60', accent: '#3D8057',
  }, {
    base: '#151D19', sidebar: '#1B2921', surface: '#202E26', nested: '#27372D',
    border: '#384C40', text: '#E6EEE8', secondary: '#A6B6AB', accent: '#76B891',
  }),
  sea: freezePalette({
    base: '#F4F8FB', sidebar: '#E5EEF5', surface: '#FBFDFE', nested: '#EDF3F8',
    border: '#D2E1EB', text: '#233846', secondary: '#5C7485', accent: '#316F96',
  }, {
    base: '#151D24', sidebar: '#1A2833', surface: '#202F3B', nested: '#283A47',
    border: '#3B5060', text: '#E5EDF4', secondary: '#A7BAC9', accent: '#7EB5DC',
  }),
  sand: freezePalette({
    base: '#FBF8F2', sidebar: '#F1E8D9', surface: '#FFFDF9', nested: '#F5EEDF',
    border: '#E5D7C4', text: '#40362A', secondary: '#7B6A56', accent: '#95653F',
  }, {
    base: '#231D18', sidebar: '#2C241D', surface: '#332A22', nested: '#3E3228',
    border: '#584636', text: '#F2E8DA', secondary: '#C2AE98', accent: '#DBAA78',
  }),
});

// Baseline names come from Theme Inspect. Additional color consumers are
// confirmed in DSH 0.2.1-rc.5 and its matching public ui-primitives package:
// SegmentedTabs/Tag/settings fields (layer-3), Markdown inline code and code
// banners, Pill/calendar selections, Button pressed/toolbar fills and Input
// placeholders. Explicit modes must not leave these neutral paints native-dark.
// Status/diff/syntax colors, native preferences and typography stay untouched.
const COLOR_TOKEN_FIELDS = Object.freeze({
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
});

/** Supply only color values; never fonts, dimensions, spacing, or layout. */
export function buildTokenOverrides(input) {
  const state = validateState(input);
  const overrides = {};
  const palette = state.preset === 'original'
    ? (state.mode === 'inherit' ? null : BASE_PALETTE)
    : PALETTES[state.preset];
  if (palette) {
    for (const [token, field] of Object.entries(COLOR_TOKEN_FIELDS)) {
      overrides[token] = { light: palette.light[field], dark: palette.dark[field] };
    }
    // label-primary-foreground also inks fixed semantic StateDot steps. Keep it
    // and the native primary-button hover pair out of the global neutral layer;
    // backgrounds.js isolates the actual-accent ink to owned plugin switches.
    // Switch(off) has its own neutral thumb. Retain the native light raised /
    // dark muted distinction, rather than pairing two near-identical surfaces.
    overrides['--dsw-alias-switch-thumb'] = { light: palette.light.surface, dark: palette.dark.secondary };
  }
  if (state.accent) {
    overrides['--dsw-alias-brand-primary'] = { light: state.accent, dark: state.accent };
  }
  return overrides;
}

/** Resolve base or preset colors without changing DSH's native preference. */
export function resolveTokenModes(input, systemDark = false) {
  const state = validateState(input);
  if (typeof systemDark !== 'boolean') throw new TypeError('systemDark must be a boolean');
  const overrides = buildTokenOverrides(state);
  if (state.mode === 'inherit') return overrides;
  const mode = state.mode === 'system' ? (systemDark ? 'dark' : 'light') : state.mode;
  return Object.fromEntries(Object.entries(overrides).map(([token, values]) => [
    token, { light: values[mode], dark: values[mode] },
  ]));
}
