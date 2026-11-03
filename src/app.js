'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const deepCell = c => ({...c});
const makeCell=(ch=' ')=>({ch,fg:'',bg:'',font:'DejaVu Sans Mono',bold:false,italic:false,underline:false});
// Bound model allocation and retained history. Validate before replacing a document.
const MAX_DIMENSION=512,MAX_CELLS=65536,MAX_FILE_BYTES=16*1024*1024,MAX_PALETTE=4096;
const MAX_HISTORY=60,MAX_HISTORY_CELLS=262144;
let importGeneration=0,documentRevision=0,documentIdentity=0,preferencesUnavailable=false;
let renderer=null,recovery=null,fileSaver=null,activeJob=null;
function validateDimensions(cols,rows){
  if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<1||rows<1||cols>MAX_DIMENSION||rows>MAX_DIMENSION||cols*rows>MAX_CELLS)
    throw Error(`Use whole-number dimensions from 1 to ${MAX_DIMENSION}, with at most ${MAX_CELLS.toLocaleString()} cells in total.`);
  return {cols,rows};
}
const validGlyphCache=new Set();
function validGlyph(ch){if(validGlyphCache.has(ch))return true;if(!GPInterchange.validGrapheme(ch))return false;if(validGlyphCache.size>=MAX_PALETTE)validGlyphCache.clear();validGlyphCache.add(ch);return true}
const SAFE_FONTS=['Cascadia Mono','Cascadia Code','Consolas','Courier New','DejaVu Sans Mono','monospace'];
function normaliseFont(font){return SAFE_FONTS.includes(font)?font:'Cascadia Mono'}
function normaliseCell(c){
  if(!c||typeof c!=='object'||!validGlyph(c.ch))throw Error('Each cell must contain one printable grapheme (up to 32 Unicode code points).');
  for(const key of ['fg','bg'])if(c[key]!==undefined&&c[key]!==''&&!validColour(c[key]))throw Error('Cell colours must be empty (inherit) or six-digit hex colours.');
  return {ch:c.ch,fg:validColour(c.fg)?c.fg.toLowerCase():'',bg:validColour(c.bg)?c.bg.toLowerCase():'',font:normaliseFont(c.font),bold:c.bold===true,italic:c.italic===true,underline:c.underline===true};
}
function includeUsedGlyphs(palette,cells){
  const seen=new Set(palette.map(e=>e.glyph));
  for(const c of cells)if(!seen.has(c.ch)){
    if(palette.length>=MAX_PALETTE)throw Error(`A document supports at most ${MAX_PALETTE} distinct palette glyphs.`);
    palette.push({glyph:c.ch,colour:validColour(c.fg)?c.fg:defaultColourForGlyph(c.ch),represents:''});seen.add(c.ch);
  }
  return palette;
}
let hoveredCells=[];

const DEFAULT_GLYPH_CHARS=['#','.','+','~','*','X','O','@',' ','=','-','|','>','<','^','o','x'];
const DEFAULT_GLYPH_COLOURS=['#a8e6a3','#88d8c0','#7fd4d4','#9ed9e0','#f6b5c4','#e6a8d7','#c0a8e6','#b8a6f5'];
const DEFAULT_GLYPH_PALETTE=DEFAULT_GLYPH_CHARS.map(glyph=>({glyph,colour:DEFAULT_GLYPH_COLOURS[glyph.codePointAt(0)%DEFAULT_GLYPH_COLOURS.length]}));
const PREFS_KEY='glyphpoint.palette.v3';
const LEGACY_PREFS_KEY='glyphpoint.palette.v2';
const UI_MODE_KEY='glyphpoint.uiMode.v1';

const state={
  cols:80,rows:80,cells:[],tool:'pencil',shape:'line',
  fieldBg:'#000000',brushSize:1,shapeSize:1,brushShape:'square',
  outlineMode:'rough',fillMode:'none',shiftHeld:false,zoom:1,grid:true,rulers:true,status:true,square:false,
  transparentSelect:true,selection:null,clipboard:null,history:[],future:[],drawing:false,
  actionStart:null,lastCell:null,freePath:[],preview:new Set(),textAnchor:null,docName:'untitled',dirty:false,
  cursor:{x:0,y:0},keyboardAnchor:null,drawSecondary:false,panMode:false,paintFg:'',paintBg:'',edgePolicy:'expand',
  glyphCounts:{},glyphPalette:DEFAULT_GLYPH_PALETTE.map(e=>({...e})),
  paletteEditing:false,paletteEditIndex:null,paletteBgMode:'grey',glyphPrimary:'#',glyphSecondary:'+',drawGlyph:'#',knownGlyphs:new Set(),uiMode:'ribbon'
};

const SHAPES=[
  ['line','\u2571'],['rect','\u25A1'],['ellipse','\u25CB'],['triangle','\u25B3'],
  ['rightTri','\u25FF'],['diamond','\u25C7'],['arrowR','\u2192'],['arrowL','\u2190'],['arrowU','\u2191'],
  ['arrowD','\u2193'],['slash','/'],['bslash','\\']
];
const BRUSH_RATIOS={rect13:[1,3],rect31:[3,1],rect15:[1,5],rect51:[5,1]};

