'use strict';

// Real-browser regression tests for the shipped, standalone HTML editor.
// Usage: node tests/browser.cjs [chromium|firefox ...]
// Requires: npm ci && npx playwright install chromium firefox
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const playwright = require('playwright');

const appPath = path.resolve(process.env.GLYPHPOINT_APP || path.join(__dirname, '..', 'GlyphPoint-v1a-layout-fixed.html'));
const appURL = pathToFileURL(appPath).href;
const requestedBrowsers = process.argv.slice(2);
const browserNames = requestedBrowsers.length ? requestedBrowsers : ['chromium', 'firefox'];
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
}
async function download(page, action) {
  await page.locator('#fileBtn').click();
  const pending = page.waitForEvent('download');
  await page.locator(`#fileMenu [data-file="${action}"]`).click();
  const result = await pending;
  assert.equal(await result.failure(), null, 'Browser accepted the download');
  return fs.readFile(await result.path(), 'utf8');
}
async function save(page) { return JSON.parse(await download(page, 'saveProject')); }
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
  assert.ok(['chromium','firefox'].includes(browserName), `Unsupported test browser: ${browserName}`);
  const browser = await playwright[browserName].launch({headless:true,timeout:30000});
  let completed = 0;
  async function scenario(name, run) {
    const context = await browser.newContext({acceptDownloads:true, viewport:{width:1440,height:1000}});
    const page = await context.newPage();
    const errors = [], dialogs = [], externalRequests = [];
    page.on('pageerror', error=>errors.push(error.message));
    page.on('dialog', dialog=>{dialogs.push({type:dialog.type(),message:dialog.message()});void dialog.accept();});
    await context.route(/^https?:/, route=>{externalRequests.push(route.request().url());return route.abort();});
    try {
      await page.goto(appURL);
      await page.waitForSelector('#canvasGrid .cell');
      await run({page,context,errors,dialogs,externalRequests});
      assert.deepEqual(errors, [], 'No uncaught JavaScript errors');
      assert.deepEqual(externalRequests, [], 'Standalone editor/import did not request external resources');
      completed++;
      console.log(`PASS ${browserName}: ${name}`);
    } catch(error) { console.error('Browser diagnostics:', {name, errors, dialogs, externalRequests}); throw error; } finally { await context.close(); }
  }
  try {
    await scenario('startup and both UI layouts', async ({page})=>{
      assert.equal(await page.locator('#canvasGrid .cell').count(), 6400);
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
      assert.equal(await page.locator('#canvasGrid .cell').count(), 8);
      assert.equal(await page.locator('#fieldBgInput').inputValue(), '#102030');
      assert.equal(await page.locator('#squareToggle').getAttribute('aria-pressed'), 'true');
      const styled = page.locator('#canvasGrid .cell').nth(1);
      assert.equal(await styled.evaluate(el=>getComputedStyle(el).fontStyle), 'italic');
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
      assert.equal(await page.locator('#canvasGrid .cell').first().textContent(),'Q');
      await page.locator('#gcmRevert').click();
      assert.equal(await page.locator('#canvasGrid .cell').first().textContent(),'A');
      await page.locator('#gcmClose').click();
      assert.deepEqual(projectValues(await save(page)),projectValues(original));
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
      const centre=async(x,y)=>{
        const box=await page.locator('#canvasGrid .cell').nth(y*8+x).boundingBox();
        assert.ok(box,'Target cell is laid out');
        return {x:box.x+box.width/2,y:box.y+box.height/2};
      };
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
      assert.equal(await page.locator('#canvasGrid .cell').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(16, 32, 48)');
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

      await page.locator('[data-tool="text"]').click();await page.locator('#canvasGrid .cell').first().click();
      await page.locator('#textValue').fill('Z Q');await page.locator('#textBg').selectOption('transparent');
      await page.locator('#applyText').click();
      assert.equal(await page.locator('#textDialog').evaluate(el=>el.open),false);
      const textResult=await documentState(page);
      assert.equal(textResult.cells.slice(0,4).map(c=>c.ch).join(''),'ZAQ<');
      assert.deepEqual(textResult.cells[1],original.cells[1],'A transparent space preserves the existing glyph and every cell style');
      await page.locator('#qUndo').click();
      assert.deepEqual(await documentState(page),projectValues(original),'Text placement is one reversible action');
    });
    console.log(`${browserName}: ${completed} browser scenarios passed`);
  } finally { await browser.close(); }
}
(async()=>{for(const name of browserNames)await runBrowser(name)})().catch(error=>{console.error(error);process.exitCode=1});
