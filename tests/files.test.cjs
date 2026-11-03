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

test('project and palette reads cannot overwrite a recovered, undone, or newly edited document', async () => {
  for (const action of ['recover', 'undo', 'edit']) for (const kind of ['project', 'palette']) {
    const e = createEditor();
    e.run('newDocument(1,1,false);state.docName="original.json";snapshot();setCell(0,0,makeCell("A"));markDirty()');
    let finish;
    const pending = new Promise(resolve => { finish=resolve; });
    e.context.event={target:{value:'file',files:[{name:'pending.json',size:100,text:()=>pending}]}};
    const reading=e.run(kind==='project'?'openProjectFile(event)':'importGlyphPaletteFile(event)');
    if(action==='recover'){
      e.context.restored={format:'glyphpoint-v3',cols:1,rows:1,cells:[{ch:'B'}],glyphPalette:[{glyph:'B',colour:'#00ff00'}],fieldBg:'#000000'};
      e.run('installDocument(normaliseProject(restored),"recovered.json");markDirty()');
    }else if(action==='undo')e.run('undo()');
    else e.run('setCell(0,0,makeCell("B"));markDirty()');
    const before=plain(e.run('captureDocument()')),history=e.state.history.length;
    finish(JSON.stringify(kind==='project'?project():{format:'glyphpoint-v3',glyphPalette:[{glyph:'B',colour:'#ff0000'}],fieldBg:'#123456'}));
    await reading;
    assert.deepEqual(plain(e.run('captureDocument()')),before,`${kind} read replaced ${action} state`);
    assert.equal(e.state.history.length,history);
    assert.match(e.element('msgStat').textContent,/changed while reading.*choose the file again/i);
    assert.equal(e.confirmations.length,0,'A stale read is discarded rather than asking to replace an unrelated current document');
  }
});

test('an unchanged document still accepts an explicitly chosen project or palette', async () => {
  for (const kind of ['project', 'palette']) {
    const e=createEditor();e.run('newDocument(1,1,false);setCell(0,0,makeCell("A"));markDirty()');
    const value=kind==='project'?project():{format:'glyphpoint-v3',glyphPalette:[{glyph:'A',colour:'#ff0000'}],fieldBg:'#123456'};
    e.context.event={target:{value:'file',files:[{name:'chosen.json',size:100,async text(){return JSON.stringify(value)}}]}};
    await e.run(kind==='project'?'openProjectFile(event)':'importGlyphPaletteFile(event)');
    assert.equal(e.state.glyphPalette.find(entry=>entry.glyph==='A').colour,kind==='project'?'#123456':'#ff0000');
    assert.equal(e.state.fieldBg,kind==='project'?'#102030':'#123456');
    assert.equal(e.confirmations.length,kind==='project'?1:0);
  }
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
