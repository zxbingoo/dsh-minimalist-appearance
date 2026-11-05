import { resolveTokenModes } from '../core.js';
import { backgroundStyle } from '../backgrounds.js';

/** The exact shared paint; large raster declarations never contain variables. */
export function themePreviewPaint(state, assets = {}, environment = {}) {
  const { nativeDark = false, systemDark = nativeDark } = environment;
  const pairs = resolveTokenModes(state, systemDark);
  return {
    ...Object.fromEntries(Object.entries(pairs).map(([name, modes]) => [name, modes[nativeDark ? 'dark' : 'light']])),
    ...backgroundStyle(state, assets, environment),
    backgroundColor: 'var(--dsw-alias-bg-base)',
    color: 'var(--dsw-alias-label-primary)',
  };
}

/** Setting-page illustrations only: no live Session, controls or slot renderer. */
export function createThemePreview(React) {
  const h = React.createElement;
  const line = (key, className = '') => h('span', { key, className: `dsha-sample-line ${className}`.trim() });
  function thumbnailWindow() {
    return h('span', { className: 'dsha-thumb-window', 'aria-hidden': true },
      h('span', { className: 'dsha-thumb-rail' }),
      h('span', { className: 'dsha-thumb-content' }, line('title'), h('span', { className: 'dsha-thumb-block' }), line('one'), line('two')));
  }
  function sampleWindow(paint, t) {
    return h('span', { className: 'dsha-sample-window', 'aria-hidden': true },
      h('span', { className: 'dsha-sample-rail' },
        h('span', { className: 'dsha-sample-dots' }, ...[0, 1, 2].map((key) => h('span', { key }))),
        h('span', { className: 'dsha-sample-brand' }, 'DeepSeek'),
        ...Array.from({ length: 5 }, (_, key) => h('span', { key, className: 'dsha-sample-nav', 'data-current': key === 0 }, h('span'), line(key))),
        h('span', { className: 'dsha-sample-divider' }),
        ...Array.from({ length: 5 }, (_, key) => h('span', { key: `history-${key}`, className: 'dsha-sample-history' }, line(key)))),
      h('span', { className: 'dsha-sample-main', style: paint },
        h('span', { className: 'dsha-sample-body' },
          h('span', { className: 'dsha-sample-greeting' }, 'DeepSeek Harness'),
          h('span', { className: 'dsha-sample-tagline' }, t('previewGreeting')),
          h('span', { className: 'dsha-sample-chips' }, ...[0, 1, 2, 3].map((key) => h('span', { key }))),
          h('span', { className: 'dsha-sample-input' },
            h('span', { className: 'dsha-sample-placeholder' }, t('previewPlaceholder')),
            h('span', { className: 'dsha-sample-input-tools' }, h('span', null, '+'),
              h('span', { className: 'dsha-sample-send' }, h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }, h('path', { d: 'M8 12V4m-3 3 3-3 3 3' }))))))));
  }
  return function ThemePreview({ state, assets = {}, t, nativeDark = false, systemDark = nativeDark, nativeBase = '', nativeTokens = {}, variant = 'thumbnail', badge = '' }) {
    const environment = { nativeDark, systemDark, nativeBase };
    // Registry colors (with neutral built-in fallbacks) come from the page,
    // not the current override. This remains an illustration, not a live view.
    const paint = { ...nativeTokens, ...themePreviewPaint(state, assets, environment) };
    if (variant === 'stage') {
      const palette = Object.fromEntries(Object.entries(paint).filter(([key]) => key.startsWith('--')));
      return h('div', { className: 'dsha-stage', style: palette, role: 'img', 'aria-label': t('previewIllustration'), title: t('previewIllustration') },
        h('span', { className: 'dsha-stage-badge' }, badge), sampleWindow(paint, t));
    }
    const split = state.preset === 'original' && state.mode === 'system' && state.background === 'none';
    return h('span', { className: 'dsha-material-preview', style: paint, role: 'img', 'aria-label': t('preview') },
      split ? h('span', { className: 'dsha-mode-split' }, ...['light', 'dark'].map((mode) =>
        h('span', { key: mode, className: 'dsha-mode-half', style: { ...nativeTokens, ...themePreviewPaint({ ...state, mode }, assets, environment) } }, thumbnailWindow())))
        : state.background === 'none' ? thumbnailWindow() : null);
  };
}
