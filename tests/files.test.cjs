'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createEditor, plain} = require('./helper.cjs');

const project = () => ({format:'glyphpoint-v2',cols:1,rows:1,cells:[{ch:'A'}],glyphPalette:[{glyph:'A',colour:'#123456'}],fieldBg:'#102030'});

test('project normalization rejects invalid dimensions, arrays, glyphs and schema types', () => {
  const e = createEditor();
  for (const patch of [{cols:NaN},{cols:0},{rows:1.2},{cols:512,rows:512},{cells:[]},{cells:[{ch:'AB'}]},{cells:[{ch:'\ud800'}]},{square:'yes'},{fieldBg:'red'},{kind:'palette'},{glyphPalette:[{glyph:'A'},{glyph:'A'}]}]) {
    e.context.payload={...project(),...patch};
    assert.throws(()=>e.run('normaliseProject(payload)'));
  }
  e.context.payload={...project(),cells:[{ch:'😀'}]};
  assert.equal(e.run('normaliseProject(payload).cells[0].ch'),'😀');
});

test('legacy v1 data normalizes safe colours, fonts and reserved space without executing metadata', () => {
  const e = createEditor();
  e.context.payload={format:'glyphpoint-v1',cols:1,rows:1,cells:[{ch:'A',font:'" onload="x',bold:'true'}],glyphPalette:['A'],glyphColours:{A:'red;bad-css'},defaultBg:'#123456'};
  const data=plain(e.run('normaliseProject(payload)'));
  assert.equal(data.fieldBg,'#123456');assert.equal(data.cells[0].font,'Cascadia Mono');assert.equal(data.cells[0].bold,false);
  assert.equal(data.glyphPalette.find(entry=>entry.glyph==='A').colour,'#ffffff');assert.ok(data.glyphPalette.some(entry=>entry.glyph===' '));
});

test('file budget rejects oversized input before invoking its text reader', async () => {
  const e = createEditor();let reads=0;
  e.context.file={size:16*1024*1024+1,async text(){reads++;return '{}'}};
  await assert.rejects(e.run('readImportFile(file)'),/16 MiB/);assert.equal(reads,0);
});

test('text parsing counts code points, expands four-column tabs and preserves extra blank rows', () => {
  const e = createEditor();
  e.context.text='\uFEFFA😀\tB\r\nZ\r\n\r\n';
  const result=plain(e.run('textDocument(text)'));
  assert.equal(result.cols,5);assert.equal(result.rows,3);
  assert.deepEqual(result.cells.map(c=>c.ch),['A','😀',' ',' ','B','Z',' ',' ',' ',' ',' ',' ',' ',' ',' ']);
  for(const text of ['', '\u0000', 'x'.repeat(513), Array(514).fill('x').join('\n')]){e.context.text=text;assert.throws(()=>e.run('textDocument(text)'))}
});

test('failed and superseded file reads cannot mutate the current document or history', async () => {
  const e = createEditor();e.run('newDocument(2,1,false);state.docName="kept";state.dirty=true');
  const before=plain(e.run('captureDocument()'));const history=e.state.history.length;
  e.context.event={target:{value:'file',files:[{name:'broken.json',size:1,async text(){return '{'}}]}};
  await e.run('openProjectFile(event)');assert.deepEqual(plain(e.run('captureDocument()')),before);assert.equal(e.state.history.length,history);
  let finish;const pending=new Promise(resolve=>{finish=resolve});
  e.context.event={target:{value:'file',files:[{name:'stale.json',size:100,text:()=>pending}]}};
  const read=e.run('openProjectFile(event)');e.run('newDocument(3,2,false)');finish(JSON.stringify(project()));await read;
  assert.equal(e.state.docName,'untitled');assert.equal(e.state.cols,3);assert.equal(e.state.rows,2);
});

test('export escapes script-closing palette labels and preserves normalized project data', () => {
  const e = createEditor();e.run('newDocument(2,1,false);setCell(0,0,makeCell("<"));setCell(1,0,makeCell("&"))');
  e.context.label='</script><img src=x onerror=alert(1)>';
  e.run('state.glyphPalette[0].represents=label;exportHtml()');
  assert.equal(e.downloads.length,1);const html=e.downloads[0].data;
  assert.ok(html.includes('&lt;</span>'));assert.ok(html.includes('&amp;</span>'));
  assert.ok(!html.includes('</script><img'));assert.ok(html.includes('\\u003c/script\\u003e'));
  const json=html.match(/<script id="glyphpoint-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  const restored=JSON.parse(json);assert.equal(restored.glyphPalette[0].represents,e.context.label);assert.deepEqual(restored.cells.map(c=>c.ch),['<','&']);
});
