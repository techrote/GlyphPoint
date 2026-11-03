'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEditor, plain } = require('./helper.cjs');

function documentOf(editor, cols, rows, chars = []) {
  editor.context.__chars = chars;
  editor.run(`newDocument(${cols}, ${rows}, false); state.history.length=0; state.future.length=0;`);
  editor.run('state.cells = state.cells.map((cell, i) => makeCell(__chars[i] ?? " ")); rebuildGrid();');
}

function glyphs(editor) { return Array.from(editor.state.cells, cell => cell.ch); }
function painted(editor) {
  return Array.from(editor.state.cells, (cell, i) => ({
    ch: cell.ch, x: i % editor.state.cols, y: Math.floor(i / editor.state.cols),
  })).filter(cell => cell.ch !== ' ');
}

test('square brush and stroke widths use the requested number of cells', () => {
  const e = createEditor();
  documentOf(e, 12, 12);
  for (const size of [1, 2, 3, 4, 6]) {
    e.context.__size = size;
    const points = plain(e.run('footprintOf(5, 5, __size, "square")'));
    assert.equal(points.length, size * size, `square brush size ${size}`);
    assert.equal(new Set(points.map(point => point[0])).size, size);
    assert.equal(new Set(points.map(point => point[1])).size, size);
    documentOf(e, 12, 12);
    e.run('strokePoint(5, 5, "#", __size)');
    assert.equal(painted(e).length, size * size, `shape stroke width ${size}`);
  }
});

test('even circular brushes stay within their requested bounding box', () => {
  const e = createEditor();
  documentOf(e, 12, 12);
  for (const size of [2, 4, 6]) {
    const points = plain(e.run(`footprintOf(5, 5, ${size}, "circle")`));
    const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
    assert.ok(points.length > 0);
    assert.ok(Math.max(...xs) - Math.min(...xs) + 1 <= size);
    assert.ok(Math.max(...ys) - Math.min(...ys) + 1 <= size);
  }
});

test('clipped shape outlines never wrap horizontal overflow into another row', () => {
  const e = createEditor();
  documentOf(e, 5, 5);
  e.run('drawShape("rect", {x:4,y:0}, {x:6,y:2})');
  assert.deepEqual(painted(e).map(({ x, y }) => [x, y]), [[4, 0], [4, 1], [4, 2]]);
});

test('box drawing at canvas edges does not connect adjacent rows', () => {
  const e = createEditor();
  documentOf(e, 3, 3);
  e.run('state.outlineMode="solid"; drawShape("rect", {x:0,y:0}, {x:2,y:2})');
  assert.deepEqual(glyphs(e), ['┌', '─', '┐', '│', ' ', '│', '└', '─', '┘']);
});

test('a horizontal or single-cell ellipse produces a finite visible outline', () => {
  const e = createEditor();
  documentOf(e, 5, 5);
  e.run('drawShape("ellipse", {x:1,y:2}, {x:3,y:2})');
  assert.deepEqual(painted(e).map(({ x, y }) => [x, y]), [[1, 2], [2, 2], [3, 2]]);
  documentOf(e, 5, 5);
  e.run('drawShape("ellipse", {x:2,y:2}, {x:2,y:2})');
  assert.deepEqual(painted(e).map(({ x, y }) => [x, y]), [[2, 2]]);
});

test('oversized paste clips the landed selection and can be copied safely', async () => {
  const e = createEditor();
  documentOf(e, 4, 2);
  e.run(`
    state.selection={type:'rect', x:3,y:1,w:1,h:1};
    state.clipboard={w:3,h:2,map:[['0,0',makeCell('A')],['1,0',makeCell('B')],['2,0',makeCell('C')],['0,1',makeCell('D')]]};
  `);
  await e.run('pasteSelection()');
  assert.equal(e.state.cells[7].ch, 'A');
  assert.deepEqual(plain(e.state.selection), { type: 'rect', x: 3, y: 1, w: 1, h: 1 });
  await e.run('copySelection()');
  assert.equal(e.clipboard.text, 'A');
});