function init(){
  loadLocalPrefs();
  renderer=GPRenderer.create({canvas:$('#canvasGrid'),overlay:$('#canvasOverlay'),scroller:$('#scroller'),spacer:$('#canvasWrap'),getState:()=>state,getGlyphColour,onMetrics:()=>renderRulers(),fontFamily:'DejaVu Sans Mono'});
  newDocument(80,80,false);
  buildShapes();bindUI();setUiMode(state.uiMode,false);setZoom(1);setTool('pencil');renderRulers();setMessage('Ready');
  buildGlyphPalette();buildColourPresets();
  $$('button[title]').forEach(b=>{if(!b.getAttribute('aria-label'))b.setAttribute('aria-label',b.title)});
  $$('dialog').forEach(d=>{const title=d.querySelector('.dlgTitle,.gcm-titletext');if(title){if(!title.id)title.id=d.id+'Title';d.setAttribute('aria-labelledby',title.id)}});
  $$('.dlgGrid>label,.options>label').forEach(label=>{const input=label.nextElementSibling;if(input&&/^(INPUT|SELECT|TEXTAREA)$/.test(input.tagName)&&input.id)label.htmlFor=input.id});
  state.grid=true;$('#canvasGrid').classList.add('gridlines');$('#gridToggle').checked=true;
  $('#fieldBgInput').value=state.fieldBg;$('#squareToggle').setAttribute('aria-pressed',state.square);
  initWorkflows();
}
function safeStorageGet(key){try{return localStorage.getItem(key)}catch{return null}}
function safeStorageSet(key,value){try{localStorage.setItem(key,value);return true}catch{return false}}
function validColour(v){return /^#[0-9a-f]{6}$/i.test(String(v||''))}
function normalisePalette(list,legacyColours={}){
  if(!Array.isArray(list))throw Error('Palette must be an array.');
  if(list.length>MAX_PALETTE)throw Error(`A palette supports at most ${MAX_PALETTE} entries.`);
  const out=[],seen=new Set();
  for(const raw of list){
    const source=raw&&typeof raw==='object'?raw:{};
    const glyph=source.glyph??raw;
    if(!validGlyph(glyph))throw Error('Palette entries must contain one printable grapheme (up to 32 code points).');
    if(seen.has(glyph))throw Error('Palette contains a duplicate glyph.');
    const legacy=legacyColours?.[glyph],fallback=validColour(legacy)?legacy.toLowerCase():defaultColourForGlyph(glyph);
    out.push({glyph,colour:validColour(source.colour)?source.colour.toLowerCase():fallback,represents:typeof source.represents==='string'?source.represents.slice(0,80):''});seen.add(glyph);
  }
  if(!seen.has(' ')){if(out.length>=MAX_PALETTE)throw Error('Palette needs room for the reserved space glyph.');out.push({glyph:' ',colour:'#000000',represents:''})}
  return out;
}
let paletteLookup=null,paletteLookupSource=null,paletteLookupLength=-1;
function invalidatePaletteLookup(){paletteLookupSource=null}
function paletteEntry(ch){
  if(paletteLookupSource!==state.glyphPalette||paletteLookupLength!==state.glyphPalette.length){paletteLookup=new Map(state.glyphPalette.map(e=>[e.glyph,e]));paletteLookupSource=state.glyphPalette;paletteLookupLength=state.glyphPalette.length}
  return paletteLookup.get(ch)||null;
}
function defaultColourForGlyph(ch){return DEFAULT_GLYPH_PALETTE.find(e=>e.glyph===ch)?.colour||'#ffffff'}
function getGlyphColour(ch){return /^\s$/u.test(ch||'')?state.fieldBg:(paletteEntry(ch)?.colour||'#ffffff')}
function refreshGlyphColourUI(){renderAll();buildGlyphPalette();buildGlyphColourPanel()}

function setGlyphColour(ch,colour,{persist=true,refresh=true,record=true}={}){
  if(!validGlyph(ch)||!validColour(colour))return null;
  let entry=paletteEntry(ch);const next=colour.toLowerCase();
  if(entry?.colour===next)return next;
  if(!entry&&state.glyphPalette.length>=MAX_PALETTE){setMessage('Palette limit reached');return null}
  if(record)snapshot();
  if(!entry){entry={glyph:ch,colour:'#ffffff',represents:''};state.glyphPalette.push(entry)}
  entry.colour=next;markDirty();if(persist)savePalettePrefs();if(refresh)refreshGlyphColourUI();return entry.colour;
}
function ensureGlyphEntry(ch,colour=defaultColourForGlyph(ch)){if(!validGlyph(ch)||paletteEntry(ch))return false;if(state.glyphPalette.length>=MAX_PALETTE)return false;state.glyphPalette.push({glyph:ch,colour:validColour(colour)?colour.toLowerCase():'#ffffff',represents:''});return true}
function loadLocalPrefs(){
  try{const raw=safeStorageGet(PREFS_KEY)||safeStorageGet(LEGACY_PREFS_KEY);if(raw){const p=JSON.parse(raw),pal=normalisePalette(p.palette,p.glyphColours||{});if(pal.length)state.glyphPalette=pal;if(typeof p.primary==='string')state.glyphPrimary=GPInterchange.splitGraphemes(p.primary)[0]??'#';if(typeof p.secondary==='string')state.glyphSecondary=GPInterchange.splitGraphemes(p.secondary)[0]??'+';if(p.bgMode==='grey'||p.bgMode==='invert')state.paletteBgMode=p.bgMode}}
  catch{}
  const mode=safeStorageGet(UI_MODE_KEY);if(mode==='classic'||mode==='ribbon')state.uiMode=mode;
  const glyphs=state.glyphPalette.map(e=>e.glyph);
  if(!glyphs.includes(state.glyphPrimary))state.glyphPrimary=glyphs[0]??'#';
  if(!glyphs.includes(state.glyphSecondary))state.glyphSecondary=glyphs[1]??state.glyphPrimary;
  state.drawGlyph=state.glyphPrimary;
}
function savePalettePrefs(){const saved=safeStorageSet(PREFS_KEY,JSON.stringify({palette:state.glyphPalette,primary:state.glyphPrimary,secondary:state.glyphSecondary,bgMode:state.paletteBgMode}));preferencesUnavailable=!saved;if(!saved)setMessage('Palette changes are available for this session.');return saved}
function updateClassicOverflow(){
  if(window.matchMedia?.('(max-width:760px),(pointer:coarse)')?.matches){$$('.ribbonwrap').forEach(w=>w.classList.remove('classic-overflow'));return}
  const wrap=document.querySelector('#app.classic .ribbonwrap'),ribbon=document.querySelector('#app.classic .ribbon');
  if(!wrap||!ribbon)return;
  requestAnimationFrame(()=>{const needs=ribbon.scrollHeight>wrap.clientHeight+1;wrap.classList.toggle('classic-overflow',needs)});
}
function setUiMode(mode,persist=true){
  state.uiMode=mode==='classic'?'classic':'ribbon';
  const classic=state.uiMode==='classic',app=$('#app');app.classList.toggle('classic',classic);document.body.classList.toggle('ui-classic',classic);
  const label=$('#uiModeLabel'),icon=$('#uiModeIcon');if(label)label.textContent=classic?'Ribbon':'Classic';if(icon)icon.textContent=classic?'▰':'◫';
  $('#uiModeToggle')?.setAttribute('title',classic?'Switch to compact ribbon interface':'Switch to Win98-style side-panel interface');
  if(persist&&!safeStorageSet(UI_MODE_KEY,state.uiMode)){preferencesUnavailable=true;setMessage('Interface choice is available for this session.');}
  requestAnimationFrame(()=>{renderRulers();setZoom(state.zoom);updateClassicOverflow()});
}

function newDocument(cols=80,rows=80,push=true){
  validateDimensions(cols,rows);recovery?.flush();fileSaver?.reset();cancelJob();importGeneration++;documentRevision++;
  if(push) snapshot();documentIdentity++;state.cols=cols;state.rows=rows;state.cells=Array.from({length:cols*rows},()=>makeCell(' '));
  state.selection=null;state.keyboardAnchor=null;state.drawing=false;state.moveSelection=null;state.textAnchor=null;state.preview.clear();state.cursor={x:0,y:0};state.docName='untitled';state.dirty=false;recovery?.beginDocument();rebuildGrid();updateTitle();
}
function idx(x,y){return y*state.cols+x} function xy(i){return [i%state.cols,Math.floor(i/state.cols)]}
function inBounds(x,y){return x>=0&&y>=0&&x<state.cols&&y<state.rows}
function getCell(x,y){return inBounds(x,y)?state.cells[idx(x,y)]:null}
function setCell(x,y,patch){if(!inBounds(x,y)||!validGlyph(patch.ch))return;if(!paletteEntry(patch.ch)&&state.glyphPalette.length>=MAX_PALETTE){setMessage('Palette limit reached; remove an unused glyph before adding another.');return}const i=idx(x,y),prev=state.cells[i].ch;if(prev!==patch.ch){if(state.glyphCounts[prev]>0)state.glyphCounts[prev]--;state.glyphCounts[patch.ch]=(state.glyphCounts[patch.ch]||0)+1;}Object.assign(state.cells[i],patch);if(!paletteEntry(patch.ch))autoAddGlyph(patch.ch);renderCellIndex(i);state.dirty=true}
function rebuildGrid(){
  state.cursor={x:clamp(state.cursor.x,0,state.cols-1),y:clamp(state.cursor.y,0,state.rows-1)};
  state.knownGlyphs=new Set();
  state.glyphCounts={};let paletteChanged=false;for(const c of state.cells){state.glyphCounts[c.ch]=(state.glyphCounts[c.ch]||0)+1;if(!state.knownGlyphs.has(c.ch)){state.knownGlyphs.add(c.ch);paletteChanged=ensureGlyphEntry(c.ch)||paletteChanged}}
  if(paletteChanged)savePalettePrefs();
  renderAll();updateStats();setZoom(state.zoom);buildGlyphPalette();buildGlyphColourPanel();
}
function renderAll(){renderer?.invalidateAll();renderSelection();renderPreview();updateAccessibleCell()}
function renderCell(x,y){renderCellIndex(idx(x,y))}
function renderCellIndex(i){renderer?.invalidateCell(i)}
function resolveGlyphColour(ch){return{fg:getGlyphColour(ch),bg:state.fieldBg||'#000000'}}
function glyphFg(ch){return resolveGlyphColour(ch).fg}
function hexRgb(hex){const m=/^#?([0-9a-f]{6})$/i.exec(hex||'');if(!m)return null;const n=parseInt(m[1],16);return{r:n>>16&255,g:n>>8&255,b:n&255}}
function invertHex(hex){const c=hexRgb(hex);if(!c)return '#000000';return '#'+[255-c.r,255-c.g,255-c.b].map(v=>v.toString(16).padStart(2,'0')).join('')}
function lumHex(hex){const c=hexRgb(hex);if(!c)return 0;return 0.299*c.r+0.587*c.g+0.114*c.b}
function paletteContrast(col){
  if(state.paletteBgMode==='grey')return Math.round(lumHex(col))>=128?'#000000':'#ffffff';
  return invertHex(col);
}
function autoAddGlyph(ch){
  if(!validGlyph(ch))return;state.knownGlyphs.add(ch);
  if(ensureGlyphEntry(ch)){savePalettePrefs();buildGlyphPalette()}
  const panel=$('#glyphColourPanel');if(panel)buildGlyphColourPanel();
}
function displayGlyph(ch){return ch===' '?'\u2423':ch}
function updateStats(){ $('#sizeStat').textContent=`${state.cols} \u00D7 ${state.rows} cells`; if(state.selection){const s=selectionBounds();$('#selectStat').textContent=`${s.w} \u00D7 ${s.h} selected`}else $('#selectStat').textContent=''; }
function updateTitle(){ $('#docTitle').textContent=`${state.dirty?'*':''}${state.docName} - GlyphPoint` }
function markDirty(){state.dirty=true;documentRevision++;updateTitle();recovery?.touch();updateAccessibleCell()}
function setMessage(s){$('#msgStat').textContent=s+(preferencesUnavailable?' Browser storage is unavailable; download a project or palette to keep changes.':'')}


function captureDocument(){
  return {documentIdentity,cols:state.cols,rows:state.rows,cells:state.cells.map(deepCell),selection:state.selection?JSON.parse(JSON.stringify(state.selection)):null,
    glyphPalette:state.glyphPalette.map(e=>({...e})),glyphPrimary:state.glyphPrimary,glyphSecondary:state.glyphSecondary,
    fieldBg:state.fieldBg,square:state.square,docName:state.docName,transparentSelect:state.transparentSelect};
}
function trimHistory(){
  let count=state.history.reduce((n,s)=>n+s.cells.length,0)+state.future.reduce((n,s)=>n+s.cells.length,0);
  while(state.history.length+state.future.length>MAX_HISTORY||count>MAX_HISTORY_CELLS){
    const stack=state.history.length>1?state.history:state.future.length?state.future:state.history;
    if(!stack.length)break;count-=stack.shift().cells.length;
  }
}
function snapshot(){state.history.push(captureDocument());state.future.length=0;trimHistory()}
function syncDocumentControls(){
  $('#fieldBgInput').value=state.fieldBg;$('#squareToggle').setAttribute('aria-pressed',state.square);
  $('#transparentRibbon').checked=state.transparentSelect;$('#transparentSelect').checked=state.transparentSelect;
}
function restore(s){
  if(s.documentIdentity!==undefined&&s.documentIdentity!==documentIdentity){recovery?.flush();fileSaver?.reset();recovery?.beginDocument();documentIdentity=s.documentIdentity}
  else if(s.docName!==undefined&&s.docName!==state.docName)fileSaver?.reset();
  for(const key of ['cols','rows','fieldBg','square','docName','transparentSelect','glyphPrimary','glyphSecondary'])if(key in s)state[key]=s[key];
  state.cells=s.cells.map(deepCell);state.selection=s.selection?JSON.parse(JSON.stringify(s.selection)):null;
  state.glyphPalette=s.glyphPalette.map(e=>({...e}));state.drawGlyph=state.glyphPrimary;
  state.keyboardAnchor=null;state.drawing=false;state.moveSelection=null;clearPreview();syncDocumentControls();savePalettePrefs();rebuildGrid();markDirty();
}
function undo(){if(!state.history.length)return;state.future.push(captureDocument());restore(state.history.pop());trimHistory();setMessage('Undo')}
function redo(){if(!state.future.length)return;state.history.push(captureDocument());restore(state.future.pop());trimHistory();setMessage('Redo')}
let gcmOpeningSnapshot=null;
const GCM_COLOURWAYS={
  'Pastel':DEFAULT_GLYPH_COLOURS,
  'Neon':['#00ffff','#ff00ff','#ffff00','#00ff66','#ff6600','#6699ff','#ff3366','#99ff00'],
  'Ocean':['#003f5c','#2f4b7c','#665191','#a05195','#d45087','#f95d6a','#ff7c43','#ffa600'],
  'Forest':['#16302b','#22543d','#2f855a','#48bb78','#68d391','#9ae6b4','#d69e2e','#975a16'],
  'Monochrome':['#ffffff','#dddddd','#bbbbbb','#999999','#777777','#555555','#333333','#111111'],
  'High contrast':['#ffffff','#ffff00','#00ffff','#ff00ff','#00ff00','#ff0000','#0080ff','#ff8000']
};
function isWhitespaceGlyph(ch){return /^\s$/u.test(ch||'')}
function getGlyphManagerRows(){
  const q=($('#gcmSearch')?.value||'').trim().toLowerCase(),sort=$('#gcmSort')?.value||'order';
  let rows=state.glyphPalette.map((entry,index)=>({entry,index,usage:state.glyphCounts[entry.glyph]||0})).filter(x=>!isWhitespaceGlyph(x.entry.glyph));
  if(q)rows=rows.filter(({entry})=>entry.glyph.toLowerCase().includes(q)||entry.colour.toLowerCase().includes(q)||(entry.represents||'').toLowerCase().includes(q));
  if(sort==='glyph')rows.sort((a,b)=>a.entry.glyph.localeCompare(b.entry.glyph));else if(sort==='colour')rows.sort((a,b)=>a.entry.colour.localeCompare(b.entry.colour));else if(sort==='usage')rows.sort((a,b)=>b.usage-a.usage||a.index-b.index);else if(sort==='represents')rows.sort((a,b)=>(a.entry.represents||'').localeCompare(b.entry.represents||''));return rows;
}
function setGcmStatus(message){const el=$('#gcmStatus');if(el)el.textContent=message}

function replacePaletteGlyph(oldGlyph,newGlyph,{record=true}={}){
  if(oldGlyph===' ')return{ok:false,message:'Space is reserved for blank cells'};
  if(!validGlyph(newGlyph)||isWhitespaceGlyph(newGlyph))return{ok:false,message:'Enter one non-whitespace grapheme'};
  if(newGlyph!==oldGlyph&&paletteEntry(newGlyph))return{ok:false,message:'That glyph is already in the palette'};
  const entry=paletteEntry(oldGlyph);if(!entry)return{ok:false,message:'Glyph not found'};
  if(newGlyph===oldGlyph)return{ok:true};if(record)snapshot();entry.glyph=newGlyph;invalidatePaletteLookup();
  for(const c of state.cells)if(c.ch===oldGlyph)c.ch=newGlyph;
  if(state.glyphPrimary===oldGlyph)state.glyphPrimary=newGlyph;if(state.glyphSecondary===oldGlyph)state.glyphSecondary=newGlyph;
  state.drawGlyph=state.glyphPrimary;savePalettePrefs();rebuildGrid();markDirty();return{ok:true};
}
function renderGlyphColourManager(){
  const list=$('#gcmList');if(!list)return;list.replaceChildren();const head=document.createElement('div');head.className='gcm-head';['Glyph','Colour','Hex','Uses','Represents','Actions'].forEach(t=>{const x=document.createElement('span');x.textContent=t;head.appendChild(x)});list.appendChild(head);
  const rows=getGlyphManagerRows();if(!rows.length){const x=document.createElement('div');x.className='gcm-empty';x.textContent='No glyphs match the current filter.';list.appendChild(x);setGcmStatus('0 glyphs shown');return}
  const canRemove=state.glyphPalette.filter(e=>!isWhitespaceGlyph(e.glyph)).length>1;
  for(const {entry,usage} of rows){
    const row=document.createElement('div');row.className='gcm-row';
    const glyph=document.createElement('input');glyph.className='gcm-glyph';glyph.value=entry.glyph;glyph.maxLength=64;glyph.spellcheck=false;glyph.title='Replace this grapheme everywhere in the palette and canvas';glyph.setAttribute('aria-label',`Replace glyph ${displayGlyph(entry.glyph)}`);
    const colour=document.createElement('input');colour.type='color';colour.className='gcm-colour';colour.value=entry.colour;colour.setAttribute('aria-label',`Colour for glyph ${displayGlyph(entry.glyph)}`);
    const hex=document.createElement('input');hex.className='gcm-hex';hex.value=entry.colour.toUpperCase();hex.maxLength=7;hex.spellcheck=false;hex.size=8;hex.setAttribute('aria-label',`Hex colour for glyph ${displayGlyph(entry.glyph)}`);
    const uses=document.createElement('span');uses.textContent=String(usage);
    const represents=document.createElement('input');represents.className='gcm-represents';represents.value=entry.represents||'';represents.maxLength=80;represents.placeholder='Label…';represents.setAttribute('aria-label',`Meaning of glyph ${displayGlyph(entry.glyph)}`);
    const actions=document.createElement('span');actions.className='gcm-actions';const reset=document.createElement('button');reset.textContent='Reset';reset.setAttribute('aria-label',`Reset colour for glyph ${displayGlyph(entry.glyph)}`);const remove=document.createElement('button');remove.textContent='Remove';remove.setAttribute('aria-label',`Remove glyph ${displayGlyph(entry.glyph)}`);remove.disabled=!canRemove;
    const commitGlyph=()=>{const old=entry.glyph,next=glyph.value;const result=replacePaletteGlyph(old,next);glyph.classList.toggle('invalid',!result.ok);if(!result.ok){setGcmStatus(result.message);return}renderGlyphColourManager();setGcmStatus(`Replaced ${old} with ${next}`)};glyph.onchange=commitGlyph;glyph.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commitGlyph()}};
    let colourEditing=false;colour.oninput=()=>{if(!colourEditing){snapshot();colourEditing=true}hex.value=colour.value.toUpperCase();setGlyphColour(entry.glyph,colour.value,{persist:false,refresh:false,record:false});renderAll();buildGlyphPalette()};colour.onchange=()=>{colourEditing=false;savePalettePrefs()};
    const commitHex=()=>{const v=hex.value.trim();if(!validColour(v)){hex.classList.add('invalid');setGcmStatus('Enter a six-digit hex colour');return}hex.classList.remove('invalid');colour.value=v;setGlyphColour(entry.glyph,v);hex.value=v.toUpperCase()};hex.onchange=commitHex;hex.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commitHex()}};
    represents.onchange=()=>{snapshot();entry.represents=represents.value.trim().slice(0,80);markDirty();savePalettePrefs();setGcmStatus(`Saved label for ${entry.glyph}`)};
    reset.onclick=()=>{setGlyphColour(entry.glyph,defaultColourForGlyph(entry.glyph));renderGlyphColourManager()};remove.onclick=()=>{removePaletteGlyph(state.glyphPalette.indexOf(entry));renderGlyphColourManager()};actions.append(reset,remove);row.append(glyph,colour,hex,uses,represents,actions);list.appendChild(row);
  }setGcmStatus(`${rows.length} glyphs shown. Whitespace is managed automatically from the canvas background.`);
}
function closeGcmMenus(){ $$('.gcm-menu').forEach(m=>m.classList.remove('open')) }
function openGcmMenu(button,menu){closeGcmMenus();const r=button.getBoundingClientRect();menu.style.left=r.left+'px';menu.style.top=r.bottom+'px';menu.classList.add('open')}
function buildGcmThemeMenu(){const menu=$('#gcmThemeMenu');menu.replaceChildren();for(const name of Object.keys(GCM_COLOURWAYS)){const b=document.createElement('button');b.textContent=name;b.onclick=()=>{applyGcmColourway(name);closeGcmMenus()};menu.appendChild(b)}}
function applyGcmColourway(name){const colours=GCM_COLOURWAYS[name];if(!colours)return;snapshot();let i=0;for(const entry of state.glyphPalette){if(isWhitespaceGlyph(entry.glyph))continue;entry.colour=colours[i++%colours.length]}markDirty();savePalettePrefs();refreshGlyphColourUI();renderGlyphColourManager();setGcmStatus(`Applied ${name} colourway`)}

