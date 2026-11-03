'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createEditor,plain}=require('./helper.cjs');

test('v3 preserves complete graphemes and independent cell colours; legacy appearance migrates',()=>{
  const e=createEditor();
  e.context.input={format:'glyphpoint-v3',cols:3,rows:1,fieldBg:'#010203',glyphPalette:[{glyph:'A',colour:'#445566'}],cells:[{ch:'A',fg:'#ff0000',bg:'#112233'},{ch:'A',fg:'#00ff00',bg:'#aabbcc'},{ch:'👩🏽‍💻'}]};
  const p=plain(e.run('normaliseProject(input)'));
  assert.equal(p.cells[2].ch,'👩🏽‍💻');assert.equal(p.cells[0].fg,'#ff0000');assert.equal(p.cells[1].fg,'#00ff00');assert.equal(p.cells[1].bg,'#aabbcc');
  e.context.input={format:'glyphpoint-v2',cols:2,rows:1,fieldBg:'#010203',glyphPalette:[],cells:[{ch:'Z',fg:'#123456',bg:'#abcdef'},{ch:'Z',fg:'#ff0000'}]};
  const legacy=plain(e.run('normaliseProject(input)'));
  assert.equal(legacy.glyphPalette.find(p=>p.glyph==='Z').colour,'#123456','Missing legacy palette glyph keeps its previous first-colour seed');
  assert.ok(legacy.cells.every(c=>c.fg===''&&c.bg===''),'Ignored legacy per-cell styles do not change appearance');
  e.context.input.cells[0].ch='e\u0301';assert.throws(()=>e.run('normaliseProject(input)'),/Legacy/);
});

test('grapheme text parser counts combining sequences and emoji as cells and rejects long rows early',()=>{
  const e=createEditor();e.context.input='e\u0301👩🏽‍💻\t🇬🇧';
  const data=plain(e.run('textDocument(input)'));assert.equal(data.cols,5);assert.deepEqual(data.cells.map(c=>c.ch),['e\u0301','👩🏽‍💻',' ',' ','🇬🇧']);
  e.context.input='A'.repeat(1024*1024);assert.throws(()=>e.run('textDocument(input)'),/columns/);
  e.context.input='x'+'\u0301'.repeat(32);assert.throws(()=>e.run('textDocument(input)'),/unsupported|grapheme/i);
});

test('default paste expands and undo restores dimensions, content and complete styles',async()=>{
  const e=createEditor();e.run(`newDocument(2,1,false);state.cells[0]=makeCell('K');rebuildGrid();state.selection={type:'rect',x:1,y:0,w:1,h:1};state.clipboard={w:3,h:2,map:[['0,0',{...makeCell('👩🏽‍💻'),fg:'#ff0000',bg:'#123456'}],['2,1',makeCell('Z')]]};`);
  await e.run('pasteSelection()');assert.equal(e.state.cols,4);assert.equal(e.state.rows,2);assert.equal(e.state.cells[1].fg,'#ff0000');assert.equal(e.state.cells[7].ch,'Z');assert.equal(e.state.selection.w,3);
  e.run('undo()');assert.equal(e.state.cols,2);assert.equal(e.state.rows,1);assert.equal(e.state.cells[0].ch,'K');
});

test('reject and over-budget expansion preserve content and history atomically',async()=>{
  const e=createEditor();e.run(`newDocument(2,1,false);state.edgePolicy='reject';state.selection={type:'rect',x:1,y:0,w:1,h:1};state.clipboard={w:3,h:1,map:[['2,0',makeCell('Z')]]}`);
  const before=plain(e.run('captureDocument()')),history=e.state.history.length;await e.run('pasteSelection()');assert.deepEqual(plain(e.run('captureDocument()')),before);assert.equal(e.state.history.length,history);
  e.run(`state.edgePolicy='expand';state.clipboard.w=513`);await e.run('pasteSelection()');assert.deepEqual(plain(e.run('captureDocument()')),before);assert.equal(e.state.history.length,history);
});

