/* Offline recovery and explicit file saves. Bundled into the standalone editor. */
const GPRecovery = (() => {
  'use strict';

  const DEFAULTS = Object.freeze({
    database: 'glyphpoint.recovery.v1',
    debounceMs: 750,
    maxWaitMs: 5000,
    maxDocuments: 12,
    maxBytes: 32 * 1024 * 1024,
    maxRecordBytes: 16 * 1024 * 1024,
  });

  function failure(name, message) {
    const error = new Error(message);
    error.name = name;
    return error;
  }

  function byteLength(value) {
    return new TextEncoder().encode(value).byteLength;
  }

  function positiveInteger(value, fallback) {
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }

  function limitsFor(options = {}) {
    return {
      maxDocuments: positiveInteger(options.maxDocuments, DEFAULTS.maxDocuments),
      maxBytes: positiveInteger(options.maxBytes, DEFAULTS.maxBytes),
      maxRecordBytes: positiveInteger(options.maxRecordBytes, DEFAULTS.maxRecordBytes),
    };
  }

  function identifier() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      return Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('');
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
  }

  function documentName(value) {
    return String(value || 'untitled').slice(0, 180);
  }

  function metadata(record) {
    const { id, sessionId, documentId, name, updatedAt, sequence, bytes, cols, rows } = record;
    return { id, sessionId, documentId, name, updatedAt, sequence, bytes, cols, rows };
  }

  // Payload-byte and document-count budgets apply in the same IDB transaction as
  // the new checkpoint. Browser disk accounting can differ; quota errors still
  // abort the entire transaction, including any eviction.
  function planRetention(records, incoming, options = {}) {
    const limits = limitsFor(options);
    if (!Number.isSafeInteger(incoming.bytes) || incoming.bytes < 0 || incoming.bytes > limits.maxRecordBytes || incoming.bytes > limits.maxBytes) {
      throw failure('RecoverySizeError', 'This project is too large for the recovery archive. Save a project file.');
    }
    const older = records.filter(record => record.id !== incoming.id).sort((a, b) => {
      const first = Number.isFinite(a.updatedAt) ? a.updatedAt : 0;
      const second = Number.isFinite(b.updatedAt) ? b.updatedAt : 0;
      return first - second || String(a.id).localeCompare(String(b.id));
    });
    let total = incoming.bytes + older.reduce((sum, record) => sum + (Number.isSafeInteger(record.bytes) && record.bytes >= 0 ? record.bytes : limits.maxBytes), 0);
    let count = older.length + 1;
    const evicted = [];
    for (const record of older) {
      if (count <= limits.maxDocuments && total <= limits.maxBytes) break;
      evicted.push(record.id);
      total -= Number.isSafeInteger(record.bytes) && record.bytes >= 0 ? record.bytes : limits.maxBytes;
      count--;
    }
    return evicted;
  }

  function createIndexedDBStore(options = {}) {
    const indexedDB = options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB;
    const limits = limitsFor(options);
    let database = null;
    let opening = null;

    function connect() {
      if (database) return Promise.resolve(database);
      if (opening) return opening;
      if (!indexedDB || typeof indexedDB.open !== 'function') {
        return Promise.reject(failure('StorageUnavailableError', 'This browser does not provide recovery storage in this context.'));
      }
      opening = new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        const finish = (error, db) => {
          if (settled) { if (db) db.close(); return; }
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else {
            database = db;
            db.onversionchange = () => { db.close(); if (database === db) database = null; };
            resolve(db);
          }
        };
        let request;
        try { request = indexedDB.open(options.database || DEFAULTS.database, 1); }
        catch (error) { finish(error); return; }
        timer = setTimeout(() => finish(failure('StorageBlockedError', 'Recovery storage did not open. Close other copies of this editor and retry.')), positiveInteger(options.openTimeoutMs, 10000));
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('summaries')) db.createObjectStore('summaries', { keyPath: 'id' });
        };
        request.onblocked = () => finish(failure('StorageBlockedError', 'Another tab is blocking recovery storage. Close old copies of this editor and retry.'));
        request.onerror = () => finish(request.error || failure('StorageUnavailableError', 'Recovery storage could not be opened.'));
        request.onsuccess = () => finish(null, request.result);
      }).finally(() => { opening = null; });
      return opening;
    }

    async function transaction(mode, operate) {
      const db = await connect();
      return new Promise((resolve, reject) => {
        let tx;
        try {
          // Older engines ignore/omit transaction durability options.
          try { tx = db.transaction(['documents', 'summaries'], mode, mode === 'readwrite' ? { durability: 'strict' } : undefined); }
          catch (error) {
            if (error.name !== 'TypeError') throw error;
            tx = db.transaction(['documents', 'summaries'], mode);
          }
        } catch (error) { reject(error); return; }
        let result;
        let operationError;
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(operationError || tx.error || failure('AbortError', 'The recovery storage transaction was interrupted.'));
        tx.onerror = () => { /* onabort is authoritative; request success is not commit. */ };
        const abort = error => { operationError = error; try { tx.abort(); } catch (_) { reject(error); } };
        try { operate(tx, value => { result = value; }, abort); }
        catch (error) { abort(error); }
      });
    }

    return {
      async put(record) {
        if (!record || typeof record.id !== 'string' || typeof record.payload !== 'string' || record.bytes !== byteLength(record.payload)) {
          throw failure('RecoveryDataError', 'The recovery checkpoint is invalid.');
        }
        planRetention([], record, limits);
        return transaction('readwrite', (tx, complete, abort) => {
          const summaries = tx.objectStore('summaries');
          const documents = tx.objectStore('documents');
          const request = summaries.getAll();
          request.onsuccess = () => {
            try {
              const existing = request.result.find(item => item.id === record.id);
              if (existing && existing.sequence > record.sequence) throw failure('StaleSnapshotError', 'A newer recovery checkpoint already exists.');
              const evicted = planRetention(request.result, record, limits);
              for (const id of evicted) { documents.delete(id); summaries.delete(id); }
              documents.put(record);
              summaries.put(metadata(record));
              complete({ evicted });
            } catch (error) { abort(error); }
          };
        });
      },
      list() {
        return transaction('readonly', (tx, complete) => {
          const request = tx.objectStore('summaries').getAll();
          request.onsuccess = () => complete(request.result);
        });
      },
      get(id) {
        return transaction('readonly', (tx, complete) => {
          const request = tx.objectStore('documents').get(id);
          request.onsuccess = () => complete(request.result);
        });
      },
      remove(id) {
        return transaction('readwrite', tx => {
          tx.objectStore('documents').delete(id);
          tx.objectStore('summaries').delete(id);
        });
      },
      close() { if (database) database.close(); database = null; },
    };
  }

  function create(options) {
    if (!options || typeof options.capture !== 'function' || typeof options.validate !== 'function') {
      throw new TypeError('Recovery requires capture and validate functions.');
    }
    const limits = limitsFor(options);
    const store = options.store || createIndexedDBStore(options);
    const now = options.now || Date.now;
    const makeId = options.makeId || identifier;
    const sessionId = makeId();
    const pending = new Map();
    const removals = new Map();
    let current;
    let debounceTimer = null;
    let maxTimer = null;
    let running = null;
    let writing = null;
    let retryContext = null;
    let disposed = false;
    let detach = () => {};
    let status = { state: 'idle', message: 'Recovery starts after your first edit.', available: null, pending: false, savedAt: null };

    function report(state, message, extra = {}) {
      status = { ...status, state, message, pending: current.sequence > current.savedSequence, documentId: current.id, ...extra };
      if (typeof options.report === 'function') {
        try { options.report({ ...status }); } catch (_) { /* UI reporting must not prevent saving. */ }
      }
      return { ...status };
    }

    function reportError(error, operation = 'write') {
      const unavailable = ['StorageUnavailableError', 'SecurityError', 'InvalidStateError', 'StorageBlockedError'].includes(error.name);
      const message = error.name === 'QuotaExceededError'
        ? 'Recovery storage is full. Save a project file, then delete older recovery entries or free browser storage.'
        : operation === 'read'
          ? 'Could not read recovery storage. ' + error.message
          : 'Recovery checkpoint failed. Save a project file. ' + error.message;
      return report(unavailable ? 'unavailable' : 'error', message, { available: unavailable ? false : status.available, errorName: error.name });
    }

    function clearTimers() {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      if (maxTimer !== null) clearTimeout(maxTimer);
      debounceTimer = maxTimer = null;
    }

    function pump() {
      if (running) return running;
      running = (async () => {
        while (pending.size) {
          const [id, job] = pending.entries().next().value;
          pending.delete(id);
          if (job.remove) {
            try {
              await store.remove(job.id);
              if (job.context) {
                // Only the revision that the user chose to delete is suppressed.
                // Newer writes are queued after this deletion in the same pump.
                job.context.savedSequence = Math.max(job.context.savedSequence, job.sequence);
                if (job.context === current && removals.get(job.id) === job) {
                  report(current.sequence > job.sequence ? 'pending' : 'idle', current.sequence > job.sequence
                    ? 'Changes made after the deletion request are waiting for a recovery checkpoint.'
                    : 'Recovery checkpoint deleted. Your next edit will create a new checkpoint.', { savedAt: null });
                }
              }
              job.resolve();
            } catch (error) { job.reject(error); }
            finally { if (removals.get(job.id) === job) removals.delete(job.id); }
            continue;
          }
          writing = job;
          if (job.context === current && !removals.has(job.record.id)) report('saving', 'Saving recovery checkpoint…');
          try {
            const result = await store.put(job.record);
            job.context.savedSequence = job.record.sequence;
            job.context.savedAt = job.record.updatedAt;
            if (job.context === current && !removals.has(job.record.id)) {
              const changed = current.sequence !== job.record.sequence;
              report(changed ? 'pending' : 'saved', changed ? 'Changes are waiting for a recovery checkpoint.' : 'Recovery checkpoint saved in this browser.', {
                available: true, savedAt: job.record.updatedAt, errorName: null, evicted: result && Array.isArray(result.evicted) ? result.evicted.length : 0,
              });
            }
          } catch (error) {
            if (job.context === current) reportError(error);
            else {
              const failed = reportError(error);
              report(failed.state, 'Recovery checkpoint for “' + job.record.name + '” failed. Its latest changes may not be recoverable. ' + error.message, {
                affectedDocumentId: job.record.id,
              });
            }
          } finally {
            if (job.context.queuedSequence === job.record.sequence) job.context.queuedSequence = 0;
            writing = null;
          }
        }
      })().finally(() => {
        running = null;
        // A flush may enqueue work between the loop finishing and this promise
        // reaction. Keep its caller waiting until that work has drained too.
        if (pending.size) return pump();
        if (!disposed && retryContext === current) { retryContext = null; return flush(); }
      });
      return running;
    }

    function flush() {
      clearTimers();
      if (disposed) return Promise.resolve({ ...status });
      const context = current;
      if (context.sequence > context.savedSequence && context.sequence !== context.queuedSequence && context.sequence > (removals.get(context.id)?.sequence ?? -1)) {
        try {
          // Capture and stringify before yielding: a synchronous New/Open caller
          // can flush, replace state, then beginDocument without changing this job.
          const project = options.capture();
          options.validate(project);
          const payload = JSON.stringify(project);
          if (typeof payload !== 'string') throw failure('RecoveryDataError', 'The current project cannot be serialized.');
          const record = {
            format: 'glyphpoint-recovery-v1', id: context.id, sessionId, documentId: context.documentId,
            name: documentName(options.getName ? options.getName() : 'untitled'),
            updatedAt: now(), sequence: context.sequence, bytes: byteLength(payload), payload,
            cols: project.cols, rows: project.rows,
          };
          planRetention([], record, limits);
          // A blocked storage transaction must not let rapid Open/New operations
          // accumulate unbounded detached JSON snapshots in memory. Keep only a
          // retry marker for the current document when this bounded queue is full.
          const queuedIds = new Set([record.id]);
          let queuedBytes = record.bytes;
          if (writing) { queuedIds.add(writing.record.id); queuedBytes += writing.record.bytes; }
          for (const [id, job] of pending) if (!job.remove && id !== record.id) { queuedIds.add(id); queuedBytes += job.record.bytes; }
          if (queuedIds.size > limits.maxDocuments || queuedBytes > limits.maxBytes) {
            retryContext = context;
            throw failure('RecoveryBusyError', 'Recovery storage is still busy. The current document will retry when queued writes finish.');
          }
          context.queuedSequence = context.sequence;
          pending.set(context.id, { context, record });
        } catch (error) {
          reportError(error);
          return error.name === 'RecoveryBusyError' && running ? running.then(() => ({ ...status })) : Promise.resolve({ ...status });
        }
      }
      if (!pending.size && !running) return Promise.resolve({ ...status });
      return pump().then(() => ({ ...status }));
    }

    function beginDocument() {
      clearTimers();
      const documentId = makeId();
      current = { id: sessionId + ':' + documentId, documentId, sequence: 0, savedSequence: 0, queuedSequence: 0, savedAt: null };
      return report('idle', 'Recovery starts after your first edit.', { savedAt: null, errorName: null, evicted: 0 });
    }

    beginDocument();
    return {
      touch() {
        if (disposed) return;
        current.sequence++;
        report('pending', 'Changes are waiting for a recovery checkpoint.');
        if (debounceTimer !== null) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(flush, positiveInteger(options.debounceMs, DEFAULTS.debounceMs));
        if (maxTimer === null) maxTimer = setTimeout(flush, positiveInteger(options.maxWaitMs, DEFAULTS.maxWaitMs));
      },
      flush,
      beginDocument,
      async list() {
        try {
          const items = await store.list();
          return items.filter(item => item && typeof item.id === 'string' && item.id.length <= 300).map(item => ({
            id: item.id, name: documentName(item.name), updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
            bytes: Number.isSafeInteger(item.bytes) && item.bytes >= 0 ? item.bytes : 0,
            cols: Number.isSafeInteger(item.cols) ? item.cols : null, rows: Number.isSafeInteger(item.rows) ? item.rows : null,
            current: item.id === current.id, thisSession: item.sessionId === sessionId,
          })).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
        } catch (error) { reportError(error, 'read'); throw error; }
      },
      async read(id) {
        try {
          const record = await store.get(id);
          if (!record) throw failure('RecoveryMissingError', 'This checkpoint is no longer available. Refresh the recovery list.');
          const bytes = typeof record.payload === 'string' ? byteLength(record.payload) : Infinity;
          if (record.format !== 'glyphpoint-recovery-v1' || record.id !== id || bytes > limits.maxRecordBytes || record.bytes !== bytes) {
            throw failure('RecoveryDataError', 'This recovery checkpoint is damaged or exceeds the project limit.');
          }
          const project = options.validate(JSON.parse(record.payload));
          return { project, name: documentName(record.name), updatedAt: record.updatedAt, id };
        } catch (error) { reportError(error, 'read'); throw error; }
      },
      async remove(id) {
        try {
          // Delete in the same queue as writes. Suppress only snapshots already
          // present at the request boundary, so edits made while deletion waits
          // are committed afterwards even if the user switches documents.
          const context = id === current.id ? current : pending.get(id)?.context || (writing?.record.id === id ? writing.context : null) || removals.get(id)?.context;
          const sequence = context?.sequence ?? 0;
          if (id === current.id) clearTimers();
          pending.delete(id);
          if (context) context.queuedSequence = writing?.context === context ? writing.record.sequence : 0;
          if (retryContext === context) retryContext = null;
          const existing = removals.get(id);
          if (existing) {
            // Repeated activation while storage waits represents the same delete,
            // with a later revision boundary if the user edited in between.
            existing.sequence = Math.max(existing.sequence, sequence);
            await existing.completion;
            return;
          }
          let resolve, reject;
          const completion = new Promise((yes, no) => { resolve = yes; reject = no; });
          const job = { remove: true, id, context, sequence, resolve, reject, completion };
          removals.set(id, job);
          pending.set(Symbol(id), job);
          if (context === current) report('pending', 'Deleting recovery checkpoint…');
          void pump();
          await completion;
        } catch (error) { reportError(error); throw error; }
      },
      getStatus() { return { ...status }; },
      attachLifecycle(win = globalThis.window, doc = globalThis.document) {
        detach();
        const hidden = () => { if (doc.visibilityState === 'hidden') void flush(); };
        const pagehide = () => { void flush(); };
        doc.addEventListener('visibilitychange', hidden);
        win.addEventListener('pagehide', pagehide);
        detach = () => { doc.removeEventListener('visibilitychange', hidden); win.removeEventListener('pagehide', pagehide); };
        return detach;
      },
      async dispose() {
        if (disposed) return;
        const finishing = flush();
        disposed = true;
        detach();
        clearTimers();
        await finishing;
        if (running) await running;
        if (typeof store.close === 'function') store.close();
      },
    };
  }

  function projectFilename(value) {
    const name = documentName(value).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\.(?:txt|html?)$/i, '');
    return /\.json$/i.test(name) ? name : name + '.json';
  }

  function createFileSaver(options) {
    if (!options || typeof options.capture !== 'function' || typeof options.validate !== 'function' || typeof options.download !== 'function') {
      throw new TypeError('File saving requires capture, validate, and download functions.');
    }
    const pickFile = options.pickFile === undefined
      ? (globalThis.isSecureContext !== false && typeof globalThis.showSaveFilePicker === 'function' ? globalThis.showSaveFilePicker.bind(globalThis) : null)
      : options.pickFile;
    let handle = null;
    let epoch = 0;
    let busy = false;
    function report(state, message) {
      if (typeof options.report === 'function') { try { options.report({ state, message }); } catch (_) {} }
    }
    return {
      capabilities() { return { direct: typeof pickFile === 'function', hasHandle: !!handle, busy }; },
      isCurrentDocument(result) { return result?.documentEpoch === epoch; },
      reset() { handle = null; epoch++; },
      async save(settings = {}) {
        if (busy) return { kind: 'busy' };
        busy = true;
        const documentEpoch = epoch;
        const revision = options.getRevision ? options.getRevision() : null;
        let stream = null;
        let phase = 'prepare';
        try {
          const project = options.capture();
          options.validate(project);
          let text = JSON.stringify(project, null, 2);
          if (typeof text !== 'string') throw failure('ProjectDataError', 'The current project cannot be serialized.');
          const maxFileBytes = positiveInteger(options.maxFileBytes, DEFAULTS.maxRecordBytes);
          if (byteLength(text) > maxFileBytes) text = JSON.stringify(project);
          if (byteLength(text) > maxFileBytes) throw failure('ProjectSizeError', 'This project exceeds the supported project file size.');
          const name = projectFilename(options.getName ? options.getName() : 'glyphpoint-project');
          if (settings.download || typeof pickFile !== 'function') {
            phase = 'download';
            await options.download(text, 'application/json', name);
            report('downloaded', 'Project download requested. Confirm the JSON file is in your downloads; the editor cannot verify completion.');
            return { kind: 'downloaded', name, revision, current: documentEpoch === epoch };
          }
          // No asynchronous work precedes the picker; preserve the Save gesture's
          // transient activation. Existing handles are reused only for this doc.
          phase = 'picker';
          const selected = handle && !settings.saveAs ? handle : await pickFile({
            id: 'glyphpoint-project', suggestedName: name,
            types: [{ description: 'GlyphPoint project', accept: { 'application/json': ['.json'] } }],
          });
          if (documentEpoch !== epoch) {
            report('cancelled', 'Save cancelled because another document was opened.');
            return { kind: 'cancelled', revision, current: false };
          }
          phase = 'write';
          report('saving', 'Writing project file…');
          stream = await selected.createWritable();
          await stream.write(text);
          await stream.close();
          stream = null;
          if (documentEpoch === epoch) handle = selected;
          const current = documentEpoch === epoch && (!options.getRevision || options.getRevision() === revision);
          report('saved', current ? 'Project file saved.' : 'Project file saved; newer edits remain unsaved.');
          return { kind: 'saved', name: selected.name || name, revision, current, documentEpoch };
        } catch (error) {
          if (stream && typeof stream.abort === 'function') { try { await stream.abort(); } catch (_) {} }
          const cancelled = phase === 'picker' && error.name === 'AbortError';
          report(cancelled ? 'cancelled' : 'error', cancelled ? 'Project save cancelled.' : 'Project save failed. ' + error.message + ' Use Save as or Download project to try another destination.');
          return { kind: cancelled ? 'cancelled' : 'error', error, revision, current: documentEpoch === epoch };
        } finally { busy = false; }
      },
    };
  }

  return Object.freeze({ create, createIndexedDBStore, createFileSaver, planRetention, defaults: DEFAULTS });
})();
