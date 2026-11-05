import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, validateState } from '../core.js';
import { appearanceOps, chooseTheme, sameAppearance, themeChoiceId } from '../src/editor.js';
import { createAppearanceEditor, currentPreview } from '../src/live-preview.js';

const UPLOAD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6w4sAAAAASUVORK5CYII=';
const ready = (value = DEFAULTS, revision = 0, writable = true) => ({ status: 'ready', value, revision, writable });
const preset = (id, current = DEFAULTS) => chooseTheme(current, id);
const valuesOf = (ops) => validateState(Object.fromEntries(ops.map(({ path, value }) => [path[0], value])));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
}

// A logic-only form boundary: snapshots and recorded mutation arguments, never
// React, a DOM, an RPC connection, persisted settings, or an alternative page.
function formHarness(initial, mutation = () => false) {
  let snapshot = initial;
  const listeners = new Set();
  const writes = [];
  const form = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    publish(next) { snapshot = next; for (const listener of listeners) listener(); },
    mutate(ops, revision) {
      writes.push({ ops, revision });
      return mutation({ ops, revision, form });
    },
    writes,
  };
  return form;
}

function acceptingForm(initial) {
  return formHarness(initial, ({ ops, revision, form }) => {
    // The real settings contract folds the accepted view into its mirror before
    // mutate resolves; this fixture exercises that ordering without emulating it.
    form.publish(ready(valuesOf(ops), revision + 1));
    return true;
  });
}

test('appearance editor starts empty, stays inert before a ready form, and clears silently when empty', async () => {
  const editor = createAppearanceEditor();
  let notifications = 0;
  const unsubscribe = editor.subscribe(() => { notifications += 1; });
  assert.equal(Object.isFrozen(editor), true);
  assert.equal(editor.getSnapshot(), null);
  editor.sync({ status: 'loading' });
  assert.equal(editor.select('breeze'), false);
  assert.equal(editor.reload({ status: 'unavailable' }), false);
  assert.equal(editor.startPreview({ status: 'loading' }), false);
  const form = formHarness({ status: 'unavailable' });
  assert.equal(await editor.save(form), false);
  assert.equal(form.writes.length, 0);
  editor.clear();
  editor.clear();
  assert.equal(editor.getSnapshot(), null);
  assert.equal(notifications, 0);
  unsubscribe();
});

test('ready snapshots are stable, detached, immutable and preserve valid legacy values', () => {
  const input = validateState({ preset: 'forest', mode: 'light', background: 'upload', imageData: UPLOAD, accent: '#aabbcc' });
  const before = { ...input };
  const form = ready(input, 7);
  const editor = createAppearanceEditor();
  editor.sync(form);
  const initial = editor.getSnapshot();
  assert.deepEqual(initial, {
    value: before, base: before, revision: 7, invalid: false, previewing: false, busy: false, notice: null,
  });
  assert.equal(initial.value, initial.base);
  assert.notEqual(initial.value, input);
  for (const value of [initial, initial.value, initial.base]) assert.equal(Object.isFrozen(value), true);
  editor.sync(ready({ ...input }, 7));
  assert.equal(editor.getSnapshot(), initial, 'an identical mirror does not republish');
  input.accent = '#123456';
  input.imageData = '';
  assert.deepEqual(initial.value, before);
  assert.throws(() => { initial.value.mode = 'dark'; }, TypeError);
  assert.throws(() => { initial.revision = 8; }, TypeError);
  assert.equal(editor.select('breeze'), true);
  const selected = editor.getSnapshot();
  assert.equal(Object.isFrozen(selected.value), true);
  assert.equal(selected.base, initial.base);
  assert.equal(selected.value.imageData, UPLOAD, 'a dormant legacy upload is not deleted');
  assert.equal(themeChoiceId(selected.value), 'breeze');
});

