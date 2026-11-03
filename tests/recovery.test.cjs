'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const moduleSource = fs.readFileSync(path.join(root, 'src/recovery.js'), 'utf8');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function error(name, message = name) { return Object.assign(new Error(message), { name }); }

class Clock {
  time = 1000;
  sequence = 0;
  timers = new Map();
  setTimeout = (fn, delay) => { const id = ++this.sequence; this.timers.set(id, { at: this.time + delay, fn }); return id; };
  clearTimeout = id => { this.timers.delete(id); };
  async advance(ms) {
    const until = this.time + ms;
    for (;;) {
      const due = [...this.timers.entries()].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      this.time = due[1].at;
      this.timers.delete(due[0]);
      due[1].fn();
      await Promise.resolve();
    }
    this.time = until;
    await Promise.resolve();
  }
}

function load(clock = new Clock()) {
  const context = vm.createContext({ TextEncoder, crypto: require('node:crypto').webcrypto, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  vm.runInContext(moduleSource + '\nglobalThis.Recovery = GPRecovery;', context, { filename: 'src/recovery.js' });
  return context.Recovery;
}

function memoryStore() {
  const records = new Map();
  return {
    records, writes: [], failure: null, gate: null, active: 0, maxActive: 0,
    async put(record) {
      this.active++;
      this.maxActive = Math.max(this.maxActive, this.active);
      this.writes.push(structuredClone(record));
      const gate = this.gate;
      this.gate = null;
      try {
        if (gate) await gate.promise;
        if (this.failure) throw this.failure;
        records.set(record.id, structuredClone(record));
        return { evicted: [] };
      } finally { this.active--; }
    },
    async list() { if (this.failure) throw this.failure; return [...records.values()]; },
    async get(id) { if (this.failure) throw this.failure; return records.get(id); },
    async remove(id) { if (this.failure) throw this.failure; records.delete(id); },
  };
}

function project(glyph = '#', format = 'glyphpoint-v3') { return { format, cols: 1, rows: 1, cells: [{ ch: glyph }] }; }

function validate(value) {
  if (!value || !['glyphpoint-v1', 'glyphpoint-v2', 'glyphpoint-v3'].includes(value.format)) throw new Error('Unsupported project');
  if (value.cols !== 1 || value.rows !== 1 || value.cells.length !== 1 || typeof value.cells[0].ch !== 'string') throw new Error('Invalid cells');
  return { cols: value.cols, rows: value.rows, cells: value.cells.map(cell => ({ ch: cell.ch })) };
}

function fixture(options = {}) {
  const clock = new Clock();
  const api = load(clock);
  const store = memoryStore();
  const state = { value: project(), name: 'art.json', revision: 1 };
  const statuses = [];
  let nextId = 0;
  const recovery = api.create({
    capture: () => state.value, validate, getName: () => state.name,
    report: status => statuses.push(status), store, now: () => clock.time, makeId: () => String(++nextId),
    ...options,
  });
  return { clock, api, store, state, statuses, recovery };
}

function saverFixture(options = {}) {
  const api = load();
  const state = { value: project(), name: 'art.json', revision: 7 };
  const downloads = [], statuses = [], events = [];
  const stream = {
    async write(text) { events.push(['write', JSON.parse(text)]); },
    async close() { events.push(['close']); },
    async abort() { events.push(['abort']); },
  };
  const handle = { name: 'chosen.json', async createWritable() { events.push(['open']); return stream; } };
  const saver = api.createFileSaver({
    capture: () => state.value, validate, getName: () => state.name, getRevision: () => state.revision,
    download: (text, type, name) => downloads.push({ text, type, name }),
    report: status => statuses.push(status),
    pickFile: async settings => { events.push(['picker', settings]); return handle; },
    ...options,
  });
  return { api, saver, state, downloads, statuses, events, handle, stream };
}

test('recovery module is embedded exactly in the maintained standalone application', () => {
  const shipped = fs.readFileSync(process.env.GLYPHPOINT_APP || path.join(root, 'GlyphPoint-v1a-layout-fixed.html'), 'utf8');
  assert.ok(shipped.includes(moduleSource.trim()), 'Run npm run build before testing: shipped recovery code differs from src/recovery.js');
});

test('pending checkpoints coalesce to the latest immutable project without overlapping writes', async () => {
  const { recovery, state, store } = fixture();
  const firstGate = deferred();
  store.gate = firstGate;
  recovery.touch();
  const first = recovery.flush();
  state.value.cells[0].ch = 'B';
  recovery.touch();
  const second = recovery.flush();
  state.value.cells[0].ch = 'C';
  recovery.touch();
  const third = recovery.flush();
  assert.equal(store.writes.length, 1);
  assert.equal(JSON.parse(store.writes[0].payload).cells[0].ch, '#');
  firstGate.resolve();
  await Promise.all([first, second, third]);
  assert.deepEqual(store.writes.map(record => JSON.parse(record.payload).cells[0].ch), ['#', 'C']);
  assert.equal(store.maxActive, 1);
  assert.equal(recovery.getStatus().state, 'saved');
  assert.equal(recovery.getStatus().pending, false);
  const [entry] = await recovery.list();
  assert.equal((await recovery.read(entry.id)).project.cells[0].ch, 'C');
  await recovery.dispose();
});

test('a changed document stays pending until its own checkpoint commits', async () => {
  const { recovery, state, store, statuses } = fixture();
  const firstGate = deferred();
  store.gate = firstGate;
  recovery.touch();
  const write = recovery.flush();
  state.value = project('newer');
  recovery.touch();
  firstGate.resolve();
  await write;
  assert.equal(recovery.getStatus().state, 'pending');
  assert.equal(statuses.some(status => status.state === 'saved'), false);
  await recovery.flush();
  assert.equal(recovery.getStatus().state, 'saved');
  await recovery.dispose();
});

test('flush captures the old document before synchronous replacement and new documents retain separate entries', async () => {
  const { recovery, state, store } = fixture();
  const gate = deferred();
  store.gate = gate;
  recovery.touch();
  const oldWrite = recovery.flush();
  state.value = project('👨‍👩‍👧‍👦');
  state.name = 'second.json';
  recovery.beginDocument();
  recovery.touch();
  const newWrite = recovery.flush();
  gate.resolve();
  await Promise.all([oldWrite, newWrite]);
  assert.equal(store.records.size, 2);
  const entries = await recovery.list();
  assert.equal(entries.filter(entry => entry.current).length, 1);
  assert.equal(new Set([...store.records.values()].map(entry => entry.id)).size, 2);
  assert.deepEqual([...store.records.values()].map(entry => [entry.name, JSON.parse(entry.payload).cells[0].ch]), [['art.json', '#'], ['second.json', '👨‍👩‍👧‍👦']]);
  await recovery.dispose();
});

test('independent sessions never share a document recovery key', async () => {
  const api = load();
  const store = memoryStore();
  const a = api.create({ capture: () => project('a'), validate, store });
  const b = api.create({ capture: () => project('b'), validate, store });
  a.touch(); b.touch();
  await Promise.all([a.flush(), b.flush()]);
  assert.equal(store.records.size, 2);
  assert.equal((await a.list()).filter(entry => entry.thisSession).length, 1);
  await Promise.all([a.dispose(), b.dispose()]);
});

test('blocked storage cannot accumulate unbounded document snapshots and retries the latest document when drained', async () => {
  const size = new TextEncoder().encode(JSON.stringify(project())).byteLength;
  const { recovery, state, store, statuses } = fixture({ maxBytes: size * 2, maxRecordBytes: size, maxDocuments: 2 });
  const gate = deferred(); store.gate = gate;
  recovery.touch(); const first = recovery.flush();
  recovery.beginDocument(); state.value = project('B'); recovery.touch(); const second = recovery.flush();
  recovery.beginDocument(); state.value = project('C'); recovery.touch(); const third = recovery.flush();
  assert.equal(store.writes.length, 1);
  assert.equal(statuses.at(-1).errorName, 'RecoveryBusyError');
  gate.resolve();
  await Promise.all([first, second, third]);
  assert.deepEqual(store.writes.map(record => JSON.parse(record.payload).cells[0].ch), ['#', 'B', 'C']);
  assert.equal(store.maxActive, 1);
  assert.equal(recovery.getStatus().state, 'saved');
  await recovery.dispose();
});

test('failure saving an outgoing document is visible after a new document has opened', async () => {
  const { recovery, store } = fixture();
  const gate = deferred(); store.gate = gate;
  recovery.touch(); const write = recovery.flush();
  recovery.beginDocument();
  gate.reject(error('QuotaExceededError'));
  await write;
  assert.equal(recovery.getStatus().state, 'error');
  assert.match(recovery.getStatus().message, /art\.json/);
  assert.match(recovery.getStatus().message, /may not be recoverable/);
  await recovery.dispose();
});

test('debounce avoids per-keystroke saves and max wait checkpoints continuous editing', async () => {
  const { recovery, clock, store } = fixture({ debounceMs: 100, maxWaitMs: 250 });
  recovery.touch();
  await clock.advance(90);
  recovery.touch();
  await clock.advance(90);
  recovery.touch();
  await clock.advance(69);
  assert.equal(store.writes.length, 0);
  await clock.advance(1);
  assert.equal(store.writes.length, 1);
  await recovery.flush();
  recovery.touch();
  await clock.advance(99);
  assert.equal(store.writes.length, 1);
  await clock.advance(1);
  assert.equal(store.writes.length, 2);
  await recovery.dispose();
  assert.equal(clock.timers.size, 0);
});

test('quota failures retain pending state and retry the same unsaved revision', async () => {
  const { recovery, store, statuses } = fixture();
  store.failure = error('QuotaExceededError');
  recovery.touch();
  const failed = await recovery.flush();
  assert.equal(failed.state, 'error');
  assert.equal(failed.pending, true);
  assert.match(failed.message, /storage is full/);
  assert.equal(store.records.size, 0);
  assert.equal(statuses.some(status => status.state === 'saved'), false);
  store.failure = null;
  await recovery.flush();
  assert.equal(recovery.getStatus().state, 'saved');
  assert.equal(store.records.size, 1);
  await recovery.dispose();
});

test('missing IndexedDB reports unavailable without reporting a saved checkpoint', async () => {
  const api = load();
  const recovery = api.create({ capture: () => project(), validate, indexedDB: null });
  recovery.touch();
  assert.equal((await recovery.flush()).state, 'unavailable');
  await assert.rejects(recovery.list(), { name: 'StorageUnavailableError' });
  assert.equal(recovery.getStatus().pending, true);
  await recovery.dispose();
});

test('recovering validates legacy and current project payloads through the caller without installing them', async () => {
  const { recovery, state } = fixture();
  for (const format of ['glyphpoint-v1', 'glyphpoint-v2', 'glyphpoint-v3']) {
    state.value = { ...project(format, format), ignored: '<script>malicious</script>' };
    recovery.beginDocument(); recovery.touch(); await recovery.flush();
    const entry = (await recovery.list()).find(item => item.current);
    const restored = await recovery.read(entry.id);
    assert.equal(restored.project.cells[0].ch, format);
    assert.equal(restored.project.ignored, undefined);
    assert.equal(state.value.ignored, '<script>malicious</script>');
  }
  await recovery.dispose();
});

test('corrupt, oversized, missing, and invalid recovery data fail without overwriting another checkpoint', async () => {
  const { recovery, store } = fixture({ maxRecordBytes: 250 });
  recovery.touch(); await recovery.flush();
  const [id, original] = [...store.records.entries()][0];
  for (const payload of ['{', JSON.stringify(project('#', 'unknown')), JSON.stringify({ ...project(), cols: 100 }), ' '.repeat(251)]) {
    store.records.set(id, { ...original, payload, bytes: new TextEncoder().encode(payload).byteLength });
    await assert.rejects(recovery.read(id));
    assert.equal(store.records.size, 1);
  }
  store.records.set(id, { ...original, bytes: 0 });
  await assert.rejects(recovery.read(id), { name: 'RecoveryDataError' });
  await assert.rejects(recovery.read('missing'), { name: 'RecoveryMissingError' });
  store.records.set(id, original);
  assert.equal((await recovery.read(id)).project.cells[0].ch, '#');
  await recovery.dispose();
});

test('retention budgets evict oldest entries, account for replacement, and reject an oversized incoming project', () => {
  const api = load();
  const records = [{ id: 'old', updatedAt: 1, bytes: 80 }, { id: 'middle', updatedAt: 2, bytes: 70 }, { id: 'new', updatedAt: 3, bytes: 50 }];
  const options = { maxDocuments: 3, maxBytes: 180, maxRecordBytes: 150 };
  assert.deepEqual(Array.from(api.planRetention(records, { id: 'incoming', bytes: 100 }, options)), ['old', 'middle']);
  assert.deepEqual(Array.from(api.planRetention(records, { id: 'middle', bytes: 40 }, options)), []);
  assert.throws(() => api.planRetention(records, { id: 'huge', bytes: 151 }, options), { name: 'RecoverySizeError' });
  assert.deepEqual(records.map(record => record.id), ['old', 'middle', 'new']);
});

test('deleting a checkpoint waits for an in-flight write and lifecycle flush does not recreate it without a new edit', async () => {
  const { recovery, store } = fixture();
  const gate = deferred();
  store.gate = gate;
  recovery.touch();
  const write = recovery.flush();
  const id = store.writes[0].id;
  const remove = recovery.remove(id);
  gate.resolve();
  await Promise.all([write, remove]);
  assert.equal(store.records.size, 0);
  await recovery.flush();
  assert.equal(store.records.size, 0);
  recovery.touch(); await recovery.flush();
  assert.equal(store.records.size, 1);
  await recovery.dispose();
});

test('edits made while deletion waits remain pending and create a new checkpoint', async () => {
  const { recovery, store, state } = fixture();
  recovery.touch(); await recovery.flush();
  const id = store.writes[0].id, deleting = deferred();
  store.remove = async key => { await deleting.promise; store.records.delete(key); };
  const removed = recovery.remove(id);
  state.value = project('B'); recovery.touch();
  deleting.resolve(); await removed;
  assert.equal(recovery.getStatus().pending, true, 'A later edit is not suppressed by the earlier deletion');
  await recovery.flush();
  assert.equal(JSON.parse(store.records.get(id).payload).cells[0].ch, 'B');
  assert.equal(recovery.getStatus().state, 'saved');
  await recovery.dispose();
});

test('deletion serializes with an in-flight save and preserves newer outgoing edits across document replacement', async () => {
  const { recovery, store, state } = fixture();
  const first = deferred(), deleting = deferred(), enteredDelete = deferred(), events = [];
  store.gate = first;
  const put = store.put.bind(store);
  store.put = async record => { events.push('write:' + JSON.parse(record.payload).cells[0].ch); return put(record); };
  store.remove = async id => { events.push('delete'); enteredDelete.resolve(); await deleting.promise; store.records.delete(id); };
  recovery.touch(); const before = recovery.flush(), id = store.writes[0].id;
  const removed = recovery.remove(id);
  first.resolve(); await enteredDelete.promise;
  state.value = project('B'); recovery.touch(); const latestOutgoing = recovery.flush();
  recovery.beginDocument(); state.value = project('C'); recovery.touch(); const nextDocument = recovery.flush();
  assert.deepEqual(events, ['write:#', 'delete'], 'Newer writes must wait until deletion commits');
  deleting.resolve(); await Promise.all([before, removed, latestOutgoing, nextDocument]);
  assert.deepEqual(events, ['write:#', 'delete', 'write:B', 'write:C']);
  assert.equal(JSON.parse(store.records.get(id).payload).cells[0].ch, 'B');
  assert.equal(store.records.size, 2);
  assert.equal(recovery.getStatus().state, 'saved');
  await recovery.dispose();
});

test('repeated deletion requests coalesce and explicitly include revisions edited before the later request', async () => {
  const { recovery, store, state } = fixture();
  recovery.touch(); await recovery.flush();
  const id = store.writes[0].id, deleting = deferred(); let deletes = 0;
  store.remove = async key => { deletes++; await deleting.promise; store.records.delete(key); };
  const first = recovery.remove(id);
  state.value = project('B'); recovery.touch(); const writing = recovery.flush();
  const again = Array.from({ length: 30 }, () => recovery.remove(id));
  deleting.resolve(); await Promise.all([first, writing, ...again]);
  assert.equal(deletes, 1);
  assert.equal(store.records.size, 0, 'The second delete deliberately includes the intervening edit');
  await recovery.flush();
  assert.equal(store.records.size, 0);
  state.value = project('C'); recovery.touch(); await recovery.flush();
  assert.equal(JSON.parse(store.records.get(id).payload).cells[0].ch, 'C');
  await recovery.dispose();
});

test('a failed checkpoint deletion does not suppress an unsaved revision', async () => {
  const { recovery, store, state } = fixture();
  recovery.touch(); await recovery.flush();
  const id = store.writes[0].id;
  state.value = project('B'); recovery.touch();
  store.remove = async () => { throw error('QuotaExceededError'); };
  await assert.rejects(recovery.remove(id), { name: 'QuotaExceededError' });
  assert.equal(recovery.getStatus().pending, true);
  assert.equal(JSON.parse(store.records.get(id).payload).cells[0].ch, '#');
  await recovery.flush();
  assert.equal(JSON.parse(store.records.get(id).payload).cells[0].ch, 'B');
  await recovery.dispose();
});

test('hidden and pagehide lifecycle events checkpoint changes and detach cleanly', async () => {
  const { recovery, store } = fixture();
  const windowEvents = new Map(), documentEvents = new Map();
  const target = events => ({ addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) });
  const win = target(windowEvents), doc = { ...target(documentEvents), visibilityState: 'visible' };
  recovery.attachLifecycle(win, doc);
  recovery.touch();
  documentEvents.get('visibilitychange')();
  assert.equal(store.writes.length, 0);
  doc.visibilityState = 'hidden'; documentEvents.get('visibilitychange')();
  await recovery.flush();
  assert.equal(store.writes.length, 1);
  recovery.touch(); windowEvents.get('pagehide')();
  await recovery.flush();
  assert.equal(store.writes.length, 2);
  await recovery.dispose();
  assert.equal(windowEvents.size + documentEvents.size, 0);
});

test('a throwing UI reporter does not interrupt recovery persistence', async () => {
  const { recovery, store } = fixture({ report: () => { throw new Error('UI failed'); } });
  recovery.touch(); await recovery.flush();
  assert.equal(store.records.size, 1);
  await recovery.dispose();
});

test('download fallback reports only a request, preserves revision information, and sanitizes filenames', async () => {
  const { saver, state, downloads, statuses, events } = saverFixture({ pickFile: null });
  state.name = '../my:art.html';
  const result = await saver.save();
  assert.equal(result.kind, 'downloaded');
  assert.equal(result.revision, 7);
  assert.equal(downloads[0].name, '.._my_art.json');
  assert.equal(downloads[0].type, 'application/json');
  assert.match(statuses.at(-1).message, /cannot verify completion/);
  assert.equal(statuses.some(status => status.state === 'saved'), false);
  assert.equal(events.length, 0);
  assert.equal(saver.capabilities().direct, false);
});

test('direct save invokes picker synchronously, waits for close, refuses overlap, and reuses its document handle', async () => {
  const { saver, events, stream, statuses } = saverFixture();
  const closing = deferred();
  stream.close = async () => { events.push(['close']); await closing.promise; };
  const first = saver.save();
  assert.equal(events[0][0], 'picker', 'picker must run inside the original user gesture');
  assert.equal((await saver.save()).kind, 'busy');
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(statuses.some(status => status.state === 'saved'), false);
  closing.resolve();
  const result = await first;
  assert.equal(result.kind, 'saved');
  assert.equal(result.current, true);
  assert.equal(result.name, 'chosen.json');
  assert.equal(saver.isCurrentDocument(result), true);
  assert.deepEqual(events.map(event => event[0]), ['picker', 'open', 'write', 'close']);
  await saver.save();
  assert.equal(events.filter(event => event[0] === 'picker').length, 1);
  await saver.save({ saveAs: true });
  assert.equal(events.filter(event => event[0] === 'picker').length, 2);
  assert.equal(saver.capabilities().hasHandle, true);
  saver.reset();
  assert.equal(saver.capabilities().hasHandle, false);
  assert.equal(saver.isCurrentDocument(result), false, 'A result cannot rename a later document after its awaiting caller resumes');
});

test('editing while a direct file save is pending never claims that newer edits were saved', async () => {
  const { saver, state, stream, statuses, events } = saverFixture();
  const closing = deferred();
  stream.close = () => closing.promise;
  const save = saver.save();
  state.revision++;
  state.value.cells[0].ch = 'changed';
  closing.resolve();
  const result = await save;
  assert.equal(result.kind, 'saved');
  assert.equal(result.current, false);
  assert.equal(events.find(event => event[0] === 'write')[1].cells[0].ch, '#');
  assert.match(statuses.at(-1).message, /newer edits remain unsaved/);
});

test('switching documents while the picker is open cancels writing the old snapshot', async () => {
  const choosing = deferred();
  const { saver, handle, events } = saverFixture({ pickFile: () => choosing.promise });
  const save = saver.save();
  saver.reset();
  choosing.resolve(handle);
  const result = await save;
  assert.equal(result.kind, 'cancelled');
  assert.equal(result.current, false);
  assert.equal(events.length, 0);
  assert.equal(saver.capabilities().hasHandle, false);
});

test('picker cancellation does not trigger a download or report file success', async () => {
  const { saver, statuses, downloads } = saverFixture({ pickFile: () => Promise.reject(error('AbortError')) });
  assert.equal((await saver.save()).kind, 'cancelled');
  assert.equal(downloads.length, 0);
  assert.equal(statuses.at(-1).state, 'cancelled');
  assert.equal(saver.capabilities().hasHandle, false);
});

test('a close failure or interrupted write aborts cleanup and cannot claim a successful save', async () => {
  for (const name of ['QuotaExceededError', 'AbortError']) {
    const { saver, stream, statuses, downloads, events } = saverFixture();
    stream.close = () => Promise.reject(error(name));
    const result = await saver.save();
    assert.equal(result.kind, 'error');
    assert.equal(statuses.at(-1).state, 'error');
    assert.equal(statuses.some(status => status.state === 'saved'), false);
    assert.equal(downloads.length, 0);
    assert.equal(events.at(-1)[0], 'abort');
    assert.equal(saver.capabilities().hasHandle, false);
  }
});

test('explicit download remains available when direct file saving exists', async () => {
  const { saver, downloads, events } = saverFixture();
  assert.equal((await saver.save({ download: true })).kind, 'downloaded');
  assert.equal(downloads.length, 1);
  assert.equal(events.length, 0);
});

test('invalid or oversized projects never reach the file picker or download', async () => {
  const { saver, state, events, downloads } = saverFixture({ maxFileBytes: 100 });
  state.value = project('x'.repeat(100));
  assert.equal((await saver.save()).kind, 'error');
  state.value = project('#', 'invalid');
  assert.equal((await saver.save()).kind, 'error');
  assert.equal(events.length + downloads.length, 0);
});

test('compact JSON preserves projects that fit the import budget without pretty-print whitespace', async () => {
  const value = project('🧑🏽‍🚀');
  const compactBytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const { saver, state, downloads } = saverFixture({ maxFileBytes: compactBytes, pickFile: null });
  state.value = value;
  assert.equal((await saver.save()).kind, 'downloaded');
  assert.equal(new TextEncoder().encode(downloads[0].text).byteLength, compactBytes);
  assert.deepEqual(JSON.parse(downloads[0].text), value);
});
