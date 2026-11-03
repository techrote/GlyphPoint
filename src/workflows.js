'use strict';

function paintCell(ch){return {...makeCell(ch),fg:state.paintFg,bg:state.paintBg}}
function cancelJob(){if(activeJob){activeJob.controller.abort();setMessage('Operation cancelled; the document was not changed.')}}
async function runDocumentJob(label,kind,input,commit){
  if(activeJob){setMessage('Finish or cancel the current operation first.');return false}
  const focusBefore=document.activeElement,revision=documentRevision,controller=new AbortController(),job={controller};activeJob=job;
  $('#jobPanel').hidden=false;$('#jobLabel').textContent=label+'…';$('#workspace').setAttribute('aria-busy','true');
  $('.ribbonwrap').inert=true;$('#canvasWrap').setAttribute('aria-disabled','true');$('#cancelJob').focus();
  try{
    const result=await GPJobs.run(kind,input,{signal:controller.signal,onProgress:p=>{$('#jobLabel').textContent=`${label}: ${Math.round(p.completed/p.total*100)}%`}});
    if(controller.signal.aborted||revision!==documentRevision){setMessage('The document changed; the pending result was discarded.');return false}
    snapshot();commit(result);markDirty();setMessage(label+' complete'+(result.clipped?' (Clip mode discarded the part outside the field).':'.'));return true;
  }catch(err){if(err.name!=='AbortError')alert(label+' failed: '+err.message);return false}
  finally{if(activeJob===job){activeJob=null;$('#jobPanel').hidden=true;$('#workspace').removeAttribute('aria-busy');$('.ribbonwrap').inert=false;$('#canvasWrap').removeAttribute('aria-disabled');if(document.activeElement===$('#cancelJob'))focusBefore?.focus?.()}}
}

// Compute expansion first; rejected placement never changes history or cells.
function planPlacement(x,y,w,h){
  const outside=x<0||y<0||x+w>state.cols||y+h>state.rows;
  if(!outside||state.edgePolicy==='clip')return {x,y,dx:0,dy:0,cols:state.cols,rows:state.rows,clipped:outside};
  if(state.edgePolicy==='reject')throw Error('This edit extends outside the field. Choose Expand to keep all cells or Clip to discard overflow.');
  const dx=Math.max(0,-x),dy=Math.max(0,-y),cols=Math.max(state.cols,x+w)+dx,rows=Math.max(state.rows,y+h)+dy;
  validateDimensions(cols,rows);return {x:x+dx,y:y+dy,dx,dy,cols,rows,clipped:false};
}
function preparePlacement(x,y,w,h){try{return planPlacement(x,y,w,h)}catch(err){setMessage(err.message);return null}}
function applyPlacement(plan){
  if(plan.cols===state.cols&&plan.rows===state.rows&&!plan.dx&&!plan.dy)return;
  const old=state.cells,oldCols=state.cols,oldRows=state.rows;
  state.cells=Array.from({length:plan.cols*plan.rows},()=>makeCell());state.cols=plan.cols;state.rows=plan.rows;
  for(let y=0;y<oldRows;y++)for(let x=0;x<oldCols;x++)state.cells[idx(x+plan.dx,y+plan.dy)]=old[y*oldCols+x];
  if(state.selection){state.selection.x+=plan.dx;state.selection.y+=plan.dy}
  if(state.textAnchor){state.textAnchor.x+=plan.dx;state.textAnchor.y+=plan.dy}
  state.cursor.x+=plan.dx;state.cursor.y+=plan.dy;rebuildGrid();
}