test('subscribers observe publications, can unsubscribe independently, and do not own editor lifetime', () => {
  const editor = createAppearanceEditor();
  const first = [];
  const second = [];
  const unsubscribeFirst = editor.subscribe(() => first.push(editor.getSnapshot()));
  const unsubscribeSecond = editor.subscribe(() => second.push(editor.getSnapshot()));
  editor.sync(ready(DEFAULTS, 2));
  const initial = editor.getSnapshot();
  assert.deepEqual(first, [initial]);
  assert.deepEqual(second, [initial]);
  unsubscribeFirst();
  unsubscribeFirst();
  editor.select('sea');
  const next = editor.getSnapshot();
  assert.deepEqual(first, [initial]);
  assert.deepEqual(second, [initial, next]);
  unsubscribeSecond();
  assert.equal(editor.getSnapshot(), next, 'page unsubscribe must not dispose the plugin draft');
  editor.stopPreview();
  assert.equal(editor.getSnapshot(), next);
  editor.clear();
  editor.clear();
  assert.equal(editor.getSnapshot(), null);
  assert.deepEqual(second, [initial, next]);
});

test('navigation and canceling temporary paint retain the selected draft without writing settings', () => {
  const form = formHarness(ready(DEFAULTS, 4));
  const editor = createAppearanceEditor();
  editor.sync(form.getSnapshot());
  editor.select('breeze');
  const chosen = editor.getSnapshot().value;
  assert.equal(currentPreview(editor.getSnapshot(), form.getSnapshot()), null);
  assert.equal(editor.startPreview(form.getSnapshot()), true);
  assert.equal(currentPreview(editor.getSnapshot(), form.getSnapshot()).value, chosen);
  editor.stopPreview(); // Both navigation helpers and Cancel use this operation.
  const canceled = editor.getSnapshot();
  assert.equal(canceled.previewing, false);
  assert.equal(canceled.value, chosen);
  assert.equal(canceled.base.preset, 'original');
  assert.equal(sameAppearance(canceled.value, canceled.base), false);
  const unsubscribe = editor.subscribe(() => {});
  unsubscribe(); // Leaving and returning to the page changes observers, not state.
  editor.sync(form.getSnapshot());
  assert.equal(editor.getSnapshot(), canceled);
  assert.equal(editor.startPreview(form.getSnapshot()), true);
  editor.select('sea');
  assert.equal(editor.getSnapshot().previewing, false, 'choosing another card cancels the previous paint');
  assert.equal(themeChoiceId(editor.getSnapshot().value), 'sea');
  assert.deepEqual(form.getSnapshot(), ready(DEFAULTS, 4));
  assert.equal(form.writes.length, 0);
});

test('dirty external-revision conflicts stop preview and preserve draft until an explicit reload', async () => {
  const form = formHarness(ready(DEFAULTS, 10));
  const editor = createAppearanceEditor();
  editor.sync(form.getSnapshot());
  editor.select('sea');
  const before = editor.getSnapshot();
  editor.startPreview(form.getSnapshot());
  form.publish(ready(preset('sand'), 11));
  editor.sync(form.getSnapshot());
  const conflict = editor.getSnapshot();
  assert.equal(conflict.value, before.value);
  assert.equal(conflict.base, before.base);
  assert.equal(conflict.revision, 10);
  assert.equal(conflict.previewing, false);
  assert.equal(editor.startPreview(form.getSnapshot()), false);
  assert.equal(await editor.save(form), false);
  assert.equal(form.writes.length, 0);
  // Even an external writer selecting the same colors does not authorize a stale write.
  form.publish(ready(before.value, 12));
  editor.sync(form.getSnapshot());
  assert.equal(editor.getSnapshot().revision, 10);
  assert.equal(await editor.save(form), false);
  assert.equal(editor.select('dark'), true);
  assert.equal(editor.getSnapshot().revision, 10, 'another selection must not silently accept the external base');
  assert.equal(editor.reload({ status: 'loading' }), false);
  assert.equal(editor.reload(form.getSnapshot()), true);
  const reloaded = editor.getSnapshot();
  assert.equal(reloaded.revision, 12);
  assert.equal(reloaded.value, reloaded.base);
  assert.equal(reloaded.previewing, false);
  assert.equal(themeChoiceId(reloaded.value), 'sea');
  assert.equal(await editor.save(form), false, 'a clean, valid reloaded state needs no write');
});

