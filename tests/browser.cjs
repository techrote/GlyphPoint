'use strict';

// Real-browser regression tests for the shipped, standalone HTML editor.
// Usage: node tests/browser.cjs [chromium|firefox|webkit ...]
// GP_RUN_SMOKE=1 selects the platform smoke workflows used on Windows/macOS.
// Requires: npm ci && npx playwright install chromium firefox webkit
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const playwright = require('playwright');

const appPath = path.resolve(process.env.GLYPHPOINT_APP || path.join(__dirname, '..', 'GlyphPoint-v1a-layout-fixed.html'));
const appURL = pathToFileURL(appPath).href;
const requestedBrowsers = process.argv.slice(2);
const browserNames = requestedBrowsers.length ? requestedBrowsers : ['chromium', 'firefox'];
const smoke = process.env.GP_RUN_SMOKE === '1';
const smokeScenarios = new Set(['startup and both UI layouts', 'JSON open/save preserves document and Unicode',
  'real pointer strokes use both glyph slots and stop after cancellation', 'keyboard grid navigation, selection and readable text',
  'palette buttons retain keyboard focus and support semantic activation',
  'cell colours and full-field PNG survive save and undo', 'mobile viewport supports touch secondary drawing and panning']);
const cell = (ch, options = {}) => ({ch, fg:'', bg:'', font:'Cascadia Mono', bold:false, italic:false, underline:false, ...options});
const fixture = () => ({
  format:'glyphpoint-v2', cols:4, rows:2, square:true, fieldBg:'#102030',
  glyphPrimary:'A', glyphSecondary:'B',
  cells:[cell('A'), cell('A',{font:'Consolas',bold:true,italic:true,underline:true}), cell('B'), cell('<'), cell('&'), cell(' '), cell('😀'), cell(' ')],
  glyphPalette:[['A','#112233'],['B','#445566'],['<','#778899'],['&','#ff00cc'],['😀','#abcdef'],[' ','#000000']].map(([glyph,colour])=>({glyph,colour,represents:glyph==='A'?'Terrain':''})),
});
const jsonPayload = (name, value) => ({name, mimeType:'application/json', buffer:Buffer.from(JSON.stringify(value))});
const textPayload = (name, value, mimeType='text/plain') => ({name,mimeType,buffer:Buffer.from(value)});

async function importFile(page, selector, payload) {
  const expectedName = payload.name;
  await page.locator(selector).setInputFiles(payload);
  await page.waitForFunction(name => document.querySelector('#docTitle').textContent.includes(name), expectedName);
  await page.evaluate(()=>renderer.whenIdle());
}
async function downloadBytes(page, action) {
  await page.locator('#fileBtn').click();
  const pending = page.waitForEvent('download');
  await page.locator(`#fileMenu [data-file="${action}"]`).click();
  const result = await pending;
  assert.equal(await result.failure(), null, 'Browser accepted the download');
  return fs.readFile(await result.path());
}
async function download(page, action) { return (await downloadBytes(page, action)).toString('utf8'); }
async function save(page) { return JSON.parse(await download(page, 'downloadProject')); }
async function cellCentre(page,x,y) {
  return page.evaluate(async ({x,y})=>{
    renderer.ensureCellVisible(x,y);await renderer.whenIdle();
    const m=renderer.metrics(),r=document.querySelector('#canvasGrid').getBoundingClientRect();
    return {x:r.left+m.originX+(x+.5)*m.scaledCellWidth,y:r.top+m.originY+(y+.5)*m.scaledCellHeight};
  },{x,y});
}
async function clickCell(page,x,y,options) { const p=await cellCentre(page,x,y);await page.mouse.click(p.x,p.y,options); }
async function backgroundPixel(page,x,y) {
  return page.evaluate(async ({x,y})=>{
    renderer.ensureCellVisible(x,y);await renderer.whenIdle();const m=renderer.metrics();
    const data=document.querySelector('#canvasGrid').getContext('2d').getImageData(
      Math.floor((m.originX+x*m.scaledCellWidth+.5)*m.dpr),Math.floor((m.originY+y*m.scaledCellHeight+.5)*m.dpr),1,1).data;
    return Array.from(data);
  },{x,y});
}
async function assertMobileLayout(page,label) {
  const layout=await page.evaluate(()=>{
    const viewport={width:innerWidth,height:innerHeight},toolbar=document.querySelector('.ribbonwrap').getBoundingClientRect();
    const box=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const status=[document.querySelector('#statusbar'),...document.querySelector('#statusbar').children].filter(el=>el.getClientRects().length).map(el=>({name:el.id||el.className,...box(el)}));
    const targets=[];
    for(const el of document.querySelectorAll('.toolbtn,.gp-btn,.shape,.bsbtn,.xformbtn')){
      const r=box(el),parent=el.closest('.toolgrid,.gp-grid,.shapegrid,.brushshape,.transformgrid'),clip=parent?.classList.contains('gp-grid')?box(parent):toolbar;
      const x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;
      if(x<Math.max(0,toolbar.left,clip.left)||x>Math.min(innerWidth,toolbar.right,clip.right))continue;
      if(parent?.classList.contains('gp-grid')&&(y<clip.top||y>clip.bottom))continue;
      targets.push({name:el.id||el.getAttribute('data-tool')||el.getAttribute('data-g')||el.getAttribute('data-shape')||el.className,
        group:parent?.id||parent?.className||'',...r});
    }
    return {viewport,toolbar:{top:toolbar.top,bottom:toolbar.bottom},status,targets};
  });
  for(const item of layout.status){
    assert.ok(item.left>=-.5&&item.right<=layout.viewport.width+.5&&item.top>=-.5&&item.bottom<=layout.viewport.height+.5,`${label}: ${item.name} stays within the mobile viewport (${JSON.stringify(item)})`);
  }
  for(const target of layout.targets){
    assert.ok(target.width>=43.5&&target.height>=43.5,`${label}: ${target.name} has an actual 44-pixel target (${target.width}×${target.height})`);
    assert.ok(target.top>=layout.toolbar.top-.5&&target.bottom<=layout.toolbar.bottom+.5,`${label}: ${target.name} is not vertically clipped by the toolbar`);
  }
  for(let i=0;i<layout.targets.length;i++)for(let j=i+1;j<layout.targets.length;j++){
    const a=layout.targets[i],b=layout.targets[j];if(a.group!==b.group)continue;
    const width=Math.min(a.right,b.right)-Math.max(a.left,b.left),height=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
    assert.ok(width<=.5||height<=.5,`${label}: touch targets ${a.name} and ${b.name} do not overlap`);
  }
}
function projectValues(project) {
  return {cols:project.cols,rows:project.rows,cells:project.cells,glyphPalette:project.glyphPalette,glyphPrimary:project.glyphPrimary,glyphSecondary:project.glyphSecondary,square:project.square,fieldBg:project.fieldBg};
}
async function documentState(page) {
  return page.evaluate(()=>({cols:state.cols,rows:state.rows,cells:state.cells,glyphPalette:state.glyphPalette,glyphPrimary:state.glyphPrimary,glyphSecondary:state.glyphSecondary,square:state.square,fieldBg:state.fieldBg}));
}
async function rejectedImport(page, payload) {
  const before = await documentState(page);
  const pending = page.waitForEvent('dialog', {predicate:dialog=>dialog.type()==='alert'});
  await page.locator('#openProjectInput').setInputFiles(payload);
  const dialog = await pending;
  assert.ok(dialog.message(), 'Rejected import explains the error');
  const after = await documentState(page);
  assert.deepEqual(after, before, `Rejected ${payload.name} without changing the open document`);
}

