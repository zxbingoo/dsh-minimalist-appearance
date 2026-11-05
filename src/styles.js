// All geometry is confined to the Appearance page and its static illustrations.
export const PAGE_CSS = `
.dsha-panel { box-sizing: border-box; flex: 1 1 0; align-self: stretch; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: auto; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); padding: max(36px, var(--dsh-frame-top-clearance, 0px)) 24px 32px; container-type: inline-size; }
.dsha-panel button, .dsha-live-notice button { font: inherit; }
.dsha-content { box-sizing: border-box; width: 100%; max-width: 900px; margin: 0 auto; }
.dsha-stage { box-sizing: border-box; position: relative; width: 100%; aspect-ratio: 2 / 1; overflow: hidden; border-radius: 12px; background: linear-gradient(130deg, var(--dsw-alias-bg-layer-2), var(--dsw-specific-sidebar-fill)); color: var(--dsw-alias-label-primary); container-type: inline-size; }
.dsha-stage-badge { position: absolute; top: 10px; right: 10px; z-index: 1; padding: 3px 8px; border-radius: 99px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 38%, transparent); color: var(--dsw-alias-bg-base); font-size: 11px; line-height: 1.3; }
.dsha-sample-window { box-sizing: border-box; display: grid; grid-template-columns: 18% minmax(0, 1fr); position: absolute; width: 77%; height: 86%; left: 11.5%; bottom: -1px; overflow: hidden; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px 9px 0 0; background: var(--dsw-alias-bg-base); box-shadow: 0 6px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); pointer-events: none; user-select: none; }
.dsha-sample-rail { box-sizing: border-box; display: flex; flex-direction: column; gap: .7cqw; padding: 1.1cqw .9cqw; min-width: 0; overflow: hidden; background: var(--dsw-specific-sidebar-fill); }
.dsha-sample-dots { display: flex; gap: .35cqw; margin-bottom: .7cqw; }
.dsha-sample-dots > span { display: block; width: .55cqw; height: .55cqw; border-radius: 50%; background: var(--dsw-alias-label-secondary); opacity: .6; }
.dsha-sample-brand { display: block; margin-bottom: .7cqw; font-size: 1.3cqw; font-weight: 600; }
.dsha-sample-nav { display: flex; align-items: center; gap: .7cqw; height: 2.2cqw; padding: 0 .5cqw; border-radius: 3px; flex: none; }
.dsha-sample-nav[data-current="true"] { background: var(--dsw-alias-bg-layer-2); }
.dsha-sample-nav > span:first-child { box-sizing: border-box; width: .8cqw; height: .8cqw; border: 1px solid var(--dsw-alias-label-secondary); border-radius: 2px; flex: none; }
.dsha-sample-line { display: block; height: .5cqw; width: 66%; border-radius: 99px; background: var(--dsw-alias-label-secondary); opacity: .26; }
.dsha-sample-divider { display: block; height: 1px; background: var(--dsw-alias-border-l1); margin: .8cqw 0; flex: none; }
.dsha-sample-history { display: flex; align-items: center; height: 2cqw; padding-left: .5cqw; flex: none; }
.dsha-sample-history:nth-last-child(even) .dsha-sample-line { width: 85%; }
.dsha-sample-main { display: block; min-width: 0; overflow: hidden; }
.dsha-sample-body { display: flex; flex-direction: column; align-items: center; width: 80%; margin: 15% auto 0; }
.dsha-sample-greeting { font-size: clamp(9px, 1.6cqw, 15px); font-weight: 600; line-height: 1.5; white-space: nowrap; }
.dsha-sample-tagline { margin-top: 1%; font-size: clamp(6px, .9cqw, 9px); color: var(--dsw-alias-brand-primary); line-height: 1.5; }
.dsha-sample-chips { display: flex; gap: .8cqw; width: 90%; margin-top: 6%; }
.dsha-sample-chips > span { display: block; flex: 1; height: 1.4cqw; border: 1px solid var(--dsw-alias-border-l1); border-radius: 99px; background: var(--dsw-alias-bg-layer-1); }
.dsha-sample-input { box-sizing: border-box; position: relative; display: block; width: 100%; height: 10cqw; margin-top: 2.5%; border: 1px solid var(--dsw-alias-border-l1); border-radius: 1cqw; background: var(--dsw-specific-input-major); box-shadow: 0 2px 8px color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent); }
.dsha-sample-placeholder { display: block; padding: 1.2cqw; color: var(--dsw-alias-label-secondary); font-size: .9cqw; }
.dsha-sample-input-tools { position: absolute; bottom: .8cqw; left: 1.2cqw; right: .8cqw; display: flex; justify-content: space-between; align-items: center; color: var(--dsw-alias-label-secondary); font-size: 1.6cqw; }
.dsha-sample-send { display: grid; place-items: center; width: 2cqw; height: 2cqw; border-radius: 50%; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }
.dsha-sample-send svg { width: 1.4cqw; height: 1.4cqw; }
.dsha-gallery { margin: 24px 0 0; padding: 0; border: 0; min-width: 0; }
.dsha-gallery-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 20px; margin-bottom: 14px; }
.dsha-panel .dsha-gallery-title { margin: 0; font-size: 14px; font-weight: 600; line-height: 1.4; }
.dsha-gallery-status { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dsha-theme-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px 8px; }
.dsha-panel .dsha-theme-card { box-sizing: border-box; min-width: 0; display: flex; flex-direction: column; gap: 7px; padding: 3px; border: 0; border-radius: 12px; background: transparent; color: var(--dsw-alias-label-secondary); text-align: center; cursor: pointer; }
.dsha-theme-thumb { display: block; box-sizing: border-box; width: 100%; aspect-ratio: 3 / 2; overflow: hidden; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; }
.dsha-theme-card:hover:not(:disabled) .dsha-theme-thumb { border-color: var(--dsw-alias-label-secondary); }
.dsha-theme-card[data-selected="true"] .dsha-theme-thumb { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 2px; }
.dsha-theme-card[data-selected="true"] .dsha-card-name { color: var(--dsw-alias-label-primary); }
.dsha-card-name { display: block; font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.dsha-material-preview { position: relative; box-sizing: border-box; display: block; width: 100%; aspect-ratio: 3 / 2; overflow: hidden; }
.dsha-thumb-window { box-sizing: border-box; position: absolute; width: 78%; height: 84%; left: 11%; bottom: -8%; display: grid; grid-template-columns: 23% minmax(0, 1fr); overflow: hidden; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px 7px 0 0; background: var(--dsw-alias-bg-layer-1); }
.dsha-thumb-rail { display: block; margin: 4px 2px 0 3px; border-radius: 4px 4px 0 0; background: var(--dsw-alias-bg-layer-2); }
.dsha-thumb-content { display: flex; flex-direction: column; align-items: center; gap: 8%; padding-top: 13%; }
.dsha-thumb-content > .dsha-sample-line { height: 4%; width: 58%; background: var(--dsw-alias-label-secondary); opacity: .25; }
.dsha-thumb-content > .dsha-sample-line:nth-last-child(2) { width: 75%; }
.dsha-thumb-block { display: block; width: 85%; height: 26%; border-radius: 3px; background: var(--dsw-alias-bg-layer-2); }
.dsha-mode-split { display: grid; width: 100%; height: 100%; grid-template-columns: 1fr 1fr; }
.dsha-mode-half { position: relative; display: block; overflow: hidden; }
.dsha-mode-half .dsha-thumb-window { width: 156%; left: 22%; }
.dsha-mode-half:last-child .dsha-thumb-window { left: -78%; }
.dsha-messages { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dsha-panel .dsha-messages p { margin: 0; }
.dsha-messages:empty { display: none; }
.dsha-error { color: var(--dsw-alias-state-error-primary); }
.dsha-notice { color: var(--dsw-alias-state-warn-primary); }
.dsha-button { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; padding: 7px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); cursor: pointer; white-space: nowrap; }
.dsha-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsha-link { padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dsha-link:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dsha-panel button:disabled, .dsha-live-notice button:disabled { opacity: .5; cursor: not-allowed; }
.dsha-panel button:focus-visible, .dsha-live-notice button:focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 3px; }
.dsha-live-notice { box-sizing: border-box; position: absolute; right: 16px; top: max(12px, var(--dsh-frame-overlay-top, 12px)); max-width: min(680px, calc(100% - 32px)); display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); pointer-events: auto; font: inherit; }
@container (max-width: 520px) { .dsha-theme-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@container (max-width: 320px) { .dsha-theme-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 540px) { .dsha-panel { padding: max(24px, var(--dsh-frame-top-clearance, 0px)) 16px 24px; } }
`;