function updateAccessibleCell(){
  const wrap=$('#canvasWrap'),cell=$('#activeCell'),row=$('#activeRow');if(!wrap||!cell||!state.cells.length)return;
  const {x,y}=state.cursor,c=getCell(x,y);if(!c)return;
  const glyph=c.ch===' '?'blank':c.ch,entry=paletteEntry(c.ch),fg=c.fg||getGlyphColour(c.ch),bg=c.bg||state.fieldBg;
  const description=`Row ${y+1}, column ${x+1}: ${glyph}${entry?.represents?' ('+entry.represents+')':''}; foreground ${fg}; background ${bg}${selectionContains(x,y)?'; selected':''}.`;
  wrap.setAttribute('aria-rowcount',state.rows);wrap.setAttribute('aria-colcount',state.cols);
  row?.setAttribute('aria-rowindex',y+1);cell.setAttribute('aria-colindex',x+1);cell.setAttribute('aria-selected',selectionContains(x,y));
  cell.textContent=description;cell.setAttribute('aria-label',description);
  if(document.activeElement===wrap)$('#cellAnnouncement').textContent=description;
}
function focusCanvas(){ $('#canvasWrap').focus({preventScroll:true});renderer?.ensureCellVisible(state.cursor.x,state.cursor.y);updateAccessibleCell();syncOverlays() }
function handleCanvasKeyboard(e){
  if(e.target!==$('#canvasWrap')||e.altKey||activeJob)return false;
  const mod=e.ctrlKey||e.metaKey,key=e.key,{x,y}=state.cursor;
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(key)){
    e.preventDefault();if(e.shiftKey&&!state.keyboardAnchor)state.keyboardAnchor={x,y};else if(!e.shiftKey)state.keyboardAnchor=null;
    if(key==='ArrowLeft')state.cursor.x--;if(key==='ArrowRight')state.cursor.x++;
    if(key==='ArrowUp')state.cursor.y--;if(key==='ArrowDown')state.cursor.y++;
    if(key==='PageUp')state.cursor.y-=10;if(key==='PageDown')state.cursor.y+=10;
    if(key==='Home'){state.cursor.x=0;if(mod)state.cursor.y=0}
    if(key==='End'){state.cursor.x=state.cols-1;if(mod)state.cursor.y=state.rows-1}
    state.cursor.x=clamp(state.cursor.x,0,state.cols-1);state.cursor.y=clamp(state.cursor.y,0,state.rows-1);
    if(e.shiftKey)commitRectSelection(state.keyboardAnchor,state.cursor);
    renderer?.ensureCellVisible(state.cursor.x,state.cursor.y);updateAccessibleCell();syncOverlays();return true;
  }
  if(mod&&key.toLowerCase()==='a'){e.preventDefault();state.selection={type:'rect',x:0,y:0,w:state.cols,h:state.rows};renderSelection();updateStats();return true}
  if(!mod&&key==='Enter'){e.preventDefault();state.textAnchor={x,y};$('#textValue').value='';$('#textDialog').showModal();$('#textValue').focus();return true}
  if(!mod&&(key==='Delete'||key==='Backspace')){e.preventDefault();if(state.selection)deleteSelection();else{snapshot();setCell(x,y,makeCell());markDirty()}return true}
  if(!mod&&key===' '){
    e.preventDefault();const glyph=e.shiftKey||state.drawSecondary?state.glyphSecondary:state.glyphPrimary;
    if(state.tool==='fill')void floodFill(x,y,glyph);
    else if(state.tool==='picker'){e.shiftKey||state.drawSecondary?setSecondaryGlyph(getCell(x,y).ch):setPrimaryGlyph(getCell(x,y).ch)}
    else{snapshot();state.tool==='eraser'?eraseBrush(x,y):paintBrush(x,y,glyph)}
    return true;
  }
  return false;
}

function openCellStyle(){
  $('#styleFgMode').value=state.paintFg?'custom':'inherit';$('#styleBgMode').value=state.paintBg?'custom':'inherit';
  $('#styleFg').value=state.paintFg||getGlyphColour(state.glyphPrimary);$('#styleBg').value=state.paintBg||state.fieldBg;
  $('#styleTarget').textContent=state.selection?'Apply to the selected cells':'Apply to the focused cell';
  $('#cellStyleDialog').showModal();
}
function commitCellStyle(apply){
  state.paintFg=$('#styleFgMode').value==='custom'?$('#styleFg').value:'';
  state.paintBg=$('#styleBgMode').value==='custom'?$('#styleBg').value:'';
  if(apply){snapshot();const points=state.selection?selectedPositions():[[state.cursor.x,state.cursor.y]];for(const [x,y]of points)setCell(x,y,{...getCell(x,y),fg:state.paintFg,bg:state.paintBg});markDirty()}
  $('#cellStyleDialog').close();setMessage(apply?'Cell colours applied.':'Brush colours updated.');focusCanvas();
}
function applyBundledFont(){
  snapshot();const points=state.selection?selectedPositions():state.cells.map((_,i)=>xy(i));
  for(const [x,y]of points)setCell(x,y,{...getCell(x,y),font:'DejaVu Sans Mono'});
  markDirty();renderAll();setMessage('Embedded DejaVu Sans Mono applied'+(state.selection?' to the selection.':' to the whole field.'));
}

