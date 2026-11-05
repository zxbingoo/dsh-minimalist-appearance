import { imageInfo, buildTokenOverrides, BASE_PALETTE, resolveTokenModes } from './core.js';

// Package-owned landscape artwork. Forest uses the watercolor raster bundled
// by build.mjs; the alternative vector landscapes stay local too. No requests.
export const BACKGROUND_ART = Object.freeze({
  sea: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#c9dfe8"/><stop offset="1" stop-color="#eff4ef"/></linearGradient><linearGradient id="water" x2="0" y2="1"><stop stop-color="#9fc8cf"/><stop offset="1" stop-color="#528fa7"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h1600v1000H0z"/><circle cx="1120" cy="260" r="100" fill="#f8f1da" opacity=".75"/><path d="M0 530 170 400l240 160 240-170 300 190 330-200 320 130v490H0Z" fill="#a5c4cb"/><path d="M0 590q390-25 800 0t800-10v420H0Z" fill="url(#water)"/><g fill="none" stroke="#edf5ee" stroke-width="4" opacity=".45"><path d="M280 660q200-20 420 0t420 0"/><path d="M700 740q300-20 720 0"/><path d="M80 810q250-20 570 0"/><path d="M660 910q310-20 660 0"/></g><path d="M0 650q110 110 180 350H0Z" fill="#648b84"/><path d="M0 810q200 65 380 190H0Z" fill="#376961"/><path d="M1600 760q-110 90-180 240h180Z" fill="#476e73"/></svg>`,
  sand: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#eadbc9"/><stop offset="1" stop-color="#faf1df"/></linearGradient><linearGradient id="dune" x2=".6" y2="1"><stop stop-color="#e3c69d"/><stop offset="1" stop-color="#c79d72"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h1600v1000H0z"/><circle cx="1100" cy="260" r="105" fill="#fff6d7" opacity=".85"/><path d="M0 680q250-220 520-80t530-60 550 80v380H0Z" fill="#e8d4b4"/><path d="M0 780q380-270 760-50t840-150v420H0Z" fill="url(#dune)"/><path d="M0 960q360-390 850-90t750-35v165H0Z" fill="#c79e76"/><path d="M0 960q350-390 850-90" fill="none" stroke="#f5dfba" stroke-width="4" opacity=".65"/><g fill="none" stroke="#8e8862" stroke-width="5" stroke-linecap="round" opacity=".7"><path d="m150 1000-12-135m12 135-48-85m48 85 39-105"/><path d="m1450 1000 15-150m-15 150-40-95m40 95 48-63"/></g></svg>`,
});