test('moving a selection beyond an edge clips its new bounds and contents', () => {
  const e = createEditor();
  documentOf(e, 4, 4);
  e.run(`
    setCell(1,1,makeCell('A'));setCell(2,1,makeCell('B'));
    setCell(1,2,makeCell('C'));setCell(2,2,makeCell('D'));
    state.selection={type:'rect',x:1,y:1,w:2,h:2};
    state.moveSelection={start:{x:1,y:1},copy:captureSelection(),bounds:{...state.selection}};
    commitMoveSelection({x:3,y:3});
  `);
  assert.deepEqual(painted(e), [{ ch: 'A', x: 3, y: 3 }]);
  assert.deepEqual(plain(e.state.selection), { type: 'rect', x: 3, y: 3, w: 1, h: 1 });
  const captured = plain(e.run('captureSelection()'));
  assert.equal(captured.map.length, 1);
  assert.equal(captured.map[0][1].ch, 'A');
});

test('free selection moves retain only the landed mask entries', () => {
  const e = createEditor();
  documentOf(e, 4, 4);
  e.run(`
    setCell(1,1,makeCell('A'));setCell(2,2,makeCell('B'));
    state.selection={type:'free',x:1,y:1,w:2,h:2,mask:[[0,0],[1,1]]};
    state.moveSelection={start:{x:1,y:1},copy:captureSelection(),bounds:{...state.selection}};
    commitMoveSelection({x:3,y:3});
  `);
  assert.equal(e.state.selection.type, 'free');
  assert.deepEqual(plain(e.state.selection.mask), [[0, 0]]);
  assert.equal(e.state.selection.w, 1);
  assert.equal(e.state.selection.h, 1);
  assert.deepEqual(painted(e), [{ ch: 'A', x: 3, y: 3 }]);
});

test('capture excludes out-of-bounds cells even if given a stale selection', () => {
  const e = createEditor();
  documentOf(e, 2, 1, ['A', 'B']);
  e.run('state.selection={type:"rect",x:1,y:0,w:3,h:1}');
  const captured = plain(e.run('captureSelection()'));
  assert.equal(captured.map.length, 1);
  assert.equal(captured.map[0][1].ch, 'B');
});

test('free-form transforms preserve every unselected cell outside their mask', () => {
  const e = createEditor();
  const input = ['A', 'b', 'B', 'd', 'e', 'f', 'C', 'h', 'D'];
  for (const [type, expected] of [
    ['flipH', ['B', 'b', 'A', 'd', 'e', 'f', 'D', 'h', 'C']],
    ['rot90', ['C', 'b', 'A', 'd', 'e', 'f', 'D', 'h', 'B']],
  ]) {
    documentOf(e, 3, 3, input);
    e.run('state.selection={type:"free",x:0,y:0,w:3,h:3,mask:[[0,0],[2,0],[0,2],[2,2]]}');
    e.run(`transform(${JSON.stringify(type)})`);
    assert.deepEqual(glyphs(e), expected, type);
    assert.equal(e.state.selection.type, 'free', `${type} preserves a free selection`);
    assert.equal(e.state.selection.mask.length, 4);
  }
});

test('free-form crop blanks cells that were outside the selected mask', () => {
  const e = createEditor();
  documentOf(e, 3, 3, ['A', 'b', 'B', 'd', 'e', 'f', 'C', 'h', 'D']);
  e.run('state.selection={type:"free",x:0,y:0,w:3,h:3,mask:[[0,0],[2,0],[0,2],[2,2]]}; cropSelection()');
  assert.deepEqual(glyphs(e), ['A', ' ', 'B', ' ', ' ', ' ', 'C', ' ', 'D']);
});

test('cut deletes the originally captured region if clipboard completion is delayed', async () => {
  let finishWrite;
  const e = createEditor({ clipboard: {
    writeText(text) {
      this.text = text;
      return new Promise(resolve => { finishWrite = resolve; });
    },
  } });
  documentOf(e, 2, 1, ['A', 'B']);
  e.run('state.selection={type:"rect",x:0,y:0,w:1,h:1}');
  const pending = e.run('cutSelection()');
  e.run('state.selection={type:"rect",x:1,y:0,w:1,h:1}');
  assert.equal(typeof finishWrite, 'function');
  finishWrite();
  await pending;
  assert.deepEqual(glyphs(e), [' ', 'B']);
  assert.equal(e.clipboard.text, 'A');
});

