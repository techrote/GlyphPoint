'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the module embedded in the deliverable, not a parallel implementation.
const app = fs.readFileSync(process.env.GLYPHPOINT_APP || path.join(__dirname,'..','GlyphPoint-v1a-layout-fixed.html'),'utf8');
const moduleSource = app.match(/\/\* Unicode cells and bounded, inert HTML interchange\.[\s\S]*?if \(typeof module !== 'undefined' && module\.exports\) module\.exports = GPInterchange;/)?.[0];
assert.ok(moduleSource, 'Build the standalone editor before running interchange tests.');
function load(overrides = {}) {
  const sandbox = {Intl,TextEncoder,module:{exports:{}},...overrides};
  vm.runInNewContext(moduleSource,sandbox,{filename:'embedded-interchange.js'});
  return sandbox.module.exports;
}
const interchange = load();
const plain = value => JSON.parse(JSON.stringify(value));

test('extended graphemes preserve combining marks, emoji, flags and Indic/Hangul clusters', () => {
  const glyphs = ['A','e\u0301','👍🏽','👨‍👩‍👧‍👦','🇯🇵','\u0915\u094d\u0937','\u1100\u1161\u11a8'];
  assert.deepEqual(plain(interchange.splitGraphemes(glyphs.join(''))),glyphs);
  for (const glyph of glyphs) assert.equal(interchange.validGrapheme(glyph),true,glyph);
  assert.deepEqual(plain(interchange.splitGraphemes('é'+'e\u0301')),['é','e\u0301'],'No implicit Unicode normalization changes glyph identity');
});

test('a cell accepts exactly one printable grapheme with a finite code-point budget', () => {
  const lastAccepted = 'a' + '\u0301'.repeat(31);
  assert.equal(interchange.MAX_GRAPHEME_CODE_POINTS,32);
  assert.equal(interchange.validGrapheme(lastAccepted),true);
  assert.equal(interchange.validGrapheme(lastAccepted+'\u0301'),false);
  for (const value of ['',null,undefined,1,{},'AB','😀😀','\t','\r\n','\u0000','\u001f','\u007f','\u0080','\u009f','\u2028','\u2029','\ud800','\udfff','A\ud800']) {
    assert.equal(interchange.validGrapheme(value),false,JSON.stringify(value));
  }
  assert.equal(interchange.validGrapheme(' '),true);
  assert.equal(interchange.validGrapheme('𝄞'),true);
  assert.throws(()=>interchange.splitGraphemes(null),/string/);
});

test('old engines retain ASCII but never silently split Unicode clusters', () => {
  const oldEngine = load({Intl:{}});
  assert.deepEqual(plain(oldEngine.splitGraphemes('A B')),['A',' ','B']);
  assert.equal(oldEngine.validGrapheme('A'),true);
  assert.equal(oldEngine.validGrapheme('e\u0301'),false);
  assert.throws(()=>oldEngine.splitGraphemes('👨‍👩‍👧‍👦'),/Intl\.Segmenter/);
});

test('streamed segmentation lets callers reject oversized rows without an eager array', () => {
  const stream = interchange.iterateGraphemes('e\u0301'+'A'.repeat(1000000));
  assert.equal(stream.next().value,'e\u0301');
  assert.equal(stream.next().value,'A');
  assert.equal(stream.return().done,true);
});

test('hex colours and transparency flatten into safe six-digit document colours', () => {
  assert.equal(interchange.normaliseColour('#ABC'),'#aabbcc');
  assert.equal(interchange.normaliseColour('#aabbcc'),'#aabbcc');
  assert.equal(interchange.normaliseColour('#ff000080','#ffffff'),'#ff7f7f');
  assert.equal(interchange.normaliseColour('#f008','#fff'),'#ff7777');
  assert.equal(interchange.normaliseColour('transparent','#123456'),'#123456');
  for (const value of ['#12','#12345','url(https://example.invalid)','var(--red)','currentColor','red; background: url(x)',null]) {
    assert.equal(interchange.normaliseColour(value),null,String(value));
  }
  assert.ok(Object.isFrozen(interchange));
});

test('HTML input type, bytes and limit configuration are rejected before DOM parsing', () => {
  assert.throws(()=>interchange.parseHtml(null),/string/);
  assert.throws(()=>interchange.parseHtml('<pre>A</pre>',{maxDimension:0}),/Invalid HTML import limit/);
  assert.throws(()=>interchange.parseHtml('<pre>A</pre>',{maxFileBytes:5}),/file-size/);
  assert.throws(()=>interchange.parseHtml('éé',{maxFileBytes:3}),/file-size/);
});