test('clean drafts rebase to external ready revisions without automatically previewing', () => {
  const editor = createAppearanceEditor();
  const first = ready(preset('dark'), 2);
  editor.sync(first);
  editor.startPreview(first);
  const latest = ready(preset('sand'), 3);
  editor.sync(latest);
  const rebased = editor.getSnapshot();
  assert.equal(rebased.revision, 3);
  assert.deepEqual(rebased.value, latest.value);
  assert.equal(rebased.value, rebased.base);
  assert.equal(rebased.previewing, false);
  assert.equal(currentPreview(rebased, latest), null);
  editor.sync(latest);
  assert.equal(editor.getSnapshot(), rebased);
});

test('non-ready form snapshots stop paint but preserve draft, and a ready rebase never resumes it', () => {
  const editor = createAppearanceEditor();
  const initial = ready(DEFAULTS, 5);
  editor.sync(initial);
  editor.select('breeze');
  const chosen = editor.getSnapshot().value;
  for (const status of ['loading', 'unavailable', 'error']) {
    assert.equal(editor.startPreview(initial), true);
    editor.sync({ ...initial, status });
    assert.equal(editor.getSnapshot().value, chosen);
    assert.equal(editor.getSnapshot().previewing, false);
    assert.equal(currentPreview(editor.getSnapshot(), { ...initial, status }), null);
    editor.sync(initial);
    assert.equal(editor.getSnapshot().previewing, false);
  }
});

test('an explicit connection-stop signal also cancels paint when the form mirror remains ready', () => {
  // Form readiness is not transport connectivity. The Client must wire the real
  // disconnect signal to stopPreview; this test checks only the controller side.
  const editor = createAppearanceEditor();
  const form = ready(DEFAULTS, 6);
  editor.sync(form);
  editor.select('sea');
  editor.startPreview(form);
  const chosen = editor.getSnapshot().value;
  editor.stopPreview();
  editor.sync(form); // A reconnect may publish the exact same ready mirror.
  assert.equal(editor.getSnapshot().value, chosen);
  assert.equal(editor.getSnapshot().previewing, false);
  assert.equal(currentPreview(editor.getSnapshot(), form), null);
  assert.equal(editor.startPreview(form), true, 'only a new explicit preview action restarts it');
});

test('read-only connections may select and preview locally but cannot save', async () => {
  const form = formHarness(ready(DEFAULTS, 9, false));
  const editor = createAppearanceEditor();
  editor.sync(form.getSnapshot());
  assert.equal(editor.select('breeze'), true);
  assert.equal(editor.startPreview(form.getSnapshot()), true);
  const before = editor.getSnapshot();
  assert.equal(currentPreview(before, form.getSnapshot()), before);
  assert.equal(await editor.save(form), false);
  assert.equal(editor.getSnapshot(), before);
  assert.equal(form.writes.length, 0);
  assert.deepEqual(form.getSnapshot().value, DEFAULTS);
});