function openGlyphColourManager(){gcmOpeningSnapshot=captureDocument();$('#gcmSearch').value='';$('#gcmSort').value='order';buildGcmThemeMenu();renderGlyphColourManager();$('#glyphColourManagerDialog').showModal()}
function closeGlyphColourManager(){closeGcmMenus();$('#glyphColourManagerDialog').close();gcmOpeningSnapshot=null}
function addGlyphFromManager(){state.paletteEditIndex=null;$('#paletteDlgTitle').textContent='Add palette glyph';$('#paletteGlyphInput').value='';$('#paletteColourInput').value='#ffffff';$('#paletteRemoveBtn').hidden=true;$('#paletteDialog').showModal();setTimeout(()=>$('#paletteGlyphInput').focus(),0)}
function resetAllGlyphColours(){if(!confirm('Reset all glyph colours?'))return;snapshot();for(const e of state.glyphPalette)if(!isWhitespaceGlyph(e.glyph))e.colour=defaultColourForGlyph(e.glyph);markDirty();savePalettePrefs();refreshGlyphColourUI();renderGlyphColourManager()}

function revertGlyphManager(){if(!gcmOpeningSnapshot)return;snapshot();restore(gcmOpeningSnapshot);renderGlyphColourManager();setGcmStatus('Opening document and palette restored; Undo can recover the changes.')}
function exportGlyphPalette(){const payload={format:'glyphpoint-v3',kind:'palette',glyphPalette:state.glyphPalette,glyphPrimary:state.glyphPrimary,glyphSecondary:state.glyphSecondary,fieldBg:state.fieldBg};downloadBlob(JSON.stringify(payload,null,2),'application/json','glyphpoint-palette.json');setGcmStatus('Palette exported')}

async function importGlyphPaletteFile(e){
  const f=e.target.files[0];if(!f)return;e.target.value='';const generation=++importGeneration,revision=documentRevision;
  let applying=false;
  try{
    const text=await readImportFile(f);if(!importStillCurrent(generation,revision,'the palette'))return;const d=JSON.parse(text);
    if(!d||!['glyphpoint-v1','glyphpoint-v2','glyphpoint-v3'].includes(d.format)||!Array.isArray(d.glyphPalette))throw Error('No compatible GlyphPoint palette found');
    if(!d.glyphPalette.length)throw Error('Palette is empty');
    const pal=normalisePalette(d.glyphPalette,d.glyphColours||{}),seen=new Set(pal.map(x=>x.glyph)),used=new Set(state.cells.map(c=>c.ch));
    for(const entry of state.glyphPalette)if(!seen.has(entry.glyph)&&used.has(entry.glyph)){if(pal.length>=MAX_PALETTE)throw Error('Palette has no room for glyphs used on the canvas');pal.push({...entry});seen.add(entry.glyph)}
    includeUsedGlyphs(pal,state.cells);
    if(!pal.length)throw Error('Palette is empty');if(generation!==importGeneration)return;
    applying=true;snapshot();state.glyphPalette=pal;
    state.glyphPrimary=pal.some(x=>x.glyph===d.glyphPrimary)?d.glyphPrimary:pal[0].glyph;
    state.glyphSecondary=pal.some(x=>x.glyph===d.glyphSecondary)?d.glyphSecondary:(pal[1]||pal[0]).glyph;
    state.drawGlyph=state.glyphPrimary;if(validColour(d.fieldBg))state.fieldBg=d.fieldBg.toLowerCase();
    syncDocumentControls();savePalettePrefs();refreshGlyphColourUI();renderGlyphColourManager();markDirty();setGcmStatus(`Imported palette from ${f.name}`);
  }catch(err){if(applying||generation===importGeneration&&revision===documentRevision)alert('Could not import palette: '+err.message)}
}
function buildGlyphPalette(){
  const grid=$('#glyphPalette');if(!grid)return;grid.innerHTML='';
  state.glyphPalette.forEach((entry,i)=>{
    const ch=entry.glyph;
    const b=document.createElement('button');b.className='gp-btn';b.dataset.g=ch;b.dataset.index=i;
    const activate=secondary=>{if(state.paletteEditing)openPaletteEditor(i);else secondary||state.drawSecondary?setSecondaryGlyph(ch):setPrimaryGlyph(ch)};
    b.textContent=displayGlyph(ch);b.setAttribute('aria-label',`Glyph ${displayGlyph(ch)}; Enter selects the active slot; Shift+Enter selects secondary`);
    // Native/assistive button activation uses click, without depending on a
    // preceding pointer event. Explicit key handling retains Shift selection.
    b.onclick=()=>activate(false);b.onkeydown=e=>{
      // Native Tab behavior varies with browser/OS full-keyboard-access settings.
      // Give focused palette tiles a consistent, non-trapping previous/next route.
      if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
        e.preventDefault();
        const neighbour=e.key==='ArrowRight'?b.nextElementSibling:b.previousElementSibling;
        if(neighbour?.matches('.gp-btn[data-g]'))neighbour.focus();
      }else if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(e.shiftKey)}
    };
    b.oncontextmenu=e=>{e.preventDefault();if(state.paletteEditing)removePaletteGlyph(i);else setSecondaryGlyph(ch)};
    b.title=state.paletteEditing?'Edit this palette glyph; right-click removes it':`Select active slot: click · Secondary: right click — ${ch===' '?'space':ch}`;
    b.style.color=glyphFg(ch);b.style.background=/^\s$/u.test(ch)?state.fieldBg:paletteContrast(glyphFg(ch));
    if(state.paletteEditing)b.classList.add('editing');
    grid.appendChild(b);
  });
  if(state.paletteEditing){const add=document.createElement('button');add.className='gp-btn gp-add';add.textContent='+';add.title='Add glyph to palette';add.onclick=()=>openPaletteEditor(null);grid.appendChild(add)}
  updateGlyphSlots();
  const edit=$('#gpEditBtn'),reset=$('#gpResetBtn'),hint=$('#gpEditHint');if(edit){edit.classList.toggle('active',state.paletteEditing);edit.textContent=state.paletteEditing?'Done':'Edit'}if(reset)reset.hidden=!state.paletteEditing;if(hint)hint.hidden=!state.paletteEditing;updateClassicOverflow();
}
function updateGlyphSlots(){
  $$('#glyphPalette .gp-btn[data-g]').forEach(b=>b.classList.toggle('prime',b.dataset.g===state.glyphPrimary));
  $$('#glyphPalette .gp-btn[data-g]').forEach(b=>b.classList.toggle('sec',b.dataset.g===state.glyphSecondary));
  const p1=$('#slotPrimaryChar'),p2=$('#slotSecondaryChar');
  if(p1){p1.textContent=displayGlyph(state.glyphPrimary);p1.style.color=glyphFg(state.glyphPrimary);p1.closest('.gp-slot').style.background=isWhitespaceGlyph(state.glyphPrimary)?state.fieldBg:paletteContrast(glyphFg(state.glyphPrimary))}
  if(p2){p2.textContent=displayGlyph(state.glyphSecondary);p2.style.color=glyphFg(state.glyphSecondary);p2.closest('.gp-slot').style.background=isWhitespaceGlyph(state.glyphSecondary)?state.fieldBg:paletteContrast(glyphFg(state.glyphSecondary))}
}
function setPaletteEditing(on){state.paletteEditing=!!on;buildGlyphPalette();setMessage(state.paletteEditing?'Palette edit mode — click a glyph to replace it; right-click to remove':'Palette edit mode closed')}
function paletteInputGlyph(){const v=$('#paletteGlyphInput')?.value??'';return GPInterchange.splitGraphemes(v)[0]}
function openPaletteEditor(index){
  state.paletteEditIndex=Number.isInteger(index)?index:null;const dlg=$('#paletteDialog'),input=$('#paletteGlyphInput'),remove=$('#paletteRemoveBtn');
  const editing=state.paletteEditIndex!==null;const entry=editing?state.glyphPalette[state.paletteEditIndex]:null;$('#paletteDlgTitle').textContent=editing?'Edit palette glyph':'Add palette glyph';input.value=entry?.glyph||'';$('#paletteColourInput').value=entry?.colour||'#ffffff';remove.hidden=!editing;dlg.showModal();setTimeout(()=>{input.focus();input.select()},0)
}

function applyPaletteEditor(){
  const ch=$('#paletteGlyphInput').value,colour=$('#paletteColourInput').value;
  if(!validGlyph(ch)){alert('Enter exactly one printable grapheme (up to 32 code points).');return}
  const i=state.paletteEditIndex,duplicate=state.glyphPalette.findIndex(e=>e.glyph===ch);
  if(duplicate>=0&&duplicate!==i){alert('Glyph is already in the palette.');return}
  if(i!==null&&state.glyphPalette[i].glyph===' '&&ch!==' '){alert('Space is reserved for blank cells.');return}
  if(i===null&&state.glyphPalette.length>=MAX_PALETTE){alert('Palette limit reached.');return}
  snapshot();
  if(i===null)state.glyphPalette.push({glyph:ch,colour:validColour(colour)?colour:'#ffffff',represents:''});
  else{
    const entry=state.glyphPalette[i],old=entry.glyph;entry.glyph=ch;entry.colour=validColour(colour)?colour:'#ffffff';invalidatePaletteLookup();
    for(const c of state.cells)if(c.ch===old)c.ch=ch;
    if(state.glyphPrimary===old)state.glyphPrimary=ch;if(state.glyphSecondary===old)state.glyphSecondary=ch;
  }
  state.drawGlyph=state.glyphPrimary;markDirty();savePalettePrefs();$('#paletteDialog').close();rebuildGrid();
  if($('#glyphColourManagerDialog')?.open)renderGlyphColourManager();setMessage('Palette updated; save the project to keep document changes.');
}