test('copy preserves a rectangular Unicode grid, blanks and row boundaries', async () => {
  const e = createEditor();
  const cols = 80, rows = 80;
  const chars = Array.from({ length: cols * rows }, (_, i) => ['A', ' ', '😀', '#'][i % 4]);
  documentOf(e, cols, rows, chars);
  e.run('state.selection={type:"rect",x:0,y:0,w:80,h:80}');
  await e.run('copySelection()');
  const expected = Array.from({ length: rows }, (_, y) => chars.slice(y * cols, (y + 1) * cols).join('')).join('\n');
  assert.equal(e.clipboard.text, expected);
  assert.equal(e.state.clipboard.map.length, cols * rows);
});

test('external clipboard text uses Unicode code points and ignores a final line ending', async () => {
  const e = createEditor();
  documentOf(e, 2, 2);
  e.clipboard.text = '😀B\nCD\n';
  await e.run('pasteSelection()');
  assert.deepEqual(glyphs(e), ['😀', 'B', 'C', 'D']);
  assert.equal(e.state.selection.w, 2);
  assert.equal(e.state.selection.h, 2);
  assert.equal(e.alerts.length, 0);
});

test('a delayed external paste cannot write into a newly created document', async () => {
  let finishRead;
  const e = createEditor({ clipboard: {
    readText() { return new Promise(resolve => { finishRead = resolve; }); },
  } });
  documentOf(e, 2, 1, ['A', 'B']);
  const pending = e.run('pasteSelection()');
  assert.equal(typeof finishRead, 'function');
  e.run('newDocument(2, 1, false)');
  finishRead('X');
  await pending;
  assert.deepEqual(glyphs(e), [' ', ' ']);
  assert.match(e.element('msgStat').textContent, /changed|cancel|again/i);
});

test('external paste retains its original destination while clipboard permission is pending', async () => {
  let finishRead;
  const e = createEditor({ clipboard: {
    readText() { return new Promise(resolve => { finishRead = resolve; }); },
  } });
  documentOf(e, 3, 1, ['A', 'B', 'C']);
  e.run('state.selection={type:"rect",x:0,y:0,w:1,h:1}');
  const pending = e.run('pasteSelection()');
  e.run('state.selection={type:"rect",x:2,y:0,w:1,h:1}');
  finishRead('X');
  await pending;
  assert.deepEqual(glyphs(e), ['X', 'B', 'C']);
  assert.equal(e.state.selection.x, 0);
});

test('editing controls retain native clipboard, delete, undo and punctuation keys', () => {
  const e = createEditor();
  documentOf(e, 2, 1, ['A', 'B']);
  e.run(`
    state.selection={type:'rect',x:0,y:0,w:2,h:1};
    globalThis.__commands=[];
    undo=()=>__commands.push('undo'); redo=()=>__commands.push('redo');
    copySelection=()=>__commands.push('copy'); cutSelection=()=>__commands.push('cut');
    pasteSelection=()=>__commands.push('paste'); deleteSelection=()=>__commands.push('delete');
    setZoom=()=>__commands.push('zoom');
  `);
  const input = e.element('textValue');
  for (const [key, ctrlKey] of [['c', true], ['x', true], ['v', true], ['z', true], ['y', true], ['Delete', false], ['+', false], ['-', false], ['=', false]]) {
    let prevented = false;
    e.context.__event = { key, ctrlKey, metaKey: false, target: input, preventDefault() { prevented = true; } };
    e.run('keyboard(__event)');
    assert.equal(prevented, false, `${key} remains native inside textarea`);
  }
  assert.deepEqual(plain(e.run('__commands')), []);
  assert.deepEqual(glyphs(e), ['A', 'B']);
});