test('a pending save completes after page observers unmount and blocks duplicate edits and writes', { timeout: 2000 }, async () => {
  const gate = deferred();
  const form = formHarness(ready(DEFAULTS, 9), () => gate.promise);
  const editor = createAppearanceEditor();
  const unsubscribeMirror = form.subscribe(() => editor.sync(form.getSnapshot()));
  editor.sync(form.getSnapshot());
  const observed = [];
  const unsubscribePage = editor.subscribe(() => observed.push(editor.getSnapshot()));
  editor.select('sea');
  const selected = editor.getSnapshot().value;
  editor.startPreview(form.getSnapshot());
  const pending = editor.save(form);
  assert.equal(editor.getSnapshot().busy, true);
  assert.equal(editor.getSnapshot().previewing, false);
  assert.equal(form.writes.length, 1);
  assert.deepEqual(form.writes[0], { ops: appearanceOps(selected), revision: 9 });
  assert.equal(editor.select('sand'), false);
  assert.equal(editor.reload(form.getSnapshot()), false);
  assert.equal(editor.startPreview(form.getSnapshot()), false);
  assert.equal(await editor.save(form), false);
  assert.equal(form.writes.length, 1);
  unsubscribePage();
  const countAtUnmount = observed.length;
  form.publish(ready(selected, 10));
  assert.equal(editor.getSnapshot().busy, true, 'the provider mirror may update before mutate resolves');
  gate.resolve(true);
  assert.equal(await pending, true);
  const saved = editor.getSnapshot();
  assert.deepEqual(saved.value, selected);
  assert.equal(saved.value, saved.base);
  assert.equal(saved.revision, 10);
  assert.equal(saved.busy, false);
  assert.equal(saved.previewing, false);
  assert.equal(saved.notice, 'saved');
  assert.equal(observed.length, countAtUnmount, 'unmounted page listeners remain unsubscribed');
  assert.equal(form.writes.length, 1);
  editor.sync(form.getSnapshot());
  assert.equal(editor.getSnapshot(), saved, 'a remounted page sees the completed plugin-owned save');
  unsubscribeMirror();
});

test('save refusal, transport errors and a mismatched accepted mirror retain the unsaved selection', async (t) => {
  for (const result of ['refused', 'thrown', 'rejected', 'stale-accepted', 'conflicting', 'unavailable']) {
    await t.test(result, { timeout: 2000 }, async () => {
      const form = formHarness(ready(DEFAULTS, 3), ({ form }) => {
        if (result === 'thrown') throw new Error('write refused');
        if (result === 'rejected') return Promise.reject(new Error('transport interrupted'));
        if (result === 'conflicting') form.publish(ready(preset('dark'), 4));
        if (result === 'unavailable') form.publish({ status: 'unavailable' });
        return result === 'stale-accepted' || result === 'unavailable';
      });
      const editor = createAppearanceEditor();
      editor.sync(form.getSnapshot());
      editor.select('sand');
      const chosen = editor.getSnapshot().value;
      const base = editor.getSnapshot().base;
      editor.startPreview(form.getSnapshot());
      assert.equal(await editor.save(form), false);
      const failed = editor.getSnapshot();
      assert.equal(failed.value, chosen);
      assert.equal(failed.base, base);
      assert.equal(failed.revision, 3);
      assert.equal(failed.busy, false);
      assert.equal(failed.previewing, false);
      assert.equal(failed.notice, 'saveError');
      assert.equal(form.writes.length, 1);
      assert.deepEqual(form.writes[0], { ops: appearanceOps(chosen), revision: 3 });
      assert.equal(sameAppearance(failed.value, failed.base), false);
      if (result === 'conflicting') {
        assert.equal(editor.startPreview(form.getSnapshot()), false);
        assert.equal(await editor.save(form), false);
        assert.equal(form.writes.length, 1);
      }
    });
  }
});

test('compatibility select/preview/save keeps Original staged until a save and preserves dormant legacy image data', async () => {
  const legacy = validateState({ preset: 'forest', mode: 'dark', background: 'upload', imageData: UPLOAD, accent: '#123456', fade: 37 });
  const form = acceptingForm(ready(legacy, 4));
  const editor = createAppearanceEditor();
  editor.sync(form.getSnapshot());
  editor.select('original');
  const original = { ...DEFAULTS, imageData: UPLOAD };
  assert.deepEqual(editor.getSnapshot().value, original);
  assert.deepEqual(editor.getSnapshot().base, legacy);
  assert.equal(themeChoiceId(editor.getSnapshot().value), 'original');
  assert.equal(form.writes.length, 0);
  assert.equal(editor.startPreview(form.getSnapshot()), true);
  assert.deepEqual(currentPreview(editor.getSnapshot(), form.getSnapshot()).value, original);
  editor.stopPreview();
  assert.deepEqual(form.getSnapshot().value, legacy);
  assert.equal(form.writes.length, 0);
  assert.equal(await editor.save(form), true);
  assert.equal(form.writes.length, 1);
  assert.deepEqual(form.writes[0], { ops: appearanceOps(original), revision: 4 });
  assert.deepEqual(form.getSnapshot().value, original);
  assert.equal(editor.getSnapshot().notice, 'saved');
});