function removePaletteGlyph(index=state.paletteEditIndex){
  if(!Number.isInteger(index)||index<0||index>=state.glyphPalette.length)return;
  if(state.glyphPalette.length<=1){setMessage('Palette must contain at least one glyph');return}
  const old=state.glyphPalette[index].glyph;
  if(old===' '){alert('Space is reserved for blank cells.');return}
  if(state.cells.some(c=>c.ch===old)){alert('This glyph is in use on the canvas. Replace or erase it before removing its palette entry.');return}
  snapshot();state.glyphPalette.splice(index,1);
  if(state.glyphPrimary===old)state.glyphPrimary=state.glyphPalette[0].glyph;
  if(state.glyphSecondary===old)state.glyphSecondary=state.glyphPalette[Math.min(1,state.glyphPalette.length-1)].glyph;
  state.drawGlyph=state.glyphPrimary;markDirty();savePalettePrefs();if($('#paletteDialog')?.open)$('#paletteDialog').close();refreshGlyphColourUI();setMessage('Unused glyph removed');
}
function resetPalette(){
  if(!confirm('Restore the default palette and colours? Glyphs used on the canvas will be retained.'))return;
  const used=new Set([' ',...state.cells.map(c=>c.ch)]);
  const pal=[...used].map(glyph=>({glyph,colour:defaultColourForGlyph(glyph),represents:''}));
  for(const entry of DEFAULT_GLYPH_PALETTE)if(!used.has(entry.glyph)&&pal.length<MAX_PALETTE)pal.push({...entry});
  snapshot();state.glyphPalette=pal;
  state.glyphPrimary=paletteEntry('#')?'#':pal[0].glyph;state.glyphSecondary=paletteEntry('+')?'+':state.glyphPrimary;state.drawGlyph=state.glyphPrimary;markDirty();savePalettePrefs();refreshGlyphColourUI();setMessage('Default palette restored; used glyphs retained');
}
function setPrimaryGlyph(ch){state.glyphPrimary=ch;state.drawGlyph=ch;savePalettePrefs();updateGlyphSlots();setMessage(`Primary glyph: ${displayGlyph(ch)}`)}
function setSecondaryGlyph(ch){state.glyphSecondary=ch;savePalettePrefs();updateGlyphSlots();setMessage(`Secondary glyph: ${displayGlyph(ch)}`)}
function setDrawGlyph(e){return e.button===2||state.drawSecondary?state.glyphSecondary:state.glyphPrimary}
function buildGlyphColourPanel(){
  const panel=$('#glyphColourPanel');if(!panel)return;panel.innerHTML='';
  const bgRow=document.createElement('div');bgRow.className='gc-row';
  const bgLabel=document.createElement('span');bgLabel.className='gc-ch';bgLabel.textContent='Bg';bgLabel.title='Field background colour';
  const bgSwatch=document.createElement('div');bgSwatch.className='gc-swatch';bgSwatch.style.background=state.fieldBg;bgSwatch.title='Field background colour';
  bgSwatch.onclick=e=>{e.stopPropagation();snapshot();openColourPicker(e.clientX,e.clientY,state.fieldBg,h=>{state.fieldBg=h;bgSwatch.style.background=h;renderAll();markDirty()})};
  const bgDel=document.createElement('button');bgDel.className='gc-del';bgDel.textContent='\u00D7';bgDel.title='Reset background to black';
  bgDel.onclick=()=>{snapshot();state.fieldBg='#000000';bgSwatch.style.background=state.fieldBg;renderAll();markDirty()};
  bgRow.append(bgLabel,bgSwatch,bgDel);panel.appendChild(bgRow);
  const counts={};state.cells.forEach(c=>{counts[c.ch]=(counts[c.ch]||0)+1});
  const glyphs=Object.keys(counts).filter(ch=>ch!==' ').sort();
  if(!glyphs.length)return;
  for(const ch of glyphs){
    const row=document.createElement('div');row.className='gc-row';
    const label=document.createElement('span');label.className='gc-ch';label.textContent=displayGlyph(ch);
    const swatch=document.createElement('div');swatch.className='gc-swatch';swatch.style.background=getGlyphColour(ch);
    swatch.title=`Colour for "${ch===''?'space':ch}"`;
    swatch.onclick=e=>{e.stopPropagation();openColourPicker(e.clientX,e.clientY,getGlyphColour(ch),h=>{setGlyphColour(ch,h,{persist:true,refresh:false});swatch.style.background=h;renderAll();buildGlyphPalette()})};
    const count=document.createElement('span');count.className='gc-count';count.textContent=counts[ch];
    const del=document.createElement('button');del.className='gc-del';del.textContent='\u00D7';
    del.title='Reset to default colour';
    del.onclick=()=>{setGlyphColour(ch,defaultColourForGlyph(ch))};
    row.append(label,swatch,count,del);
    panel.appendChild(row);
  }
}
const COLOUR_PRESETS=['#000000','#ffffff','#808080','#ff0000','#ff8000','#ffff00','#00b050','#00cccc','#0060ff','#6000ff','#ff00ff','#a0522d'];
let cpOnChange=c=>{};
function hexToHsl(hex){const c=hexRgb(hex);if(!c)return{h:0,s:0,l:128};const r=c.r/255,g=c.g/255,b=c.b/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h=0,s=0;const l=(mx+mn)/2;if(mx!==mn){const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);switch(mx){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4}h/=6}return{h:h*360,s:s*255,l:l*255}}
function hslToHex(h,s,l){s/=255;l/=255;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(((h/60)%2)-1)),m=l-c/2;let r=0,g=0,b=0;if(h<60){r=c;g=x}else if(h<120){r=x;g=c}else if(h<180){g=c;b=x}else if(h<240){g=x;b=c}else if(h<300){r=x;b=c}else{r=c;b=x}return '#'+[Math.round((r+m)*255),Math.round((g+m)*255),Math.round((b+m)*255)].map(v=>Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('')}
function cpickCurrent(){return hslToHex(+$('#cpickH').value,+$('#cpickSat').value,+$('#cpickL').value)}
function cpickPreview(){const hex=cpickCurrent();$('#cpickSwatch').style.background=hex;$('#cpickHexInput').value=hex}
function cpickApply(){cpickPreview();cpOnChange(cpickCurrent())}
function cpickFromHex(hex){const h=hexToHsl(hex);$('#cpickH').value=h.h;$('#cpickSat').value=h.s;$('#cpickL').value=h.l;cpickApply()}
function buildColourPresets(){const box=$('#cpickPresets');COLOUR_PRESETS.forEach(c=>{const b=document.createElement('button');b.className='cpick-preset';b.style.background=c;b.dataset.c=c;b.title=c;b.onclick=()=>cpickFromHex(c);box.appendChild(b)})}
function openColourPicker(x,y,hex,onchange){
  cpOnChange=onchange;
  const h=hexToHsl(hex);$('#cpickH').value=h.h;$('#cpickSat').value=h.s;$('#cpickL').value=h.l;
  cpickPreview();
  const p=$('#colorPicker');p.hidden=false;
  p.style.left=clamp(x+10,4,innerWidth-p.offsetWidth-8)+'px';
  p.style.top=clamp(y+10,4,innerHeight-p.offsetHeight-8)+'px';
}
function closeColourPicker(){const p=$('#colorPicker');if(p)p.hidden=true}
const SHAPE_NAMES={line:'Line',rect:'Rectangle',ellipse:'Ellipse',triangle:'Triangle',rightTri:'Right triangle',diamond:'Diamond',arrowR:'Arrow right',arrowL:'Arrow left',arrowU:'Arrow up',arrowD:'Arrow down',slash:'Diagonal /',bslash:'Diagonal \\'};
function buildShapes(){const sg=$('#shapeGrid');sg.innerHTML='';for(const [id,ico] of SHAPES){const b=document.createElement('button');b.className='shape';b.dataset.shape=id;b.title=SHAPE_NAMES[id]||id;b.textContent=ico;b.onclick=()=>{state.shape=id;setTool('shape')};sg.appendChild(b)}}
function setTool(t){state.tool=t;$$('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tool===t));$$('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));$('#selectBtn').classList.toggle('active',t==='select');$$('.shape').forEach(b=>b.classList.toggle('active',t==='shape'&&b.dataset.shape===state.shape));const names={pencil:'Pencil',fill:'Flood fill',text:'Text',eraser:'Eraser',picker:'Glyph picker',magnifier:'Magnifier',select:'Selection',shape:SHAPE_NAMES[state.shape]||'Shape'};setMessage(`${names[t]||t} tool`)}

function eventCell(e){return renderer?.hitTest(e.clientX,e.clientY)||null}
function edgeCell(e){return renderer?.hitTest(e.clientX,e.clientY,{clamp:true})||null}

function footprintOf(x,y,size,brushShape=state.brushShape){
  const out=[];size=clamp(Math.round(size)||1,1,60);const ratio=BRUSH_RATIOS[brushShape]||[1,1];
  const w=size*ratio[0],h=size*ratio[1],x0=-Math.floor((w-1)/2),y0=-Math.floor((h-1)/2);
  for(let dy=y0;dy<y0+h;dy++)for(let dx=x0;dx<x0+w;dx++){
    if(brushShape==='circle'&&Math.hypot(dx-(x0+(w-1)/2),dy-(y0+(h-1)/2))>size/2)continue;
    if(inBounds(x+dx,y+dy))out.push([x+dx,y+dy]);
  }
  return out;
}
function edgeOf(pts){const set=new Set(pts.map(p=>`${p[0]},${p[1]}`)),out=[];for(const [x,y] of pts){let e=false;for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]])if(!inBounds(nx,ny)||!set.has(`${nx},${ny}`)){e=true;break}if(e)out.push([x,y])}return out}