export function backgroundUrl(state, assets = {}) {
  if (!state || state.background === 'none') return '';
  if (state.background === 'forest') {
    // Trusted package artwork, not a persisted upload: it can exceed the user
    // upload limit. Still enforce a bounded, raster-only URL at this boundary.
    const url = assets.breeze;
    return typeof url === 'string' && url.length <= 8 * 1024 * 1024
      && /^data:image\/png;base64,iVBORw0KGg[opqr][A-Za-z0-9+/]*={0,2}$(?![\s\S])/.test(url)
      && url.slice(url.indexOf(',') + 1).length % 4 === 0 ? url : '';
  }
  if (state.background === 'upload') {
    try { return imageInfo(state.imageData) ? state.imageData : ''; } catch { return ''; }
  }
  const art = BACKGROUND_ART[state.background];
  return art ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art)}` : '';
}

// Only literal colors may share a declaration with a large raster URL. Blink
// limits a declaration needing var()/env()/attr() substitution to 2 MiB; the
// bundled watercolor alone is almost 3 MiB when base64-encoded. Keep theme
// variables on the small, separate color declarations instead. No Blob URLs,
// new CSP requirements, image re-encoding or persistent config changes needed.
function literalColor(input) {
  if (typeof input !== 'string' || input.length > 256) return '';
  const value = input.trim();
  if (/^(?:currentcolor|inherit|initial|unset|revert|revert-layer)$/i.test(value)) return '';
  return /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|[a-z]+|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([-+a-z\d.,%/\s]+\))$/i.test(value) ? value : '';
}

/** Read the same palette as the token layer, without leaving CSS substitution. */
export function resolveBackgroundBase(state, { nativeDark = false, systemDark = nativeDark, nativeBase = '' } = {}) {
  if (typeof nativeDark !== 'boolean') throw new TypeError('nativeDark must be a boolean');
  const mode = nativeDark ? 'dark' : 'light';
  const override = resolveTokenModes(state, systemDark)['--dsw-alias-bg-base']?.[mode];
  return literalColor(override) || literalColor(nativeBase) || BASE_PALETTE[mode].base;
}

// Only background paint properties: no layout, typography, pseudo-elements or DOM edits.
// Input is a validated state. JSON string escaping is also CSS-string escaping for
// our allowlisted data URLs (built-in SVG is percent-encoded; uploads are base64).
export function backgroundImage(state, assets = {}, environment = {}) {
  const url = backgroundUrl(state, assets);
  if (!url) return 'none';
  const fade = Number.isInteger(state.fade) ? Math.max(0, Math.min(100, state.fade)) : 80;
  const base = resolveBackgroundBase(state, environment);
  const veil = `color-mix(in srgb, ${base} ${fade}%, transparent)`;
  return `linear-gradient(${veil}, ${veil}), url(${JSON.stringify(url)})`;
}

/** Shared by the real conversation paint and the background sample. */
export function backgroundStyle(state, assets = {}, environment = {}) {
  return {
    backgroundImage: backgroundImage(state, assets, environment),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}

export function buildBackgroundCss(state, assets = {}, environment = {}) {
  if (!state || !backgroundUrl(state, assets)) return '';
  const paint = backgroundStyle(state, assets, environment);
  // ConversationMainPanel owns this full-height frame (header + content +
  // sticky composer). Paint once there, not on the transcript's body alone.
  // The attribute/descendant relation survives Factory/Slot display-contents
  // anchors; no hashed class, replacement shell, dimensions or DOM writes.
  const frame = 'div[data-phase]:has([data-conversation-content])';
  return `${frame} {\n  background-image: ${paint.backgroundImage} !important;\n  background-size: ${paint.backgroundSize};\n  background-position: ${paint.backgroundPosition};\n  background-repeat: ${paint.backgroundRepeat};\n}\n${frame} [data-conversation-content],\n${frame} [data-conversation-scroll],\n${frame} [data-composer-seat] {\n  background-color: transparent !important;\n  background-image: none !important;\n}`;
}

/** Rebind only source-confirmed local fills that bypass the native aliases. */
export function buildComponentCss(state) {
  if (!state || !Object.hasOwn(buildTokenOverrides(state), '--dsw-alias-bg-layer-1')) return '';
  // DSH 0.2.1-rc.5 ChangedFiles and Deliverables hard-code static neutrals
  // in local variables selected by the native body dark attribute. Our mode
  // must follow the effective token palette instead. Override only these
  // documented paint consumers, never the static palette, diff or status colors.
  // InputBar's add/attachment command button uses selector and hover-solid
  // fills with label-primary. Rebind them only within the existing composer;
  // leave its icon, disabled opacity, focus treatment and interactions native.
  // The bundled BrandWordmark has a currentColor badge rectangle; its paths
  // read label-primary-inverted. The defs id identifies only this SVG, so pair
  // its inverse ink with our effective base without changing other labels.
  // ChatView's return-to-bottom button reads floating-fill/hover from the
  // native body scheme, unlike its already-aliased arrow and elevation stroke.
  // Rebind just those two paints inside the conversation content boundary;
  // keep its native selector, shadow, focus, visibility and scroll handler.
  // Composer model/effort, permission and trigger popups, plus header "Open
  // In..." menus, share MenuSurface (including body-portaled submenus).
  // Its material child reads menu-surface-fill, not specific-menu, and several
  // owners portal the surface outside the composer. Rebind only the stable
  // material boundary so the native rows, hover, checks, border and text keep
  // consuming the effective aliases. Keep pinned group headers 94% opaque.
  // The macOS backing already uses bg-base; do not touch its anchor or blur.
  // Bounded !important wins at the local declaration regardless of CSS order.
  return `body [data-changed-files] {\n  --changes-fill: var(--dsw-alias-bg-layer-1) !important;\n  --changes-hover: var(--dsw-alias-interactive-bg-hover) !important;\n}\nbody [data-presented-file] {\n  --deliverable-fill: var(--dsw-alias-bg-layer-1) !important;\n  --deliverable-hover: var(--dsw-alias-interactive-bg-hover) !important;\n}\nbody [data-composer-card] {\n  --dsw-specific-selector: var(--dsw-alias-bg-base) !important;\n  --dsw-alias-interactive-bg-hover-solid: var(--dsw-alias-interactive-bg-hover) !important;\n}\nbody svg:has(#dsh-wordmark-badge-clip) {\n  --dsw-alias-label-primary-inverted: var(--dsw-alias-bg-base) !important;\n}\nbody [data-conversation-content] {\n  --dsw-alias-button-floating-fill: var(--dsw-alias-bg-layer-1) !important;\n  --dsw-alias-button-floating-hover: var(--dsw-alias-interactive-bg-hover) !important;\n}\nbody [data-menu-material] {\n  --dsw-menu-surface-fill: var(--dsw-alias-bg-overlay) !important;\n  --dsw-alias-menu-icon: var(--dsw-alias-label-primary) !important;\n  --dsw-alias-menu-group-header-fill: color-mix(in srgb, var(--dsw-alias-bg-overlay) 94%, transparent) !important;\n}`;
}

export function buildChromeCss(state) {
  if (!state || !Object.hasOwn(buildTokenOverrides(state), '--dsw-specific-sidebar-fill')) return '';
  // DSH 0.2.1-rc.5 AppFrame: the first element is the sidebar column and a
  // direct [data-shell-overlay] child identifies the frame. macOS otherwise
  // mixes this token at 40% opacity over native vibrancy. Paint it opaquely;
  // do not touch the window, sidebar registration, geometry or native theme.
  return `html[data-platform="darwin"] div:has(> [data-shell-overlay]) > div:first-child {\n  background: var(--dsw-specific-sidebar-fill) !important;\n}`;
}