test('valid non-preset legacy state stays intact until a preset is chosen and saved', async () => {
  const legacy = validateState({ ...preset('breeze'), accent: '#3D8057', fade: 37, imageData: UPLOAD });
  const form = acceptingForm(ready(legacy, 14));
  const editor = createAppearanceEditor();
  editor.sync(form.getSnapshot());
  assert.deepEqual(editor.getSnapshot().value, legacy);
  assert.equal(editor.getSnapshot().invalid, false);
  assert.equal(themeChoiceId(editor.getSnapshot().value), '');
  assert.equal(editor.startPreview(form.getSnapshot()), false);
  assert.equal(await editor.save(form), false);
  assert.equal(form.writes.length, 0);
  editor.select('breeze');
  const selected = editor.getSnapshot().value;
  assert.equal(selected.accent, '');
  assert.equal(selected.fade, 0);
  assert.equal(selected.imageData, UPLOAD);
  assert.deepEqual(form.getSnapshot().value, legacy);
  assert.equal(await editor.save(form), true);
  assert.equal(form.getSnapshot().value.imageData, UPLOAD);
});

test('invalid saved state is repaired without applying an invalid upload and may save a clean repaired preset', async () => {
  const invalid = { ...preset('light'), imageData: 'https://example.test/unsafe.png', unknown: 'x' };
  const form = acceptingForm(ready(invalid, 2));
  const editor = createAppearanceEditor();
  editor.sync(form.getSnapshot());
  const repaired = editor.getSnapshot();
  assert.equal(repaired.invalid, true);
  assert.deepEqual(repaired.value, preset('light'));
  assert.equal(repaired.value, repaired.base);
  assert.doesNotThrow(() => validateState(repaired.value));
  assert.equal(await editor.save(form), true, 'invalid saved input requires a repair write even if the normalized preset is clean');
  assert.equal(editor.getSnapshot().invalid, false);
  assert.equal(editor.getSnapshot().notice, 'saved');
});