test('a modal dialog blocks canvas keyboard commands when its button has focus', () => {
  const e = createEditor();
  documentOf(e, 2, 1, ['A', 'B']);
  e.run('state.selection={type:"rect",x:0,y:0,w:2,h:1}');
  e.element('textDialog').open = true;
  const button = e.element('applyText', 'button');
  button.parentElement = e.element('textDialog');
  e.context.__event = { key: 'Delete', target: button, ctrlKey: false, metaKey: false, preventDefault() {} };
  e.run('keyboard(__event)');
  assert.deepEqual(glyphs(e), ['A', 'B']);
});

test('history restores project identity, appearance, slots, palette and cells', () => {
  const e = createEditor();
  documentOf(e, 2, 1, ['A', 'B']);
  e.run(`
    state.docName='before.json'; state.fieldBg='#123456'; state.square=false;
    state.glyphPrimary='A'; state.glyphSecondary='B'; state.drawGlyph='A';
    state.glyphPalette=[{glyph:'A',colour:'#abcdef',represents:'first'},{glyph:'B',colour:'#fedcba',represents:'second'}];
    snapshot();
    state.docName='after.json'; state.fieldBg='#654321'; state.square=true;
    state.glyphPrimary='B'; state.glyphSecondary='A'; state.drawGlyph='B';
    state.glyphPalette[0].colour='#111111'; state.cells[0].ch='B';
    undo();
  `);
  assert.equal(e.state.docName, 'before.json');
  assert.equal(e.state.fieldBg, '#123456');
  assert.equal(e.state.square, false);
  assert.equal(e.state.glyphPrimary, 'A');
  assert.equal(e.state.glyphSecondary, 'B');
  assert.equal(e.state.drawGlyph, 'A');
  assert.equal(e.state.glyphPalette[0].colour, '#abcdef');
  assert.deepEqual(glyphs(e), ['A', 'B']);
  e.run('redo()');
  assert.equal(e.state.docName, 'after.json');
  assert.equal(e.state.fieldBg, '#654321');
  assert.equal(e.state.square, true);
  assert.equal(e.state.glyphPrimary, 'B');
  assert.equal(e.state.glyphSecondary, 'A');
  assert.deepEqual(glyphs(e), ['B', 'B']);
});

test('changing a used glyph colour is a dirty, undoable document edit', () => {
  const e = createEditor();
  documentOf(e, 2, 1, ['#', '#']);
  const original = e.run('getGlyphColour("#")');
  e.run('state.dirty=false; setGlyphColour("#", "#123456")');
  assert.equal(e.run('getGlyphColour("#")'), '#123456');
  assert.equal(e.state.dirty, true);
  assert.equal(e.state.history.length, 1);
  e.run('undo()');
  assert.equal(e.run('getGlyphColour("#")'), original);
  assert.deepEqual(glyphs(e), ['#', '#']);
});

test('glyph manager revert restores canvas renames as well as palette slots', () => {
  const e = createEditor();
  documentOf(e, 2, 1, ['A', 'B']);
  e.run('state.glyphPrimary="A";state.glyphSecondary="B";state.drawGlyph="A";openGlyphColourManager()');
  const result = plain(e.run('replacePaletteGlyph("A", "Z")'));
  assert.equal(result.ok, true);
  assert.deepEqual(glyphs(e), ['Z', 'B']);
  assert.equal(e.state.dirty, true);
  e.run('revertGlyphManager()');
  assert.deepEqual(glyphs(e), ['A', 'B']);
  assert.equal(e.state.glyphPrimary, 'A');
  assert.equal(e.state.drawGlyph, 'A');
  assert.ok(e.run('paletteEntry("A")'));
  assert.equal(e.run('paletteEntry("Z")'), null);
  e.run('undo()');
  assert.deepEqual(glyphs(e), ['Z', 'B']);
});

