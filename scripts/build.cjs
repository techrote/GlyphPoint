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
const destination = path.join(root, 'GlyphPoint-v1a-layout-fixed.html');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(destination, 'utf8') !== output) throw Error('Shipped HTML is stale. Run npm run build.');
  console.log('Standalone HTML exactly matches the source modules and embedded fonts.');
} else {
  fs.writeFileSync(destination, output);
  console.log(`Built GlyphPoint-v1a-layout-fixed.html (${Buffer.byteLength(output).toLocaleString()} bytes).`);
}
