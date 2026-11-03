'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

// Exercise exactly the renderer embedded in the shipped offline application.
const appPath = process.env.GLYPHPOINT_APP || path.join(__dirname, '..', 'GlyphPoint-RC.html');
const html = fs.readFileSync(appPath, 'utf8');
const source = html.match(/\/\* GP_RENDERER_BEGIN \*\/[\s\S]*?\/\* GP_RENDERER_END \*\//)?.[0];
assert.ok(source, 'Build the maintained HTML before running renderer tests.');
const sandbox = {module: {exports: {}}, Set, Map, Error, Promise};
vm.runInNewContext(source, sandbox, {filename: 'shipped-renderer.js'});
const rendererModule = sandbox.module.exports;
const plain = value => JSON.parse(JSON.stringify(value));

function fixture({cols = 512, rows = 128, width = 96, height = 64, dpr = 2, maxCellsPerFrame = 3, zoom = 1} = {}) {
  const callbacks = new Map();
  let serial = 0, maxObservedCells = 0;
  const drawings = [];
  function context() {
    return {
      fillStyle: '', strokeStyle: '', lineWidth: 1, fontKerning: 'auto',
      setTransform() {}, clearRect() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {},
      moveTo() {}, lineTo() {}, stroke() {}, strokeRect() {},
      fillRect() {},
      fillText(text) { drawings.push({text, fill: this.fillStyle}); },
      measureText(text) { return {width: text.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: text.length * 8, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3}; }
    };
  }
  const win = {
    devicePixelRatio: dpr,
    performance: {now: () => 0},
    requestAnimationFrame(callback) { const id = ++serial; callbacks.set(id, callback); return id; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    addEventListener() {}, removeEventListener() {},
    getComputedStyle() { return {paddingLeft: '0px', paddingTop: '0px'}; }
  };
  const doc = {defaultView: win};
  function surface() {
    const ctx = context();
    return {ownerDocument: doc, style: {}, width: 1, height: 1, getContext: () => ctx, setAttribute() {},
      getBoundingClientRect: () => ({left: 100, top: 200, width, height})};
  }
  const canvas = surface(), overlay = surface();
  const scroller = {style: {}, clientWidth: width, clientHeight: height, scrollLeft: 0, scrollTop: 0, addEventListener() {}, removeEventListener() {}};
  const spacer = {style: {}};
  const state = {cols, rows, zoom, square: true, grid: false, fieldBg: '#000000',
    glyphPalette: [{glyph: '#', colour: '#ffffff'}], cells: Array.from({length: cols * rows}, () => ({ch: '#'}))};
  const renderer = rendererModule.create({canvas, overlay, scroller, spacer, getState: () => state, maxCellsPerFrame});
  function frame() {
    const first = callbacks.entries().next();
    if (first.done) return false;
    const [id, callback] = first.value;
    callbacks.delete(id);
    callback();
    maxObservedCells = Math.max(maxObservedCells, renderer.stats().lastFrameCells);
    assert.ok(renderer.stats().lastFrameUnits <= maxCellsPerFrame, 'Each animation frame obeys its work bound');
    return true;
  }
  function drain() { let count = 0; while (frame()) assert.ok(++count < 10000, 'Renderer becomes idle'); }
  return {renderer, state, canvas, overlay, scroller, spacer, callbacks, drawings, frame, drain, maxObservedCells: () => maxObservedCells};
}

test('viewport bounds exclude offscreen cells and handle fractional zoom', () => {
  const view = {cols: 512, rows: 128, scaledCellWidth: 4, scaledCellHeight: 8, originX: -7, originY: -9, viewportWidth: 20, viewportHeight: 16};
  assert.deepEqual(plain(rendererModule.visibleRange(view)), {x0: 1, y0: 1, x1: 7, y1: 4, count: 18});
  assert.equal(rendererModule.visibleRange({...view, originX: 100}).count, 0);
  assert.equal(rendererModule.visibleRange({...view, originX: -4096}).count, 0);
  assert.equal(rendererModule.visibleRange({...view, viewportWidth: 0}).count, 0);
});

test('pointer mapping accounts for viewport, scroll origin, zoom, and explicit edge clamping', () => {
  const view = {cols: 80, rows: 60, scaledCellWidth: 16, scaledCellHeight: 32, originX: -34, originY: -19, viewportWidth: 320, viewportHeight: 240};
  const rect = {left: 100, top: 200};
  assert.deepEqual(plain(rendererModule.cellFromPoint(114, 213, rect, view)), {x: 3, y: 1, i: 83});
  assert.equal(rendererModule.cellFromPoint(99, 213, rect, view), null, 'A nearby toolbar is not canvas input');
  assert.equal(rendererModule.cellFromPoint(114, 213, rect, {...view, originX: 20}), null, 'Padding is not a cell');
  assert.deepEqual(plain(rendererModule.cellFromPoint(-500, 9999, rect, view, true)), {x: 0, y: 59, i: 4720});
  assert.equal(rendererModule.cellFromPoint(NaN, 213, rect, view, true), null);
});

test('cell colours override inherited palette and field without changing another copy of the glyph', () => {
  const settings = {palette: new Map([['A', '#112233']]), fieldBg: '#445566'};
  assert.deepEqual(plain(rendererModule.resolveStyle({ch: 'A', fg: '#ff0000', bg: '#0000ff', font: 'DejaVu Sans Mono', bold: true}, settings)),
    {ch: 'A', fg: '#ff0000', bg: '#0000ff', font: 'DejaVu Sans Mono', bold: true, italic: false, underline: false});
  const inherited = rendererModule.resolveStyle({ch: 'A', fg: 'url(https://example.invalid)', font: 'unsafe";url(x)'}, settings);
  assert.equal(inherited.fg, '#112233');
  assert.equal(inherited.bg, '#445566');
  assert.equal(inherited.font, 'DejaVu Sans Mono');
  assert.equal(rendererModule.resolveStyle({ch: '👨‍👩‍👧‍👦'}, settings).ch, '👨‍👩‍👧‍👦', 'One grapheme passes intact to Canvas2D');
});

test('a maximum-size document uses a viewport backing store and bounded incremental painting', async () => {
  const f = fixture();
  assert.equal(f.drawings.length, 0, 'Creation schedules painting instead of synchronously drawing the field');
  f.frame();
  assert.ok(f.renderer.stats().pendingCells > 0, 'The initial visible field is split across animation frames');
  f.drain();
  await f.renderer.whenIdle();
  assert.equal(f.renderer.stats().paintedCells, 24, 'Only six by four visible cells were painted');
  assert.equal(f.renderer.stats().visibleCells, 24);
  assert.equal(f.canvas.width * f.canvas.height, 96 * 64 * 4, 'DPR backing depends on viewport, not field extent');
  assert.ok(f.maxObservedCells() <= 3);
  assert.equal(f.spacer.style.width, '8192px');
  assert.equal(f.spacer.style.height, '2048px');
  f.renderer.destroy();
});

test('dirty cells coalesce, changes during a full repaint survive, and offscreen edits do not repaint the viewport', () => {
  const f = fixture();
  f.frame();
  f.state.cells[0].fg = '#ff0000';
  f.renderer.invalidateCell(0);
  f.renderer.invalidateCell(0);
  f.drain();
  assert.equal(f.renderer.stats().paintedCells, 25, 'The edited earlier cell is painted again after the full pass');
  assert.equal(f.drawings.at(-1).fill, '#ff0000');
  const painted = f.renderer.stats().paintedCells;
  f.renderer.invalidateCell(f.state.cells.length - 1);
  f.drain();
  assert.equal(f.renderer.stats().paintedCells, painted);
  f.renderer.invalidateCell(0);
  f.renderer.invalidateCell(0);
  f.drain();
  assert.equal(f.renderer.stats().paintedCells, painted + 1, 'Multiple updates to a cell coalesce');
  f.renderer.destroy();
});

test('scrolling and 800 percent zoom preserve bounded backing allocation and cell mapping', () => {
  const f = fixture({maxCellsPerFrame: 16});
  f.drain();
  f.state.zoom = 8;
  f.scroller.scrollLeft = 1280;
  f.scroller.scrollTop = 2560;
  f.renderer.setView();
  f.drain();
  assert.equal(f.renderer.metrics().scaledCellWidth, 128);
  assert.deepEqual(plain(f.renderer.hitTest(110, 210)), {x: 10, y: 20, i: 10250});
  assert.equal(f.renderer.stats().visibleCells, 1);
  assert.equal(f.canvas.width * f.canvas.height, 96 * 64 * 4);
  assert.equal(f.canvas.style.left, '1280px');
  assert.equal(f.canvas.style.top, '2560px');
  f.renderer.destroy();
});

test('overlay-only updates leave artwork pixels untouched and rectangle work follows its visible perimeter', () => {
  const f = fixture({cols: 100, rows: 100, width: 1600, height: 1600, maxCellsPerFrame: 512});
  f.drain();
  const before = f.renderer.stats();
  f.renderer.setOverlays({selection: {type: 'rect', x: 0, y: 0, w: 100, h: 100}, preview: new Set([1]), hover: [2], cursor: {x: 3, y: 0}});
  f.drain();
  const after = f.renderer.stats();
  assert.equal(after.paintedCells, before.paintedCells);
  assert.equal(after.frames - before.frames, 1, 'A 10,000-cell selection requires only 396 boundary cells plus overlays');
  f.renderer.destroy();
});

test('PNG allocation budgets accept the whole largest native field and reject unsafe scales before allocation', () => {
  assert.deepEqual(plain(rendererModule.exportDimensions(512, 128, 16, 16)), {width: 8192, height: 2048, scale: 1});
  assert.deepEqual(plain(rendererModule.exportDimensions(3, 2, 8.43, 16, 2)), {width: 51, height: 64, scale: 2});
  assert.throws(() => rendererModule.exportDimensions(256, 256, 16, 16, 2), /32 megapixel/);
  assert.throws(() => rendererModule.exportDimensions(512, 512, 16, 16), /32 megapixel/);
  assert.deepEqual(plain(rendererModule.exportDimensions(1024,1024,1,1)),{width:1024,height:1024,scale:1});
  assert.throws(() => rendererModule.exportDimensions(4096,257,1,1), /1,048,576/);
  assert.throws(() => rendererModule.exportDimensions(1, 1, NaN, 16), /finite/);
  assert.throws(() => rendererModule.exportDimensions(1, 1, 8, 16, Infinity), /finite/);
});

test('destroy cancels pending animation work and settles callers waiting for idle', async () => {
  const f = fixture();
  const idle = f.renderer.whenIdle();
  f.renderer.destroy();
  await idle;
  assert.equal(f.callbacks.size, 0);
  assert.equal(f.drawings.length, 0);
});
