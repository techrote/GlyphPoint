'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const playwright = require('playwright');

const appURL = pathToFileURL(path.resolve(process.env.GLYPHPOINT_APP || path.join(__dirname,'..','GlyphPoint-RC.html'))).href;
const browserNames = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium','firefox','webkit'];

async function runBrowser(browserName) {
  assert.ok(['chromium','firefox','webkit'].includes(browserName));
  const browser = await playwright[browserName].launch({headless:true,timeout:30000});
  const context = await browser.newContext();
  const requests = [], errors = [];
  await context.route(/^https?:/,route=>{requests.push(route.request().url());return route.abort();});
  const page = await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>void dialog.dismiss());
  let completed = 0;
  try {
    await page.goto(appURL);
    await page.waitForFunction(()=>typeof GPInterchange !== 'undefined');
    const parse = (html,options) => page.evaluate(({html,options})=>GPInterchange.parseHtml(html,options),{html,options});
    const reject = async (html,options,pattern) => {
      const message = await page.evaluate(({html,options})=>{try{GPInterchange.parseHtml(html,options);return null}catch(error){return error.message}},{html,options});
      assert.match(message || '',pattern);
    };
    const scenario = async (name,run) => {await run();completed++;console.log(`PASS ${browserName}: interchange — ${name}`);};

    await scenario('inherited document styles, CSS specificity and important declarations',async()=>{
      const result = await parse('<!doctype html><html style="color:red;background:#123456"><head><style>body{background:white} pre{color:navy}.a{color:red}.a{color:blue}#art > .a{color:lime!important}#art .b{color:gold!important}.b{color:purple!important}</style></head><body><pre id="art"><span class="a" style="color:pink">A</span><span class="b" style="color:cyan!important">A</span><span class="b">A</span>A</pre></body></html>');
      assert.equal(result.format,'glyphpoint-v3');
      assert.equal(result.fieldBg,'#ffffff');
      assert.deepEqual(result.cells.map(cell=>cell.fg),['#00ff00','#00ffff','#ffd700','#000080']);
      assert.deepEqual(result.cells.map(cell=>cell.ch),['A','A','A','A']);
      assert.deepEqual(result.warnings,[]);
    });

    await scenario('descendant selectors backtrack across nearer ancestors and keep their work budget',async()=>{
      const html = '<style>.a > .b .c{color:red}.a > .b > .c{font-weight:bold}</style><pre><span class="a"><span class="b"><span class="b"><span class="c">A</span></span></span></span><span class="a"><span class="b"><span class="c">B</span></span></span><span class="b"><span class="c">C</span></span></pre>';
      const result = await parse(html);
      const comparison = await context.newPage();
      await comparison.setContent(html);
      const expected = await comparison.locator('.c').evaluateAll(elements=>elements.map(element=>{const style=getComputedStyle(element);return {red:style.color==='rgb(255, 0, 0)',bold:Number(style.fontWeight)>=600}}));
      await comparison.close();
      assert.deepEqual(result.cells.map(cell=>({red:cell.fg==='#ff0000',bold:cell.bold})),expected);
      assert.deepEqual(expected,[{red:true,bold:false},{red:true,bold:true},{red:false,bold:false}]);
      assert.deepEqual(result.warnings,[]);
      await reject(html,{maxSelectorChecks:4},/matching/);
    });

    await scenario('per-cell backgrounds and CSS rgba/hsl/named colours',async()=>{
      const result = await parse('<pre style="background:white;color:rgba(255,0,0,.5)"><span>A</span><span style="background:black">A</span><span style="background:hsl(240 100% 50%);color:rgba(0,255,0,.5)">A</span><span style="background:rgba(0,0,255,.5);color:rebeccapurple">A</span></pre>');
      assert.equal(result.fieldBg,'#ffffff');
      assert.deepEqual(result.cells.map(cell=>cell.fg),['#ff8080','#800000','#008080','#663399']);
      assert.deepEqual(result.cells.map(cell=>cell.bg),['','#000000','#0000ff','#8080ff']);
      assert.equal(result.glyphPalette.filter(entry=>entry.glyph==='A').length,1,'Palette defaults do not collapse cell colours');
      const colours = await page.evaluate(()=>['rgb(100% 0% 0%)','hsl(120,100%,50%)','rgba(255,0,0,0.5)','transparent','not-a-colour'].map(value=>GPInterchange.normaliseColour(value,'#ffffff')));
      assert.deepEqual(colours,['#ff0000','#00ff00','#ff8080','#ffffff',null]);
    });

    await scenario('allowed fonts and inherited bold/italic/underline semantics',async()=>{
      const result = await parse('<style>b{font-weight:normal}.style{font-family:"Missing Font","Courier New",monospace;font-weight:700;font-style:oblique;text-decoration:underline}</style><pre><b>A</b><span class="style">B<span style="font-weight:normal;font-style:normal;text-decoration:none">C</span></span><u style="text-decoration:none">D</u></pre>');
      assert.equal(result.cells[0].bold,false,'Author CSS overrides the semantic bold default');
      assert.deepEqual(result.cells.slice(1,3).map(({font,bold,italic,underline})=>({font,bold,italic,underline})),[
        {font:'Courier New',bold:true,italic:true,underline:true},
        {font:'Courier New',bold:false,italic:false,underline:true},
      ]);
      assert.equal(result.cells[3].underline,false);
      const unsupported = await parse('<pre style="font-family:DefinitelyMissing">X</pre>');
      assert.match(unsupported.importWarning,/Unavailable font/);
    });

    await scenario('graphemes span text nodes, tabs use cell columns and rows are padded',async()=>{
      const result = await parse('<pre>e<span>́</span>\t👨‍👩‍👧‍👦\n🇯🇵<br>A</pre>');
      assert.equal(result.cols,5);assert.equal(result.rows,3);
      assert.deepEqual(result.cells.map(cell=>cell.ch),['é',' ',' ',' ','👨‍👩‍👧‍👦','🇯🇵',' ',' ',' ',' ','A',' ',' ',' ',' ']);
      assert.deepEqual(result.warnings,[]);
      const conflicting = await parse('<pre style="color:red">e<span style="color:blue">́</span></pre>');
      assert.equal(conflicting.cols,1);assert.equal(conflicting.cells[0].ch,'é');assert.equal(conflicting.cells[0].fg,'#ff0000');
      assert.match(conflicting.importWarning,/differently styled/);
      await reject('<pre>a'+'́'.repeat(32)+'</pre>',{},/32 code points/);
    });

    await scenario('hidden content, explicit line breaks and block rows',async()=>{
      const result = await parse('<pre><div>A<span hidden>X</span><span style="display:none">Y</span><span style="visibility:hidden">Z</span></div><div>B<br>C</div></pre>');
      assert.equal(result.cols,2);assert.equal(result.rows,3);
      assert.deepEqual(result.cells.map(cell=>cell.ch),['A',' ','B',' ','C',' ']);
      await reject('<body hidden><pre>A</pre></body>',{},/empty/);
      await reject('<pre style="display:none">A</pre>',{},/empty/);
    });

    await scenario('scripts, resource URLs, event handlers and external CSS remain inert',async()=>{
      const count = await page.evaluate(()=>document.querySelectorAll('*').length);
      const result = await parse('<html><head><base href="https://interchange.invalid/"><link rel="stylesheet" href="remote.css"><style>@import "https://interchange.invalid/other.css";@font-face{font-family:x;src:url(https://interchange.invalid/font.woff2)}.a{color:red;background-image:url(https://interchange.invalid/bg.png)}</style></head><body onload="window.__interchangeExecuted=true"><pre><span class="a" onclick="window.__interchangeExecuted=true">A</span><script>window.__interchangeExecuted=true</script><img src="https://interchange.invalid/image.png" onerror="window.__interchangeExecuted=true"><iframe src="https://interchange.invalid/frame"></iframe><object data="https://interchange.invalid/object"></object><svg><image href="https://interchange.invalid/svg.png"/></svg><math><mtext>ignored</mtext></math></pre></body></html>');
      assert.equal(result.cols,1);assert.equal(result.cells[0].ch,'A');assert.equal(result.cells[0].fg,'#ff0000');
      assert.match(result.importWarning,/External stylesheets/);assert.match(result.importWarning,/@import/);assert.match(result.importWarning,/resource URLs/);
      assert.equal(await page.evaluate(()=>window.__interchangeExecuted),undefined);
      assert.equal(await page.evaluate(()=>document.querySelectorAll('*').length),count,'No imported nodes entered the application DOM');
      assert.deepEqual(requests,[]);
    });

    await scenario('container preservation leaves comments and raw-text content untouched',async()=>{
      const result = await parse('<!-- <body style="color:blue"> --><html style="color:red"><head><script>const html="<body style=\"color:green\">";</script></head><body><pre><textarea><body></textarea>&lt;html&gt;</pre></body></html>');
      assert.equal(result.cells.map(cell=>cell.ch).join(''),'<body><html>');
      assert.ok(result.cells.every(cell=>cell.fg==='#ff0000'));
    });

    await scenario('unsupported selectors, layout and at-rules report precise warnings',async()=>{
      const result = await parse('<style>span:hover{color:red}@media screen{pre{color:blue}}.a{font-size:40px;transform:rotate(20deg)}</style><pre><span class="a">A</span></pre>');
      assert.equal(result.cells[0].fg,'#ffffff');
      assert.match(result.importWarning,/Unsupported CSS selectors/);assert.match(result.importWarning,/at-rules/);assert.match(result.importWarning,/font-size/);assert.match(result.importWarning,/transform/);
    });

    await scenario('bounded HTML dimensions, palette, nodes, depth and source bytes',async()=>{
      await reject('<pre>ABCD</pre>',{maxDimension:3},/columns/);
      await reject('<pre>A\nB\nC\nD</pre>',{maxDimension:3},/rows/);
      await reject('<pre>AB\nCD</pre>',{maxCells:3},/cells/);
      await reject('<pre>AB</pre>',{maxPalette:2},/glyphs/);
      await reject('<pre><span>A</span><span>B</span><span>C</span></pre>',{maxNodes:9},/nodes/);
      await reject('<pre>'+'<i>'.repeat(20)+'A'+'</i>'.repeat(20)+'</pre>',{maxDepth:10},/nesting/);
      await reject('<pre>ABCDEFGHIJ</pre>',{maxFileBytes:10},/file-size/);
      await reject('<div>No artwork</div>',{},/No <pre>/);
    });

    await scenario('bounded CSS rules, selectors, declarations and matching work',async()=>{
      await reject('<style>.a{color:red}.b{color:blue}</style><pre>A</pre>',{maxRules:1},/CSS rules/);
      await reject('<style>@media all{.a{color:red}.b{color:blue}}</style><pre>A</pre>',{maxRules:2},/CSS rules/);
      await reject('<style>.a,.b{color:red}</style><pre>A</pre>',{maxSelectors:1},/selectors/);
      await reject('<pre style="color:red;font-weight:bold;font-style:italic">A</pre>',{maxDeclarations:2},/declarations/);
      await reject('<style>.a{color:red}</style><pre><span class="a">A</span><span class="a">B</span></pre>',{maxSelectorChecks:1},/matching/);
      await reject('<style>pre{color:rebeccapurple}</style><pre>A</pre>',{maxStyleChars:10},/styles/);
    });

    await scenario('ordinary CSS imports agree with browser-computed foreground and styles',async()=>{
      const html = '<style>#comparison .paint{color:red}.paint{color:blue!important}#comparison>span.paint{color:green!important}.paint{font-style:italic;font-weight:bold;text-decoration:underline}</style><pre id="comparison"><span class="paint">A</span><b style="color:rebeccapurple;font-weight:normal">B</b></pre>';
      const result = await parse(html);
      const comparison = await context.newPage();
      await comparison.setContent(html);
      const actual = await comparison.locator('#comparison > *').evaluateAll(elements=>elements.map(element=>{const style=getComputedStyle(element);const channels=style.color.match(/[\d.]+/g).slice(0,3).map(Number);return{fg:'#'+channels.map(value=>value.toString(16).padStart(2,'0')).join(''),bold:Number(style.fontWeight)>=600,italic:style.fontStyle!=='normal',underline:style.textDecorationLine.includes('underline')}}));
      await comparison.close();
      assert.deepEqual(result.cells.map(({fg,bold,italic,underline})=>({fg,bold,italic,underline})),actual);
    });

    await scenario('the full cell budget imports without a DOM-cell rendering dependency',async()=>{
      const row = '<span class="a">A</span>'.repeat(256);
      const result = await parse('<style>.a{color:#123456}</style><pre>'+Array(256).fill(row).join('\n')+'</pre>');
      assert.equal(result.cols,256);assert.equal(result.rows,256);assert.equal(result.cells.length,65536);
      assert.equal(result.cells.at(-1).fg,'#123456');assert.deepEqual(result.warnings,[]);
    });

    await scenario('pasting a new glyph refreshes palette controls, usage and saved preferences',async()=>{
      const result = await page.evaluate(async()=>{
        newDocument(3,3,false);state.history.length=0;
        state.clipboard={w:1,h:1,map:[['0,0',{...makeCell('Ж'),fg:'#ff0000',bg:'#123456'}]]};
        await pasteSelection();
        return {cols:state.cols,rows:state.rows,cell:{...state.cells[0]},history:state.history.length,
          palette:state.glyphPalette.map(entry=>entry.glyph),
          preferences:JSON.parse(localStorage.getItem('glyphpoint.palette.v3')).palette.map(entry=>entry.glyph),
          buttons:Array.from(document.querySelectorAll('#glyphPalette [data-g]'),button=>button.dataset.g),
          usage:getGlyphManagerRows().find(({entry})=>entry.glyph==='Ж')?.usage};
      });
      assert.deepEqual([result.cols,result.rows],[3,3],'The regression exercises paste without a field rebuild');
      assert.equal(result.cell.ch,'Ж');assert.equal(result.cell.fg,'#ff0000');assert.equal(result.cell.bg,'#123456');
      assert.equal(result.history,1,'Paste remains one undo transaction');
      assert.deepEqual(result.buttons,result.palette);
      assert.deepEqual(result.preferences,result.palette);
      assert.equal(result.usage,1);
      await page.locator('#glyphPalette [data-g="Ж"]').click();
      assert.equal(await page.evaluate(()=>state.glyphPrimary),'Ж','The new glyph is immediately selectable');
      await page.evaluate(()=>undo());
      assert.equal(await page.locator('#glyphPalette [data-g="Ж"]').count(),0,'Undo restores the earlier palette controls');
      await page.evaluate(()=>redo());
      assert.equal(await page.locator('#glyphPalette [data-g="Ж"]').count(),1);
    });

    assert.deepEqual(errors,[],'No unhandled browser exceptions');
    assert.deepEqual(requests,[],'Imports did not fetch any external resources');
    console.log(`${browserName}: ${completed} interchange scenarios passed`);
  } finally { await context.close();await browser.close(); }
}

(async()=>{for(const browserName of browserNames)await runBrowser(browserName)})().catch(error=>{console.error(error);process.exitCode=1;});
