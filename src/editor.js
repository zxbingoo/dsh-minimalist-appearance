import { DEFAULTS, validateState } from '../core.js';

// Preset-only editor. Keep the existing breeze/forest storage identifiers;
// only its localized display name changes to Green. Legacy data stays readable.
export const THEME_CHOICES = Object.freeze([
  { id: 'light', preset: 'original', mode: 'light', background: 'none', fade: 80 },
  { id: 'dark', preset: 'original', mode: 'dark', background: 'none', fade: 80 },
  { id: 'system', preset: 'original', mode: 'system', background: 'none', fade: 80 },
  { id: 'breeze', preset: 'forest', mode: 'light', background: 'forest', fade: 0 },
  { id: 'sea', preset: 'sea', mode: 'light', background: 'sea', fade: 10 },
  { id: 'sand', preset: 'sand', mode: 'light', background: 'sand', fade: 10 },
  { id: 'original', preset: 'original', mode: 'inherit', background: 'none', fade: 80 },
].map(Object.freeze));

export function themeChoiceId(state) {
  if (!state || state.accent !== '') return '';
  return THEME_CHOICES.find((choice) => ['preset', 'mode', 'background', 'fade']
    .every((field) => choice[field] === state[field]))?.id ?? '';
}

export function chooseTheme(current, id) {
  const choice = THEME_CHOICES.find((entry) => entry.id === id);
  if (!choice) throw new TypeError('Unknown theme choice');
  const { id: _id, ...patch } = choice;
  return validateState({ ...current, ...patch, accent: '' });
}

// Shared by the page and its focused tests. This module has no runtime services.
export function sameAppearance(a, b) {
  return !!a && !!b && Object.keys(DEFAULTS).every((field) => a[field] === b[field]);
}

export function decodeSaved(value) {
  try {
    return { state: validateState(value), invalid: false };
  } catch {
    // A generic settings editor may have staged upload without a file. Keep
    // valid fields editable but never feed an invalid URL to a style or image.
    const safe = { ...DEFAULTS };
    for (const field of Object.keys(DEFAULTS)) {
      if (!value || !Object.hasOwn(value, field)) continue;
      try { Object.assign(safe, validateState({ [field]: value[field] }, { partial: true })); } catch {}
    }
    if (safe.background === 'upload' && !safe.imageData) safe.background = 'none';
    return { state: safe, invalid: true };
  }
}

export function appearanceOps(input) {
  const state = validateState(input);
  return Object.entries(state).map(([field, value]) => ({ op: 'set', path: [field], value }));
}