function bindUI(){
  $('#fileBtn').onclick=e=>{const m=$('#fileMenu');const r=e.target.getBoundingClientRect();m.style.left=r.left+'px';m.style.top=r.bottom+'px';m.classList.toggle('open')};
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#fileMenu')&&!e.target.closest('#fileBtn'))$('#fileMenu').classList.remove('open')});
  $('#qUndo').onclick=undo;$('#qRedo').onclick=redo;$('#uiModeToggle').onclick=()=>setUiMode(state.uiMode==='classic'?'ribbon':'classic');
  $$('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));$('#selectBtn').onclick=()=>setTool('select');
  const commitBrushSize=e=>{let v=Math.round(+e.target.value);if(!Number.isFinite(v))v=1;v=clamp(v,1,60);e.target.value=v;state.brushSize=v};$('#brushSize').oninput=commitBrushSize;$('#brushSize').onchange=commitBrushSize;$('#shapeSize').onchange=e=>state.shapeSize=+e.target.value;$('#outlineMode').onchange=e=>state.outlineMode=e.target.value;$('#fillMode').onchange=e=>state.fillMode=e.target.value;
  $$('[data-bs]').forEach(b=>b.onclick=()=>{state.brushShape=b.dataset.bs;$$('[data-bs]').forEach(x=>x.classList.toggle('active',x.dataset.bs===state.brushShape))});
  $('#cutBtn').onclick=cutSelection;$('#copyBtn').onclick=copySelection;$('#pasteBtn').onclick=pasteSelection;$('#cropBtn').onclick=cropSelection;$('#resizeBtn').onclick=openResize;
  $$('[data-transform]').forEach(b=>b.onclick=()=>transform(b.dataset.transform));
  $('#selectAllBtn').onclick=()=>{state.selection={type:'rect',x:0,y:0,w:state.cols,h:state.rows};renderSelection();updateStats();setTool('select')};
  $('#deleteBtn').onclick=deleteSelection;
  $('#transparentRibbon').onchange=e=>{state.transparentSelect=e.target.checked;$('#transparentSelect').checked=e.target.checked};
  $('#glyphPalette').addEventListener('contextmenu',e=>e.preventDefault());
  $('#gpEditBtn').onclick=()=>setPaletteEditing(!state.paletteEditing);$('#gpResetBtn').onclick=resetPalette;$('#gpColoursBtn').onclick=openGlyphColourManager;
  $('#gpBgBtn').onclick=()=>{state.paletteBgMode=state.paletteBgMode==='invert'?'grey':'invert';savePalettePrefs();buildGlyphPalette();setMessage(state.paletteBgMode==='invert'?'Palette contrast: inverted':'Palette contrast: neutral')};
  $$('#cpickH,#cpickSat,#cpickL').forEach(s=>s.oninput=cpickApply);
  $('#cpickHexInput').onchange=e=>{const m=/^#?([0-9a-f]{6})$/i.exec(String(e.target.value).trim());if(m)cpickFromHex('#'+m[1].trim())};
  document.addEventListener('pointerdown',e=>{const p=$('#colorPicker');if(p&&!p.hidden&&!e.target.closest('#colorPicker')&&!e.target.closest('.gc-swatch'))closeColourPicker()});
  $('#paletteApplyBtn').onclick=e=>{e.preventDefault();applyPaletteEditor()};$('#paletteRemoveBtn').onclick=e=>{e.preventDefault();removePaletteGlyph()};$('#paletteGlyphInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();applyPaletteEditor()}};
  $('#gcmSearch').oninput=renderGlyphColourManager;$('#gcmSort').onchange=renderGlyphColourManager;$('#gcmAdd').onclick=addGlyphFromManager;$('#gcmResetAll').onclick=resetAllGlyphColours;$('#gcmRevert').onclick=revertGlyphManager;$('#gcmClose').onclick=closeGlyphColourManager;$('#gcmCloseX').onclick=closeGlyphColourManager;$('#gcmFileBtn').onclick=e=>{e.stopPropagation();openGcmMenu(e.currentTarget,$('#gcmFileMenu'))};$('#gcmThemeBtn').onclick=e=>{e.stopPropagation();openGcmMenu(e.currentTarget,$('#gcmThemeMenu'))};$('#gcmFileMenu').onclick=e=>{const a=e.target.dataset.gcmFile;if(a==='import')$('#gcmImportInput').click();else if(a==='export')exportGlyphPalette();closeGcmMenus()};$('#gcmImportInput').onchange=importGlyphPaletteFile;document.addEventListener('pointerdown',e=>{if(!e.target.closest('.gcm-menu')&&!e.target.closest('.gcm-menubtn'))closeGcmMenus()});
  $('#canvasGrid').addEventListener('contextmenu',e=>e.preventDefault());
  $('#canvasGrid').addEventListener('pointerdown',pointerDown);document.addEventListener('pointermove',pointerMove);document.addEventListener('pointerup',pointerUp);
  const cancelDrawing=()=>{state.panGesture=null;state.drawing=false;state.moveSelection=null;clearPreview();hoveredCells=[];syncOverlays()};
  document.addEventListener('pointercancel',cancelDrawing);$('#canvasGrid').addEventListener('lostpointercapture',cancelDrawing);window.addEventListener('blur',cancelDrawing);
  window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue=''}});
  $('#scroller').addEventListener('scroll',()=>{$('#hruler').scrollLeft=$('#scroller').scrollLeft;$('#vruler').scrollTop=$('#scroller').scrollTop});
  $('#zoomIn').onclick=()=>setZoom(state.zoom*2);$('#zoomOut').onclick=()=>setZoom(state.zoom/2);$('#zoom100').onclick=()=>setZoom(1);$('#zminus').onclick=()=>setZoom(state.zoom-0.25);$('#zplus').onclick=()=>setZoom(state.zoom+0.25);$('#zoomSlider').oninput=e=>setZoom(+e.target.value/100);
  $('#gridToggle').onchange=e=>{state.grid=e.target.checked;renderer?.invalidateAll()};$('#rulerToggle').onchange=e=>{state.rulers=e.target.checked;$('#workspace').classList.toggle('no-rulers',!state.rulers)};$('#statusToggle').onchange=e=>{$('#statusbar').classList.toggle('hidden',!e.target.checked)};
  $('#squareToggle').onclick=e=>{snapshot();state.square=!state.square;e.currentTarget.setAttribute('aria-pressed',state.square);rebuildGrid();markDirty()};
  let editingBackground=false;$('#fieldBgInput').oninput=e=>{if(!editingBackground){snapshot();editingBackground=true}state.fieldBg=e.target.value;renderAll();buildGlyphPalette();markDirty()};$('#fieldBgInput').onchange=()=>{editingBackground=false};
  $('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen?.();else await document.documentElement.requestFullscreen?.()}catch{setMessage('Full screen is unavailable in this browser context.')}};
  $('#resizeDialog').addEventListener('close',()=>{});$('#resizeW').addEventListener('input',()=>syncResizeAspect('w'));$('#resizeH').addEventListener('input',()=>syncResizeAspect('h'));$('#resizeUnit').addEventListener('change',openResize);$('#applyResize').onclick=async e=>{e.preventDefault();if(await applyResizeSkew())$('#resizeDialog').close()};
  $('#applyText').onclick=e=>{e.preventDefault();if(placeText())$('#textDialog').close()};
  $('#applyProps').onclick=e=>{e.preventDefault();if(applyProperties())$('#propertiesDialog').close()};
  $$('dialog button[value="cancel"]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  $('#openProjectInput').onchange=openProjectFile;$('#openTxtInput').onchange=openTxtFile;$('#openHtmlInput').onchange=openHtmlFile;
  $$('#fileMenu [data-file]').forEach(b=>b.onclick=()=>handleFile(b.dataset.file));
  window.addEventListener('keydown',keyboard);window.addEventListener('resize',updateClassicOverflow);if('ResizeObserver' in window)new ResizeObserver(updateClassicOverflow).observe($('#homeRibbon'));
}


function pointerDown(e){
  if(activeJob)return;
  if(e.button!==0&&e.button!==2)return;
  const p=eventCell(e);if(!p)return;e.preventDefault();$('#canvasWrap').focus({preventScroll:true});state.cursor={x:p.x,y:p.y};updateAccessibleCell();if(state.panMode){state.drawing=true;state.panGesture={x:e.clientX,y:e.clientY,left:$('#scroller').scrollLeft,top:$('#scroller').scrollTop};$('#canvasGrid').setPointerCapture?.(e.pointerId);return}$('#canvasGrid').setPointerCapture?.(e.pointerId);state.drawing=true;state.shiftHeld=!!e.shiftKey;state.drawButton=e.button===2||state.drawSecondary?2:0;state.actionStart=p;state.lastCell=p;state.freePath=[p];
  const g=setDrawGlyph(e);state.drawGlyph=g;
  if(state.tool==='pencil'){state.drawGlyph=g;snapshot();paintBrush(p.x,p.y,g,true)}
  else if(state.tool==='eraser'){snapshot();eraseBrush(p.x,p.y)}
  else if(state.tool==='fill'){void floodFill(p.x,p.y,g);state.drawing=false}
  else if(state.tool==='picker'){const c=getCell(p.x,p.y);if(c){if(state.drawButton===2)setSecondaryGlyph(c.ch);else setPrimaryGlyph(c.ch)}state.drawing=false}
  else if(state.tool==='magnifier'){setZoom(state.zoom<2?state.zoom*2:state.zoom/2);state.drawing=false}
  else if(state.tool==='text'){state.textAnchor=p;$('#textValue').value='';$('#textDialog').showModal();state.drawing=false}
  else if(state.tool==='select'){
    if(state.selection&&selectionContains(p.x,p.y)){state.moveSelection={start:p,copy:captureSelection(),bounds:selectionBounds()};}
    else{state.selection=null;clearSelectionClasses();if($('#selectMode').value==='free')state.freePath=[p]}
  }
  else if(state.tool==='shape'){clearPreview();previewShape(state.actionStart,p)}
}
function pointerMove(e){
  if(e.shiftKey!==undefined)state.shiftHeld=!!e.shiftKey;
  const hv=eventCell(e)||(state.drawing?edgeCell(e):null);

  hoveredCells=[];
  if(hv){
    if(state.tool!=='fill'&&state.tool!=='text'&&state.tool!=='magnifier'&&state.tool!=='picker'){
      const size=state.tool==='shape'?state.shapeSize:state.brushSize;
      hoveredCells=edgeOf(footprintOf(hv.x,hv.y,size,state.tool==='shape'?'square':state.brushShape)).map(([x,y])=>idx(x,y));

    }
    $('#cursorStat').textContent=`${hv.x}, ${hv.y}`;
  }else{$('#cursorStat').textContent=''}
  syncOverlays();
  if(!state.drawing)return;
  if(state.panGesture){const scroller=$('#scroller');scroller.scrollLeft=state.panGesture.left+state.panGesture.x-e.clientX;scroller.scrollTop=state.panGesture.top+state.panGesture.y-e.clientY;return}
  const p=eventCell(e)||(state.tool==='shape'||state.tool==='select'?edgeCell(e):null);
  if(!p)return;
  if(state.tool==='pencil'){drawLine(state.lastCell.x,state.lastCell.y,p.x,p.y,(x,y)=>paintBrush(x,y,state.drawGlyph,true));state.lastCell=p}
  else if(state.tool==='eraser'){drawLine(state.lastCell.x,state.lastCell.y,p.x,p.y,(x,y)=>eraseBrush(x,y));state.lastCell=p}
  else if(state.tool==='select'){if(state.moveSelection){previewMoveSelection(p)}else if($('#selectMode').value==='free'){state.freePath.push(p);previewFreeSelection()}else previewRectSelection(state.actionStart,p)}
  else if(state.tool==='shape'){const q=state.shiftHeld?snapB(state.actionStart,p):p;previewShape(state.actionStart,q)}
}
function pointerUp(e){if(state.panGesture){state.panGesture=null;state.drawing=false;return}if(!state.drawing)return;const p=eventCell(e)||edgeCell(e)||state.lastCell||state.actionStart;state.drawing=false;
  if(state.tool==='select'){
    if(state.moveSelection){commitMoveSelection(p);state.moveSelection=null}
    else if($('#selectMode').value==='free')commitFreeSelection();else commitRectSelection(state.actionStart,p);
  }else if(state.tool==='shape'){const q=state.shiftHeld?snapB(state.actionStart,p):p;clearPreview();snapshot();drawShape(state.shape,state.actionStart,q);markDirty()}
}

function paintBrush(x,y,ch,drag=false){const g=ch||'#';for(const [px,py] of footprintOf(x,y,state.brushSize))setCell(px,py,paintCell(g));markDirty()}
function eraseBrush(x,y){for(const [px,py] of footprintOf(x,y,state.brushSize))setCell(px,py,makeCell(' '));markDirty()}
async function floodFill(x,y,g){
  const target=getCell(x,y);if(!target)return false;
  const ch=g||state.glyphPrimary;
  if(!paletteEntry(ch)&&state.glyphPalette.length>=MAX_PALETTE){setMessage('Palette limit reached');return false}
  return runDocumentJob('Flood fill','fill',{cols:state.cols,rows:state.rows,cells:state.cells,x,y,cell:paintCell(ch)},result=>{state.cells=result.cells;rebuildGrid()});
}

function drawLine(x0,y0,x1,y1,fn){let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;while(true){fn(x0,y0);if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>=dy){err+=dy;x0+=sx}if(e2<=dx){err+=dx;y0+=sy}}}
function lineGlyph(x0,y0,x1,y1){const dx=x1-x0,dy=y1-y0;if(Math.abs(dx)>Math.abs(dy)*1.8)return '\u2500';if(Math.abs(dy)>Math.abs(dx)*1.8)return '\u2502';return dx*dy>=0?'\\':'/'}

function strokePoint(x,y,ch,size){for(const [px,py] of footprintOf(x,y,size,'square'))setCell(px,py,paintCell(ch))}
function strokeSegment(a,b,size=1){
  const g=state.drawButton===2?state.glyphSecondary:state.glyphPrimary;
  const ch=state.outlineMode==='rough'?g:lineGlyph(a.x,a.y,b.x,b.y);
  drawLine(a.x,a.y,b.x,b.y,(x,y)=>strokePoint(x,y,ch,size))
}
function rectBounds(a,b){const x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x),y0=Math.min(a.y,b.y),y1=Math.max(a.y,b.y);return{x0,y0,x1,y1,w:x1-x0+1,h:y1-y0+1}}
function snapB(a,b){const dx=b.x-a.x,dy=b.y-a.y,s=Math.max(Math.abs(dx),Math.abs(dy));if(!s)return b;const sx=dx?Math.sign(dx):1,sy=dy?Math.sign(dy):1;return{x:a.x+sx*s,y:a.y+sy*s}}
function fillGlyph(){if(state.fillMode==='secondary')return state.glyphSecondary;return state.glyphPrimary}

function collectOutline(edges,size){const ring=new Set();for(const [a,b] of edges)drawLine(a.x,a.y,b.x,b.y,(x,y)=>{for(const [px,py] of footprintOf(x,y,size,'square'))ring.add(idx(px,py))});return ring}
function drawRingChar(ring,x,y){const has=(x,y)=>inBounds(x,y)&&ring.has(idx(x,y));const up=has(x,y-1),dn=has(x,y+1),lf=has(x-1,y),rt=has(x+1,y),h=(lf?1:0)+(rt?1:0),v=(up?1:0)+(dn?1:0);if(h===0&&v===0)return state.glyphPrimary;if(h===0)return '\u2502';if(v===0)return '\u2500';if(h===1&&v===1){if(rt&&dn)return '\u250C';if(rt&&up)return '\u2514';if(lf&&dn)return '\u2510';if(lf&&up)return '\u2518'}if(h===2&&v===1)return dn?'\u252C':'\u2534';if(h===1&&v===2)return rt?'\u251C':'\u2524';return '\u253C'}
function outlineRingFromRows(rows){
  const ring=new Set(),byY=new Map(rows.map(r=>[r.y,r]));
  for(const {y,min,max} of rows){
    const up=byY.get(y-1),dn=byY.get(y+1);
    for(let x=min;x<=max;x++){
      const edgeX=x===min||x===max;
      const edgeY=!up||x<up.min||x>up.max||!dn||x<dn.min||x>dn.max;
      if((edgeX||edgeY)&&inBounds(x,y))ring.add(idx(x,y));
    }
  }
  return ring;
}
function transposeRows(rows){const m=new Map();for(const r of rows)for(let x=r.min;x<=r.max;x++){const e=m.get(x)||[Number.MAX_SAFE_INTEGER,-Number.MAX_SAFE_INTEGER];if(r.y<e[0])e[0]=r.y;if(r.y>e[1])e[1]=r.y;m.set(x,e)}const out=[];for(const [x,e] of m)out.push({y:x,min:e[0],max:e[1]});return out.sort((a,b)=>a.y-b.y)}
function arrowRowsR(r){return transposeRows(arrowRowsUD('arrowD',{x0:r.y0,y0:r.x0,x1:r.y1,y1:r.x1}))}
function arrowRowsL(r){return transposeRows(arrowRowsUD('arrowU',{x0:r.y0,y0:r.x0,x1:r.y1,y1:r.x1}))}
function arrowRowsUD(shape,r){
  const x0=r.x0,x1=r.x1,y0=r.y0,y1=r.y1,w=x1-x0,h=y1-y0,aX=Math.floor((x0+x1)/2),aXR=x0+x1-aX,s=Math.min(w,h),rows=[];
  if(h===0)return[{y:y0,min:x0,max:x1}];
  if(w===0){const a=[];for(let y=y0;y<=y1;y++)a.push({y,min:aX,max:aX});return a}
  const headHt=Math.max(1,Math.round(s/2)),th=Math.max(1,Math.round(s*.2));
  for(let y=y0;y<=y1;y++){
    const dy=(shape==='arrowU'?y-y0:y1-y);let mn,mx;
    if(dy<headHt){const hw=headHt>1?Math.round(dy/(headHt-1)*w/2):Math.round(w/2);mn=Math.max(x0,aX-hw);mx=Math.min(x1,aXR+hw)}
    else{const tw=Math.floor(th/2);mn=Math.max(x0,aX-tw);mx=Math.min(x1,aXR+tw)}
    rows.push({y,min:mn,max:mx});
  }
  return rows;
}
function arrowRows(shape,r){
  if(shape==='arrowR')return arrowRowsR(r);
  if(shape==='arrowL')return arrowRowsL(r);
  return arrowRowsUD(shape,r);
}
function shapeRows(shape,r){
  const x0=r.x0,x1=r.x1,y0=r.y0,y1=r.y1,w=x1-x0,h=y1-y0,aX=Math.floor((x0+x1)/2),aXR=x0+x1-aX,rows=[];
  if(shape==='rect'){for(let y=y0;y<=y1;y++)rows.push({y,min:x0,max:x1});return rows}
  if(shape==='ellipse'&&(w===0||h===0)){for(let y=y0;y<=y1;y++)rows.push({y,min:x0,max:x1});return rows}
  if(shape==='ellipse'){const cy=(y0+y1)/2,ry=h/2,rx=w/2;for(let y=y0;y<=y1;y++){const nd=(y-cy)/ry;if(Math.abs(nd)>1)continue;const wl=Math.round(rx*Math.sqrt(Math.max(0,1-nd*nd)));rows.push({y,min:Math.max(x0,aX-wl),max:Math.min(x1,aXR+wl)})}return rows}
  if(shape==='triangle'){const H=Math.max(1,h);for(let y=y0;y<=y1;y++){const e=Math.round(w/2*(y-y0)/H);rows.push({y,min:Math.max(x0,aX-e),max:Math.min(x1,aXR+e)})}return rows}
  if(shape==='diamond'){const cy=(y0+y1)/2,ry=Math.max(1,h/2);for(let y=y0;y<=y1;y++){const e=Math.round(w/2*(1-Math.abs((y-cy)/ry)));rows.push({y,min:Math.max(x0,aX-e),max:Math.min(x1,aXR+e)})}return rows}
  if(shape==='arrowR'||shape==='arrowL'||shape==='arrowU'||shape==='arrowD')return arrowRows(shape,r);
  if(shape==='slash'||shape==='bslash'){
    const a=shape==='slash'?{x:x1,y:y0}:{x:x0,y:y0},b=shape==='slash'?{x:x0,y:y1}:{x:x1,y:y1},seg=new Map();
    drawLine(a.x,a.y,b.x,b.y,(x,y)=>{const e=seg.get(y)||[Number.MAX_SAFE_INTEGER,-Number.MAX_SAFE_INTEGER];if(x<e[0])e[0]=x;if(x>e[1])e[1]=x;seg.set(y,e)});
    return [...seg.entries()].sort((p,q)=>p[0]-q[0]).map(([y,[mn,mx]])=>({y,min:mn,max:mx}));
  }
  return null}
