'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'GlyphPoint-v1a-layout-fixed.html'), 'utf8');
const scripts = [...app.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length, 1, 'Ship one complete inline application script');
new vm.Script(scripts[0][1], { filename: 'GlyphPoint-v1a-layout-fixed.html' });
const markup = app.slice(0, app.indexOf('<script>'));
const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML element IDs must be unique');
assert.ok(!/<(?:script|link)\b[^>]*(?:src|href)="https?:/i.test(markup), 'Runtime is standalone');
const files = [];
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'test-results', 'playwright-report'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name.endsWith('.md')) files.push(file);
  }
}
visit(root);
function anchors(text) {
  const found = new Set(); const repeats = new Map();
  for (const match of text.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const base = match[1].trim().toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/ /g, '-');
    const n = repeats.get(base) || 0; repeats.set(base, n + 1); found.add(base + (n ? `-${n}` : ''));
  }
  for (const match of text.matchAll(/\bid="([^"]+)"/g)) found.add(match[1]);
  return found;
}
let checked = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const link = match[1]; if (/^[a-z][\w+.-]*:/i.test(link)) continue;
    const [relative, fragment] = link.split('#'); const target = relative ? path.resolve(path.dirname(file), decodeURIComponent(relative)) : file;
    assert.ok(fs.existsSync(target), `${path.relative(root, file)} links to missing ${link}`);
    if (fragment && target.endsWith('.md')) assert.ok(anchors(fs.readFileSync(target, 'utf8')).has(decodeURIComponent(fragment)), `${path.relative(root, file)} links to missing heading ${link}`);
    checked++;
  }
}
console.log(`Standalone JavaScript parses; ${ids.length} unique HTML IDs; ${checked} local documentation links checked across ${files.length} Markdown files.`);