async function openRecovery(){
  $('#recoveryDialog').showModal();const list=$('#recoveryList');list.replaceChildren();$('#recoveryHelp').textContent='Loading recovery checkpoints…';
  try{
    await recovery.flush();const records=await recovery.list();
    $('#recoveryHelp').textContent=records.length?'Choose a checkpoint to recover. Recovery is stored in this browser; keep project files for portable backups.':'No checkpoints yet. The first edit creates one automatically.';
    for(const record of records){
      const item=document.createElement('div');item.className='recoveryItem';const label=document.createElement('p');
      label.textContent=`${record.name} — ${record.cols} × ${record.rows} — ${new Date(record.updatedAt).toLocaleString()}`;
      const recoverButton=document.createElement('button');recoverButton.textContent='Recover';recoverButton.setAttribute('aria-label','Recover '+record.name);
      recoverButton.onclick=async()=>{
        const revision=documentRevision;try{const restored=await recovery.read(record.id);
          if(revision!==documentRevision){setMessage('Document changed while reading recovery; choose the checkpoint again.');return}
          if(state.dirty&&!confirm('Replace the current document with this checkpoint? Save a project file first if the recovery status reports an error.'))return;
          installDocument(restored.project,restored.name);markDirty();$('#recoveryDialog').close();setMessage('Recovered checkpoint. Save a project file to keep a portable copy.');
        }catch(err){$('#recoveryHelp').textContent=err.message}
      };
      const remove=document.createElement('button');remove.textContent='Delete checkpoint';remove.onclick=async()=>{if(!confirm('Delete this recovery checkpoint? This does not delete a project file.'))return;try{await recovery.remove(record.id);item.remove()}catch(err){$('#recoveryHelp').textContent=err.message}};
      item.append(label,recoverButton,remove);list.appendChild(item);
    }
  }catch(err){$('#recoveryHelp').textContent='Recovery is unavailable: '+err.message}
}
function openTextView(){ $('#readableText').value=cellsToText();$('#textViewDialog').showModal();$('#readableText').focus() }
async function exportPNG(){
  try{setMessage('Preparing full-field PNG…');const blob=await renderer.exportPNG({scale:1});downloadBlob(blob,'image/png','glyphpoint.png');setMessage('PNG download requested; the image preserves this rendering.')}catch(err){alert('PNG export failed: '+err.message)}
}
let printURL=null;
async function printArtwork(){
  try{const blob=await renderer.exportPNG({scale:1});if(printURL)URL.revokeObjectURL(printURL);printURL=URL.createObjectURL(blob);const image=$('#printImage');image.src=printURL;await image.decode();window.print()}catch(err){alert('Could not prepare print: '+err.message)}
}

function initWorkflows(){
  recovery=GPRecovery.create({capture:projectPayload,validate:normaliseProject,getName:()=>state.docName,report:s=>{
    const status=$('#recoveryStatus');status.textContent=s.state==='saved'?'Recovery saved':s.state==='pending'?'Recovery pending':s.state==='saving'?'Saving recovery…':s.state==='error'||s.state==='unavailable'?'Recovery unavailable':'Recovery ready';status.title=s.message;
    if(s.state==='error'||s.state==='unavailable')setMessage(s.message);
  }});
  recovery.attachLifecycle(window,document);
  fileSaver=GPRecovery.createFileSaver({maxFileBytes:MAX_FILE_BYTES,capture:projectPayload,validate:normaliseProject,getName:()=>state.docName,getRevision:()=>documentRevision,download:downloadBlob,report:s=>setMessage(s.message)});
  const direct=fileSaver.capabilities().direct;
  $('[data-file="saveAs"]').disabled=!direct;
  $('[data-file="saveProject"]').title=direct?'Choose a project file once, then save back to it.':'This browser saves a portable project through its download interface.';
  $('#recoverBtn').onclick=openRecovery;$('#cellStyleBtn').onclick=openCellStyle;$('#focusCanvasBtn').onclick=focusCanvas;
  $('#secondaryToggle').onclick=()=>{state.drawSecondary=!state.drawSecondary;$('#secondaryToggle').setAttribute('aria-pressed',state.drawSecondary);setMessage(state.drawSecondary?'Secondary glyph active.':'Primary glyph active.')};
  $('#panToggle').onclick=()=>{state.panMode=!state.panMode;$('#panToggle').setAttribute('aria-pressed',state.panMode);setMessage(state.panMode?'Pan mode: drag the field to scroll.':'Draw mode: drag to use the active tool.')};
  $('#edgePolicy').onchange=e=>{state.edgePolicy=e.target.value;setMessage('Field edge policy: '+e.target.selectedOptions[0].textContent)};
  $('#setBrushStyle').onclick=()=>commitCellStyle(false);$('#applyCellStyle').onclick=()=>commitCellStyle(true);$('#portableFont').onclick=applyBundledFont;
  $('#cancelJob').onclick=cancelJob;$('#canvasWrap').addEventListener('focus',()=>{updateAccessibleCell();syncOverlays()});
  $('#canvasWrap').addEventListener('blur',()=>{state.keyboardAnchor=null});
  $('#textViewCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('#readableText').value);$('#textViewStatus').textContent='Copied all text.'}catch{$('#readableText').select();$('#textViewStatus').textContent='Text selected. Use your system Copy command.'}};
  $('#textViewExport').onclick=()=>downloadBlob(cellsToText(),'text/plain','glyphpoint.txt');
  void recovery.list().then(records=>{if(records.length){$('#recoverBtn').textContent=`Recovery (${records.length})`;setMessage(`${records.length} recovery checkpoint${records.length===1?'':'s'} available from the Recovery button.`)}}).catch(()=>{});
}
