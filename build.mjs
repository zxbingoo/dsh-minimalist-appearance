import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('./', import.meta.url);
const modules = ['core.js', 'backgrounds.js', 'src/editor.js', 'src/styles.js', 'src/preview.js', 'src/live-preview.js', 'src/client.js'];
const parts = [];
for (const file of modules) {
  const source = await readFile(new URL(file, root), 'utf8');
  // This tiny build accepts only the local, single-line static imports above.
  for (const line of source.match(/^import .*;$/gm) ?? []) {
    if (!/from ['"]\.{1,2}\//.test(line)) throw new Error(`Non-local import in ${file}`);
  }
  const inline = source.replace(/^import .*;\r?\n/gm, '').replace(/^export (?=(?:const|function)\b)/gm, '');
  if (/^\s*(?:import|export)\s/m.test(inline)) throw new Error(`Unsupported module syntax in ${file}`);
  parts.push(`// ${file}\n${inline}`);
}
const dictionaries = {};
for (const locale of ['en', 'zh']) {
  const resource = JSON.parse(await readFile(new URL(`locale/${locale}.json`, root), 'utf8'));
  if (!resource.meta?.title || !resource.meta?.description) throw new Error(`Missing ${locale} metadata`);
  dictionaries[locale] = resource.ui;
}
if (JSON.stringify(Object.keys(dictionaries.en).sort()) !== JSON.stringify(Object.keys(dictionaries.zh).sort())) {
  throw new Error('Unbalanced locale dictionaries');
}
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const wallpaper = await readFile(new URL('assets/breeze.png', root));
if (wallpaper.length > 4 * 1024 * 1024 || !wallpaper.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
  throw new Error('Missing or invalid bundled watercolor artwork');
}
const assets = { breeze: `data:image/png;base64,${wallpaper.toString('base64')}` };
const result = `// Generated appearance ${manifest.version}. Edit src/client.js and shared modules instead.\nwindow.__ModuleLoader__.load({\n  id: ${JSON.stringify(manifest.name)},\n  factory(require) {\n    const React = require('react');\n${parts.join('\n')}\n    return createAppearancePlugin(React, ${JSON.stringify(dictionaries)}, ${JSON.stringify(assets)});\n  },\n});\n`;
new vm.Script(result, { filename: `${manifest.name}/client.js` }); // Syntax only; never emulate the DOM.
await writeFile(new URL('client.js', root), result);
console.log(`Built client.js (${Buffer.byteLength(result)} bytes)`);