async function runBrowser(browserName) {
  assert.ok(['chromium','firefox','webkit'].includes(browserName), `Unsupported test browser: ${browserName}`);
  const browser = await playwright[browserName].launch({headless:true,timeout:30000});
  let completed = 0;
  async function scenario(name, run, options={}) {
    if(smoke&&!smokeScenarios.has(name))return;
    const context = await browser.newContext({acceptDownloads:true, viewport:{width:1440,height:1000},...options});
    const page = await context.newPage();
    const errors = [], dialogs = [], externalRequests = [];
    page.on('pageerror', error=>errors.push(error.message));
    page.on('dialog', dialog=>{dialogs.push({type:dialog.type(),message:dialog.message()});void dialog.accept();});
    await context.route(/^https?:/, route=>{externalRequests.push(route.request().url());return route.abort();});
    try {
      await page.goto(appURL);
      await page.waitForFunction(()=>typeof renderer!=='undefined'&&renderer&&state.cells.length===6400);
      await page.evaluate(()=>renderer.whenIdle());
      await run({page,context,errors,dialogs,externalRequests});
      assert.deepEqual(errors, [], 'No uncaught JavaScript errors');
      assert.deepEqual(externalRequests, [], 'Standalone editor/import did not request external resources');
      completed++;
      console.log(`PASS ${browserName}: ${name}`);
    } catch(error) { console.error('Browser diagnostics:', {name, errors, dialogs, externalRequests}); throw error; } finally { await context.close(); }
  }
  try {
    await scenario('startup and both UI layouts', async ({page})=>{
      assert.equal(await page.locator('#canvasGrid .cell').count(), 0,'There are no per-cell DOM elements');
      assert.equal(await page.locator('#canvasGrid').evaluate(el=>el.tagName),'CANVAS');
      assert.equal((await documentState(page)).cells.length,6400);
      assert.equal(await page.locator('#canvasWrap').getAttribute('aria-rowcount'),'80');
      await page.setViewportSize({width:1440,height:720});
      await page.locator('#uiModeToggle').click();
      assert.equal(await page.locator('#app').evaluate(el=>el.classList.contains('classic')), true);
      await page.waitForFunction(()=>document.querySelector('.ribbonwrap').classList.contains('classic-overflow'));
      const classicWidths=await page.locator('#homeRibbon, #homeRibbon .group').evaluateAll(elements=>elements.map(el=>({name:el.className,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth})));
      for(const item of classicWidths)assert.ok(item.scrollWidth<=item.clientWidth+1,`${item.name} contains its controls when the Classic sidebar scrolls (${item.scrollWidth} > ${item.clientWidth})`);
      await page.locator('#gpColoursBtn').click();
      assert.equal(await page.locator('#glyphColourManagerDialog').evaluate(el=>el.open), true);
      await page.locator('#gcmClose').click();
      await page.locator('#uiModeToggle').click();
      assert.equal(await page.locator('#app').evaluate(el=>el.classList.contains('classic')), false);
    });
    await scenario('JSON open/save preserves document and Unicode', async ({page})=>{
      const original = fixture();
      await importFile(page, '#openProjectInput', jsonPayload('roundtrip.json', original));
      assert.deepEqual(projectValues(await save(page)), projectValues(original));
      assert.equal((await documentState(page)).cells.length,8);
      assert.equal(await page.locator('#fieldBgInput').inputValue(), '#102030');
      assert.equal(await page.locator('#squareToggle').getAttribute('aria-pressed'), 'true');
      assert.equal((await documentState(page)).cells[1].italic,true);
      assert.deepEqual(await backgroundPixel(page,0,0),[16,32,48,255]);
    });
    await scenario('malformed and oversized JSON rejected atomically', async ({page})=>{
      await importFile(page, '#openProjectInput', jsonPayload('original.json', fixture()));
      for (const [name, changes] of [
        ['zero-width',{cols:0}], ['fractional-height',{rows:1.5}], ['negative-width',{cols:-4}],
        ['excessive-dimensions',{cols:100000000}], ['missing-cells',{cells:[]}],
        ['invalid-cell',{cells:[null,...fixture().cells.slice(1)]}],
        ['multi-character-cell',{cells:[cell('AB'),...fixture().cells.slice(1)]}],
        ['control-character-cell',{cells:[cell('\u0000'),...fixture().cells.slice(1)]}],
      ]) await rejectedImport(page, jsonPayload(`${name}.json`, {...fixture(),...changes}));
      await rejectedImport(page, textPayload('syntax-error.json','{not valid JSON','application/json'));
    });
    await scenario('large palettes survive save/open and browser preferences', async ({page})=>{
      const glyphPalette=Array.from({length:80},(_,i)=>({glyph:String.fromCodePoint(0x400+i),colour:'#123456',represents:`Entry ${i}`}));
      const project={...fixture(),cols:1,rows:1,cells:[cell(glyphPalette[79].glyph)],glyphPalette,glyphPrimary:glyphPalette[79].glyph,glyphSecondary:glyphPalette[0].glyph};
      await importFile(page,'#openProjectInput',jsonPayload('large-palette.json',project));
      const saved=await save(page);
      assert.equal(saved.glyphPalette.length,81);
      assert.equal(saved.glyphPalette.filter(entry=>entry.glyph!==' ').length,80);
      assert.equal(saved.glyphPalette[79].colour,'#123456');
      await page.reload();
      const persisted=await save(page);
      assert.equal(persisted.glyphPalette.find(entry=>entry.glyph===glyphPalette[79].glyph)?.colour,'#123456');
      assert.equal(persisted.glyphPalette.find(entry=>entry.glyph===glyphPalette[79].glyph)?.represents,'Entry 79');
    });
    await scenario('HTML export keeps every run, style and escaped character', async ({page,context})=>{
      const original=fixture();
      await importFile(page,'#openProjectInput',jsonPayload('styled.json',original));
      const html=await download(page,'exportHtml');
      const preview=await context.newPage();
      await preview.setContent(html);
      const art=preview.locator('pre');
      assert.equal(await art.textContent(),'AAB<\n& 😀 ');
      const boxes=await art.locator('span').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}));
      assert.equal(boxes.length,8);
      assert.equal(boxes[0].y,boxes[3].y,'First row stays on one grid row');
      assert.equal(boxes[4].x,boxes[0].x,'Second row begins at the first column');
      assert.equal(boxes[4].y,boxes[0].y+boxes[0].height,'Text newline does not add an extra grid row');

      const spans=await art.locator('span').evaluateAll(elements=>elements.map(el=>{const css=getComputedStyle(el);return {text:el.textContent,colour:css.color,font:css.fontFamily,bold:css.fontWeight,italic:css.fontStyle,underline:css.textDecorationLine}}));
      assert.ok(spans.some(span=>span.text==='A'&&span.bold==='700'&&span.italic==='italic'&&span.underline==='underline'), 'Same-glyph style changes form separate export runs');
      assert.ok(spans.some(span=>span.text==='B'&&span.colour==='rgb(68, 85, 102)'));
      assert.equal(await preview.locator('script:not([type="application/json"])').count(),0,'Export contains no executable script');
      assert.equal(await preview.locator('[onerror],[onload],[onmouseover],iframe,object,embed').count(),0);
      await importFile(page,'#openHtmlInput',textPayload('styled-roundtrip.html',html,'text/html'));
      const restored=await save(page);
      assert.deepEqual(restored.cells.map(c=>c.ch),original.cells.map(c=>c.ch));
      assert.equal(restored.cols,original.cols);
      assert.equal(restored.rows,original.rows);
      assert.equal(restored.fieldBg,original.fieldBg);
      assert.equal(restored.square,original.square);
      assert.equal(restored.cells[1].bold,true);
      assert.equal(restored.cells[1].italic,true);
      assert.equal(restored.cells[1].underline,true);
      for(const entry of original.glyphPalette.filter(e=>e.glyph!==' '))assert.equal(restored.glyphPalette.find(e=>e.glyph===entry.glyph)?.colour,entry.colour);
    });
    await scenario('hostile HTML import stays inert and excludes active content', async ({page})=>{
      const html='<!doctype html><html><head><link rel="stylesheet" href="https://invalid.example/attack.css"></head><body><pre id="art">A<script>globalThis.GLYPHPOINT_PWNED=true</script><style>bad-text</style><img src="https://invalid.example/attack.png" onerror="globalThis.GLYPHPOINT_PWNED=true">B<iframe src="https://invalid.example/attack"></iframe>C</pre></body></html>';
      await importFile(page,'#openHtmlInput',textPayload('hostile.html',html,'text/html'));
      const result=await save(page);
      assert.equal(result.cells.map(c=>c.ch).join(''),'ABC');
      assert.equal(await page.evaluate(()=>globalThis.GLYPHPOINT_PWNED),undefined);
    });
    await scenario('font metadata cannot break out of exported HTML attributes', async ({page,context})=>{
      const project=fixture();project.cells[0].font='\" onmouseover=\"globalThis.GLYPHPOINT_PWNED=true\" x=\"';
      await importFile(page,'#openProjectInput',jsonPayload('font-metadata.json',project));
      const html=await download(page,'exportHtml');
      const preview=await context.newPage();await preview.setContent(html);
      assert.equal(await preview.locator('[onmouseover],[onerror],[onload]').count(),0);
      assert.equal(await preview.locator('pre').textContent(),'AAB<\n& 😀 ');
      assert.equal(await preview.evaluate(()=>globalThis.GLYPHPOINT_PWNED),undefined);
    });
    await scenario('plain-text Unicode import and text export preserve rectangular cells', async ({page})=>{
      await importFile(page,'#openTxtInput',textPayload('unicode.txt','A😀B\r\nZ\n'));
      const project=await save(page);
      assert.equal(project.cols,3);assert.equal(project.rows,2);
      assert.deepEqual(project.cells.map(c=>c.ch),['A','😀','B','Z',' ',' ']);
      assert.equal(await download(page,'exportTxt'),'A😀B\nZ  \n');
    });
    await scenario('palette-manager rename and revert restore the canvas', async ({page})=>{
      const original=fixture();await importFile(page,'#openProjectInput',jsonPayload('manager.json',original));
      await page.locator('#gpColoursBtn').click();
      const row=page.locator('.gcm-row').filter({has:page.locator('input.gcm-glyph')}).first();
      await row.locator('input.gcm-glyph').fill('Q');
      await row.locator('input.gcm-glyph').press('Tab');
      assert.equal((await documentState(page)).cells[0].ch,'Q');
      await page.locator('#gcmRevert').click();
      assert.equal((await documentState(page)).cells[0].ch,'A');
      await page.locator('#gcmClose').click();
      assert.deepEqual(projectValues(await save(page)),projectValues(original));
    });
    await scenario('palette buttons retain keyboard focus and support semantic activation', async ({page})=>{
      const project={...fixture(),cells:Array.from({length:8},()=>cell(' '))};
      await importFile(page,'#openProjectInput',jsonPayload('palette-input.json',project));
      const history=await page.evaluate(()=>state.history.length);
      const a=page.locator('#glyphPalette [data-g="A"]'),b=page.locator('#glyphPalette [data-g="B"]');
      // Assistive controls may activate a button without pointerdown/keydown.
      await b.evaluate(button=>button.click());
      assert.equal((await documentState(page)).glyphPrimary,'B','Semantic click selects the active glyph');
      await a.focus();await page.keyboard.press('Enter');
      assert.equal((await documentState(page)).glyphPrimary,'A');
      assert.equal(await a.evaluate(button=>document.activeElement===button),true,'Selection retains the focused button');
      await page.keyboard.press('Tab');
      assert.equal(await b.evaluate(button=>document.activeElement===button),true,'Tab continues from the chosen glyph');
      await page.keyboard.press('Shift+Enter');
      assert.equal((await documentState(page)).glyphSecondary,'B');
      assert.equal(await b.evaluate(button=>document.activeElement===button),true);
      await page.keyboard.press('Tab');await page.keyboard.press('Shift+Space');
      assert.equal((await documentState(page)).glyphSecondary,'<');
      assert.equal(await page.locator('#glyphPalette [data-g="<"]').evaluate(button=>document.activeElement===button),true);
      await page.locator('#secondaryToggle').click();
      await page.locator('#glyphPalette [data-g="&"]').evaluate(button=>button.click());
      assert.equal((await documentState(page)).glyphSecondary,'&','Semantic click respects the active secondary slot');
      await a.click();assert.equal((await documentState(page)).glyphSecondary,'A','Ordinary pointer click respects the active slot');
      await b.click({button:'right'});assert.equal((await documentState(page)).glyphSecondary,'B','Real right click still chooses secondary');
      assert.equal((await documentState(page)).glyphPrimary,'A');
      assert.equal(await page.evaluate(()=>state.history.length),history,'Selecting glyphs does not create content history');
      await page.locator('#secondaryToggle').click();
      await page.locator('#gpEditBtn').click();
      await b.focus();await b.evaluate(button=>button.click());
      assert.equal(await page.locator('#paletteDialog').evaluate(dialog=>dialog.open),true,'Semantic activation opens an edited glyph');
      assert.equal(await page.locator('#paletteGlyphInput').inputValue(),'B');
      await page.locator('#paletteDialog button[value="cancel"]').click();
      await page.locator('#glyphPalette [data-g="<"]').click({button:'right'});
      assert.equal(await page.locator('#glyphPalette [data-g="<"]').count(),0,'Right click removes an unused glyph in Edit mode');
      await page.locator('#gpEditBtn').click();
      await page.locator('#gpColoursBtn').click();
      for(const name of ['Replace glyph A','Colour for glyph A','Hex colour for glyph A','Meaning of glyph A']){
        assert.equal(await page.getByLabel(name,{exact:true}).count(),1,`Manager exposes the purpose and glyph for ${name}`);
      }
      assert.equal(await page.getByRole('button',{name:'Reset colour for glyph A',exact:true}).count(),1);
      assert.equal(await page.getByRole('button',{name:'Remove glyph A',exact:true}).count(),1);
      await page.locator('#gcmClose').click();
    });
    await scenario('typing shortcuts in dialogs do not edit canvas or zoom', async ({page})=>{
      await importFile(page,'#openProjectInput',jsonPayload('keyboard.json',fixture()));
      await page.locator('#gpColoursBtn').click();
      const label=page.locator('.gcm-represents').first();
      await label.fill('ABCD');await label.press('Control+A');await label.press('Backspace');await label.type('+-=');
      assert.equal(await label.inputValue(),'+-=');
      assert.equal(await page.locator('#zoomLabel').textContent(),'100%');
      await page.locator('#gcmClose').click();
      assert.deepEqual((await save(page)).cells.map(c=>c.ch),fixture().cells.map(c=>c.ch));
    });
    await scenario('real pointer strokes use both glyph slots and stop after cancellation', async ({page})=>{
      const blank={...fixture(),cols:8,rows:4,cells:Array.from({length:32},()=>cell(' '))};
      await importFile(page,'#openProjectInput',jsonPayload('pointer.json',blank));
      await page.locator('[data-tool="pencil"]').click();
      const centre=(x,y)=>cellCentre(page,x,y);
      const stroke=async(x0,y0,x1,y1,button)=>{
        const start=await centre(x0,y0),end=await centre(x1,y1);
        await page.mouse.move(start.x,start.y);await page.mouse.down({button});
        await page.mouse.move(end.x,end.y,{steps:3});await page.mouse.up({button});
      };
      await stroke(0,0,3,0,'left');
      await stroke(1,1,4,1,'right');
      let drawn=await documentState(page);
      assert.equal(drawn.cells.slice(0,8).map(c=>c.ch).join(''),'AAAA    ','Left drag paints the primary glyph continuously');
      assert.equal(drawn.cells.slice(8,16).map(c=>c.ch).join(''),' BBBB   ','Right drag paints the secondary glyph continuously');

      const start=await centre(0,2),paintedEnd=await centre(2,2),cancelledEnd=await centre(6,2);
      await page.mouse.move(start.x,start.y);await page.mouse.down({button:'left'});
      await page.mouse.move(paintedEnd.x,paintedEnd.y,{steps:2});
      await page.locator('#canvasGrid').dispatchEvent('pointercancel',{bubbles:true,pointerType:'mouse',pointerId:1});
      const atCancellation=await documentState(page);
      await page.mouse.move(cancelledEnd.x,cancelledEnd.y,{steps:4});await page.mouse.up({button:'left'});
      assert.deepEqual(await documentState(page),atCancellation,'Further real movement after pointercancel does not paint');
      assert.equal(atCancellation.cells.slice(16,24).map(c=>c.ch).join(''),'AAA     ');
      await stroke(5,3,7,3,'right');
      drawn=await documentState(page);
      assert.equal(drawn.cells.slice(24,32).map(c=>c.ch).join(''),'     BBB','A fresh stroke works after cancellation');
    });
    await scenario('appearance undo, invalid size dialogs and transparent text preserve the document', async ({page})=>{
      const original=fixture();
      await importFile(page,'#openProjectInput',jsonPayload('appearance.json',original));
      // Native OS colour pickers are outside Playwright's page surface. Exercise
      // the actual colour-input events, then use the visible Undo buttons.
      await page.locator('#fieldBgInput').evaluate(input=>{
        input.value='#334455';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
      });
      await page.locator('#squareToggle').click();
      assert.equal((await documentState(page)).fieldBg,'#334455');
      assert.equal(await page.locator('#squareToggle').getAttribute('aria-pressed'),'false');
      await page.locator('#qUndo').click();
      assert.equal(await page.locator('#squareToggle').getAttribute('aria-pressed'),'true');
      assert.equal((await documentState(page)).fieldBg,'#334455','Undoing square cells preserves the preceding background edit');
      await page.locator('#qUndo').click();
      assert.equal(await page.locator('#fieldBgInput').inputValue(),'#102030');
      assert.deepEqual(await backgroundPixel(page,0,0),[16,32,48,255]);
      assert.deepEqual(await documentState(page),projectValues(original));

      await page.locator('#fileBtn').click();await page.locator('[data-file="properties"]').click();
      await page.locator('#propW').fill('0');
      await page.locator('#propBg').evaluate(input=>{input.value='#ee0011'});
      const beforeProperties=await documentState(page),propertiesAlert=page.waitForEvent('dialog',{predicate:dialog=>dialog.type()==='alert'});
      await page.locator('#applyProps').click();await propertiesAlert;
      assert.equal(await page.locator('#propertiesDialog').evaluate(el=>el.open),true,'Invalid Properties stays open for correction');
      assert.equal(await page.locator('#propW').inputValue(),'0');
      assert.deepEqual(await documentState(page),beforeProperties,'Rejected Properties does not apply its background or dimensions');
      await page.locator('#propertiesDialog button[value="cancel"]').click();

      await page.locator('#resizeBtn').click();await page.locator('#keepAspect').uncheck();
      await page.locator('#resizeW').fill('513');
      const beforeResize=await documentState(page),resizeAlert=page.waitForEvent('dialog',{predicate:dialog=>dialog.type()==='alert'});
      await page.locator('#applyResize').click();await resizeAlert;
      assert.equal(await page.locator('#resizeDialog').evaluate(el=>el.open),true,'Invalid Resize stays open for correction');
      assert.equal(await page.locator('#resizeW').inputValue(),'513');
      assert.deepEqual(await documentState(page),beforeResize,'Rejected Resize does not alter the document');
      await page.locator('#resizeDialog button[value="cancel"]').click();

      await page.locator('[data-tool="text"]').click();await clickCell(page,0,0);
      await page.locator('#textValue').fill('Z Q');await page.locator('#textBg').selectOption('transparent');
      await page.locator('#applyText').click();
      assert.equal(await page.locator('#textDialog').evaluate(el=>el.open),false);
      const textResult=await documentState(page);
      assert.equal(textResult.cells.slice(0,4).map(c=>c.ch).join(''),'ZAQ<');
      assert.deepEqual(textResult.cells[1],original.cells[1],'A transparent space preserves the existing glyph and every cell style');
      await page.locator('#qUndo').click();
      assert.deepEqual(await documentState(page),projectValues(original),'Text placement is one reversible action');
    });
    await scenario('keyboard grid navigation, selection and readable text', async ({page})=>{
      const project={...fixture(),cols:8,rows:4,cells:Array.from({length:32},()=>cell(' '))};
      await importFile(page,'#openProjectInput',jsonPayload('accessible.json',project));
      const grid=page.locator('#canvasWrap');await grid.focus();
      assert.equal(await grid.getAttribute('role'),'grid');
      assert.equal(await grid.getAttribute('aria-activedescendant'),'activeCell');
      assert.equal(await page.locator('#canvasGrid').getAttribute('aria-hidden'),'true');
      await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');
      assert.equal((await documentState(page)).cells[1].ch,'A');
      assert.equal(await page.locator('#activeCell').getAttribute('aria-colindex'),'2');
      assert.match(await page.locator('#activeCell').getAttribute('aria-label'),/Row 1, column 2: A/);
      await page.keyboard.press('ArrowDown');await page.keyboard.press('Shift+Space');
      assert.equal((await documentState(page)).cells[9].ch,'B');
      await page.keyboard.press('Shift+ArrowRight');
      assert.equal(await page.locator('#activeCell').getAttribute('aria-selected'),'true');
      await page.keyboard.press('Delete');
      assert.deepEqual((await documentState(page)).cells.slice(9,11).map(c=>c.ch),[' ',' ']);
      await page.keyboard.press('Enter');await page.locator('#textValue').fill('é👨‍👩‍👧‍👦');await page.locator('#applyText').click();
      const withText=await documentState(page);
      assert.deepEqual(withText.cells.slice(10,12).map(c=>c.ch),['é','👨‍👩‍👧‍👦'],'Keyboard text entry preserves complete graphemes in separate cells');
      await grid.focus();await page.keyboard.press('ControlOrMeta+End');
      assert.equal(await page.locator('#activeRow').getAttribute('aria-rowindex'),'4');
      assert.equal(await page.locator('#activeCell').getAttribute('aria-colindex'),'8');
      await page.keyboard.press('Shift+ArrowLeft');await page.keyboard.press('Escape');await page.keyboard.press('Shift+ArrowLeft');
      assert.deepEqual(await page.evaluate(()=>({x:state.selection.x,w:state.selection.w})),{x:5,w:2},'Escape resets the keyboard selection anchor');
      await page.keyboard.press('Tab');
      assert.equal(await grid.evaluate(el=>document.activeElement===el),false,'Tab exits the field');
      await page.locator('#fileBtn').click();await page.locator('[data-file="textView"]').click();
      assert.equal(await page.locator('#textViewDialog').evaluate(el=>el.open),true);
      assert.match(await page.locator('#readableText').inputValue(),/é👨‍👩‍👧‍👦/);
      assert.equal(await page.locator('#readableText').getAttribute('readonly'),'');
      await page.locator('#textViewDialog button[value="cancel"]').click();
    });
    await scenario('cell colours and full-field PNG survive save and undo', async ({page})=>{
      await importFile(page,'#openProjectInput',jsonPayload('colours.json',fixture()));
      await page.locator('#canvasWrap').focus();await page.keyboard.press('ControlOrMeta+Home');
      await page.locator('#cellStyleBtn').click();
      await page.locator('#styleFgMode').selectOption('custom');await page.locator('#styleBgMode').selectOption('custom');
      await page.locator('#styleFg').evaluate(input=>{input.value='#ff0000'});
      await page.locator('#styleBg').evaluate(input=>{input.value='#123456'});
      await page.locator('#applyCellStyle').click();
      let project=await save(page);
      assert.equal(project.format,'glyphpoint-v3');
      assert.equal(project.cells[0].fg,'#ff0000');assert.equal(project.cells[0].bg,'#123456');
      assert.equal(project.cells[1].fg,'','Another copy of the glyph retains its palette inheritance');
      assert.deepEqual(await backgroundPixel(page,0,0),[18,52,86,255]);
      await page.locator('#qUndo').click();assert.equal((await documentState(page)).cells[0].fg,'');
      await page.locator('#qRedo').click();assert.equal((await documentState(page)).cells[0].fg,'#ff0000');
      await page.locator('#fileBtn').click();await page.locator('[data-file="properties"]').click();
      await page.locator('#propW').fill('80');await page.locator('#propH').fill('80');await page.locator('#applyProps').click();
      await page.locator('#zoomSlider').evaluate(input=>{input.value='800';input.dispatchEvent(new Event('input',{bubbles:true}))});
      await page.evaluate(()=>renderer.whenIdle());
      const png=await downloadBytes(page,'exportPNG');
      assert.deepEqual(Array.from(png.subarray(0,8)),[137,80,78,71,13,10,26,10]);
      assert.equal(png.readUInt32BE(16),1280,'PNG contains every field column at native size, regardless of zoom');
      assert.equal(png.readUInt32BE(20),1280,'PNG includes rows beyond the visible viewport');
      project=await save(page);assert.equal(project.cells[0].bg,'#123456');
    });
    await scenario('maximum-size worker edits are cancellable, responsive and atomic', async ({page})=>{
      const project={...fixture(),cols:256,rows:256,cells:Array.from({length:65536},()=>cell(' '))};
      await importFile(page,'#openProjectInput',jsonPayload('large-worker.json',project));
      const cancelled=await page.evaluate(async()=>{
        const history=state.history.length,pending=floodFill(0,0,'A');
        const busy=document.querySelector('#workspace').getAttribute('aria-busy');
        const button=document.querySelector('#cancelJob');const visible=!document.querySelector('#jobPanel').hidden;
        button.click();await pending;
        return {busy,visible,unchanged:state.cells.every(c=>c.ch===' '),historyUnchanged:state.history.length===history,
          panelHidden:document.querySelector('#jobPanel').hidden,enabled:!document.querySelector('.ribbonwrap').inert};
      });
      assert.deepEqual(cancelled,{busy:'true',visible:true,unchanged:true,historyUnchanged:true,panelHidden:true,enabled:true});
      const completed=await page.evaluate(async()=>{
        const initialHistory=state.history.length;
        let frames=0,painting=true;const tick=()=>{if(painting){frames++;requestAnimationFrame(tick)}};requestAnimationFrame(tick);
        const result=await floodFill(0,0,'A');painting=false;await renderer.whenIdle();
        return {result,frames,filled:state.cells.every(c=>c.ch==='A'),count:state.cells.length,history:state.history.length-initialHistory,
          domCells:document.querySelectorAll('#canvasGrid .cell').length,stats:renderer.stats(),busy:document.querySelector('#workspace').hasAttribute('aria-busy')};
      });
      assert.equal(completed.result,true);assert.equal(completed.filled,true);assert.equal(completed.count,65536);
      assert.ok(completed.frames>0,'Animation frames run while the worker computes the field');
      assert.equal(completed.history,1,'The completed worker edit has one undo transaction');
      assert.equal(completed.domCells,0);assert.equal(completed.busy,false);
      assert.ok(completed.stats.maxFrameCells<=512);assert.ok(completed.stats.backingPixels<=16*1024*1024);
      await page.locator('#qUndo').click();assert.equal(await page.evaluate(()=>state.cells.every(c=>c.ch===' ')),true);
      await page.locator('#resizeBtn').click();await page.locator('#keepAspect').uncheck();
      await page.locator('#resizeW').fill('128');await page.locator('#resizeH').fill('256');
      const resizeCancelled=await page.evaluate(async()=>{
        const history=state.history.length,pending=applyResizeSkew();
        const modalClosed=!document.querySelector('#resizeDialog').open;
        const cancel=document.querySelector('#cancelJob'),r=cancel.getBoundingClientRect();
        const reachable=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===cancel;
        const focus=document.activeElement===cancel;
        // Dispatch through the real keyboard handler in the same task so a fast
        // worker cannot finish before the cancellation regression is exercised.
        cancel.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
        const result=await pending;
        return {result,modalClosed,reachable,focus,cols:state.cols,rows:state.rows,history:state.history.length-history,
          blank:state.cells.every(c=>c.ch===' ')};
      });
      assert.deepEqual(resizeCancelled,{result:false,modalClosed:true,reachable:true,focus:true,cols:256,rows:256,history:0,blank:true},'Resize exposes its Cancel button and Escape cancels before committing');
    });
    await scenario('mobile viewport supports touch secondary drawing and panning', async ({page,context})=>{
      const project={...fixture(),cols:80,rows:80,cells:Array.from({length:6400},()=>cell(' '))};
      project.cells[1]=cell('<');
      await importFile(page,'#openProjectInput',jsonPayload('touch.json',project));
      await assertMobileLayout(page,'Initial toolbar');
      const toggle=page.locator('#secondaryToggle');await toggle.tap();
      const button=await toggle.boundingBox();assert.ok(button.width>=44&&button.height>=44,'Touch control has a 44-pixel target');
      assert.equal(await toggle.getAttribute('aria-pressed'),'true');
      await page.locator('#glyphPalette [data-g="&"]').tap();
      assert.equal((await documentState(page)).glyphSecondary,'&','Touch palette selection targets the active secondary slot');
      assert.equal((await documentState(page)).glyphPrimary,'A');
      await assertMobileLayout(page,'Glyph palette');
      const first=await cellCentre(page,0,0);await page.touchscreen.tap(first.x,first.y);
      assert.equal((await documentState(page)).cells[0].ch,'&','A trusted touch tap paints the secondary glyph without a right mouse button');
      await page.locator('[data-tool="picker"]').tap();const pick=await cellCentre(page,1,0);await page.touchscreen.tap(pick.x,pick.y);
      assert.equal((await documentState(page)).glyphSecondary,'<','Touch glyph picker updates the active secondary slot');
      assert.equal((await documentState(page)).glyphPrimary,'A');
      await page.locator('[data-shape="line"]').tap();await assertMobileLayout(page,'Shapes');
      const shape=await cellCentre(page,2,1);await page.touchscreen.tap(shape.x,shape.y);
      assert.equal((await documentState(page)).cells[82].ch,'<','A shape uses the secondary slot selected through touch');
      await page.locator('#panToggle').tap();
      await assertMobileLayout(page,'Pan controls');
      const before=await documentState(page),box=await page.locator('#scroller').boundingBox();
      const start={x:box.x+box.width*.8,y:box.y+box.height*.8},end={x:box.x+box.width*.3,y:box.y+box.height*.3};
      if(browserName==='chromium'){
        // Chromium exposes native touch dragging through its browser protocol.
        const input=await context.newCDPSession(page);
        await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:0}]});
        await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:(start.x+end.x)/2,y:(start.y+end.y)/2,id:0}]});
        await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:0}]});
        await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await input.detach();
      }else{
        // Playwright exposes touch taps on these engines; pointer dragging checks
        // the same pan handlers without claiming a physical touch-device test.
        await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:4});await page.mouse.up();
      }
      await page.evaluate(()=>renderer.whenIdle());
      const scroll=await page.locator('#scroller').evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));
      assert.ok(scroll.x>0||scroll.y>0,'Pan mode scrolls the field');
      assert.deepEqual(await documentState(page),before,'Panning leaves artwork unchanged');
      assert.equal(await page.locator('#canvasGrid').evaluate(el=>getComputedStyle(el).touchAction),'none');
      await page.locator('#uiModeToggle').tap();
      await page.locator('.ribbonwrap').evaluate(el=>{el.scrollLeft=0;el.scrollTop=0});
      await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await renderer.whenIdle()});
      await assertMobileLayout(page,'Classic mobile toolbar');
      assert.equal(await page.locator('#app').evaluate(el=>el.classList.contains('classic')),true);
      await page.locator('#glyphPalette [data-g="&"]').tap();
      await assertMobileLayout(page,'Classic mobile palette');
      await page.locator('.transformgrid .xformbtn').first().scrollIntoViewIfNeeded();
      await assertMobileLayout(page,'Classic mobile transforms');
    },{viewport:{width:390,height:844},hasTouch:true,...(browserName==='firefox'?{}:{isMobile:true})});
    console.log(`${browserName}: ${completed} browser scenarios passed`);
  } finally { await browser.close(); }
}
(async()=>{
  for(const name of browserNames){
    await runBrowser(name);
    if(!smoke)await require('./renderer.browser.cjs').runRendererBrowser(name);
  }
})().catch(error=>{console.error(error);process.exitCode=1});