function shapeEdges(shape,r){
  const x0=r.x0,x1=r.x1,y0=r.y0,y1=r.y1;
  if(shape==='rightTri')return {e:[[{x:x0,y:y0},{x:x1,y:y1}],[{x:x1,y:y1},{x:x0,y:y1}],[{x:x0,y:y1},{x:x0,y:y0}]]};
  return {e:[[{x:x0,y:y0},{x:x1,y:y0}],[{x:x1,y:y0},{x:x1,y:y1}],[{x:x1,y:y1},{x:x0,y:y1}],[{x:x0,y:y1},{x:x0,y:y0}]]};
}
function enclosedFill(edges,b){const ring=collectOutline(edges,state.shapeSize),g=fillGlyph();for(let y=b.y0;y<=b.y1;y++){let min=null,max=null;for(let x=0;x<state.cols;x++){if(ring.has(idx(x,y))){if(min===null)min=x;max=x}}if(min===null)continue;for(let x=min;x<=max;x++)strokePoint(x,y,g,state.shapeSize)}}
function strokeRing(x,y,sz,ring){const ch=state.outlineMode==='rough'?(state.drawButton===2?state.glyphSecondary:state.glyphPrimary):drawRingChar(ring,x,y);strokePoint(x,y,ch,sz)}

function drawShape(shape,a,b){
  const r=rectBounds(a,b);
  if(shape==='line'||shape==='slash'||shape==='bslash'){
    if(state.outlineMode==='none')return;
    if(shape==='slash'){a={x:r.x1,y:r.y0};b={x:r.x0,y:r.y1}}
    if(shape==='bslash'){a={x:r.x0,y:r.y0};b={x:r.x1,y:r.y1}}
    strokeSegment(a,b,state.shapeSize);return;
  }
  const rows=shapeRows(shape,r);
  if(rows){
    const sz=state.shapeSize,isArrow=shape.startsWith('arrow'),ring=isArrow?outlineRingFromRows(rows):new Set();
    const add=(x,y)=>{if(inBounds(x,y))ring.add(idx(x,y))};
    if(!isArrow)for(const {y,min,max} of rows){add(min,y);add(max,y)}
    if(shape==='rect'||(shape==='ellipse'&&(r.w===1||r.h===1))){for(let x=r.x0;x<=r.x1;x++){add(x,r.y0);add(x,r.y1)}for(let y=r.y0;y<=r.y1;y++){add(r.x0,y);add(r.x1,y)}}
    if(shape==='triangle')for(let x=r.x0;x<=r.x1;x++)add(x,r.y1);
    if(state.fillMode!=='none')for(const {y,min,max} of rows)for(let x=min;x<=max;x++)strokePoint(x,y,fillGlyph(),sz);
    if(state.outlineMode!=='none')for(const i of ring)strokeRing(i%state.cols,Math.floor(i/state.cols),sz,ring);
  }else{
    const e=shapeEdges(shape,r).e;if(state.fillMode!=='none')enclosedFill(e,r);
    if(state.outlineMode!=='none')for(const [p,q] of e)strokeSegment(p,q,state.shapeSize);
  }
}
function shapePoints(s){const P={polygon:[[.1,.3],[.35,0],[.8,.08],[1,.5],[.75,1],[.2,.92],[0,.55]],triangle:[[.5,0],[1,1],[0,1]],rightTri:[[0,0],[1,1],[0,1]],diamond:[[.5,0],[1,.5],[.5,1],[0,.5]],arrowR:[[0,.3],[.62,.3],[.62,0],[1,.5],[.62,1],[.62,.7],[0,.7]],arrowL:[[1,.3],[.38,.3],[.38,0],[0,.5],[.38,1],[.38,.7],[1,.7]],arrowU:[[.3,1],[.3,.38],[0,.38],[.5,0],[1,.38],[.7,.38],[.7,1]],arrowD:[[.3,0],[.3,.62],[0,.62],[.5,1],[1,.62],[.7,.62],[.7,0]]};return P[s]||null}
function pointInPoly(x,y,pts){let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const xi=pts[i].x,yi=pts[i].y,xj=pts[j].x,yj=pts[j].y;const inter=((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi+1e-9)+xi);if(inter)inside=!inside}return inside}

function syncOverlays(){renderer?.setOverlays({preview:state.preview,hover:hoveredCells,cursor:state.cursor})}
function renderPreview(){syncOverlays()}
function clearPreview(){state.preview.clear();syncOverlays()}
function previewShape(a,b){clearPreview();const r=rectBounds(a,b);for(let x=r.x0;x<=r.x1;x++){addPreview(x,r.y0);addPreview(x,r.y1)}for(let y=r.y0;y<=r.y1;y++){addPreview(r.x0,y);addPreview(r.x1,y)}}
function addPreview(x,y){if(!inBounds(x,y))return;state.preview.add(idx(x,y));syncOverlays()}
function previewRectSelection(a,b){clearPreview();const r=rectBounds(a,b);for(let x=r.x0;x<=r.x1;x++){addPreview(x,r.y0);addPreview(x,r.y1)}for(let y=r.y0;y<=r.y1;y++){addPreview(r.x0,y);addPreview(r.x1,y)}}
function previewFreeSelection(){clearPreview();for(const p of state.freePath)addPreview(p.x,p.y)}

function commitRectSelection(a,b){clearPreview();const r=rectBounds(a,b);state.selection={type:'rect',x:r.x0,y:r.y0,w:r.w,h:r.h};renderSelection();updateStats()}
function commitFreeSelection(){clearPreview();if(state.freePath.length<3){state.selection=null;renderSelection();return}const xs=state.freePath.map(p=>p.x),ys=state.freePath.map(p=>p.y),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);const mask=[];for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(pointInPoly(x+.5,y+.5,state.freePath))mask.push([x-x0,y-y0]);state.selection={type:'free',x:x0,y:y0,w:x1-x0+1,h:y1-y0+1,mask};renderSelection();updateStats()}
function clearSelectionClasses(){renderer?.setOverlays({selection:null})}
function renderSelection(){renderer?.setOverlays({selection:state.selection});syncOverlays();updateAccessibleCell()}
function selectionBounds(){return state.selection||{x:0,y:0,w:0,h:0}}
function selectionContains(x,y){const s=state.selection;if(!s)return false;if(x<s.x||y<s.y||x>=s.x+s.w||y>=s.y+s.h)return false;if(s.type==='free')return s.mask.some(([dx,dy])=>s.x+dx===x&&s.y+dy===y);return true}

function clipSelection(s){
  if(!s)return null;const x=Math.max(0,s.x),y=Math.max(0,s.y),right=Math.min(state.cols,s.x+s.w),bottom=Math.min(state.rows,s.y+s.h);
  if(right<=x||bottom<=y)return null;
  const clipped={type:s.type,x,y,w:right-x,h:bottom-y};
  if(s.type==='free'){
    clipped.mask=s.mask.map(([dx,dy])=>[s.x+dx-x,s.y+dy-y]).filter(([dx,dy])=>dx>=0&&dy>=0&&dx<clipped.w&&dy<clipped.h);
    if(!clipped.mask.length)return null;
  }
  return clipped;
}
function selectedPositions(){
  const s=state.selection;if(!s)return[];
  if(s.type==='free')return s.mask.map(([dx,dy])=>[s.x+dx,s.y+dy]).filter(([x,y])=>inBounds(x,y));
  const a=[];for(let y=Math.max(0,s.y);y<Math.min(state.rows,s.y+s.h);y++)for(let x=Math.max(0,s.x);x<Math.min(state.cols,s.x+s.w);x++)a.push([x,y]);return a;
}
function captureSelection(){
  const s=clipSelection(state.selection);if(!s)return null;
  const map=selectedPositions().map(([x,y])=>[`${x-s.x},${y-s.y}`,deepCell(getCell(x,y))]);
  return{w:s.w,h:s.h,map,type:s.type,mask:s.mask||null};
}
function clipboardText(clip){
  const map=new Map(clip.map),lines=[];
  for(let y=0;y<clip.h;y++){const line=[];for(let x=0;x<clip.w;x++)line.push(map.get(`${x},${y}`)?.ch||' ');lines.push(line.join(''))}
  return lines.join('\n');
}
async function writeClipboard(clip){try{await navigator.clipboard.writeText(clipboardText(clip))}catch{ /* Internal clipboard remains available offline. */ }}
async function copySelection(){
  const clip=captureSelection();if(!clip){setMessage('Select an area first');return}
  state.clipboard=clip;await writeClipboard(clip);setMessage('Copied selection (internal clipboard available)');
}
async function cutSelection(){
  const clip=captureSelection();if(!clip)return;const positions=selectedPositions();state.clipboard=clip;
  // Mutate the captured region before awaiting clipboard permission; later selection changes are unrelated.
  snapshot();for(const [x,y] of positions)setCell(x,y,makeCell(' '));markDirty();setMessage('Cut selection');await writeClipboard(clip);
}
async function pasteSelection(){
  let clip=state.clipboard;const revision=documentRevision,origin={x:Math.max(0,state.selection?.x||0),y:Math.max(0,state.selection?.y||0)};
  if(!clip){
    try{const t=await navigator.clipboard.readText();if(t){const data=textDocument(t),map=data.cells.map((c,i)=>[`${i%data.cols},${Math.floor(i/data.cols)}`,c]);clip={w:data.cols,h:data.rows,map}}}
    catch(err){setMessage('Clipboard read failed. Open a text file or copy a GlyphPoint selection.');return}
    if(revision!==documentRevision){setMessage('Document changed while reading the clipboard; paste again.');return}
  }
  if(!clip){setMessage('Clipboard empty');return}
  let prospective;try{prospective=includeUsedGlyphs(state.glyphPalette.map(e=>({...e})),clip.map.map(([,c])=>c))}catch(err){setMessage(err.message);return}
  const plan=preparePlacement(origin.x,origin.y,clip.w,clip.h);if(!plan)return;
  snapshot();applyPlacement(plan);state.glyphPalette=prospective;origin.x=plan.x;origin.y=plan.y;
  for(const [k,c] of clip.map){const [dx,dy]=k.split(',').map(Number);if(state.transparentSelect&&c.ch===' '&&!c.bg)continue;setCell(origin.x+dx,origin.y+dy,c)}
  state.selection=clipSelection({type:clip.type||'rect',x:origin.x,y:origin.y,w:clip.w,h:clip.h,...(clip.type==='free'?{mask:clip.mask}: {})});
  savePalettePrefs();buildGlyphPalette();buildGlyphColourPanel();
  renderSelection();updateStats();markDirty();setMessage(plan.clipped?'Pasted in Clip mode; overflow discarded.':'Pasted; every source cell fits the field.');
}
function previewMoveSelection(p){clearPreview();const m=state.moveSelection,dx=p.x-m.start.x,dy=p.y-m.start.y,minX=m.bounds.x+dx,minY=m.bounds.y+dy,maxX=minX+m.copy.w-1,maxY=minY+m.copy.h-1;for(let x=minX;x<=maxX;x++){addPreview(x,minY);addPreview(x,maxY)}for(let y=minY;y<=maxY;y++){addPreview(minX,y);addPreview(maxX,y)}}

