/* Unicode cells and bounded, inert HTML interchange. No imported nodes or CSS
 * enter the live document. This module is embedded in the standalone editor. */
const GPInterchange = (() => {
  'use strict';
  const MAX_GRAPHEME_CODE_POINTS = 32;
  const segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, {granularity:'grapheme'}) : null;
  const forbiddenGlyph = /[\u0000-\u001f\u007f-\u009f\ud800-\udfff\u2028\u2029]/u;
  const fallbackFonts = ['Cascadia Mono','Cascadia Code','Consolas','Courier New','DejaVu Sans Mono','monospace'];
  const wrapperPrefix = 'gp-inert-';
  const skippedTags = new Set(['SCRIPT','STYLE','TEMPLATE','NOSCRIPT','IFRAME','OBJECT','EMBED','SVG','MATH','IMG','VIDEO','AUDIO','SOURCE','TRACK','CANVAS','LINK','META','BASE']);
  const blockTags = new Set(['ADDRESS','ARTICLE','ASIDE','BLOCKQUOTE','DD','DIV','DL','DT','FIGCAPTION','FIGURE','FOOTER','FORM','H1','H2','H3','H4','H5','H6','HEADER','HR','LI','MAIN','NAV','OL','P','SECTION','TABLE','TR','UL']);
  const properties = ['color','background-color','font-family','font-weight','font-style','text-decoration-line','visibility','display'];
  const colourCache = new Map();
  let colourContext;

  function* iterateGraphemes(text) {
    if (typeof text !== 'string') throw new TypeError('Text must be a string.');
    if (segmenter) { for (const part of segmenter.segment(text)) yield part.segment; return; }
    // ASCII remains usable on old engines; never silently split an emoji or mark.
    if (/^[\x00-\x7f]*$/.test(text)) { yield* text; return; }
    throw Error('This browser needs Intl.Segmenter to edit Unicode graphemes. Please use a current browser.');
  }
  function splitGraphemes(text) { return Array.from(iterateGraphemes(text)); }

  function validGrapheme(text) {
    if (typeof text !== 'string' || !text.length || text.length > MAX_GRAPHEME_CODE_POINTS * 2 || forbiddenGlyph.test(text)) return false;
    let count = 0;
    for (const ignored of text) if (++count > MAX_GRAPHEME_CODE_POINTS) return false;
    if (!segmenter) return /^[\x20-\x7e]$/.test(text);
    const iterator = segmenter.segment(text)[Symbol.iterator]();
    return iterator.next().value.segment === text && iterator.next().done;
  }

  function rgba(value) {
    if (typeof value !== 'string' || value.length > 256) return null;
    const key = value.trim().toLowerCase();
    if (!key || /(?:url|var|env|attr)\s*\(|[;{}]/i.test(key) || /^(?:currentcolor|inherit|initial|unset|revert(?:-layer)?)$/.test(key)) return null;
    if (colourCache.has(key)) return colourCache.get(key);
    let result = null;
    const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(key);
    if (hex) {
      const raw = hex[1].length < 5 ? Array.from(hex[1], ch => ch + ch).join('') : hex[1];
      result = [parseInt(raw.slice(0,2),16),parseInt(raw.slice(2,4),16),parseInt(raw.slice(4,6),16),raw.length === 8 ? parseInt(raw.slice(6,8),16) / 255 : 1];
    } else if (key === 'transparent') result = [0,0,0,0];
    else if (typeof document !== 'undefined') {
      if (!colourContext) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        colourContext = canvas.getContext('2d', {willReadFrequently:true});
      }
      if (colourContext) {
        // Invalid fillStyle assignments retain the preceding value. Two sentinels
        // distinguish an invalid value from a valid colour equal to a sentinel.
        colourContext.fillStyle = '#010203';
        colourContext.fillStyle = key;
        const first = colourContext.fillStyle;
        colourContext.fillStyle = '#040506';
        colourContext.fillStyle = key;
        if (first === colourContext.fillStyle) {
          const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(first);
          const solid = /^#([0-9a-f]{6})$/i.exec(first);
          if (rgb) result = [Number(rgb[1]),Number(rgb[2]),Number(rgb[3]),rgb[4] === undefined ? 1 : Number(rgb[4])];
          else if (solid) result = [0,2,4].map(at=>parseInt(solid[1].slice(at,at+2),16)).concat(1);
          else {
            colourContext.clearRect(0,0,1,1);
            colourContext.fillRect(0,0,1,1);
            const pixel = colourContext.getImageData(0,0,1,1).data;
            result = [pixel[0],pixel[1],pixel[2],pixel[3]/255];
          }
        }
      }
    }
    if (colourCache.size >= 4096) colourCache.clear();
    colourCache.set(key, result);
    return result;
  }

  function composite(front, back) {
    return [0,1,2].map(i => Math.round(front[i] * front[3] + back[i] * (1-front[3]))).concat(1);
  }
  function hexColour(value) { return '#' + value.slice(0,3).map(n => Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0')).join(''); }
  function normaliseColour(value, backdrop = '#000000') {
    const colour = rgba(value), behind = rgba(backdrop);
    return colour && behind ? hexColour(composite(colour, composite(behind,[0,0,0,1]))) : null;
  }

  // A fragment parser drops html/head/body tags. Rename only actual container
  // tokens before parsing, so their styles and selector ancestry survive inside
  // inert template content. Raw-text/comment contents are not rewritten.
  function preserveContainers(source) {
    const parts = [];
    let start = 0, cursor = 0, rawTag = '';
    while (cursor < source.length) {
      if (rawTag) {
        if (rawTag === 'plaintext') break;
        const close = new RegExp('</' + rawTag + '(?=[\\s/>])','ig');
        close.lastIndex = cursor;
        const match = close.exec(source);
        if (!match) break;
        cursor = match.index;
        rawTag = '';
      }
      const open = source.indexOf('<', cursor);
      if (open < 0) break;
      if (source.startsWith('<!--',open)) {
        const close = source.indexOf('-->',open+4);
        cursor = close < 0 ? source.length : close+3;
        continue;
      }
      const token = /^<(\/?)([a-z][\w:-]*)(?=[\s/>])/i.exec(source.slice(open,open+128));
      if (!token) { cursor = open+1; continue; }
      let end = open + token[0].length, quote = '';
      for (;end < source.length;end++) {
        const ch = source[end];
        if (quote) { if (ch === quote) quote = ''; }
        else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') break;
      }
      if (end >= source.length) break;
      const tag = token[2].toLowerCase();
      if (['html','head','body'].includes(tag)) {
        const nameOffset = open + token[0].length - token[2].length;
        parts.push(source.slice(start,nameOffset), wrapperPrefix + tag);
        start = nameOffset + tag.length;
      }
      if (!token[1] && ['script','style','textarea','title','xmp','iframe','noembed','noframes','plaintext'].includes(tag)) rawTag = tag;
      cursor = end+1;
    }
    parts.push(source.slice(start));
    return parts.join('');
  }

  function parseSelector(selector) {
    if (!selector || selector.length > 256 || /[^\w.#*>\s-]/.test(selector)) return null;
    const parts = [], specificity = [0,0,0];
    let rest = selector.trim(), relation = null;
    while (rest) {
      const match = /^(\*|[a-zA-Z_][\w-]*)?((?:[.#][a-zA-Z_-][\w-]*)*)/.exec(rest);
      if (!match || !match[0]) return null;
      const part = {tag:match[1] && match[1] !== '*' ? match[1].toLowerCase() : '', ids:[], classes:[], relation};
      for (const attr of match[2].matchAll(/([.#])([\w-]+)/g)) (attr[1] === '#' ? part.ids : part.classes).push(attr[2]);
      specificity[0] += part.ids.length; specificity[1] += part.classes.length; specificity[2] += part.tag ? 1 : 0;
      parts.push(part);
      if (parts.length > 16) return null;
      rest = rest.slice(match[0].length);
      if (!rest) break;
      const spaces = /^\s*/.exec(rest)[0].length;
      rest = rest.slice(spaces);
      if (!rest) break;
      if (rest[0] === '>') { relation = 'child'; rest = rest.slice(1).trimStart(); }
      else if (spaces) relation = 'descendant';
      else return null;
      if (!rest) return null;
    }
    return {parts,specificity};
  }

  function parseHtml(text, options = {}) {
    if (typeof text !== 'string') throw new TypeError('HTML must be a string.');
    const limits = {
      maxDimension:512,maxCells:65536,maxPalette:4096,maxFileBytes:16*1024*1024,
      maxNodes:200000,maxDepth:100,maxRules:512,maxSelectors:2048,
      maxStyleChars:131072,maxDeclarations:8192,maxSelectorChecks:1000000,
      ...options,
    };
    for (const key of ['maxDimension','maxCells','maxPalette','maxFileBytes','maxNodes','maxDepth','maxRules','maxSelectors','maxStyleChars','maxDeclarations','maxSelectorChecks']) {
      if (!Number.isSafeInteger(limits[key]) || limits[key] < 1) throw Error('Invalid HTML import limit: ' + key);
    }
    if (text.length > limits.maxFileBytes || new TextEncoder().encode(text).byteLength > limits.maxFileBytes) throw Error('HTML exceeds the file-size limit.');
    const safeFonts = Array.isArray(options.safeFonts) && options.safeFonts.length ? options.safeFonts : fallbackFonts;
    const defaultFont = safeFonts.includes(options.defaultFont) ? options.defaultFont : safeFonts[0];
    const baseBg = rgba(options.defaultBackground || '#000000'), baseFg = rgba(options.defaultForeground || '#ffffff');
    if (!baseBg || !baseFg) throw Error('Invalid default HTML colours.');
    const warnings = new Set(), unsupportedProperties = new Set();
    const warn = value => warnings.add(value);
    const template = document.createElement('template');
    template.innerHTML = preserveContainers(text);
    const fragment = template.content, owner = fragment.ownerDocument;
    let root = fragment.querySelector(wrapperPrefix + 'html');
    if (!root) {
      root = owner.createElement(wrapperPrefix + 'html');
      while (fragment.firstChild) root.appendChild(fragment.firstChild);
      fragment.appendChild(root);
    }
    if (!root.querySelector(wrapperPrefix + 'body')) {
      const body = owner.createElement(wrapperPrefix + 'body');
      for (const child of Array.from(root.childNodes)) if (child.nodeName !== (wrapperPrefix+'head').toUpperCase()) body.appendChild(child);
      root.appendChild(body);
    }
    const styleSources = [];
    let nodes = 0, depth = 0, current = fragment, styleChars = 0, declarations = 0, selectorChecks = 0;
    while (current) {
      if (++nodes > limits.maxNodes) throw Error('HTML contains too many nodes.');
      if (depth > limits.maxDepth) throw Error('HTML nesting is too deep.');
      if (current.nodeType === 1) {
        const tag = current.tagName.toUpperCase();
        if (tag === 'STYLE') styleSources.push(current.textContent || '');
        if (current.hasAttribute('style')) styleChars += current.getAttribute('style').length;
        if (tag === 'LINK' && /stylesheet/i.test(current.getAttribute('rel') || '')) warn('External stylesheets are ignored; include their supported rules in a <style> element.');
        if (['SCRIPT','IFRAME','OBJECT','EMBED','SVG','MATH','IMG','VIDEO','AUDIO','CANVAS'].includes(tag)) warn('Scripts, images and embedded media are ignored.');
      }
      if (current.firstChild) { current = current.firstChild; depth++; continue; }
      while (current !== fragment && !current.nextSibling) { current = current.parentNode; depth--; }
      if (current === fragment) break;
      current = current.nextSibling;
    }
    for (const source of styleSources) styleChars += source.length;
    if (styleChars > limits.maxStyleChars) throw Error('HTML styles exceed the import budget.');
    const art = fragment.querySelector('#art') || fragment.querySelector('pre');
    if (!art) throw Error('No <pre> artwork found.');

    const ruleIndex = new Map();
    let ruleCount = 0, selectorCount = 0, order = 0;
    function readDeclarations(css) {
      declarations += css.length;
      if (declarations > limits.maxDeclarations) throw Error('HTML has too many style declarations.');
      for (let i=0;i<css.length;i++) {
        const property = css.item(i);
        if (!properties.includes(property) && !['background-image','background-position','background-position-x','background-position-y','background-size','background-repeat','background-origin','background-clip','background-attachment','font-stretch','font-variant','font-variant-caps','font-variant-ligatures','font-kerning','font-feature-settings','font-variation-settings','font-optical-sizing','font-size-adjust','text-decoration-color','text-decoration-style','text-decoration-thickness'].includes(property)) {
          if (unsupportedProperties.size < 8) unsupportedProperties.add(property.slice(0,64));
        }
        if (/url\s*\(/i.test(css.getPropertyValue(property))) warn('CSS resource URLs are ignored.');
        if (property === 'background-image' && !['','none','initial','unset','revert','revert-layer'].includes(css.getPropertyValue(property))) warn('Background images and gradients are ignored.');
      }
      const result = [];
      for (const property of properties) {
        const value = css.getPropertyValue(property).trim();
        if (!value) continue;
        if (/(?:var|env|attr|url)\s*\(/i.test(value)) { warn('CSS variables and resource-dependent values are ignored.'); continue; }
        result.push({property,value,important:css.getPropertyPriority(property) === 'important'});
      }
      return result;
    }
    for (const source of styleSources) {
      if (typeof CSSStyleSheet !== 'function') { warn('This browser cannot read embedded stylesheets; only inline styles were imported.'); break; }
      const sheet = new CSSStyleSheet();
      // Constructed sheets are never attached. replaceSync discards @import;
      // resource-bearing properties never leave this inert sheet.
      sheet.replaceSync(source);
      if (/@import\b/i.test(source)) warn('CSS @import rules are ignored; external CSS is never fetched.');
      const ruleStack = Array.from(sheet.cssRules,rule=>({rule,depth:0}));
      while (ruleStack.length) {
        const entry = ruleStack.pop();
        if (++ruleCount > limits.maxRules) throw Error('HTML has too many CSS rules.');
        if (entry.depth > 16) throw Error('HTML CSS nesting is too deep.');
        if (entry.rule.cssRules) for (const rule of entry.rule.cssRules) ruleStack.push({rule,depth:entry.depth+1});
      }
      for (const rule of sheet.cssRules) {
        if (rule.type !== 1) { warn('CSS at-rules are ignored; use ordinary class, ID or tag rules.'); continue; }
        const decls = readDeclarations(rule.style);
        for (const textSelector of rule.selectorText.split(',')) {
          if (++selectorCount > limits.maxSelectors) throw Error('HTML has too many CSS selectors.');
          const selector = parseSelector(textSelector);
          if (!selector) { warn('Unsupported CSS selectors were ignored; use tags, classes, IDs, descendants or direct children.'); continue; }
          const last = selector.parts.at(-1);
          const key = last.ids.length ? '#'+last.ids[0] : last.classes.length ? '.'+last.classes[0] : last.tag || '*';
          if (!ruleIndex.has(key)) ruleIndex.set(key,[]);
          ruleIndex.get(key).push({...selector,decls,order:order++});
        }
      }
    }
    function tagOf(node) {
      const tag = node.tagName.toLowerCase();
      return tag.startsWith(wrapperPrefix) ? tag.slice(wrapperPrefix.length) : tag;
    }
    function matchesPart(node, part) {
      return node && node.nodeType === 1 && (!part.tag || tagOf(node) === part.tag)
        && part.ids.every(id => node.id === id) && part.classes.every(name => node.classList.contains(name));
    }
    function matchesRule(node, rule) {
      // A nearer matching ancestor may fail an earlier child constraint while
      // a farther ancestor succeeds. Try every eligible ancestor, caching each
      // node/selector suffix and counting even cache probes against the budget.
      const memo = new Map();
      function matchesFrom(at, index) {
        if (++selectorChecks > limits.maxSelectorChecks) throw Error('HTML CSS matching exceeds the import budget.');
        if (!at || at.nodeType !== 1) return false;
        let cached = memo.get(at);
        if (cached?.has(index)) return cached.get(index);
        let result = false;
        if (matchesPart(at,rule.parts[index])) {
          if (!index) result = true;
          else if (rule.parts[index].relation === 'child') result = matchesFrom(at.parentElement,index-1);
          else for (let ancestor=at.parentElement;ancestor;ancestor=ancestor.parentElement) {
            if (matchesFrom(ancestor,index-1)) { result = true; break; }
          }
        }
        if (!cached) { cached = new Map(); memo.set(at,cached); }
        cached.set(index,result);
        return result;
      }
      return matchesFrom(node,rule.parts.length-1);
    }
    function outranks(a,b) {
      if (!b) return true;
      for (let i=0;i<a.rank.length;i++) if (a.rank[i] !== b.rank[i]) return a.rank[i] > b.rank[i];
      return true;
    }
    function computed(node, parent) {
      const winners = new Map();
      function offer(decls, specificity, inline, ruleOrder) {
        for (const declaration of decls) {
          const candidate = {...declaration,rank:[declaration.important ? 1 : 0,inline,...specificity,ruleOrder]};
          if (outranks(candidate,winners.get(declaration.property))) winners.set(declaration.property,candidate);
        }
      }
      const keys = new Set(['*',tagOf(node)]);
      if (node.id) keys.add('#'+node.id);
      for (const name of node.classList) keys.add('.'+name);
      for (const key of keys) for (const rule of ruleIndex.get(key) || []) if (matchesRule(node,rule)) offer(rule.decls,rule.specificity,0,rule.order);
      offer(readDeclarations(node.style),[0,0,0],1,order+1);
      const values = Object.fromEntries(Array.from(winners,([property,declaration])=>[property,declaration.value]));
      const tag = node.tagName.toUpperCase();
      const style = {...parent,ownBg:[0,0,0,0],display:blockTags.has(tag) ? 'block' : 'inline'};
      let colour = values.color;
      if (colour === 'initial') style.colour = baseFg;
      else if (colour && !['inherit','unset','revert','revert-layer','currentcolor'].includes(colour.toLowerCase())) {
        const parsed = rgba(colour); if (parsed) style.colour = parsed;
        else warn('Unsupported CSS colour values were ignored.');
      }
      let background = values['background-color'];
      if (background === 'inherit') style.ownBg = parent.ownBg;
      else if (background && !['initial','unset','revert','revert-layer'].includes(background.toLowerCase())) {
        const parsed = background.toLowerCase() === 'currentcolor' ? style.colour : rgba(background);
        if (parsed) style.ownBg = parsed;
        else warn('Unsupported CSS colour values were ignored.');
      }
      style.background = composite(style.ownBg,parent.background);
      const family = values['font-family'];
      if (family === 'initial') style.font = defaultFont;
      else if (family && !['inherit','unset','revert','revert-layer'].includes(family)) {
        const candidates = family.split(',').map(value=>value.trim().replace(/^(['"])(.*)\1$/,'$2'));
        const selected = candidates.map(candidate=>safeFonts.find(font=>font.toLowerCase() === candidate.toLowerCase())).find(Boolean);
        style.font = selected || defaultFont;
        if (!selected) warn('Unavailable font families use the editor default; fonts are never downloaded.');
      }
      let weight = values['font-weight'];
      if (!weight && ['B','STRONG'].includes(tag)) weight = 'bolder';
      if (weight === 'normal' || weight === 'initial') style.weight = 400;
      else if (weight === 'bold') style.weight = 700;
      else if (weight === 'bolder') style.weight = parent.weight < 350 ? 400 : parent.weight < 550 ? 700 : 900;
      else if (weight === 'lighter') style.weight = parent.weight < 550 ? 100 : parent.weight < 750 ? 400 : 700;
      else if (weight && /^\d+(?:\.\d+)?$/.test(weight)) style.weight = Number(weight);
      const italic = values['font-style'];
      if (!italic && ['I','EM'].includes(tag)) style.italic = true;
      else if (italic === 'normal' || italic === 'initial') style.italic = false;
      else if (italic && /^(italic|oblique)(\s|$)/.test(italic)) style.italic = true;
      const decoration = values['text-decoration-line'];
      style.underline = parent.underline || (decoration ? /\bunderline\b/.test(decoration) : tag === 'U');
      if (decoration && /\b(overline|line-through)\b/.test(decoration)) warn('Only underline text decoration is imported.');
      const visibility = values.visibility;
      if (visibility === 'visible' || visibility === 'initial') style.visible = true;
      else if (visibility === 'hidden' || visibility === 'collapse') style.visible = false;
      if (values.display) style.display = values.display;
      if (style.display === 'inherit') style.display = parent.display;
      if (['initial','unset','revert','revert-layer'].includes(style.display)) style.display = 'inline';
      if (['flex','inline-flex','grid','inline-grid','table'].includes(style.display)) warn('Complex HTML layout is linearized into text rows.');
      return style;
    }
    const defaultStyle = {colour:baseFg,background:composite(baseBg,[0,0,0,1]),ownBg:[0,0,0,0],font:defaultFont,weight:400,italic:false,underline:false,visible:true,display:'inline'};
    const ancestors = [];
    for (let node=art.parentElement;node;node=node.parentElement) ancestors.unshift(node);
    let inherited = defaultStyle, hiddenAncestor = false;
    for (const node of ancestors) {
      inherited = computed(node,inherited);
      if (inherited.display === 'none' || node.hasAttribute('hidden')) hiddenAncestor = true;
    }
    const artStyle = computed(art,inherited), fieldBg = hexColour(artStyle.background);
    const rows = [], palette = new Map();
    let rowText = '', runs = [], width = 0;
    function plainCell(ch,style) {
      return {ch,fg:hexColour(composite(style.colour,style.background)),bg:hexColour(style.background) === fieldBg ? '' : hexColour(style.background),font:style.font,bold:style.weight >= 600,italic:style.italic,underline:style.underline};
    }
    function remember(cell) {
      if (palette.has(cell.ch)) return;
      const reserved = cell.ch !== ' ' && !palette.has(' ') ? 1 : 0;
      if (palette.size + reserved >= limits.maxPalette) throw Error('HTML has too many glyphs.');
      palette.set(cell.ch,{glyph:cell.ch,colour:cell.fg,represents:''});
    }
    function flushRow() {
      if (rows.length >= limits.maxDimension) throw Error('HTML has too many rows.');
      const row = [];
      let runIndex = 0;
      const segments = segmenter ? segmenter.segment(rowText) : splitGraphemes(rowText).map((segment,index)=>({segment,index}));
      for (const {segment,index} of segments) {
        while (runIndex+1 < runs.length && runs[runIndex].end <= index) runIndex++;
        const style = runs[runIndex]?.style || artStyle;
        if (runs[runIndex] && index+segment.length > runs[runIndex].end) {
          for (let next=runIndex+1;next<runs.length && runs[next-1].end < index+segment.length;next++) {
            const other = runs[next].style;
            if (style.font !== other.font || style.weight !== other.weight || style.italic !== other.italic || style.underline !== other.underline || style.visible !== other.visible || style.colour.some((value,i)=>value !== other.colour[i]) || style.background.some((value,i)=>value !== other.background[i])) {
              warn('A grapheme spanning differently styled elements uses the style of its first code point.'); break;
            }
          }
        }
        if (segment !== '\t' && !validGrapheme(segment)) throw Error('HTML contains an unsupported control character or a grapheme longer than 32 code points.');
        const copies = segment === '\t' ? 4-(row.length%4) : 1;
        if (row.length + copies > limits.maxDimension) throw Error('HTML has too many columns.');
        for (let i=0;i<copies;i++) {
          const cell = plainCell(segment === '\t' || !style.visible ? ' ' : segment,style);
          remember(cell); row.push(cell);
        }
      }
      width = Math.max(width,row.length,1);
      if (width * (rows.length+1) > limits.maxCells) throw Error('HTML has too many cells.');
      rows.push(row); rowText = ''; runs = [];
    }
    function appendText(value,style) {
      const text = value.replace(/\r\n?/g,'\n');
      let from = 0;
      while (from < text.length) {
        const end = text.indexOf('\n',from), stop = end < 0 ? text.length : end;
        if (rowText.length + stop-from > limits.maxDimension * MAX_GRAPHEME_CODE_POINTS * 2) throw Error('HTML row exceeds the grapheme budget.');
        if (stop > from) { rowText += text.slice(from,stop); runs.push({end:rowText.length,style}); }
        if (end < 0) break;
        flushRow(); from = end+1;
      }
    }
    function walk(node,parent,isArt=false) {
      if (node.nodeType === 3) { appendText(node.nodeValue,parent); return; }
      if (node.nodeType !== 1 || skippedTags.has(node.tagName.toUpperCase())) return;
      const style = isArt ? artStyle : computed(node,parent);
      if (node.hasAttribute('hidden') || style.display === 'none') return;
      if (node.tagName.toUpperCase() === 'BR') { flushRow(); return; }
      const block = !isArt && ['block','list-item','table-row','flow-root'].includes(style.display);
      if (block && rowText.length) flushRow();
      for (const child of node.childNodes) walk(child,style);
      if (block && rowText.length) flushRow();
    }
    if (!hiddenAncestor) walk(art,inherited,true);
    if (rowText.length) flushRow();
    if (!rows.length) throw Error('Artwork is empty.');
    const cells = [];
    for (const row of rows) {
      for (const cell of row) cells.push(cell);
      for (let i=row.length;i<width;i++) cells.push(plainCell(' ',artStyle));
    }
    if (!palette.has(' ')) remember(plainCell(' ',artStyle));
    if (unsupportedProperties.size) warn('Unsupported CSS properties were ignored: ' + Array.from(unsupportedProperties).sort().join(', ') + '.');
    return {format:'glyphpoint-v3',cols:width,rows:rows.length,cells,glyphPalette:Array.from(palette.values()),fieldBg,square:false,warnings:Array.from(warnings),importWarning:Array.from(warnings).join(' ')};
  }

  return Object.freeze({MAX_GRAPHEME_CODE_POINTS,iterateGraphemes,splitGraphemes,validGrapheme,normaliseColour,parseHtml});
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GPInterchange;