test('invalid ready revisions and unknown theme selections never replace a valid draft', () => {
  const editor = createAppearanceEditor();
  editor.sync(ready(DEFAULTS, 12));
  editor.select('sand');
  const before = editor.getSnapshot();
  let notifications = 0;
  editor.subscribe(() => { notifications += 1; });
  for (const revision of [undefined, null, false, -1, 0.5, '12', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = { ...ready(DEFAULTS, 12), revision };
    assert.throws(() => editor.sync(invalid), /appearance revision/i);
    assert.equal(editor.getSnapshot(), before);
    assert.throws(() => editor.reload(invalid), /appearance revision/i);
    assert.equal(editor.getSnapshot(), before);
  }
  for (const id of [null, undefined, 'unknown', 'upload', 'custom', '__proto__']) {
    assert.throws(() => editor.select(id), /Unknown theme choice/);
    assert.equal(editor.getSnapshot(), before);
  }
  assert.equal(notifications, 0);
  editor.reload(ready(DEFAULTS, Number.MAX_SAFE_INTEGER));
  assert.equal(editor.getSnapshot().revision, Number.MAX_SAFE_INTEGER);
  assert.equal(notifications, 1);
});

test('only active paint with a ready form at the exact revision can be consumed', () => {
  const editor = createAppearanceEditor();
  const form = ready(DEFAULTS, 7);
  editor.sync(form);
  editor.select('breeze');
  assert.equal(currentPreview(editor.getSnapshot(), form), null);
  editor.startPreview(form);
  const preview = editor.getSnapshot();
  assert.equal(currentPreview(preview, form), preview);
  assert.equal(currentPreview(preview, { ...form, writable: false }), preview);
  for (const revision of [6, 8, '7', undefined]) assert.equal(currentPreview(preview, { ...form, revision }), null);
  for (const status of ['loading', 'unavailable', 'error', undefined]) assert.equal(currentPreview(preview, { ...form, status }), null);
  for (const absent of [null, undefined]) assert.equal(currentPreview(absent, form), null);
  editor.stopPreview();
  assert.equal(currentPreview(editor.getSnapshot(), form), null);
  editor.clear();
  assert.equal(currentPreview(editor.getSnapshot(), form), null);
});

test('clear generation fences pending save success and rejection without resurrecting a disposed editor', async (t) => {
  for (const outcome of ['accepted', 'rejected']) {
    await t.test(outcome, { timeout: 2000 }, async () => {
      const gate = deferred();
      const form = formHarness(ready(DEFAULTS, 1), () => gate.promise);
      const editor = createAppearanceEditor();
      editor.sync(form.getSnapshot());
      editor.select('breeze');
      const pending = editor.save(form);
      editor.clear();
      let notifications = 0;
      editor.subscribe(() => { notifications += 1; });
      if (outcome === 'accepted') {
        form.publish(ready(preset('breeze'), 2));
        gate.resolve(true);
      } else gate.reject(new Error('late refusal'));
      assert.equal(await pending, false);
      assert.equal(editor.getSnapshot(), null);
      assert.equal(notifications, 0);
    });
  }
});

test('a late old-generation save cannot alter a newly seeded draft or its temporary paint', async (t) => {
  for (const outcome of ['accepted', 'rejected']) {
    await t.test(outcome, { timeout: 2000 }, async () => {
      const gate = deferred();
      const oldForm = formHarness(ready(DEFAULTS, 1), () => gate.promise);
      const editor = createAppearanceEditor();
      editor.sync(oldForm.getSnapshot());
      editor.select('breeze');
      const pending = editor.save(oldForm);
      editor.clear();
      const nextForm = ready(preset('dark'), 30);
      editor.sync(nextForm);
      editor.select('sea');
      editor.startPreview(nextForm);
      const fresh = editor.getSnapshot();
      if (outcome === 'accepted') {
        oldForm.publish(ready(preset('breeze'), 2));
        gate.resolve(true);
      } else gate.reject(new Error('old connection rejected write'));
      assert.equal(await pending, false);
      assert.equal(editor.getSnapshot(), fresh);
      assert.equal(currentPreview(fresh, nextForm), fresh);
      assert.equal(fresh.notice, null);
      assert.equal(fresh.busy, false);
    });
  }
});

test('apply synchronizes a fresh form, selects every gallery preset and saves one complete atomic batch', async (t) => {
  for (const id of ['light', 'dark', 'system', 'breeze', 'sea', 'sand', 'original']) {
    await t.test(id, async () => {
      const legacy = validateState({ preset: 'forest', mode: 'dark', accent: '#123456', background: 'upload', imageData: UPLOAD, fade: 37 });
      const form = acceptingForm(ready(legacy, 17));
      const editor = createAppearanceEditor();
      assert.equal(editor.getSnapshot(), null, 'apply must read the current form without a prior page mount');
      const expected = preset(id, legacy);
      assert.equal(await editor.apply(id, form), true);
      assert.deepEqual(form.writes, [{ ops: appearanceOps(expected), revision: 17 }]);
      assert.deepEqual(form.getSnapshot().value, expected);
      const saved = editor.getSnapshot();
      assert.deepEqual(saved.value, expected);
      assert.equal(saved.value, saved.base);
      assert.equal(saved.revision, 18);
      assert.equal(saved.value.imageData, UPLOAD);
      assert.equal(saved.invalid, false);
      assert.equal(saved.busy, false);
      assert.equal(saved.previewing, false, 'gallery apply never starts temporary conversation paint');
      assert.equal(saved.notice, 'saved');
      assert.equal(currentPreview(saved, form.getSnapshot()), null);
    });
  }
});

test('applying the same valid saved preset succeeds without writing, including a dormant legacy image', async () => {
  for (const id of ['light', 'dark', 'system', 'breeze', 'sea', 'sand', 'original']) {
    const value = { ...preset(id), imageData: UPLOAD };
    const form = formHarness(ready(value, 8));
    const editor = createAppearanceEditor();
    assert.equal(await editor.apply(id, form), true);
    assert.equal(form.writes.length, 0);
    assert.deepEqual(editor.getSnapshot().value, value);
    assert.equal(editor.getSnapshot().revision, 8);
    assert.equal(await editor.apply(id, form), true);
    assert.equal(form.writes.length, 0, 'repeated gallery clicks cannot create redundant writes');
    editor.select(id === 'sea' ? 'sand' : 'sea');
    assert.equal(await editor.apply(id, form), true, 'returning from a local draft to the saved preset is also a no-op write');
    assert.equal(form.writes.length, 0);
    assert.equal(sameAppearance(editor.getSnapshot().value, editor.getSnapshot().base), true);
  }
});

test('apply refuses non-ready and read-only forms without choosing a new draft or writing', async () => {
  const editor = createAppearanceEditor();
  editor.sync(ready(preset('breeze'), 5));
  editor.select('sea');
  const before = editor.getSnapshot();
  for (const status of ['loading', 'unavailable', 'error']) {
    const form = formHarness({ ...ready(preset('breeze'), 5), status });
    assert.equal(await editor.apply('sand', form), false);
    assert.equal(form.writes.length, 0);
    assert.equal(editor.getSnapshot(), before);
  }
  const readOnly = formHarness(ready(preset('breeze'), 5, false));
  assert.equal(await editor.apply('sand', readOnly), false);
  assert.equal(editor.getSnapshot(), before);
  assert.equal(readOnly.writes.length, 0);
  assert.equal(editor.select('sand'), true, 'the Client may explicitly choose locally on its read-only path');
  assert.equal(themeChoiceId(editor.getSnapshot().value), 'sand');
  assert.deepEqual(readOnly.getSnapshot().value, preset('breeze'));
});

test('apply refuses dirty external revisions but rebases clean drafts to the latest revision before writing', async () => {
  const editor = createAppearanceEditor();
  editor.sync(ready(preset('breeze'), 10));
  editor.select('sea');
  const before = editor.getSnapshot();
  const latest = acceptingForm(ready(preset('dark'), 11));
  assert.equal(await editor.apply('sand', latest), false);
  assert.equal(editor.getSnapshot(), before, 'conflict must not replace the existing selection');
  assert.equal(latest.writes.length, 0);
  assert.equal(editor.reload(latest.getSnapshot()), true);
  latest.publish(ready(preset('light'), 12));
  assert.equal(await editor.apply('sand', latest), true);
  assert.deepEqual(latest.writes, [{ ops: appearanceOps(preset('sand')), revision: 12 }]);
  assert.equal(editor.getSnapshot().revision, 13);
  assert.equal(themeChoiceId(editor.getSnapshot().value), 'sand');
});

test('pending apply blocks more gallery choices and completes after page observers unmount', { timeout: 2000 }, async () => {
  const gate = deferred();
  const form = formHarness(ready(DEFAULTS, 9), () => gate.promise);
  const editor = createAppearanceEditor();
  const unsubscribeMirror = form.subscribe(() => editor.sync(form.getSnapshot()));
  const observed = [];
  const unsubscribePage = editor.subscribe(() => observed.push(editor.getSnapshot()));
  const pending = editor.apply('sea', form);
  const selected = editor.getSnapshot().value;
  assert.equal(editor.getSnapshot().busy, true);
  assert.equal(editor.getSnapshot().previewing, false);
  assert.deepEqual(form.writes, [{ ops: appearanceOps(preset('sea')), revision: 9 }]);
  assert.equal(await editor.apply('sand', form), false);
  assert.equal(await editor.apply('sea', form), false, 'even the same choice is refused while the previous save is pending');
  assert.equal(editor.getSnapshot().value, selected);
  assert.equal(form.writes.length, 1);
  unsubscribePage();
  const countAtUnmount = observed.length;
  form.publish(ready(selected, 10));
  assert.equal(editor.getSnapshot().busy, true, 'mirror acknowledgement may precede mutate settlement');
  gate.resolve(true);
  assert.equal(await pending, true);
  const saved = editor.getSnapshot();
  assert.deepEqual(saved.value, preset('sea'));
  assert.equal(saved.value, saved.base);
  assert.equal(saved.revision, 10);
  assert.equal(saved.busy, false);
  assert.equal(saved.notice, 'saved');
  assert.equal(observed.length, countAtUnmount);
  assert.equal(await editor.apply('sea', form), true);
  assert.equal(form.writes.length, 1, 'a remounted gallery sees the accepted choice and does not re-save it');
  unsubscribeMirror();
});

test('failed apply retains its selected theme and a repeated click retries once with the same revision fence', async (t) => {
  for (const failure of ['refused', 'thrown', 'rejected']) {
    await t.test(failure, async () => {
      let attempts = 0;
      const form = formHarness(ready(DEFAULTS, 4), ({ ops, revision, form }) => {
        attempts += 1;
        if (attempts === 1) {
          if (failure === 'thrown') throw new Error('refused');
          if (failure === 'rejected') return Promise.reject(new Error('connection interrupted'));
          return false;
        }
        form.publish(ready(valuesOf(ops), revision + 1));
        return true;
      });
      const editor = createAppearanceEditor();
      assert.equal(await editor.apply('breeze', form), false);
      const failed = editor.getSnapshot();
      assert.deepEqual(failed.value, preset('breeze'));
      assert.deepEqual(failed.base, DEFAULTS);
      assert.equal(failed.revision, 4);
      assert.equal(failed.busy, false);
      assert.equal(failed.notice, 'saveError');
      assert.equal(failed.previewing, false);
      assert.deepEqual(form.getSnapshot().value, DEFAULTS);
      assert.equal(await editor.apply('breeze', form), true);
      assert.deepEqual(form.writes, [
        { ops: appearanceOps(preset('breeze')), revision: 4 },
        { ops: appearanceOps(preset('breeze')), revision: 4 },
      ]);
      assert.equal(editor.getSnapshot().notice, 'saved');
      assert.equal(editor.getSnapshot().revision, 5);
    });
  }
});

test('apply repairs invalid saved input even when the normalized theme already matches', async () => {
  const invalid = { ...preset('light'), imageData: 'https://example.test/unsafe.png', unknown: 'x' };
  const form = acceptingForm(ready(invalid, 2));
  const editor = createAppearanceEditor();
  assert.equal(await editor.apply('light', form), true);
  assert.deepEqual(form.writes, [{ ops: appearanceOps(preset('light')), revision: 2 }]);
  assert.equal(editor.getSnapshot().invalid, false);
  assert.equal(editor.getSnapshot().notice, 'saved');
});

test('plugin-owned editors and their subscriptions are independent', () => {
  const first = createAppearanceEditor();
  const second = createAppearanceEditor();
  first.sync(ready(DEFAULTS, 3));
  first.select('breeze');
  first.startPreview(ready(DEFAULTS, 3));
  assert.equal(second.getSnapshot(), null);
  second.sync(ready(DEFAULTS, 3));
  second.select('sea');
  const other = second.getSnapshot();
  first.clear();
  assert.equal(first.getSnapshot(), null);
  assert.equal(second.getSnapshot(), other);
});