function commitMoveSelection(p){
  clearPreview();const m=state.moveSelection,dx=p.x-m.start.x,dy=p.y-m.start.y;if(!dx&&!dy)return;
  const plan=preparePlacement(m.bounds.x+dx,m.bounds.y+dy,m.copy.w,m.copy.h);if(!plan)return;
  const positions=selectedPositions(),oldSelection={...state.selection};
  snapshot();applyPlacement(plan);for(const [x,y] of positions)setCell(x+plan.dx,y+plan.dy,makeCell(' '));
  for(const [k,c] of m.copy.map){const [rx,ry]=k.split(',').map(Number);if(state.transparentSelect&&c.ch===' '&&!c.bg)continue;setCell(plan.x+rx,plan.y+ry,c)}
  state.selection=clipSelection({...oldSelection,x:plan.x,y:plan.y});renderSelection();updateStats();markDirty();setMessage(plan.clipped?'Moved in Clip mode; overflow discarded.':'Moved selection without clipping.');
}
function deleteSelection(){if(!state.selection){setMessage('Select an area first');return}snapshot();for(const [x,y] of selectedPositions())setCell(x,y,makeCell(' '));markDirty();setMessage('Deleted selection')}

function cropSelection(){
  const s=clipSelection(state.selection);if(!s){setMessage('Select an area first');return}
  snapshot();const nc=Array.from({length:s.w*s.h},()=>makeCell());
  for(const [x,y] of selectedPositions())nc[(y-s.y)*s.w+x-s.x]=deepCell(getCell(x,y));
  state.cols=s.w;state.rows=s.h;state.cells=nc;state.selection=null;rebuildGrid();markDirty();setMessage('Cropped');
}
function transform(type){
  if(!['flipH','flipV','rot90','rot180','rot270'].includes(type))return;
  const selected=!!state.selection,s=selected?clipSelection(state.selection):{type:'rect',x:0,y:0,w:state.cols,h:state.rows};if(!s)return;
  const positions=selected?selectedPositions():state.cells.map((_,i)=>[i%state.cols,Math.floor(i/state.cols)]);
  const entries=positions.map(([x,y])=>({x:x-s.x,y:y-s.y,c:deepCell(getCell(x,y))}));
  const quarter=type==='rot90'||type==='rot270',ow=quarter?s.h:s.w,oh=quarter?s.w:s.h;
  const dest=(x,y)=>type==='flipH'?[s.w-1-x,y]:type==='flipV'?[x,s.h-1-y]:type==='rot180'?[s.w-1-x,s.h-1-y]:type==='rot90'?[s.h-1-y,x]:[y,s.w-1-x];
  const plan=selected?preparePlacement(s.x,s.y,ow,oh):null;if(selected&&!plan)return;
  snapshot();
  if(!selected){state.cols=ow;state.rows=oh;state.cells=Array.from({length:ow*oh},()=>makeCell());for(const e of entries){const [x,y]=dest(e.x,e.y);state.cells[idx(x,y)]=e.c}rebuildGrid()}
  else{
    applyPlacement(plan);for(const [x,y] of positions)setCell(x+plan.dx,y+plan.dy,makeCell());
    const mask=[];for(const e of entries){const [x,y]=dest(e.x,e.y);setCell(plan.x+x,plan.y+y,e.c);mask.push([x,y])}
    state.selection=clipSelection({type:s.type,x:plan.x,y:plan.y,w:ow,h:oh,...(s.type==='free'?{mask}: {})});renderSelection();
  }
  updateStats();markDirty();setMessage((type.startsWith('rot')?'Rotated':'Flipped')+(plan?.clipped?' in Clip mode; overflow discarded.':''));
}
function openResize(){const unit=$('#resizeUnit').value;state.resizeAspect=state.cols/state.rows;$('#resizeW').value=unit==='percent'?100:state.cols;$('#resizeH').value=unit==='percent'?100:state.rows;$('#skewX').value=0;$('#skewY').value=0;if(!$('#resizeDialog').open)$('#resizeDialog').showModal()}
function syncResizeAspect(which){if(!$('#keepAspect').checked||state.aspectSync)return;state.aspectSync=true;const unit=$('#resizeUnit').value;if(unit==='percent'){if(which==='w')$('#resizeH').value=$('#resizeW').value;else $('#resizeW').value=$('#resizeH').value}else{if(which==='w')$('#resizeH').value=Math.max(1,Math.round((+$(`#resizeW`).value)/state.resizeAspect));else $('#resizeW').value=Math.max(1,Math.round((+$(`#resizeH`).value)*state.resizeAspect))}state.aspectSync=false}

async function applyResizeSkew(){
  try{
    const unit=$('#resizeUnit').value;let nw=Number($('#resizeW').value),nh=Number($('#resizeH').value);
    if(!Number.isFinite(nw)||!Number.isFinite(nh)||nw<=0||nh<=0)throw Error('Enter positive dimensions or percentages.');
    if(unit==='percent'){nw=Math.max(1,Math.round(state.cols*nw/100));nh=Math.max(1,Math.round(state.rows*nh/100))}
    validateDimensions(nw,nh);const ax=Number($('#skewX').value),ay=Number($('#skewY').value);
    if(!Number.isFinite(ax)||!Number.isFinite(ay)||Math.abs(ax)>89||Math.abs(ay)>89)throw Error('Skew angles must be between -89 and 89 degrees.');
    if($('#resizeDialog').open)$('#resizeDialog').close();
    return await runDocumentJob('Resize / skew','resize',{cols:state.cols,rows:state.rows,cells:state.cells,width:nw,height:nh,angleX:ax,angleY:ay,edgePolicy:$('#resizeEdges').value||'expand'},result=>{
      state.cols=result.cols;state.rows=result.rows;state.cells=result.cells;state.selection=null;rebuildGrid();
    });
  }catch(err){alert(err.message);return false}
}
function placeText(){
  if(!state.textAnchor)return false;
  try{
    const text=$('#textValue').value;if(!text)return true;
    const data=textDocument(text),scale=clamp(Number($('#textScale').value)||1,1,3),font=normaliseFont($('#textFont').value),bold=$('#textBold').checked,italic=$('#textItalic').checked,underline=$('#textUnderline').checked,opaque=$('#textBg').value==='opaque';
    const glyphs=data.cells.filter(c=>opaque||c.ch!==' '),prospective=includeUsedGlyphs(state.glyphPalette.map(e=>({...e})),glyphs);const plan=planPlacement(state.textAnchor.x,state.textAnchor.y,data.cols*scale,data.rows*scale);snapshot();applyPlacement(plan);state.glyphPalette=prospective;
    for(let ly=0;ly<data.rows;ly++)for(let cx=0;cx<data.cols;cx++){
      const ch=data.cells[ly*data.cols+cx].ch;if(!opaque&&ch===' ')continue;
      for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++)setCell(plan.x+cx*scale+sx,plan.y+ly*scale+sy,{...paintCell(ch),bg:opaque?(state.paintBg||state.fieldBg):state.paintBg,font,bold,italic,underline});
    }
    rebuildGrid();markDirty();setMessage(plan.clipped?'Text placed in Clip mode; overflow discarded.':'Text placed without clipping.');return true;
  }catch(err){alert(err.message);return false}
}
function setZoom(z){state.zoom=clamp(Math.round(z*4)/4,.25,8);renderer?.setView();$('#zoomSlider').value=Math.round(state.zoom*100);$('#zoomLabel').textContent=Math.round(state.zoom*100)+'%';renderRulers()}
function renderRulers(){
  const h=$('#hruler'),v=$('#vruler'),scroller=$('#scroller'),m=renderer?.metrics();if(!h||!v||!m)return;
  const cw=m.scaledCellWidth,ch=m.scaledCellHeight;h.replaceChildren();v.replaceChildren();
  if(typeof getComputedStyle==='function'){const css=getComputedStyle(scroller);h.style.paddingLeft=css.paddingLeft;v.style.paddingTop=css.paddingTop}
  for(let x=0;x<state.cols;x+=5){const span=document.createElement('span');span.textContent=x;span.style.cssText=`display:inline-block;width:${Math.min(5,state.cols-x)*cw}px`;h.appendChild(span)}
  for(let y=0;y<state.rows;y+=5){const div=document.createElement('div');div.textContent=y;div.style.height=`${Math.min(5,state.rows-y)*ch}px`;v.appendChild(div)}
  h.scrollLeft=scroller.scrollLeft;v.scrollTop=scroller.scrollTop;
}
function handleFile(a){$('#fileMenu').classList.remove('open');if(a==='new'){if(!state.dirty||confirm('Discard current document?'))newDocument(80,80,true)}else if(a==='openProject')$('#openProjectInput').click();else if(a==='openTxt')$('#openTxtInput').click();else if(a==='openHtml')$('#openHtmlInput').click();else if(a==='saveProject')saveProject();else if(a==='saveAs')saveProject({saveAs:true});else if(a==='downloadProject')saveProject({download:true});else if(a==='recover')openRecovery();else if(a==='exportPNG')exportPNG();else if(a==='cellStyle')openCellStyle();else if(a==='textView')openTextView();else if(a==='exportTxt')downloadBlob(cellsToText(),'text/plain','glyphpoint.txt');else if(a==='exportHtml')exportHtml();else if(a==='properties')openProperties();else if(a==='colourManager')openGlyphColourManager();else if(a==='print')printArtwork();else if(a==='help')openHelp()}
function cellsToText(){let out=[];for(let y=0;y<state.rows;y++){let s='';for(let x=0;x<state.cols;x++)s+=getCell(x,y).ch;out.push(s)}return out.join('\n')+'\n'}