test('moving past top-left expands and shifts unrelated artwork without loss',()=>{
  const e=createEditor();e.run(`newDocument(3,2,false);setCell(0,0,makeCell('A'));setCell(2,1,makeCell('Z'));state.selection={type:'rect',x:0,y:0,w:1,h:1};state.moveSelection={start:{x:0,y:0},copy:captureSelection(),bounds:{...state.selection}};commitMoveSelection({x:-2,y:-1});`);
  assert.equal(e.state.cols,5);assert.equal(e.state.rows,3);assert.equal(e.state.cells[0].ch,'A');assert.equal(e.state.cells[14].ch,'Z');assert.equal(e.state.cells.filter(c=>c.ch==='A').length,1);
});

test('selected quarter rotation expands at the bottom edge without discarding cells',()=>{
  const e=createEditor();e.run(`newDocument(4,2,false);setCell(1,1,makeCell('A'));setCell(2,1,makeCell('B'));setCell(3,1,makeCell('C'));state.selection={type:'rect',x:1,y:1,w:3,h:1};transform('rot90');`);
  assert.equal(e.state.cols,4);assert.equal(e.state.rows,4);assert.deepEqual([e.state.cells[5].ch,e.state.cells[9].ch,e.state.cells[13].ch],['A','B','C']);
});

test('bulk fill commits once and respects same-glyph cells with distinct local colours',async()=>{
  const e=createEditor();e.run(`newDocument(3,1,false);state.cells=[{...makeCell('A'),fg:'#ff0000'},{...makeCell('A'),fg:'#ff0000'},{...makeCell('A'),fg:'#00ff00'}];rebuildGrid();state.history.length=0;`);
  assert.equal(await e.run(`floodFill(0,0,'B')`),true);assert.deepEqual(Array.from(e.state.cells,c=>c.ch),['B','B','A']);assert.equal(e.state.history.length,1);e.run('undo()');assert.ok(e.state.cells.every(c=>c.ch==='A'));
});

test('a cancelled or stale bulk result never enters the document or history',async()=>{
  const e=createEditor();e.run('newDocument(256,256,false);state.history.length=0');
  const pending=e.run(`floodFill(0,0,'X')`);e.run('cancelJob()');assert.equal(await pending,false);assert.equal(e.state.history.length,0);assert.ok(e.state.cells.every(c=>c.ch===' '));
  const stale=e.run(`floodFill(0,0,'X')`);e.run(`setCell(0,0,makeCell('Z'));markDirty()`);assert.equal(await stale,false);assert.equal(e.state.cells[0].ch,'Z');assert.equal(e.state.history.length,0);
});

test('inverse-sampled sequential shear expands bounds and has no forward-scatter interior holes',async()=>{
  const e=createEditor();e.run(`newDocument(3,3,false);state.cells=state.cells.map(()=>makeCell('#'));`);
  const r=plain(await e.run(`GPJobs.run('resize',{cols:3,rows:3,cells:state.cells,width:3,height:3,angleX:45,angleY:0,edgePolicy:'expand'},{preferWorker:false})`));
  assert.equal(r.cols,6);assert.equal(r.rows,3);assert.deepEqual(r.cells.map(c=>c.ch),['#','#','#',' ',' ',' ',' ','#','#','#',' ',' ',' ',' ','#','#','#',' ']);
  const both=plain(await e.run(`GPJobs.run('resize',{cols:3,rows:3,cells:state.cells,width:3,height:3,angleX:45,angleY:45,edgePolicy:'expand'},{preferWorker:false})`));
  assert.equal(both.cols,6);assert.equal(both.rows,9);assert.ok(both.cells.some(c=>c.ch==='#'));
  await assert.rejects(e.run(`GPJobs.run('resize',{cols:3,rows:3,cells:state.cells,width:3,height:3,angleX:45,edgePolicy:'reject'},{preferWorker:false})`),/extends beyond/);
});

test('skew dimensions are validated before allocating a result',async()=>{
  const e=createEditor();e.run('newDocument(256,256,false)');
  await assert.rejects(e.run(`GPJobs.run('resize',{cols:256,rows:256,cells:state.cells,width:256,height:256,angleX:89,angleY:0,edgePolicy:'expand'},{preferWorker:false})`),/limit/);
});

