import { NS, DEFAULTS, validateState, resolveTokenModes } from '../core.js';
import { buildBackgroundCss, buildChromeCss, buildComponentCss } from '../backgrounds.js';
import { sameAppearance, decodeSaved, THEME_CHOICES, themeChoiceId, chooseTheme } from './editor.js';
import { PAGE_CSS } from './styles.js';
import { createThemePreview } from './preview.js';
import { createAppearanceEditor, currentPreview } from './live-preview.js';

// The build supplies host React, bilingual strings and package-owned artwork.
export function createAppearancePlugin(React, dictionaries, assets = {}) {
  const h = React.createElement;
  const ThemePreview = createThemePreview(React);
  function PaletteIcon({ size = 20 }) {
    return h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true },
      h('path', { d: 'M12 3a9 9 0 1 0 0 18h1.1a2.4 2.4 0 0 0 1.8-4c-.6-.7-.1-1.8.8-1.8H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3Z' }),
      ...[[7.5, 10], [10, 6.8], [14.2, 6.8], [17.3, 10]].map(([cx, cy]) => h('circle', { key: cx, cx, cy, r: 1, fill: 'currentColor', stroke: 'none' })));
  }
  function useSystemDark() {
    const query = React.useMemo(() => window.matchMedia?.('(prefers-color-scheme: dark)'), []);
    const [dark, setDark] = React.useState(() => !!query?.matches);
    React.useEffect(() => {
      if (!query) return;
      const change = () => setDark(query.matches);
      query.addEventListener('change', change);
      change();
      return () => query.removeEventListener('change', change);
    }, [query]);
    return dark;
  }
  return {
    inject: ['slots', 'theme', 'locale', 'layout', 'configForms', 'connection'],
    apply(ctx) {
      for (const [locale, dict] of Object.entries(dictionaries)) ctx.effect(() => ctx.locale.register(NS, locale, dict));
      const translate = ctx.locale.bind(NS);
      const form = ctx.configForms.get(NS); // Provider-owned; never dispose it here.
      const subscribeForm = (listener) => form.subscribe(listener);
      const readForm = () => form.getSnapshot();
      const subscribeLocale = (listener) => ctx.locale.subscribe(listener);
      const readLocale = () => ctx.locale.getSnapshot();
      const subscribeTheme = (listener) => ctx.on('theme/change', listener);
      const readTheme = () => ctx.theme.getTheme();
      const subscribeConnection = (listener) => ctx.connection.state.subscribe(listener);
      const readConnection = () => ctx.connection.state.getSnapshot();
      const useConnected = () => React.useSyncExternalStore(subscribeConnection, readConnection) === 'connected';
      const useForm = () => React.useSyncExternalStore(subscribeForm, readForm);
      const editor = createAppearanceEditor();
      const useEditor = () => React.useSyncExternalStore(editor.subscribe, editor.getSnapshot);
      // Draft and in-flight save survive page navigation. This subscription only
      // consumes the provider's shared mirror; it creates no second RPC reader.
      ctx.effect(() => {
        const sync = () => editor.sync(form.getSnapshot());
        const unsubscribe = form.subscribe(sync);
        sync();
        return () => { unsubscribe(); editor.clear(); };
      });
      // The settings mirror retains accepted values while offline, so its
      // ready status is not a transport signal. Stop only temporary paint.
      ctx.effect(() => {
        const syncConnection = () => { if (readConnection() !== 'connected') editor.stopPreview(); };
        const unsubscribe = subscribeConnection(syncConnection);
        syncConnection();
        return unsubscribe;
      });
      function useText() {
        React.useSyncExternalStore(subscribeLocale, readLocale);
        return (key, values = {}) => translate(key).replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
      }
      function backToConversation() {
        editor.stopPreview();
        ctx.layout.selectPanel(null);
      }
      function backToAppearance() {
        editor.stopPreview();
        ctx.layout.selectPanel(NS);
      }
      function VisualLayer({ usePanelInfo }) {
        const t = useText();
        const snapshot = useForm();
        const theme = React.useSyncExternalStore(subscribeTheme, readTheme);
        const draft = useEditor();
        const activePanelId = usePanelInfo((info) => info.activePanelId);
        const connected = useConnected();
        const preview = connected && activePanelId === null ? currentPreview(draft, snapshot) : null;
        const dark = useSystemDark();
        const state = React.useMemo(() => {
          if (snapshot.status !== 'ready') return null;
          if (preview) return preview.value;
          try { return validateState(snapshot.value); } catch { return null; }
        }, [snapshot.status, snapshot.value, preview]);
        React.useEffect(() => {
          if (draft?.previewing && (!connected || !currentPreview(draft, snapshot) || activePanelId !== null)) editor.stopPreview();
        }, [draft, snapshot, activePanelId, connected]);
        React.useEffect(() => {
          if (!state) return;
          const tokens = resolveTokenModes(state, dark);
          if (!Object.keys(tokens).length) return;
          return ctx.theme.overrideTokens(NS, tokens);
        }, [state, dark]);
        const nativeDark = theme.active.colorScheme === 'dark';
        const nativeBase = theme.active.tokens['--dsw-alias-bg-base'];
        const css = React.useMemo(() => state ? [
          buildBackgroundCss(state, assets, { nativeDark, systemDark: dark, nativeBase }), buildChromeCss(state), buildComponentCss(state),
        ].filter(Boolean).join('\n') : '', [state, nativeDark, dark, nativeBase]);
        return h(React.Fragment, null,
          css && h('style', { 'data-dsha-background': '', 'data-dsha-version': '0.2.14' }, css),
          preview && h(React.Fragment, null,
            h('style', null, PAGE_CSS),
            h('aside', { className: 'dsha-live-notice', 'aria-label': t('livePreviewTitle') },
              h('span', { role: 'status' }, t('livePreviewNotice', { theme: t(`theme.${themeChoiceId(preview.value)}`) })),
              h('button', { type: 'button', className: 'dsha-button', onClick: backToAppearance }, t('returnToEdit')),
              h('button', { type: 'button', className: 'dsha-link', onClick: editor.stopPreview }, t('cancelPreview')))));
      }
      function AppearancePage() {
        const t = useText();
        const snapshot = useForm();
        const draft = useEditor();
        const theme = React.useSyncExternalStore(subscribeTheme, readTheme);
        const systemDark = useSystemDark();
        const connected = useConnected();
        const ids = React.useId();
        const saved = React.useMemo(() => decodeSaved(snapshot.value), [snapshot.value]);
        const ready = snapshot.status === 'ready' && !!draft;
        const busy = !!draft?.busy;
        const dirty = !!draft && !sameAppearance(draft.value, draft.base);
        const conflict = ready && draft.revision !== snapshot.revision;
        const selected = draft ? themeChoiceId(draft.value) : '';
        const state = draft?.value ?? saved.state;
        const nativeDark = theme.active.colorScheme === 'dark';
        const nativeTokens = React.useMemo(() => {
          const mode = nativeDark ? 'dark' : 'light';
          const neutral = resolveTokenModes({ ...DEFAULTS, mode }, systemDark);
          const definition = theme.themes.find((entry) => entry.id === theme.preference)
            ?? theme.themes.find((entry) => entry.id === mode);
          // Registry colors are unmodified by our active token layer. Built-in
          // themes may carry colors only in CSS, so use neutral sample fallbacks.
          return { ...Object.fromEntries(Object.entries(neutral).map(([name, pair]) => [name, pair[mode]])), ...definition?.tokens };
        }, [theme.themes, theme.preference, nativeDark, systemDark]);
        const nativeBase = nativeTokens['--dsw-alias-bg-base'];
        const localOnly = dirty || draft?.invalid || draft?.notice === 'saveError';
        const badge = t(!ready ? 'loadingShort' : busy ? 'saving' : localOnly ? 'localPreview' : 'persistentBadge');
        const status = !ready ? t('loadingShort') : busy ? t('saving')
          : localOnly ? t('localPreview') : selected ? t('appliedTheme', { theme: t(`theme.${selected}`) }) : t('legacyAppearance');
        function selectTheme(choice) {
          const current = form.getSnapshot();
          editor.sync(current);
          const latest = editor.getSnapshot();
          if (!latest || latest.busy || current.status !== 'ready' || latest.revision !== current.revision) return;
          // A normal click applies and persists once. Restricted connections
          // can still inspect the owned illustration without changing the app.
          if (readConnection() === 'connected' && current.writable) return editor.apply(choice.id, form);
          editor.select(choice.id);
        }
        function card(choice) {
          const checked = selected === choice.id;
          const name = t(`theme.${choice.id}`);
          const cardState = chooseTheme(DEFAULTS, choice.id);
          return h('button', {
            key: choice.id, type: 'button', className: 'dsha-theme-card',
            'data-theme-choice': choice.id, 'data-selected': checked, 'aria-pressed': checked,
            'aria-label': name, disabled: !ready || busy || conflict, onClick: () => selectTheme(choice),
          },
          h('span', { className: 'dsha-theme-thumb', 'aria-hidden': true }, h(ThemePreview, { variant: 'thumbnail', state: cardState, assets, t, nativeDark, systemDark, nativeBase, nativeTokens })),
          h('span', { className: 'dsha-card-name' }, name));
        }
        return h('section', { className: 'dsha-panel', 'data-dsha-version': '0.2.14', 'aria-label': t('title'), 'aria-busy': busy },
          h('style', null, PAGE_CSS),
          h('div', { className: 'dsha-content' },
            h(ThemePreview, { variant: 'stage', state, assets, t, nativeDark, systemDark, nativeBase, nativeTokens, badge }),
            h('section', { className: 'dsha-gallery', 'aria-labelledby': `${ids}-themes` },
              h('div', { className: 'dsha-gallery-heading' },
                h('h1', { className: 'dsha-gallery-title', id: `${ids}-themes` }, t('allThemes')),
                h('span', { className: 'dsha-gallery-status', role: 'status' }, status)),
              h('div', { className: 'dsha-theme-grid' }, THEME_CHOICES.map(card))),
            h('div', { className: 'dsha-messages' },
              !ready && h('p', { role: 'status' }, t(snapshot.status === 'unavailable' ? 'unavailable' : 'loading')),
              ready && !connected && h('p', { className: 'dsha-notice', role: 'status' }, t('disconnected')),
              ready && connected && !snapshot.writable && h('p', { className: 'dsha-notice' }, t('readOnly')),
              ready && saved.invalid && h('p', { className: 'dsha-notice', role: 'alert' }, t('invalidSaved')),
              conflict && !busy && h('p', { className: 'dsha-notice', role: 'alert' }, t('conflict'), ' ',
                h('button', { type: 'button', className: 'dsha-link', onClick: () => editor.reload(form.getSnapshot()) }, t('reload'))),
              draft?.notice === 'saveError' && h('p', { className: 'dsha-error', role: 'alert' }, t('saveError')))));
      }
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: NS }, AppearancePage));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: NS, order: 20, label: () => translate('title') }, PaletteIcon));
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: `${NS}-visual-0.2.14` }, VisualLayer));
    },
  };
}
