import { sameAppearance, decodeSaved, chooseTheme, themeChoiceId, appearanceOps } from './editor.js';

/** One plugin-owned draft, independent of page mounts and temporary paint. */
export function createAppearanceEditor() {
  let snapshot = null;
  let generation = 0;
  const listeners = new Set();
  function publish(next) {
    if (next === snapshot) return;
    snapshot = next === null ? null : Object.freeze(next);
    for (const listener of listeners) listener();
  }
  function fromForm(form, notice = null) {
    if (!Number.isSafeInteger(form.revision) || form.revision < 0) throw new TypeError('Invalid appearance revision');
    const saved = decodeSaved(form.value);
    const value = Object.freeze(saved.state);
    return { value, base: value, revision: form.revision, invalid: saved.invalid, previewing: false, busy: false, notice };
  }
  function stopPreview() {
    if (snapshot?.previewing) publish({ ...snapshot, previewing: false });
  }
  function sync(form) {
    if (form.status !== 'ready') { stopPreview(); return; }
    const next = fromForm(form);
    if (!snapshot || (!snapshot.busy && sameAppearance(snapshot.value, snapshot.base)
      && (snapshot.revision !== next.revision || snapshot.invalid !== next.invalid || !sameAppearance(snapshot.base, next.base)))) {
      publish(next);
    } else if (snapshot.revision !== form.revision) {
      stopPreview(); // A conflict ends the override, not the user's draft.
    }
  }
  const editor = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    sync,
    select(id) {
      if (!snapshot || snapshot.busy) return false;
      const value = Object.freeze(chooseTheme(snapshot.value, id));
      publish({ ...snapshot, value, previewing: false, notice: null });
      return true;
    },
    reload(form) {
      if (snapshot?.busy || form.status !== 'ready') return false;
      publish(fromForm(form));
      return true;
    },
    startPreview(form) {
      sync(form);
      if (!snapshot || snapshot.busy || form.status !== 'ready'
        || snapshot.revision !== form.revision || !themeChoiceId(snapshot.value)) return false;
      // This is local, reversible view state; read-only connections may preview.
      publish({ ...snapshot, previewing: true, notice: null });
      return true;
    },
    stopPreview,
    /** Gallery click: one selection and one revision-fenced atomic save. */
    async apply(id, form) {
      const current = form.getSnapshot();
      sync(current);
      if (!snapshot || snapshot.busy || current.status !== 'ready' || !current.writable
        || snapshot.revision !== current.revision) return false;
      if (!editor.select(id)) return false;
      if (sameAppearance(snapshot.value, snapshot.base) && !snapshot.invalid) return true;
      return editor.save(form);
    },
    async save(form) {
      const current = form.getSnapshot();
      sync(current);
      if (!snapshot || snapshot.busy || current.status !== 'ready' || !current.writable
        || snapshot.revision !== current.revision || !themeChoiceId(snapshot.value)
        || (sameAppearance(snapshot.value, snapshot.base) && !snapshot.invalid)) return false;
      const { value, revision } = snapshot;
      const epoch = generation;
      publish({ ...snapshot, busy: true, previewing: false, notice: null });
      try {
        const accepted = await form.mutate(appearanceOps(value), revision);
        if (epoch !== generation) return false;
        const latest = form.getSnapshot();
        if (accepted && latest.status === 'ready') {
          const next = fromForm(latest, 'saved');
          if (!next.invalid && sameAppearance(next.value, value)) {
            publish(next);
            return true;
          }
        }
        publish({ ...snapshot, busy: false });
        sync(latest);
      } catch {
        if (epoch !== generation) return false;
        publish({ ...snapshot, busy: false });
        sync(form.getSnapshot());
      }
      if (epoch === generation && snapshot) publish({ ...snapshot, busy: false, notice: 'saveError' });
      return false;
    },
    clear() {
      generation += 1; // A pending write cannot resurrect a disposed editor.
      publish(null);
    },
  };
  return Object.freeze(editor);
}

/** Reconnect never restarts a preview; the controller stops it on disconnect. */
export function currentPreview(editor, form) {
  return form.status === 'ready' && editor?.previewing && editor.revision === form.revision ? editor : null;
}