test('palette capacity reserves space so a full valid document remains erasable', () => {
  const e = createEditor();
  const entries = Array.from({ length: 4095 }, (_, i) => ({ glyph: String.fromCodePoint(0x4e00 + i), colour: '#ffffff' }));
  e.context.__entries = entries;
  assert.throws(() => e.run('normalisePalette([...__entries,{glyph:"Z",colour:"#ffffff"}])'), /palette|4096|4,096|space/i);
  e.run(`
    const normalized=normaliseProject({format:'glyphpoint-v2',cols:1,rows:1,cells:[makeCell(__entries[0].glyph)],glyphPalette:__entries});
    installDocument(normalized,'capacity.json');
  `);
  assert.equal(e.state.glyphPalette.length, 4096);
  assert.ok(e.run('paletteEntry(" ")'));
  e.run('state.selection={type:"rect",x:0,y:0,w:1,h:1};deleteSelection()');
  assert.deepEqual(glyphs(e), [' ']);
  e.run('newDocument(1,1,false);saveProject()');
  assert.equal(e.downloads.length, 1);
  assert.equal(e.alerts.length, 0);
});

test('the reserved blank palette entry cannot be removed or renamed', () => {
  const e = createEditor();
  documentOf(e, 1, 1, ['A']);
  e.run('removePaletteGlyph(state.glyphPalette.findIndex(entry=>entry.glyph===" "))');
  assert.ok(e.run('paletteEntry(" ")'));
  const replacement = plain(e.run('replacePaletteGlyph(" ","Z")'));
  assert.equal(replacement.ok, false);
  assert.ok(e.run('paletteEntry(" ")'));
  e.run('state.paletteEditIndex=state.glyphPalette.findIndex(entry=>entry.glyph===" ")');
  e.element('paletteGlyphInput').value = 'Z';
  e.element('paletteColourInput').value = '#ffffff';
  e.run('applyPaletteEditor()');
  assert.ok(e.run('paletteEntry(" ")'));
  assert.equal(e.run('paletteEntry("Z")'), null);
});

test('palette reset retains all used glyphs at capacity and chooses existing slots', () => {
  const e = createEditor();
  e.context.__chars = Array.from({ length: 4095 }, (_, i) => String.fromCodePoint(0x4e00 + i));
  e.run(`
    installDocument(normaliseProject({format:'glyphpoint-v2',cols:65,rows:63,
      cells:__chars.map(ch=>makeCell(ch)),glyphPalette:__chars.map(glyph=>({glyph,colour:'#123456'}))
    }),'capacity.json');
    resetPalette();
  `);
  assert.equal(e.state.glyphPalette.length, 4096);
  assert.ok(e.run('state.cells.every(c=>!!paletteEntry(c.ch))'));
  assert.ok(e.run('paletteEntry(" ")'));
  assert.ok(e.run('paletteEntry(state.glyphPrimary)'));
  assert.ok(e.run('paletteEntry(state.glyphSecondary)'));
  assert.equal(e.state.drawGlyph, e.state.glyphPrimary);
  assert.equal(e.alerts.length, 0);
});

test('reusing a removed unused glyph restores its palette entry', () => {
  const e = createEditor();
  documentOf(e, 1, 1, ['#']);
  e.run('eraseBrush(0,0);removePaletteGlyph(state.glyphPalette.findIndex(entry=>entry.glyph==="#"))');
  assert.equal(e.run('paletteEntry("#")'), null);
  e.run('paintBrush(0,0,"#")');
  assert.deepEqual(glyphs(e), ['#']);
  assert.ok(e.run('paletteEntry("#")'));
  assert.equal(e.run('getGlyphColour("#")'), e.run('defaultColourForGlyph("#")'));
});

test('history enforces both entry and aggregate cell budgets across undo and redo', () => {
  const e = createEditor();
  documentOf(e, 1, 1);
  e.run('for(let i=0;i<65;i++){state.docName=`small-${i}`;snapshot()}');
  assert.equal(e.state.history.length, 60);
  documentOf(e, 128, 64);
  e.run('for(let i=0;i<40;i++){state.docName=`large-${i}`;snapshot()}state.docName="working";undo()');
  assert.equal(e.state.docName, 'large-39');
  const retained = e.run('[...state.history,...state.future].reduce((n,s)=>n+s.cells.length,0)');
  assert.ok(retained <= 262144);
  assert.ok(e.state.history.length + e.state.future.length <= 60);
  e.run('redo()');
  assert.equal(e.state.docName, 'working');
  assert.ok(e.run('[...state.history,...state.future].reduce((n,s)=>n+s.cells.length,0)') <= 262144);
});
