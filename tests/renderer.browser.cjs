'use strict';

// Canvas component regressions use the renderer and fonts from the shipped HTML.
// Usage: node tests/renderer.browser.cjs chromium [firefox]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require('playwright');

const appPath = process.env.GLYPHPOINT_APP || path.join(__dirname, '..', 'GlyphPoint-v1a-layout-fixed.html');
const html = fs.readFileSync(appPath, 'utf8');
const rendererSource = html.match(/\/\* GP_RENDERER_BEGIN \*\/[\s\S]*?\/\* GP_RENDERER_END \*\//)?.[0];
assert.ok(rendererSource, 'Build the maintained HTML before running renderer browser tests.');
const fontCSS = [...html.matchAll(/@font-face\s*\{[^}]*\}/g)].map(match => match[0]).join('\n');

async function runRendererBrowser(browserName) {
  assert.ok(['chromium', 'firefox', 'webkit'].includes(browserName));
  const browser = await playwright[browserName].launch({headless: true, timeout: 30000});
  let passed = 0;
  async function scenario(name, run, deviceScaleFactor = 1) {
    const context = await browser.newContext({viewport: {width: 700, height: 500}, deviceScaleFactor});
    const page = await context.newPage(), errors = [], network = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route(/^https?:/, route => { network.push(route.request().url()); return route.abort(); });
    try {
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>${fontCSS}
        body{margin:0}#scroll{position:relative;overflow:auto;box-sizing:border-box;width:340px;height:260px;padding:14px;margin:20px}
      </style><div id="scroll"><div id="spacer"><canvas id="art"></canvas><canvas id="overlay"></canvas></div></div>`);
      await page.addScriptTag({content: rendererSource});
      await page.evaluate(async () => {
        const cells = Array.from({length: 65536}, () => ({ch: 'A', font: 'DejaVu Sans Mono'}));
        window.testState = {cols: 512, rows: 128, cells, zoom: 8, square: true, grid: false, fieldBg: '#010203', glyphPalette: [{glyph: 'A', colour: '#ffffff'}]};
        window.testRenderer = GPRenderer.create({canvas: document.querySelector('#art'), overlay: document.querySelector('#overlay'),
          scroller: document.querySelector('#scroll'), spacer: document.querySelector('#spacer'), getState: () => testState});
        await document.fonts.ready;
        await testRenderer.whenIdle();
      });
      await run(page);
      assert.deepEqual(errors, [], 'No uncaught Canvas2D errors');
      assert.deepEqual(network, [], 'Rendering and embedded fonts stay offline');
      passed++;
      console.log(`PASS ${browserName}: ${name}`);
    } finally { await context.close(); }
  }
  try {
    await scenario('viewport canvas remains bounded at maximum field size and zoom while scrolling', async page => {
      const result = await page.evaluate(async () => {
        const scroller = document.querySelector('#scroll'), canvas = document.querySelector('#art');
        const initialScrollWidth = scroller.scrollWidth, initialScrollHeight = scroller.scrollHeight;
        for (let i = 0; i < 20; i++) { scroller.scrollLeft += 500; scroller.scrollTop += 180; testRenderer.resize(); await testRenderer.whenIdle(); }
        const m = testRenderer.metrics(), rect = canvas.getBoundingClientRect();
        const x = Math.ceil(-m.originX / m.scaledCellWidth), y = Math.ceil(-m.originY / m.scaledCellHeight);
        const clientX = rect.left + m.originX + (x + .5) * m.scaledCellWidth;
        const clientY = rect.top + m.originY + (y + .5) * m.scaledCellHeight;
        return {m, stats: testRenderer.stats(), width: canvas.width, height: canvas.height, count: document.querySelector('#spacer').children.length,
          initialScrollWidth, initialScrollHeight, finalScrollWidth: scroller.scrollWidth, finalScrollHeight: scroller.scrollHeight,
          hit: testRenderer.hitTest(clientX, clientY), expected: {x, y, i: y * testState.cols + x},
          canvasLeft: rect.left, viewportLeft: scroller.getBoundingClientRect().left + scroller.clientLeft};
      });
      assert.equal(result.count, 2, 'The grid has two canvases regardless of cell count');
      assert.equal(result.finalScrollWidth, result.initialScrollWidth, 'The viewport canvas does not extend the horizontal scroll area');
      assert.equal(result.finalScrollHeight, result.initialScrollHeight, 'The viewport canvas does not extend the vertical scroll area');
      assert.ok(Math.abs(result.canvasLeft - result.viewportLeft) < 1);
      assert.equal(result.width, Math.ceil(result.m.viewportWidth * result.m.dpr));
      assert.equal(result.height, Math.ceil(result.m.viewportHeight * result.m.dpr));
      assert.ok(result.stats.backingPixels < 1_000_000);
      assert.ok(result.stats.visibleCells < 30);
      assert.ok(result.stats.maxFrameCells <= 512);
      assert.deepEqual(result.hit, result.expected);
    }, 2);

    await scenario('per-cell colours, full graphemes, and raster export match the visible artwork without overlays', async page => {
      const result = await page.evaluate(async () => {
        const base = {font: 'DejaVu Sans Mono', bold: false, italic: false, underline: false};
        testState = {...testState, cols: 3, rows: 2, zoom: 1, square: true, glyphPalette: [{glyph: 'A', colour: '#112233'}],
          cells: [{...base, ch: 'A', fg: '#ff0000', bg: '#0000ff'}, {...base, ch: 'A', fg: '#00ff00'}, {...base, ch: '👨‍👩‍👧‍👦', bg: '#121314'},
            {...base, ch: 'Á', bold: true, italic: true, underline: true}, {...base, ch: '漢'}, {...base, ch: ' ', bg: '#445566'}]};
        // For pixel-exact parity, viewport and export must rasterize at the same
        // integer canvas origin. WebKit's glyph antialiasing depends on the
        // absolute device position; padding/scroll geometry is tested separately.
        const scroll = document.querySelector('#scroll');
        scroll.style.padding = '0'; scroll.scrollLeft = 0; scroll.scrollTop = 0;
        const canvas = document.querySelector('#art'), ctx = canvas.getContext('2d'), drawn = [];
        const realFillText = ctx.fillText.bind(ctx);
        ctx.fillText = (text, ...args) => { drawn.push(text); return realFillText(text, ...args); };
        testRenderer.setView();
        testRenderer.setOverlays({selection: {type: 'rect', x: 0, y: 0, w: 3, h: 2}, preview: new Set([0, 1]), hover: [2], cursor: {x: 1, y: 1}});
        await testRenderer.whenIdle();
        // The first newly used bold/italic cell can request another embedded face.
        await document.fonts.ready;
        await testRenderer.whenIdle();
        const m = testRenderer.metrics(), width = m.cols * m.cellWidth, height = m.rows * m.cellHeight;
        if (m.originX !== 0 || m.originY !== 0) throw Error(`Pixel parity requires origin (0,0), received (${m.originX},${m.originY})`);
        const art = ctx.getImageData(0, 0, width, height).data;
        // Separate export painting from PNG serialization and decoded-image colour handling.
        const originalToBlob = HTMLCanvasElement.prototype.toBlob;
        let beforeEncoding = null, blob;
        HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
          if (this !== canvas && this.width === width && this.height === height) {
            beforeEncoding = this.getContext('2d').getImageData(0, 0, width, height).data.slice();
          }
          return originalToBlob.call(this, callback, type, quality);
        };
        try { blob = await testRenderer.exportPNG(); }
        finally { HTMLCanvasElement.prototype.toBlob = originalToBlob; }
        const bitmap = await createImageBitmap(blob, {colorSpaceConversion: 'none', premultiplyAlpha: 'none'});
        const output = document.createElement('canvas'); output.width = bitmap.width; output.height = bitmap.height;
        const out = output.getContext('2d'); out.drawImage(bitmap, 0, 0); bitmap.close();
        const exported = out.getImageData(0, 0, output.width, output.height).data;
        const bg = (x, y) => Array.from(out.getImageData(x, y, 1, 1).data);
        let mismatchedPixels = 0, maxChannelDelta = 0, channelsOverTwo = 0, red = 0, green = 0, blankContamination = 0;
        let paintMismatch = 0, roundtripMismatch = 0, maxPaintDelta = 0, maxRoundtripDelta = 0;
        const samples = [], byCell = Array.from({length: 6}, () => 0);
        for (let i = 0; i < art.length; i++) {
          if (beforeEncoding && art[i] !== beforeEncoding[i]) {
            paintMismatch++;
            maxPaintDelta = Math.max(maxPaintDelta, Math.abs(art[i] - beforeEncoding[i]));
          }
          if (beforeEncoding && beforeEncoding[i] !== exported[i]) {
            roundtripMismatch++;
            maxRoundtripDelta = Math.max(maxRoundtripDelta, Math.abs(beforeEncoding[i] - exported[i]));
          }
          if (art[i] !== exported[i]) {
            mismatchedPixels++;
            const delta = Math.abs(art[i] - exported[i]);
            maxChannelDelta = Math.max(maxChannelDelta, delta);
            if (delta > 2) channelsOverTwo++;
            const pixel = Math.floor(i / 4), x = pixel % width, y = Math.floor(pixel / width);
            byCell[Math.floor(y / 16) * 3 + Math.floor(x / 16)]++;
            if (samples.length < 8) samples.push({x,y,channel: i % 4, viewport: art[i], preencoded: beforeEncoding?.[i], png: exported[i]});
          }
        }
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const p = bg(x, y), q = bg(x + 16, y);
          if (p[0] > 200 && p[1] < 10 && p[2] < 10) red++;
          if (q[0] < 10 && q[1] > 200 && q[2] < 10) green++;
          const b = bg(x + 32, y + 16); if (b[0] !== 68 || b[1] !== 85 || b[2] !== 102 || b[3] !== 255) blankContamination++;
        }
        return {type: blob.type, width: output.width, height: output.height, mismatchedPixels, maxChannelDelta, channelsOverTwo, samples,
          captured: Boolean(beforeEncoding), paintMismatch, roundtripMismatch, maxPaintDelta, maxRoundtripDelta, byCell,
          red, green, blankContamination, backgrounds: [bg(0, 0), bg(16, 0), bg(32, 0)], drawn};
      });
      assert.equal(result.type, 'image/png');
      assert.deepEqual([result.width, result.height], [48, 32]);
      assert.equal(result.captured, true, 'PNG encoding receives a complete export canvas');
      assert.equal(result.mismatchedPixels, 0, `PNG viewport/paint/codec comparison (${JSON.stringify({paintMismatch: result.paintMismatch, roundtripMismatch: result.roundtripMismatch, maxPaintDelta: result.maxPaintDelta, maxRoundtripDelta: result.maxRoundtripDelta, maxChannelDelta: result.maxChannelDelta, channelsOverTwo: result.channelsOverTwo, byCell: result.byCell, samples: result.samples})})`);
      assert.deepEqual(result.backgrounds, [[0, 0, 255, 255], [1, 2, 3, 255], [18, 19, 20, 255]]);
      assert.ok(result.red > 0 && result.green > 0, 'The same glyph supports independent foreground colours');
      assert.equal(result.blankContamination, 0, 'Wide glyphs and italics cannot paint a neighbouring cell');
      assert.ok(result.drawn.includes('👨‍👩‍👧‍👦') && result.drawn.includes('Á'), 'Canvas receives complete graphemes');
    });

    await scenario('keyboard cursor scrolling reaches the last cell and PNG rejects excessive allocations', async page => {
      const result = await page.evaluate(async () => {
        testRenderer.ensureCellVisible(testState.cols - 1, testState.rows - 1);
        await testRenderer.whenIdle();
        const m = testRenderer.metrics();
        const lastX = m.originX + (testState.cols - .5) * m.scaledCellWidth;
        const lastY = m.originY + (testState.rows - .5) * m.scaledCellHeight;
        const r = document.querySelector('#art').getBoundingClientRect();
        let rejected = '';
        try { await testRenderer.exportPNG({scale: 8}); } catch (error) { rejected = error.message; }
        return {lastX, lastY, viewportWidth: m.viewportWidth, viewportHeight: m.viewportHeight,
          hit: testRenderer.hitTest(r.left + lastX, r.top + lastY), rejected};
      });
      assert.ok(result.lastX >= 0 && result.lastX < result.viewportWidth);
      assert.ok(result.lastY >= 0 && result.lastY < result.viewportHeight);
      assert.deepEqual(result.hit, {x: 511, y: 127, i: 65535});
      assert.match(result.rejected, /32 megapixel|16,384/);
    });

    await scenario('asynchronous PNG captures one revision while the document keeps changing', async page => {
      const result = await page.evaluate(async () => {
        testState = {...testState, cols: 2, rows: 2, zoom: 1, square: true,
          cells: Array.from({length: 4}, () => ({ch: ' ', bg: '#123456', font: 'DejaVu Sans Mono'}))};
        testRenderer.setView(); await testRenderer.whenIdle();
        const pending = testRenderer.exportPNG();
        // The export yields while font faces load; edits must affect only the
        // live document, including changes to cell records and field geometry.
        testState.cells[0].bg = '#abcdef';
        testState.cols = 1; testState.rows = 4; testState.square = false;
        testRenderer.setView();
        const blob = await pending, bitmap = await createImageBitmap(blob);
        const output = document.createElement('canvas'); output.width = bitmap.width; output.height = bitmap.height;
        const ctx = output.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
        const controller = new AbortController(); controller.abort();
        let cancelled = '';
        try { await testRenderer.exportPNG({signal: controller.signal}); } catch (error) { cancelled = error.message; }
        return {width: output.width, height: output.height, pixel: Array.from(ctx.getImageData(0,0,1,1).data), live: testState.cells[0].bg, cancelled};
      });
      assert.deepEqual([result.width, result.height], [32, 32]);
      assert.deepEqual(result.pixel, [18, 52, 86, 255], 'Export retains the original cell colour');
      assert.equal(result.live, '#abcdef', 'Editing continues without being rolled back by export');
      assert.match(result.cancelled, /cancelled/);
    });
  } finally { await browser.close(); }
  return passed;
}

if (require.main === module) {
  (async () => {
    for (const browserName of process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox']) {
      const passed = await runRendererBrowser(browserName);
      console.log(`${browserName}: ${passed} renderer scenarios passed`);
    }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = {runRendererBrowser};
