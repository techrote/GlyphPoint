'use strict';

// Browser storage semantics are exercised using the exact bundled recovery
// module, in an offline file URL. Editor/UI integration lives in browser.cjs.
// Usage: node tests/recovery.browser.cjs [chromium|firefox|webkit ...]
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const playwright = require('playwright');

async function installHelpers(page) {
  await page.evaluate(() => {
    window.testProject = glyph => ({ format: 'glyphpoint-v3', cols: 1, rows: 1, cells: [{ ch: glyph }] });
    window.testValidate = value => {
      if (value.format !== 'glyphpoint-v3' || value.cols !== 1 || value.rows !== 1 || !Array.isArray(value.cells) || value.cells.length !== 1) throw new Error('Invalid fixture project');
      return { cols: 1, rows: 1, cells: [{ ch: value.cells[0].ch }] };
    };
    window.testRecord = (id, glyph, updatedAt = 1, sequence = 1) => {
      const payload = JSON.stringify(testProject(glyph));
      return { format: 'glyphpoint-recovery-v1', id, sessionId: 'fixture', documentId: id, name: id + '.json', updatedAt, sequence, payload, bytes: new TextEncoder().encode(payload).byteLength, cols: 1, rows: 1 };
    };
  });
}

async function run(browserName, fixtureURL) {
  assert.ok(['chromium', 'firefox', 'webkit'].includes(browserName), 'Unknown browser');
  const browser = await playwright[browserName].launch({ headless: true, timeout: 30000 });
  let completed = 0;
  async function scenario(name, check) {
    const context = await browser.newContext();
    const failures = [], requests = [];
    context.on('page', page => page.on('pageerror', err => failures.push(err.message)));
    await context.route(/^https?:/, route => { requests.push(route.request().url()); return route.abort(); });
    const page = await context.newPage();
    try {
      await page.goto(fixtureURL);
      await installHelpers(page);
      await check(page, context);
      assert.deepEqual(failures, [], 'No uncaught errors');
      assert.deepEqual(requests, [], 'Recovery does not use the network');
      completed++;
      console.log(`PASS ${browserName}: ${name}`);
    } finally { await context.close(); }
  }
  try {
    await scenario('IndexedDB checkpoint survives reload and requires explicit validated reading', async page => {
      const id = await page.evaluate(async () => {
        window.currentProject = testProject('👩🏽‍🚀');
        window.recovery = GPRecovery.create({ database: 'persist', capture: () => currentProject, validate: testValidate, getName: () => 'art.json' });
        recovery.touch();
        const status = await recovery.flush();
        if (status.state !== 'saved') throw new Error(status.message);
        return (await recovery.list())[0].id;
      });
      await page.reload();
      await installHelpers(page);
      const result = await page.evaluate(async id => {
        window.currentProject = testProject('blank');
        window.recovery = GPRecovery.create({ database: 'persist', capture: () => currentProject, validate: testValidate });
        const entries = await recovery.list();
        const before = currentProject.cells[0].ch;
        const candidate = await recovery.read(id);
        return { entries, before, after: currentProject.cells[0].ch, recovered: candidate.project.cells[0].ch, state: recovery.getStatus().state };
      }, id);
      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].name, 'art.json');
      assert.equal(result.entries[0].current, false);
      assert.equal(result.before, 'blank');
      assert.equal(result.after, 'blank');
      assert.equal(result.recovered, '👩🏽‍🚀');
      assert.equal(result.state, 'idle');
    });

    await scenario('two tabs write distinct recoverable documents into the same archive', async (page, context) => {
      const second = await context.newPage();
      await second.goto(fixtureURL);
      await installHelpers(second);
      const write = (tab, glyph) => tab.evaluate(async glyph => {
        window.recovery = GPRecovery.create({ database: 'tabs', capture: () => testProject(glyph), validate: testValidate, getName: () => glyph + '.json' });
        recovery.touch(); await recovery.flush();
        return recovery.getStatus();
      }, glyph);
      const statuses = await Promise.all([write(page, 'first'), write(second, 'second')]);
      assert.ok(statuses.every(status => status.state === 'saved'));
      assert.notEqual(statuses[0].documentId, statuses[1].documentId);
      for (const tab of [page, second]) {
        const result = await tab.evaluate(async () => {
          const entries = await recovery.list();
          return { entries, values: await Promise.all(entries.map(async entry => (await recovery.read(entry.id)).project.cells[0].ch)) };
        });
        assert.equal(result.entries.length, 2);
        assert.equal(result.entries.filter(entry => entry.thisSession).length, 1);
        assert.deepEqual(result.values.sort(), ['first', 'second']);
      }
    });

    await scenario('count and UTF-8 payload budgets prune atomically and keep the newest document', async page => {
      const result = await page.evaluate(async () => {
        const size = testRecord('one', '#').bytes;
        const store = GPRecovery.createIndexedDBStore({ database: 'budgets', maxDocuments: 2, maxBytes: size * 2, maxRecordBytes: size * 2 });
        await store.put(testRecord('one', '#', 1));
        await store.put(testRecord('two', '#', 2));
        const third = await store.put(testRecord('three', '#', 3));
        const afterCount = await store.list();
        const larger = await store.put(testRecord('four', '😀', 4));
        const afterBytes = await store.list();
        const missing = await store.get('one');
        store.close();
        return { afterCount, afterBytes, third, larger, missing: missing || null };
      });
      assert.deepEqual(result.afterCount.map(entry => entry.id).sort(), ['three', 'two']);
      assert.deepEqual(result.third.evicted, ['one']);
      assert.deepEqual(result.afterBytes.map(entry => entry.id), ['four']);
      assert.deepEqual(result.larger.evicted, ['two', 'three']);
      assert.equal(result.missing, null);
    });

    await scenario('failed IDB write rolls back eviction and stale writes cannot replace a newer checkpoint', async page => {
      const result = await page.evaluate(async () => {
        const store = GPRecovery.createIndexedDBStore({ database: 'atomic', maxDocuments: 1 });
        await store.put(testRecord('good', 'retained', 1, 2));
        const broken = testRecord('bad', 'new', 2);
        broken.nonCloneable = () => {};
        let writeError, staleError;
        try { await store.put(broken); } catch (err) { writeError = err.name; }
        try { await store.put(testRecord('good', 'stale', 3, 1)); } catch (err) { staleError = err.name; }
        const entries = await store.list();
        const retained = await store.get('good');
        store.close();
        return { writeError, staleError, entries, retained: JSON.parse(retained.payload).cells[0].ch };
      });
      assert.equal(result.writeError, 'DataCloneError');
      assert.equal(result.staleError, 'StaleSnapshotError');
      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].id, 'good');
      assert.equal(result.retained, 'retained');
    });

    await scenario('damaged stored projects fail validation and can be explicitly deleted', async page => {
      const result = await page.evaluate(async () => {
        const store = GPRecovery.createIndexedDBStore({ database: 'damaged' });
        const invalid = testRecord('bad', '#');
        invalid.payload = JSON.stringify({ format: 'glyphpoint-v3', cols: 1000000, rows: 1000000, cells: [] });
        invalid.bytes = new TextEncoder().encode(invalid.payload).byteLength;
        await store.put(invalid);
        window.currentProject = testProject('unchanged');
        const recovery = GPRecovery.create({ store, capture: () => currentProject, validate: testValidate });
        let readError;
        try { await recovery.read('bad'); } catch (err) { readError = err.message; }
        const status = recovery.getStatus();
        await recovery.remove('bad');
        const remaining = await recovery.list();
        await recovery.dispose();
        return { readError, status, remaining, current: currentProject.cells[0].ch };
      });
      assert.match(result.readError, /Invalid fixture project/);
      assert.equal(result.status.state, 'error');
      assert.equal(result.current, 'unchanged');
      assert.deepEqual(result.remaining, []);
    });
    console.log(`${browserName}: ${completed} recovery browser scenarios passed`);
  } finally { await browser.close(); }
}

(async () => {
  const root = path.resolve(__dirname, '..');
  const [moduleSource, shipped] = await Promise.all([
    fs.readFile(path.join(root, 'src/recovery.js'), 'utf8'),
    fs.readFile(process.env.GLYPHPOINT_APP || path.join(root, 'GlyphPoint-RC.html'), 'utf8'),
  ]);
  const start = shipped.indexOf(moduleSource.trim());
  assert.ok(start >= 0, 'Run npm run build: shipped recovery module differs from src/recovery.js');
  const bundledModule = shipped.slice(start, start + moduleSource.trim().length);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'glyphpoint-recovery-'));
  try {
    const fixture = path.join(temporary, 'offline.html');
    await fs.writeFile(fixture, '<!doctype html><meta charset="utf-8"><title>Offline recovery test</title><script>' + bundledModule + '</script>');
    const requested = process.argv.slice(2);
    for (const name of requested.length ? requested : ['chromium', 'firefox']) await run(name, pathToFileURL(fixture).href);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
