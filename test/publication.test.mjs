import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NS } from '../core.js';

const root = new URL('../', import.meta.url);
const text = (name) => readFile(new URL(name, root), 'utf8');

test('publication identity resolves the renamed package while retaining the config address', async () => {
  const manifest = JSON.parse(await text('package.json'));
  const patch = await text('cordis.patch.yml');
  assert.equal(manifest.name, 'dsh-minimalist-appearance');
  assert.equal(manifest.version, '0.2.18');
  assert.equal(manifest.private, true);
  assert.equal(NS, 'dsh-appearance');
  assert.equal(patch.match(/^\s+- id: (.+)$/m)?.[1], NS);
  assert.equal(patch.match(/^\s+name: (.+)$/m)?.[1], manifest.name);
  assert.equal(manifest.repository.url, `https://github.com/zxbingoo/${manifest.name}.git`);
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
});

test('the distributed browser factory registers the exact package identity', async () => {
  const manifest = JSON.parse(await text('package.json'));
  const generated = await text('client.js');
  const build = await text('build.mjs');
  const factoryId = generated.match(/window\.__ModuleLoader__\.load\(\{\s+id:\s*("[^"]+"),/);
  assert.ok(factoryId, 'build uses a JSON-encoded package id');
  assert.equal(JSON.parse(factoryId[1]), manifest.name);
  assert.match(build, /JSON\.stringify\(manifest\.name\)/);
  assert.ok(generated.includes(`const NS = '${NS}';`), 'embedded settings namespace remains stable');
});

test('a distribution rename does not rename native settings, panels, or the appearance tool', async () => {
  const host = await text('index.js');
  const client = await text('src/client.js');
  assert.match(host, /name: 'dsh_appearance'/);
  assert.match(host, /settings\.mutate\(NS, ops,/);
  assert.match(client, /ctx\.configForms\.get\(NS\)/);
  assert.match(client, /name: 'main', key: NS/);
  assert.match(client, /name: 'sidebar\.panellist', id: NS/);
  assert.ok(client.includes('id: `${NS}-visual-0.2.18-chat-controls`'));
  assert.doesNotMatch(client, /dsh-minimalist-appearance/, 'package identity must not leak into compatibility ids');
});
