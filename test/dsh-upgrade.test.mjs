import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildQuestionBadgeCss, buildHistoryCss, buildBackgroundCss } from '../backgrounds.js';
import { validateState } from '../core.js';

// Source-confirmed selector policy, not DOM simulation or browser acceptance.
const state = Object.freeze(validateState({ preset: 'forest', mode: 'light' }));
const current = 'body [data-question-key] [data-option-row] > button:is([role="radio"],[role="checkbox"]) > span > [data-option-line]';

test('DSH 0.2.2 option-line adapter is bounded and preserves the legacy badge owner', () => {
  const css = buildQuestionBadgeCss(state);
  const owners = css.slice(0, css.indexOf(' {')).split(',\n');
  assert.equal(owners.length, 2);
  assert.equal(owners[1], current);
  assert.match(owners[0], /data-question-scroll.*> button.*> span:nth-child\(2\) > span$/);
  assert.doesNotMatch(owners[1], /nth-child|data-option-description|aria-expanded|data-plan-review|\*/);
  assert.equal([...css.matchAll(/\{/g)].length, 1);
  assert.match(css, /--dsw-specific-sidebar-nav-item-active-accent: var\(--dsw-alias-bg-layer-2\) !important/);
  assert.match(css, /--dsw-alias-button-info-fill: var\(--dsw-alias-label-primary\) !important/);
  assert.doesNotMatch(css, /(?:^|[;{\n])\s*(?:color|background|display|position|padding|font|opacity|pointer-events)\s*:/);
});

test('upgrading the badge does not broaden wallpaper or native history owners', () => {
  const history = buildHistoryCss(state);
  assert.match(history, /div:has\(\+ \[data-slot="conversation\.chat\.flow"\]\) > button/);
  assert.match(history, /:hover:not\(:disabled\)/);
  const background = buildBackgroundCss({ ...state, background: 'sea' });
  assert.match(background, /^div\[data-phase\]:has\(\[data-conversation-content\]\) \{/);
  assert.equal([...background.matchAll(/background-image: linear-gradient/g)].length, 1);
});

test('upgrade support declares only audited schema dependency families and ships the maintenance guide', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.peerDependencies['@deepseek-ai/schemastery'], '~3.18.5 || ~3.19.0');
  assert.equal(manifest.name, 'dsh-minimalist-appearance');
  assert.ok(manifest.files.includes('COMPATIBILITY.md'));
  const guide = await readFile(new URL('../COMPATIBILITY.md', import.meta.url), 'utf8');
  assert.ok(guide.includes('0.2.2-rc.1'));
  assert.ok(guide.includes('不是自动认证未来版本'));
});