function projectPayload(){return{format:'glyphpoint-v3',cols:state.cols,rows:state.rows,cells:state.cells,glyphPalette:state.glyphPalette,glyphPrimary:state.glyphPrimary,glyphSecondary:state.glyphSecondary,square:state.square,fieldBg:state.fieldBg}}
function normaliseProject(d){
  if(!d||!['glyphpoint-v1','glyphpoint-v2','glyphpoint-v3'].includes(d.format)||d.kind==='palette'||!Array.isArray(d.cells))throw Error('Not a GlyphPoint project');
  validateDimensions(d.cols,d.rows);if(d.cells.length!==d.cols*d.rows)throw Error('Cell count does not match the declared dimensions.');
  const legacy=d.format!=='glyphpoint-v3';
  if(legacy&&d.cells.some(c=>!c||typeof c.ch!=='string'||[...c.ch].length!==1))throw Error('Legacy projects require one Unicode code point per cell.');
  const cells=d.cells.map(c=>normaliseCell(legacy?{...c,fg:validColour(c.fg)?c.fg:'',bg:''}:{...c,font:SAFE_FONTS.includes(c?.font)?c.font:'DejaVu Sans Mono'})),pal=includeUsedGlyphs(normalisePalette(d.glyphPalette??DEFAULT_GLYPH_PALETTE,d.glyphColours||{}),cells);
  if(legacy)for(const c of cells){c.fg='';c.bg=''}
  const fieldBg=d.fieldBg??d.defaultBg??'#000000';if(!validColour(fieldBg))throw Error('Field background must be a six-digit hex colour.');
  if(d.square!==undefined&&typeof d.square!=='boolean')throw Error('Square pixels must be true or false.');
  return{cols:d.cols,rows:d.rows,cells,glyphPalette:pal,fieldBg:fieldBg.toLowerCase(),square:d.square===true,
    glyphPrimary:pal.some(e=>e.glyph===d.glyphPrimary)?d.glyphPrimary:pal[0].glyph,
    glyphSecondary:pal.some(e=>e.glyph===d.glyphSecondary)?d.glyphSecondary:(pal[1]||pal[0]).glyph};
}
async function saveProject(options={}){
  if(!fileSaver){try{normaliseProject(projectPayload());downloadBlob(JSON.stringify(projectPayload(),null,2),'application/json','glyphpoint-project.json');setMessage('Project download requested; keep the downloaded JSON file.')}catch(err){alert('Could not save project: '+err.message)}return}
  const result=await fileSaver.save(options);
  if(result.kind==='saved'&&fileSaver.isCurrentDocument(result)){
    // A successful Save As changes the destination even when the user made a
    // newer edit while the write was pending. Keep its name visible, but leave
    // those edits dirty. Recheck the saver epoch after the await as New/Undo may
    // have reset it between the write completion and this continuation.
    if(result.name)state.docName=result.name;
    if(result.current&&result.revision===documentRevision)state.dirty=false;
    updateTitle();
  }
  return result;
}
async function readImportFile(f){if(f.size>MAX_FILE_BYTES)throw Error('File exceeds the 16 MiB import limit.');return await f.text()}
function importStillCurrent(generation,revision,source){
  if(generation!==importGeneration)return false;
  if(revision!==documentRevision){setMessage(`The document changed while reading ${source}; choose the file again to apply it.`);return false}
  return true;
}
function textDocument(text){
  text=String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');if(text.endsWith('\n'))text=text.slice(0,-1);
  if(!text.length)throw Error('Text is empty.');const lines=text.split('\n');if(lines.length>MAX_DIMENSION)throw Error('Text has too many rows.');
  let cols=1;const rows=lines.map(line=>{
    const chars=[];for(const ch of GPInterchange.iterateGraphemes(line)){if(ch==='\t'){do{chars.push(' ')}while(chars.length%4)}else{if(!validGlyph(ch))throw Error('Text contains an unsupported control character.');chars.push(ch)}if(chars.length>MAX_DIMENSION)throw Error('Text has too many columns.')}
    cols=Math.max(cols,chars.length);return chars;
  });validateDimensions(cols,rows.length);
  return{cols,rows:rows.length,cells:rows.flatMap(chars=>Array.from({length:cols},(_,x)=>makeCell(chars[x]??' ')))};
}
function installDocument(data,name){
  recovery?.flush();fileSaver?.reset();cancelJob();snapshot();documentIdentity++;for(const key of ['cols','rows','cells','glyphPalette','glyphPrimary','glyphSecondary','fieldBg','square'])state[key]=data[key];
  state.docName=name;state.cursor={x:0,y:0};state.selection=null;state.keyboardAnchor=null;state.drawing=false;state.moveSelection=null;state.drawGlyph=state.glyphPrimary;state.textAnchor=null;clearPreview();
  syncDocumentControls();rebuildGrid();savePalettePrefs();state.dirty=false;documentRevision++;recovery?.beginDocument();recovery?.touch();updateTitle();
}
async function importDocumentFile(e,parse,label){
  const f=e.target.files[0];if(!f)return;e.target.value='';const generation=++importGeneration,revision=documentRevision;
  let installing=false;
  try{
    const text=await readImportFile(f);if(!importStillCurrent(generation,revision,'the file'))return;
    const data=await parse(text);if(!importStillCurrent(generation,revision,'the file'))return;
    if(state.dirty&&!confirm('Discard unsaved changes and open this file?'))return;
    installing=true;installDocument(data,f.name);if(label!=='Project opened')markDirty();setMessage(label+(data.importWarning?' — '+data.importWarning:''));
  }catch(err){if(installing||generation===importGeneration&&revision===documentRevision)alert('Could not open file: '+err.message)}
}
function openProjectFile(e){return importDocumentFile(e,t=>normaliseProject(JSON.parse(t)),'Project opened')}
function openTxtFile(e){return importDocumentFile(e,t=>normaliseProject({format:'glyphpoint-v3',...textDocument(t),glyphPalette:state.glyphPalette,fieldBg:state.fieldBg,square:state.square,glyphPrimary:state.glyphPrimary,glyphSecondary:state.glyphSecondary}),'Plain text imported')}
function inlineColour(value){
  if(validColour(value))return value.toLowerCase();let m=/^#([0-9a-f]{3})$/i.exec(value||'');if(m)return '#'+[...m[1]].map(c=>c+c).join('').toLowerCase();
  m=/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(value||'');
  if(m&&m.slice(1).every(v=>Number(v)<=255))return '#'+m.slice(1).map(v=>Number(v).toString(16).padStart(2,'0')).join('');return null;
}
function htmlDocument(text){
  const template=document.createElement('template');template.innerHTML=text;
  const native=template.content.querySelector('script#glyphpoint-data[type="application/json"]');
  if(native)return normaliseProject(JSON.parse(native.textContent));
  const parsed=GPInterchange.parseHtml(text,{maxDimension:MAX_DIMENSION,maxCells:MAX_CELLS,maxPalette:MAX_PALETTE,safeFonts:SAFE_FONTS,defaultFont:'DejaVu Sans Mono'});
  return {...normaliseProject(parsed),importWarning:parsed.importWarning||parsed.warnings?.join('; ')||''};
}
function openHtmlFile(e){return importDocumentFile(e,htmlDocument,'HTML imported')}
function exportHtml(){
  try{
    const data=normaliseProject(projectPayload()),glyphIndex=new Map(data.glyphPalette.map((e,i)=>[e.glyph,i]));
    const paletteCss=data.glyphPalette.map((e,i)=>`.g${i}{color:${isWhitespaceGlyph(e.glyph)?data.fieldBg:e.colour}}`).join('');
    const fontCss=SAFE_FONTS.map((font,i)=>`.f${i}{font-family:${JSON.stringify(font)},monospace}`).join('');
    const m=renderer?.metrics(),cellWidth=m?.cellWidth||(data.square?16:8.4296875),cellHeight=m?.cellHeight||16;
    const fonts=$('#embeddedFonts')?.textContent||'';
    const measuring=document.createElement('canvas').getContext?.('2d');
    const lines=[];for(let y=0;y<data.rows;y++){
      const row=[];for(let x=0;x<data.cols;x++){
        const c=data.cells[y*data.cols+x];let size=14;
        if(measuring){measuring.font=`${c.italic?'italic ':''}${c.bold?'bold ':''}14px "${c.font}"`;const metrics=measuring.measureText(c.ch),width=Math.max(metrics.width,(metrics.actualBoundingBoxLeft||0)+(metrics.actualBoundingBoxRight||0));if(width>cellWidth)size=Math.max(1,14*cellWidth/width)}
        const style=`${c.fg?'color:'+c.fg+';':''}${c.bg?'background-color:'+c.bg+';':''}font-size:${size}px`;
        row.push(`<span class="g${glyphIndex.get(c.ch)} f${SAFE_FONTS.indexOf(c.font)}${c.bold?' b':''}${c.italic?' i':''}${c.underline?' u':''}" style="${style}">${escapeHtml(c.ch)}</span>`);
      }lines.push(row.join(''));
    }
    const json=JSON.stringify({...data,format:'glyphpoint-v3'}).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
    const license=BUNDLED_FONT_LICENSE.replace(/--/g,'—');
    const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:"><title>GlyphPoint export</title><style>${fonts}html,body{margin:0;background:${data.fieldBg};color:#fff}body{padding:20px}pre{display:grid;grid-template-columns:repeat(${data.cols},${cellWidth}px);width:max-content;margin:0;font:14px/${cellHeight}px "DejaVu Sans Mono",monospace;white-space:pre;font-variant-ligatures:none}pre>span{display:block;width:${cellWidth}px;height:${cellHeight}px;overflow:hidden;text-align:center;background:${data.fieldBg}}.b{font-weight:bold}.i{font-style:italic}.u{text-decoration:underline}${paletteCss}${fontCss}</style><!--${license}--></head><body><pre id="art" aria-label="GlyphPoint artwork">${lines.join('\n')}</pre><script id="glyphpoint-data" type="application/json">${json}<\/script></body></html>`;
    if(new Blob([html]).size>MAX_FILE_BYTES)throw Error('HTML exceeds the import budget; save the project JSON or use a smaller field.');
    downloadBlob(html,'text/html','glyphpoint-export.html');setMessage('HTML exported with cell colours, embedded font and editable project data.');
  }catch(err){alert('Could not export HTML: '+err.message)}
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function downloadBlob(data,type,name){const blob=data instanceof Blob?data:new Blob([data],{type}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)}
function openProperties(){const d=$('#propertiesDialog');$('#propW').value=state.cols;$('#propH').value=state.rows;$('#propBg').value=state.fieldBg;$('#transparentSelect').checked=state.transparentSelect;d.showModal()}

function applyProperties(){
  try{
    const w=Number($('#propW').value),h=Number($('#propH').value);validateDimensions(w,h);
    const bg=$('#propBg').value;if(!validColour(bg))throw Error('Choose a valid field background.');
    const removed=state.cells.filter((c,i)=>(i%state.cols>=w||Math.floor(i/state.cols)>=h)&&(c.ch!==' '||c.bg||c.underline)).length;
    if(removed&&!confirm(`Shrinking the field discards ${removed} non-empty or styled cells. Continue?`))return false;
    snapshot();
    const old=state.cells,oc=state.cols,or=state.rows;state.cols=w;state.rows=h;state.fieldBg=bg;state.transparentSelect=$('#transparentSelect').checked;
    state.cells=Array.from({length:w*h},(_,i)=>{const x=i%w,y=Math.floor(i/w);return x<oc&&y<or?deepCell(old[y*oc+x]):makeCell()});
    state.selection=null;syncDocumentControls();rebuildGrid();markDirty();return true;
  }catch(err){alert(err.message);return false}
}
function openHelp(){const h=$('#helpBody');h.innerHTML=`<p><b>Start drawing</b><br>Choose a glyph and a tool, then draw. Use secondary glyph selects the second slot for pointer, touch, and keyboard drawing. Right-click always uses the secondary slot. Pan field lets a touch or pointer drag scroll the field.</p><p><b>Keyboard field</b><br>Focus field or Tab into the grid. Arrows move one cell; Shift+arrows select. Space paints; Shift+Space uses secondary; Delete clears; Enter opens text. Home/End move within a row, Ctrl/Command+Home/End reach field corners, Page Up/Down move ten rows. Ctrl/Command+A selects the field. Tab leaves the field.</p><p><b>Recovery and saving</b><br>Edits are checkpointed in browser storage after a short pause. Recovery opens the checkpoint list. Storage errors are reported; save project files as portable backups. Save writes directly when the browser supports file access; otherwise it requests a JSON download. A download request does not confirm that a file was kept.</p><p><b>Colours and characters</b><br>A cell holds one grapheme, including combining letters and joined emoji (up to 32 code points). Cell colours can inherit palette / field defaults or have independent foreground and background colours. Use for next strokes changes brush defaults; Apply to cells changes the selection or focused cell.</p><p><b>Fonts and export</b><br>DejaVu Sans Mono is embedded for portable text drawing. Other fonts and glyphs outside its coverage can depend on the device. Export PNG freezes the full-field appearance. HTML includes embedded fonts, cell styles and editable project data. Readable text exposes every row for assistive tools and copying.</p><p><b>Geometry</b><br>Paste, move, text and selected rotations expand the field by default. Edges also offers Reject and explicit Clip. Resize / skew has its own edge option and applies horizontal then vertical shear with inverse sampling. Fill and resize are cancellable; a pending result cannot replace a changed document.</p><p><b>Clipboard and history</b><br>Ctrl/Command+C copies, X cuts, V pastes, Z undoes, Shift+Z or Y redoes. Internal clipboard remains available if system permission is denied. Controls and dialogs keep their native editing shortcuts.</p><p><b>Shapes and brushes</b><br>Stroke modes are Glyph, Lines, or None; fill uses the chosen slot. Shift locks shape proportions. Brush size controls Pencil and Eraser; circle, square and fixed ratio tips are available.</p>`;$('#helpDialog').showModal()}




function keyboard(e){
  const target=e.target;if(e.defaultPrevented||e.isComposing||target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')||document.querySelector('dialog[open]'))return;
  if(handleCanvasKeyboard(e))return;
  if(activeJob){if(e.key==='Escape'){e.preventDefault();cancelJob()}return}
  const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
  if(mod&&key==='z'){e.preventDefault();e.shiftKey?redo():undo()}
  else if(mod&&key==='y'){e.preventDefault();redo()}
  else if(mod&&key==='c'){e.preventDefault();copySelection()}
  else if(mod&&key==='x'){e.preventDefault();cutSelection()}
  else if(mod&&key==='v'){e.preventDefault();pasteSelection()}
  else if(mod&&key==='n'){e.preventDefault();handleFile('new')}
  else if(mod&&key==='s'){e.preventDefault();saveProject()}
  else if(mod&&key==='p'){e.preventDefault();printArtwork()}
  else if(!mod&&!e.altKey&&e.key==='Delete'&&state.selection){e.preventDefault();deleteSelection()}
  else if(e.key==='Escape'){closeColourPicker();closeGcmMenus();$('#fileMenu').classList.remove('open');state.drawing=false;state.moveSelection=null;clearPreview();state.selection=null;state.keyboardAnchor=null;renderSelection();updateStats()}
  else if(!mod&&!e.altKey&&(e.key==='+'||e.key==='=')){e.preventDefault();setZoom(state.zoom+.25)}
  else if(!mod&&!e.altKey&&e.key==='-'){e.preventDefault();setZoom(state.zoom-.25)}
}
