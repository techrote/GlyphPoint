/* GP_RENDERER_BEGIN */
/* Viewport-sized Canvas2D artwork and overlays. No DOM is created per cell. */
const GPRenderer = (() => {
  'use strict';

  const DEFAULT_FONTS = ['DejaVu Sans Mono', 'Cascadia Mono', 'Cascadia Code', 'Consolas', 'Courier New', 'monospace'];
  const MAX_VIEWPORT_PIXELS = 16 * 1024 * 1024;
  const MAX_EXPORT_PIXELS = 32 * 1024 * 1024;
  const MAX_EXPORT_SIDE = 16384;
  const DEFAULT_FONT_SIZE = 14;
  const DEFAULT_CELL_HEIGHT = 16;
  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
  const number = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const colour = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

  function visibleRange({cols, rows, scaledCellWidth, scaledCellHeight, originX, originY, viewportWidth, viewportHeight}) {
    if (!(cols > 0 && rows > 0 && scaledCellWidth > 0 && scaledCellHeight > 0 && viewportWidth > 0 && viewportHeight > 0)) {
      return {x0: 0, y0: 0, x1: 0, y1: 0, count: 0};
    }
    const x0 = clamp(Math.floor(-originX / scaledCellWidth), 0, cols);
    const y0 = clamp(Math.floor(-originY / scaledCellHeight), 0, rows);
    const x1 = clamp(Math.ceil((viewportWidth - originX) / scaledCellWidth), x0, cols);
    const y1 = clamp(Math.ceil((viewportHeight - originY) / scaledCellHeight), y0, rows);
    return {x0, y0, x1, y1, count: (x1 - x0) * (y1 - y0)};
  }

  function cellFromPoint(clientX, clientY, bounds, view, shouldClamp = false) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || !view || !(view.cols > 0 && view.rows > 0)) return null;
    const px = clientX - bounds.left, py = clientY - bounds.top;
    if (!shouldClamp && (px < 0 || py < 0 || px >= view.viewportWidth || py >= view.viewportHeight)) return null;
    let x = Math.floor((px - view.originX) / view.scaledCellWidth);
    let y = Math.floor((py - view.originY) / view.scaledCellHeight);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (shouldClamp) { x = clamp(x, 0, view.cols - 1); y = clamp(y, 0, view.rows - 1); }
    if (x < 0 || y < 0 || x >= view.cols || y >= view.rows) return null;
    return {x, y, i: y * view.cols + x};
  }

  function resolveStyle(cell, {palette, fieldBg, safeFonts = DEFAULT_FONTS, getGlyphColour} = {}) {
    const ch = typeof cell?.ch === 'string' ? cell.ch : ' ';
    let inherited = palette?.get(ch);
    if (inherited === undefined && typeof getGlyphColour === 'function') inherited = getGlyphColour(ch);
    return {
      ch,
      fg: colour(cell?.fg, colour(inherited, '#ffffff')),
      bg: colour(cell?.bg, colour(fieldBg, '#000000')),
      font: safeFonts.includes(cell?.font) ? cell.font : safeFonts[0] || 'monospace',
      bold: cell?.bold === true,
      italic: cell?.italic === true,
      underline: cell?.underline === true
    };
  }

  function exportDimensions(cols, rows, cellWidth, cellHeight, scale = 1) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols > 4096 || rows > 4096 || cols * rows > 1048576) {
      throw Error('PNG export requires a field within 4,096 cells per axis and 1,048,576 cells overall.');
    }
    if (!Number.isFinite(scale) || scale <= 0 || scale > 8 || !Number.isFinite(cellWidth) || !Number.isFinite(cellHeight) || cellWidth <= 0 || cellHeight <= 0) {
      throw Error('PNG export requires finite cell dimensions and a scale between 0 and 8.');
    }
    const width = Math.ceil(cols * cellWidth * scale), height = Math.ceil(rows * cellHeight * scale);
    if (width > MAX_EXPORT_SIDE || height > MAX_EXPORT_SIDE || width * height > MAX_EXPORT_PIXELS) {
      throw Error('This PNG would exceed the 32 megapixel or 16,384 pixel side limit. Use a smaller export scale.');
    }
    return {width, height, scale};
  }

  function paletteMap(state) {
    const result = new Map();
    for (const entry of state.glyphPalette || []) if (entry && typeof entry.glyph === 'string') result.set(entry.glyph, entry.colour);
    return result;
  }

  function fontCSS(style, fontSize) {
    const family = style.font === 'monospace' ? 'monospace' : '"' + style.font + '",monospace';
    return `${style.italic ? 'italic' : 'normal'} ${style.bold ? '700' : '400'} ${fontSize}px ${family}`;
  }

  // Cache only measured shapes, never palette colours or cell backgrounds.
  function glyphGeometry(context, style, fontSize, cellWidth, cellHeight, cache) {
    const font = fontCSS(style, fontSize), key = font + '\n' + style.ch + '\n' + cellWidth + ',' + cellHeight;
    if (cache.has(key)) return cache.get(key);
    context.font = font;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    if ('fontKerning' in context) context.fontKerning = 'none';
    const measured = context.measureText(style.ch), probe = context.measureText('Mg');
    const left = number(measured.actualBoundingBoxLeft, 0);
    const right = number(measured.actualBoundingBoxRight, measured.width);
    const ascent = number(measured.actualBoundingBoxAscent, fontSize * .8);
    const descent = number(measured.actualBoundingBoxDescent, fontSize * .2);
    const inkWidth = Math.max(0, left + right), inkHeight = Math.max(0, ascent + descent);
    const scale = Math.min(1, cellWidth / Math.max(inkWidth, .01), cellHeight / Math.max(inkHeight, .01));
    const baseline = (cellHeight + (number(probe.actualBoundingBoxAscent, fontSize * .8) - number(probe.actualBoundingBoxDescent, fontSize * .2)) * scale) / 2;
    const result = {
      font, scale,
      x: (cellWidth - inkWidth * scale) / 2 + left * scale,
      y: clamp(baseline, ascent * scale, cellHeight - descent * scale)
    };
    // A bounded cache prevents a stream of different imported glyphs retaining memory.
    if (cache.size >= 8192) cache.clear();
    cache.set(key, result);
    return result;
  }

  function paintCell(context, cell, x, y, view, styleOptions, geometryCache) {
    const style = resolveStyle(cell, styleOptions), w = view.cellWidth, h = view.cellHeight;
    const left = x * w, top = y * h;
    context.fillStyle = style.bg;
    context.fillRect(left, top, w, h);
    if (style.ch === ' ' || style.ch === '\u00a0' || style.ch === '') {
      if (!style.underline) return;
    }
    context.save();
    context.beginPath();
    context.rect(left, top, w, h);
    context.clip();
    if (style.ch !== ' ' && style.ch !== '\u00a0' && style.ch !== '') {
      const geometry = glyphGeometry(context, style, view.fontSize, w, h, geometryCache);
      context.font = geometry.font;
      context.textAlign = 'left';
      context.textBaseline = 'alphabetic';
      if ('fontKerning' in context) context.fontKerning = 'none';
      context.fillStyle = style.fg;
      context.translate(left + geometry.x, top + geometry.y);
      context.scale(geometry.scale, geometry.scale);
      context.fillText(style.ch, 0, 0);
    }
    context.restore();
    if (style.underline) {
      context.fillStyle = style.fg;
      context.fillRect(left + Math.min(1, w / 8), top + h - 2, Math.max(0, w - Math.min(2, w / 4)), 1);
    }
  }

  function selectionMask(selection) {
    if (selection?.type !== 'free') return null;
    const result = new Set();
    for (const item of selection.mask || []) {
      if (Array.isArray(item) && item.length === 2) result.add(item[0] + ',' + item[1]);
      else if (typeof item === 'string') result.add(item);
    }
    return result;
  }

  /**
   * Mount two viewport-sized canvases inside a logical scroll spacer.
   * getState supplies validated cells, palette, dimensions, square, zoom and grid.
   * Call invalidateCell for edits, invalidateAll for palette/background changes,
   * and setView for dimensions/zoom/square changes. Scroll/resize/font loading
   * update the view automatically. metrics are CSS pixels; hitTest takes client
   * coordinates. Selection masks use relative [x,y] pairs or "x,y" Set entries;
   * preview/hover use linear indices and cursor is {x,y} or an index.
   *
   * Painting and overlay work share a per-frame time/count budget. Offscreen
   * cells have no DOM or bitmap allocation. exportPNG captures a stable document
   * revision, loads its font faces, and draws the full field in yielding chunks.
   */
  function create(options) {
    const {canvas, scroller, spacer, getState} = options || {};
    if (!canvas || !scroller || !spacer || typeof getState !== 'function') throw Error('The canvas renderer needs a canvas, scroller, spacer, and state getter.');
    const doc = canvas.ownerDocument, win = doc.defaultView || globalThis;
    let overlay = options.overlay;
    const ownsOverlay = !overlay;
    if (!overlay) { overlay = doc.createElement('canvas'); spacer.appendChild(overlay); }
    const context = canvas.getContext('2d', {alpha: true});
    const overlayContext = overlay.getContext('2d', {alpha: true});
    if (!context || !overlayContext) throw Error('This browser could not create a Canvas2D drawing surface.');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.pointerEvents = 'none';
    const fontSize = clamp(number(options.fontSize, DEFAULT_FONT_SIZE), 8, 32);
    const cellHeight = clamp(number(options.cellHeight, DEFAULT_CELL_HEIGHT), fontSize, 40);
    const safeFonts = Array.isArray(options.safeFonts) && options.safeFonts.length ? [...options.safeFonts] : DEFAULT_FONTS;
    const fontFamily = safeFonts.includes(options.fontFamily) ? options.fontFamily : 'DejaVu Sans Mono';
    const frameLimit = clamp(Math.floor(number(options.maxCellsPerFrame, 512)), 1, 4096);
    const frameBudget = clamp(number(options.frameBudgetMs, 6), 1, 16);
    const requestFrame = options.requestFrame || win.requestAnimationFrame.bind(win);
    const cancelFrame = options.cancelFrame || win.cancelAnimationFrame.bind(win);
    const now = options.now || (() => win.performance.now());
    const geometryCache = new Map();
    const dirtyCells = new Set();
    const idleWaiters = [];
    let palette = new Map();
    let destroyed = false, frame = null, layoutDirty = true, allDirty = true, overlayDirty = true;
    let fullRange = null, fullPosition = 0, overlayIterator = null;
    let overlays = {selection: null, preview: null, hover: null, cursor: null};
    let mask = null;
    let view = {cols: 0, rows: 0, fontFamily, fontSize, cellHeight, cellWidth: fontSize * .6, zoom: 1,
      scaledCellWidth: fontSize * .6, scaledCellHeight: cellHeight, logicalWidth: 0, logicalHeight: 0,
      viewportWidth: 0, viewportHeight: 0, originX: 0, originY: 0, paddingLeft: 0, paddingTop: 0, dpr: 1};
    const counters = {frames: 0, paintedCells: 0, lastFrameCells: 0, maxFrameCells: 0, lastFrameUnits: 0};

    spacer.style.position = 'relative';
    spacer.style.overflow = 'clip';
    spacer.style.transform = 'none';
    spacer.style.marginRight = '0';
    spacer.style.marginBottom = '0';
    for (const surface of [canvas, overlay]) {
      surface.style.position = 'absolute';
      surface.style.display = 'block';
      surface.style.maxWidth = 'none';
      surface.style.maxHeight = 'none';
      surface.style.margin = '0';
      surface.style.padding = '0';
      surface.style.border = '0';
    }

    function schedule() {
      if (!destroyed && frame === null) frame = requestFrame(renderFrame);
    }

    function syncLayout() {
      if (!layoutDirty || destroyed) return;
      layoutDirty = false;
      const state = getState(), zoom = clamp(number(state.zoom, 1), .25, 8);
      context.font = fontCSS({font: fontFamily, bold: false, italic: false}, fontSize);
      const cellWidth = state.square ? cellHeight : Math.max(4, context.measureText('0').width);
      const logicalWidth = state.cols * cellWidth * zoom, logicalHeight = state.rows * cellHeight * zoom;
      spacer.style.width = logicalWidth + 'px';
      spacer.style.height = logicalHeight + 'px';
      spacer.style.background = colour(state.fieldBg, '#000000');
      const css = win.getComputedStyle(scroller);
      const paddingLeft = parseFloat(css.paddingLeft) || 0, paddingTop = parseFloat(css.paddingTop) || 0;
      const viewportWidth = Math.max(0, scroller.clientWidth), viewportHeight = Math.max(0, scroller.clientHeight);
      const dpr = Math.min(clamp(number(win.devicePixelRatio, 1), .5, 3), Math.sqrt(MAX_VIEWPORT_PIXELS / Math.max(1, viewportWidth * viewportHeight)));
      view = {cols: state.cols, rows: state.rows, fontFamily, fontSize, cellWidth, cellHeight, zoom,
        scaledCellWidth: cellWidth * zoom, scaledCellHeight: cellHeight * zoom,
        logicalWidth, logicalHeight, viewportWidth, viewportHeight, paddingLeft, paddingTop,
        originX: paddingLeft - scroller.scrollLeft, originY: paddingTop - scroller.scrollTop, dpr};
      for (const surface of [canvas, overlay]) {
        const width = Math.max(1, Math.ceil(viewportWidth * dpr)), height = Math.max(1, Math.ceil(viewportHeight * dpr));
        if (surface.width !== width) surface.width = width;
        if (surface.height !== height) surface.height = height;
        surface.style.width = viewportWidth + 'px';
        surface.style.height = viewportHeight + 'px';
        surface.style.left = scroller.scrollLeft - paddingLeft + 'px';
        surface.style.top = scroller.scrollTop - paddingTop + 'px';
      }
      allDirty = true;
      overlayDirty = true;
      if (typeof options.onMetrics === 'function') options.onMetrics({...view});
    }

    function clearSurface(ctx, surface) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, surface.width, surface.height);
    }

    function beginArtwork() {
      allDirty = false;
      palette = paletteMap(getState());
      fullRange = visibleRange(view);
      fullPosition = 0;
      dirtyCells.clear();
      clearSurface(context, canvas);
      context.setTransform(view.dpr * view.zoom, 0, 0, view.dpr * view.zoom, view.dpr * view.originX, view.dpr * view.originY);
      context.fillStyle = colour(getState().fieldBg, '#000000');
      context.fillRect(0, 0, view.cols * view.cellWidth, view.rows * view.cellHeight);
      if (!fullRange.count) fullRange = null;
    }

    function nextCell() {
      if (fullRange) {
        const width = fullRange.x1 - fullRange.x0;
        const x = fullRange.x0 + fullPosition % width, y = fullRange.y0 + Math.floor(fullPosition / width);
        fullPosition++;
        if (fullPosition >= fullRange.count) fullRange = null;
        return y * view.cols + x;
      }
      if (dirtyCells.size) {
        const item = dirtyCells.values().next().value;
        dirtyCells.delete(item);
        return item;
      }
      return null;
    }

    function inView(x, y) {
      return x >= 0 && y >= 0 && x < view.cols && y < view.rows &&
        (x + 1) * view.scaledCellWidth + view.originX > 0 && x * view.scaledCellWidth + view.originX < view.viewportWidth &&
        (y + 1) * view.scaledCellHeight + view.originY > 0 && y * view.scaledCellHeight + view.originY < view.viewportHeight;
    }

    function overlayCell(i, stroke, fill) {
      if (!Number.isInteger(i)) return;
      const x = i % view.cols, y = Math.floor(i / view.cols);
      if (!inView(x, y)) return;
      const px = view.originX + x * view.scaledCellWidth, py = view.originY + y * view.scaledCellHeight;
      const w = view.scaledCellWidth, h = view.scaledCellHeight;
      if (fill) { overlayContext.fillStyle = fill; overlayContext.fillRect(px, py, w, h); }
      overlayContext.strokeStyle = stroke;
      overlayContext.lineWidth = Math.min(1.5, Math.min(w, h) / 3);
      const inset = overlayContext.lineWidth / 2;
      overlayContext.strokeRect(px + inset, py + inset, Math.max(0, w - 2 * inset), Math.max(0, h - 2 * inset));
    }

    function* overlayWork() {
      const range = visibleRange(view), state = getState();
      overlayContext.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      if (state.grid && range.count) {
        overlayContext.strokeStyle = 'rgba(125,160,210,.24)';
        overlayContext.lineWidth = 1 / view.dpr;
        const left = Math.max(0, view.originX), top = Math.max(0, view.originY);
        const right = Math.min(view.viewportWidth, view.originX + view.logicalWidth);
        const bottom = Math.min(view.viewportHeight, view.originY + view.logicalHeight);
        for (let x = range.x0; x <= range.x1; x++) {
          const px = Math.round((view.originX + x * view.scaledCellWidth) * view.dpr) / view.dpr + .5 / view.dpr;
          overlayContext.beginPath(); overlayContext.moveTo(px, top); overlayContext.lineTo(px, bottom); overlayContext.stroke(); yield;
        }
        for (let y = range.y0; y <= range.y1; y++) {
          const py = Math.round((view.originY + y * view.scaledCellHeight) * view.dpr) / view.dpr + .5 / view.dpr;
          overlayContext.beginPath(); overlayContext.moveTo(left, py); overlayContext.lineTo(right, py); overlayContext.stroke(); yield;
        }
      }
      const selection = overlays.selection;
      if (selection) {
        const sx0 = Math.max(range.x0, selection.x), sy0 = Math.max(range.y0, selection.y);
        const sx1 = Math.min(range.x1, selection.x + selection.w), sy1 = Math.min(range.y1, selection.y + selection.h);
        if (selection.type === 'free') {
          for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) {
            const dx = x - selection.x, dy = y - selection.y;
            const edge = mask?.has(dx + ',' + dy) && (!mask.has((dx - 1) + ',' + dy) || !mask.has((dx + 1) + ',' + dy) || !mask.has(dx + ',' + (dy - 1)) || !mask.has(dx + ',' + (dy + 1)));
            if (edge) overlayCell(y * view.cols + x, '#00a8ff', 'rgba(0,168,255,.12)');
            yield;
          }
        } else {
          // A large rectangle needs work proportional to its perimeter, not its area.
          for (const y of new Set([selection.y, selection.y + selection.h - 1])) {
            if (y < sy0 || y >= sy1) continue;
            for (let x = sx0; x < sx1; x++) { overlayCell(y * view.cols + x, '#00a8ff', 'rgba(0,168,255,.12)'); yield; }
          }
          for (const x of new Set([selection.x, selection.x + selection.w - 1])) {
            if (x < sx0 || x >= sx1) continue;
            for (let y = Math.max(sy0, selection.y + 1); y < Math.min(sy1, selection.y + selection.h - 1); y++) {
              overlayCell(y * view.cols + x, '#00a8ff', 'rgba(0,168,255,.12)'); yield;
            }
          }
        }
      }
      for (const i of overlays.preview || []) { overlayCell(i, '#ff00ff', 'rgba(255,255,255,.10)'); yield; }
      for (const i of overlays.hover || []) { overlayCell(i, '#ffcc00'); yield; }
      const cursor = overlays.cursor;
      if (cursor !== null && cursor !== undefined) {
        const i = Number.isInteger(cursor) ? cursor : cursor.y * view.cols + cursor.x;
        overlayCell(i, '#ffffff', 'rgba(255,255,255,.14)');
        yield;
      }
    }

    function hasWork() { return layoutDirty || allDirty || fullRange !== null || dirtyCells.size > 0 || overlayDirty || overlayIterator !== null; }

    function renderFrame() {
      frame = null;
      if (destroyed) return;
      syncLayout();
      if (allDirty) beginArtwork();
      if (overlayDirty) {
        overlayDirty = false;
        clearSurface(overlayContext, overlay);
        overlayIterator = overlayWork();
      }
      const started = now();
      let units = 0, painted = 0;
      const state = getState(), styleOptions = {palette, fieldBg: state.fieldBg, safeFonts, getGlyphColour: options.getGlyphColour};
      const artworkLimit = overlayIterator ? Math.max(1, Math.floor(frameLimit * .8)) : frameLimit;
      const artworkBudget = overlayIterator ? frameBudget * .8 : frameBudget;
      while (units < artworkLimit && (units === 0 || now() - started < artworkBudget)) {
        const i = nextCell();
        if (i === null) break;
        const x = i % view.cols, y = Math.floor(i / view.cols);
        if (inView(x, y) && state.cells[i]) { paintCell(context, state.cells[i], x, y, view, styleOptions, geometryCache); painted++; }
        units++;
      }
      while (overlayIterator && units < frameLimit && (units === 0 || now() - started < frameBudget)) {
        if (overlayIterator.next().done) overlayIterator = null;
        units++;
      }
      counters.frames++;
      counters.paintedCells += painted;
      counters.lastFrameCells = painted;
      counters.maxFrameCells = Math.max(counters.maxFrameCells, painted);
      counters.lastFrameUnits = units;
      if (hasWork()) schedule();
      else while (idleWaiters.length) idleWaiters.shift()();
    }

    function invalidateCell(i) {
      if (!Number.isInteger(i) || i < 0 || i >= getState().cells.length || destroyed) return;
      dirtyCells.add(i);
      schedule();
    }
    function invalidateAll() { if (destroyed) return; allDirty = true; overlayDirty = true; schedule(); }
    function invalidateOverlay() { if (destroyed) return; overlayDirty = true; schedule(); }
    function resize() { if (destroyed) return; layoutDirty = true; schedule(); }
    function setOverlays(patch) {
      overlays = {...overlays, ...patch};
      if (Object.prototype.hasOwnProperty.call(patch, 'selection')) mask = selectionMask(patch.selection);
      invalidateOverlay();
    }
    function hitTest(clientX, clientY, settings = {}) {
      syncLayout();
      return cellFromPoint(clientX, clientY, canvas.getBoundingClientRect(), view, settings.clamp === true);
    }
    function ensureCellVisible(x, y) {
      syncLayout();
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= view.cols || y >= view.rows) return;
      const left = view.paddingLeft + x * view.scaledCellWidth, top = view.paddingTop + y * view.scaledCellHeight;
      const right = left + view.scaledCellWidth, bottom = top + view.scaledCellHeight;
      if (left < scroller.scrollLeft) scroller.scrollLeft = left;
      else if (right > scroller.scrollLeft + view.viewportWidth) scroller.scrollLeft = right - view.viewportWidth;
      if (top < scroller.scrollTop) scroller.scrollTop = top;
      else if (bottom > scroller.scrollTop + view.viewportHeight) scroller.scrollTop = bottom - view.viewportHeight;
      resize();
    }

    async function exportPNG(settings = {}) {
      if (destroyed) throw Error('The editor has closed.');
      if (settings.signal?.aborted) throw Error('PNG export cancelled.');
      syncLayout();
      const source = getState();
      exportDimensions(source.cols, source.rows, view.cellWidth, view.cellHeight, settings.scale ?? 1);
      // Export one coherent revision even while asynchronous drawing yields to input.
      const state = {...source, cells: source.cells.map(cell => ({...cell})), glyphPalette: (source.glyphPalette || []).map(entry => ({...entry}))};
      if (doc.fonts?.load) {
        // Offscreen cells may use font faces the viewport has not requested yet.
        // Request every used weight/style before measuring or painting the export.
        const fonts = new Set([fontCSS({font: fontFamily, bold: false, italic: false}, fontSize)]);
        for (const cell of state.cells) fonts.add(fontCSS(resolveStyle(cell, {safeFonts}), fontSize));
        await Promise.all([...fonts].map(font => doc.fonts.load(font, 'Mg')));
      }
      if (doc.fonts?.ready) await doc.fonts.ready;
      if (destroyed || settings.signal?.aborted) throw Error('PNG export cancelled.');
      context.font = fontCSS({font: fontFamily, bold: false, italic: false}, fontSize);
      const exportView = {...view, cellWidth: state.square ? cellHeight : Math.max(4, context.measureText('0').width)};
      const dimensions = exportDimensions(state.cols, state.rows, exportView.cellWidth, cellHeight, settings.scale ?? 1);
      const output = doc.createElement('canvas');
      output.width = dimensions.width; output.height = dimensions.height;
      // Match the viewport context so browsers use the same text antialiasing.
      // The entire background is filled opaquely before any glyph is drawn.
      const out = output.getContext('2d', {alpha: true});
      if (!out) throw Error('This browser could not allocate the PNG canvas.');
      const cache = new Map();
      const styleOptions = {palette: paletteMap(state), fieldBg: state.fieldBg, safeFonts};
      out.fillStyle = colour(state.fieldBg, '#000000');
      out.fillRect(0, 0, output.width, output.height);
      out.setTransform(dimensions.scale, 0, 0, dimensions.scale, 0, 0);
      let index = 0;
      while (index < state.cells.length) {
        if (destroyed || settings.signal?.aborted) { output.width = output.height = 1; throw Error('PNG export cancelled.'); }
        const started = now();
        let count = 0;
        do {
          paintCell(out, state.cells[index], index % state.cols, Math.floor(index / state.cols), exportView, styleOptions, cache);
          index++; count++;
        } while (index < state.cells.length && count < frameLimit && now() - started < frameBudget);
        if (index < state.cells.length) await new Promise(resolve => win.setTimeout(resolve, 0));
      }
      return new Promise((resolve, reject) => output.toBlob(blob => {
        // Release the potentially large export backing store after encoding.
        output.width = output.height = 1;
        if (blob) resolve(blob); else reject(Error('The browser could not encode this PNG.'));
      }, 'image/png'));
    }

    const onScroll = () => resize();
    scroller.addEventListener('scroll', onScroll, {passive: true});
    win.addEventListener('resize', resize);
    const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resize) : null;
    observer?.observe(scroller);
    const fontsChanged = () => { geometryCache.clear(); resize(); };
    doc.fonts?.addEventListener?.('loadingdone', fontsChanged);
    doc.fonts?.ready?.then(fontsChanged);
    schedule();

    return {
      invalidateCell, invalidateAll, invalidateOverlay, resize, setView: resize, setOverlays, hitTest, ensureCellVisible, exportPNG,
      metrics() { syncLayout(); return {...view}; },
      stats() { return {...counters, pendingCells: dirtyCells.size + (fullRange ? fullRange.count - fullPosition : 0), visibleCells: visibleRange(view).count,
        backingPixels: canvas.width * canvas.height, maxCellsPerFrame: frameLimit, frameBudgetMs: frameBudget}; },
      whenIdle() { return destroyed || (!hasWork() && frame === null) ? Promise.resolve() : new Promise(resolve => { idleWaiters.push(resolve); schedule(); }); },
      destroy() {
        destroyed = true;
        if (frame !== null) cancelFrame(frame);
        frame = null;
        observer?.disconnect();
        scroller.removeEventListener('scroll', onScroll);
        win.removeEventListener('resize', resize);
        doc.fonts?.removeEventListener?.('loadingdone', fontsChanged);
        if (ownsOverlay) overlay.remove();
        dirtyCells.clear(); geometryCache.clear();
        while (idleWaiters.length) idleWaiters.shift()();
      }
    };
  }

  return {create, visibleRange, cellFromPoint, resolveStyle, exportDimensions,
    limits: Object.freeze({maxViewportPixels: MAX_VIEWPORT_PIXELS, maxExportPixels: MAX_EXPORT_PIXELS, maxExportSide: MAX_EXPORT_SIDE})};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GPRenderer;
/* GP_RENDERER_END */