test('cell style edits are independent, undoable, and do not recolour another matching glyph',()=>{
  const e=createEditor();e.run(`newDocument(2,1,false);state.cells=[makeCell('A'),makeCell('A')];rebuildGrid();`);
  e.element('styleFgMode').value='custom';e.element('styleFg').value='#ff0000';e.element('styleBgMode').value='custom';e.element('styleBg').value='#112233';
  e.run('commitCellStyle(true)');assert.equal(e.state.cells[0].fg,'#ff0000');assert.equal(e.state.cells[1].fg,'');assert.equal(e.state.cells[0].bg,'#112233');e.run('undo()');assert.equal(e.state.cells[0].fg,'');
});

test('history resets a direct save handle across document identities and restored filenames',()=>{
  const e=createEditor();e.run(`newDocument(2,1,false);state.docName='same.json';setCell(0,0,makeCell('A'));markDirty();`);
  e.context.resets=0;e.run('fileSaver={reset(){resets++}};newDocument(3,1,true);state.docName="same.json";resets=0;undo()');
  assert.equal(e.context.resets,1,'Equal filenames do not make distinct document identities share a save handle');assert.equal(e.state.cells[0].ch,'A');
  e.run('resets=0;snapshot();state.cells[0]=makeCell("B");markDirty();undo()');assert.equal(e.context.resets,0,'Ordinary same-document undo retains the selected save destination');
  e.run('state.docName="A.json";snapshot();state.docName="B.json";resets=0;undo()');assert.equal(e.context.resets,1,'Undo after Save As cannot silently retain the differently named destination');assert.equal(e.state.docName,'A.json');
});

test('Save As keeps the chosen destination visible when editing continues during its write',async()=>{
  const e=createEditor();e.run('newDocument(1,1,false);state.docName="original.json";markDirty()');
  let close;const closing=new Promise(resolve=>{close=resolve}),writes=[];let pickers=0;
  e.context.chooseFile=async()=>{pickers++;return{name:'chosen.json',async createWritable(){return{async write(text){writes.push(JSON.parse(text))},close:()=>closing}}}};
  e.run('fileSaver=GPRecovery.createFileSaver({capture:projectPayload,validate:normaliseProject,getName:()=>state.docName,getRevision:()=>documentRevision,download:downloadBlob,pickFile:chooseFile})');
  const saving=e.run('saveProject({saveAs:true})');
  e.run('snapshot();setCell(0,0,makeCell("B"));markDirty()');close();const result=await saving;
  assert.equal(result.current,false);assert.equal(e.state.dirty,true);
  assert.equal(e.state.docName,'chosen.json','The title must describe the retained file handle even when newer edits remain unsaved');
  assert.match(e.element('docTitle').textContent,/\*chosen\.json/);
  assert.equal(writes[0].cells[0].ch,' ');
  await e.run('saveProject()');assert.equal(pickers,1);assert.equal(writes[1].cells[0].ch,'B');assert.equal(e.state.dirty,false);
  e.run('undo()');assert.equal(e.state.docName,'original.json');assert.equal(e.run('fileSaver.capabilities().hasHandle'),false);
});

test('a completed old-document save cannot rename or clean a replacement document',async()=>{
  const e=createEditor();e.run('newDocument(1,1,false);state.docName="original.json";markDirty()');
  let close,writing;const closing=new Promise(resolve=>{close=resolve}),entered=new Promise(resolve=>{writing=resolve});
  e.context.chooseFile=async()=>({name:'old-destination.json',async createWritable(){return{async write(){writing()},close:()=>closing}}});
  e.run('fileSaver=GPRecovery.createFileSaver({capture:projectPayload,validate:normaliseProject,getName:()=>state.docName,getRevision:()=>documentRevision,download:downloadBlob,pickFile:chooseFile})');
  const saving=e.run('saveProject({saveAs:true})');await entered;
  e.run('newDocument(2,1,true);state.docName="replacement.json";setCell(0,0,makeCell("R"));markDirty()');
  close();await saving;
  assert.equal(e.state.docName,'replacement.json');assert.equal(e.state.dirty,true);assert.equal(e.state.cells[0].ch,'R');
  assert.equal(e.run('fileSaver.capabilities().hasHandle'),false);
});
