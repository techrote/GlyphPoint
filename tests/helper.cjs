'use strict';

// Execute the actual standalone application's data operations without starting
// its UI. Browser integration is checked separately; these stubs do not model
// layout, pointer capture, dialogs, or browser clipboard permissions.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class ElementStub {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.childNodes = this.children;
    this.parentElement = null;
    this.style = {};
    this.dataset = {};
    this.attributes = new Map();
    this.value = '';
    this.checked = false;
    this.hidden = false;
    this.open = false;
    this.disabled = false;
    this.textContent = '';
    this.innerHTML = '';
    this.offsetWidth = 800;
    this.offsetHeight = 800;
    this.clientWidth = 800;
    this.clientHeight = 800;
    this.scrollHeight = 800;
    const classes = new Set();
    this.classList = {
      add: (...items) => items.forEach(item => classes.add(item)),
      remove: (...items) => items.forEach(item => classes.delete(item)),
      contains: item => classes.has(item),
      toggle: (item, force) => {
        const enabled = force === undefined ? !classes.has(item) : !!force;
        if (enabled) classes.add(item); else classes.delete(item);
        return enabled;
      },
    };
  }
  appendChild(child) {
    if (child.tagName === '#FRAGMENT') {
      child.children.forEach(item => this.appendChild(item));
    } else {
      this.children.push(child);
      child.parentElement = this;
    }
    return child;
  }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  get innerHTML() { return this._innerHTML || ''; }
  set innerHTML(value) {
    this._innerHTML = String(value);
    this.children.length = 0;
  }
  replaceChildren(...children) {
    this.children.length = 0;
    this.append(...children);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener() {}
  removeEventListener() {}
  click() {}
  focus() {}
  select() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
  remove() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 800, bottom: 800, width: 800, height: 800 };
  }
  matches(selector) {
    return selector.split(',').some(part => {
      const s = part.trim();
      if (s.startsWith('#')) return s.slice(1) === this.id;
      if (s === 'dialog[open]') return this.tagName === 'DIALOG' && this.open;
      if (s.startsWith('[contenteditable')) return !!this.isContentEditable;
      if (s.startsWith('.')) return this.classList.contains(s.slice(1));
      return s.toUpperCase() === this.tagName;
    });
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (node.matches(selector)) return node;
    }
    return null;
  }
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) {
      if (child.matches(selector)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function createEditor(options = {}) {
  const elements = new Map();
  const tags = {
    textValue: 'textarea', textFont: 'select', textScale: 'select', textBg: 'select',
    resizeUnit: 'select', selectMode: 'select', gcmSort: 'select',
    textDialog: 'dialog', resizeDialog: 'dialog', propertiesDialog: 'dialog',
    paletteDialog: 'dialog', glyphColourManagerDialog: 'dialog', helpDialog: 'dialog',
    paletteGlyphInput: 'input', paletteColourInput: 'input', fieldBgInput: 'input',
    propW: 'input', propH: 'input', propBg: 'input', resizeW: 'input', resizeH: 'input',
    skewX: 'input', skewY: 'input', keepAspect: 'input', transparentSelect: 'input',
    transparentRibbon: 'input', gcmSearch: 'input',
  };
  const element = (id, tagName = tags[id] || 'div') => {
    if (!elements.has(id)) {
      const el = new ElementStub(tagName);
      el.id = id;
      elements.set(id, el);
    }
    return elements.get(id);
  };
  const downloads = [], alerts = [], confirmations = [], storage = new Map();
  const clipboard = {
    text: '',
    async writeText(text) { this.text = text; },
    async readText() { return this.text; },
    ...options.clipboard,
  };
  const document = {
    body: new ElementStub('body'),
    documentElement: new ElementStub('html'),
    activeElement: null,
    querySelector(selector) {
      if (/^#[\w-]+$/.test(selector)) return element(selector.slice(1));
      if (selector === '.ribbonwrap') return element('ribbonwrap');
      if (selector === 'dialog[open]') {
        return [...elements.values()].find(el => el.matches(selector)) || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      return [...elements.values()].filter(el => el.matches(selector));
    },
    createElement: tagName => new ElementStub(tagName),
    createDocumentFragment: () => new ElementStub('#fragment'),
    createTextNode: text => ({ nodeType: 3, nodeValue: text, textContent: text }),
    addEventListener() {},
    removeEventListener() {},
  };
  const sandbox = {
    console, document, navigator: { clipboard },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    Blob, URL, TextEncoder, TextDecoder, AbortController,
    setTimeout, clearTimeout,
    requestAnimationFrame: callback => callback(),
    cancelAnimationFrame() {},
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1280, innerHeight: 900,
    alert: message => alerts.push(String(message)),
    confirm: message => {
      confirmations.push(String(message));
      return options.confirmResult ?? true;
    },
    print() {},
    __captureDownload: (data, type, name) => downloads.push({ data, type, name }),
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  const filename = options.filename || process.env.GLYPHPOINT_APP || path.join(__dirname, '..', 'GlyphPoint-v1a-layout-fixed.html');
  const html = fs.readFileSync(filename, 'utf8');
  const match = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error(`No inline application script in ${filename}`);
  const script = match[1].replace(/\binit\(\);\s*$/, '');
  vm.runInContext(script, context, { filename });
  const run = source => vm.runInContext(source, context, { timeout: 10000 });
  // Keep rebuildGrid and all model operations real; only skip visual painting
  // and capture downloaded bytes instead of invoking a browser download.
  run(`
    renderAll = function() {};
    renderCellIndex = function() {};
    renderSelection = function() {};
    renderPreview = function() {};
    renderRulers = function() {};
    buildGlyphPalette = function() {};
    updateGlyphSlots = function() {};
    buildGlyphColourPanel = function() {};
    renderGlyphColourManager = function() {};
    updateClassicOverflow = function() {};
    downloadBlob = function(data, type, name) { __captureDownload(data, type, name); };
  `);
  element('resizeUnit').value = 'pixels';
  element('textScale').value = '1';
  element('textFont').value = 'Cascadia Mono';
  element('textBg').value = 'transparent';
  element('selectMode').value = 'rect';
  element('gcmSort').value = 'order';
  element('fieldBgInput').value = '#000000';
  element('skewX').value = '0';
  element('skewY').value = '0';
  return {
    context, run, state: run('state'), element, elements, document,
    downloads, alerts, confirmations, clipboard, storage,
  };
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

module.exports = { createEditor, ElementStub, plain };
