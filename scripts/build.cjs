'use strict';
// Development-only assembly. The distributed editor has no runtime imports.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const modules = ['interchange', 'recovery', 'renderer', 'jobs', 'app', 'workflows'];
const code = `const BUNDLED_FONT_LICENSE=${JSON.stringify(read('assets/fonts/LICENSE-DejaVu.txt'))};\n` + modules.map(name => `// ---- src/${name}.js ----\n${read(`src/${name}.js`).trim()}\n`).join('\n') + '\ninit();\n';
if (/<\/script(?=[\s/>])/i.test(code)) throw Error('Application code contains an unescaped closing script token.');
const template = read('src/app.html');
const fontCSS = read('assets/fonts/fonts.css');
for (const marker of ['/* GLYPHPOINT_FONTS */', '/* GLYPHPOINT_APPLICATION */']) {
  if (template.split(marker).length !== 2) throw Error(`Template must contain exactly one ${marker} placeholder.`);
}
if (/<\/style(?=[\s/>])/i.test(fontCSS)) throw Error('Font CSS contains a closing style token.');
const output = template.replace('/* GLYPHPOINT_FONTS */', () => fontCSS).replace('/* GLYPHPOINT_APPLICATION */', () => code);
const destination = path.join(root, 'GlyphPoint-RC.html');
const legacyDestination = path.join(root, 'GlyphPoint-v1a-layout-fixed.html');
const legacyAlias = '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=GlyphPoint-RC.html"><title>GlyphPoint legacy launcher</title><p>This older address is a compatibility launcher. <a href="GlyphPoint-RC.html">Open GlyphPoint-RC</a>.</p></html>\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(destination, 'utf8') !== output) throw Error('Shipped HTML is stale. Run npm run build.');
  if (fs.readFileSync(legacyDestination, 'utf8') !== legacyAlias) throw Error('Legacy launcher differs. Run npm run build.');
  console.log('GlyphPoint-RC standalone HTML and legacy launcher exactly match generated sources.');
} else {
  fs.writeFileSync(destination, output);
  fs.writeFileSync(legacyDestination, legacyAlias);
  console.log(`Built GlyphPoint-RC.html (${Buffer.byteLength(output).toLocaleString()} bytes).`);
}
