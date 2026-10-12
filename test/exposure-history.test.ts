import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Catalog } from '../src/main/catalog.ts';
import { Library } from '../src/main/library.ts';

const decoder = async (bytes: Buffer) => 'data:image/jpeg;base64,' + bytes.toString('base64');
test('a completed exposure adjustment can be undone and redone by UUID after reopening', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-history-')), file = join(dir, 'photo.jpg'), db = join(dir, 'catalog.sqlite');
  copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const original = readFileSync(file);
  let catalog = new Catalog(db), library = new Library(catalog, decoder);
  t.after(() => { catalog.close(); rmSync(dir, { recursive: true, force: true }); });
  const imported = await library.importSelected(file); assert.ok(imported.ok && !imported.value.canceled);
  const id = imported.value.photo.id;
  const opened = await library.beginEditing(id); assert.ok(opened.ok);
  assert.equal((await library.saveExposure(id, opened.value.sessionId, 1, 10, 1)).ok, true);
  catalog.close(); catalog = new Catalog(db); library = new Library(catalog, decoder);
  const reopened = await library.beginEditing(id); assert.ok(reopened.ok);
  const undone = await library.moveExposureHistory(id, reopened.value.sessionId, 1, 'undo');
  assert.ok(undone.ok); assert.equal(undone.value.exposureTenths, 0);
  const redone = await library.moveExposureHistory(id, reopened.value.sessionId, 2, 'redo');
  assert.ok(redone.ok); assert.equal(redone.value.exposureTenths, 10);
  assert.equal(library.recipe(id).value.exposureTenths, 10);
  assert.deepEqual(readFileSync(file), original);
});

test('history availability starts empty, follows undo/redo and never invents a neutral state for a v5 recipe', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-history-')), file = join(dir, 'photo.jpg'), db = join(dir, 'catalog.sqlite');
  copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const { DatabaseSync } = await import('node:sqlite'), { createHash } = await import('node:crypto');
  const id = '420ce72c-2bb7-4e40-89ec-e3945c5b5425', fixture = new DatabaseSync(db);
  fixture.exec("CREATE TABLE photos (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, sha256 TEXT, rating INTEGER, flag TEXT NOT NULL DEFAULT 'neutral'); CREATE TABLE thumbnails (photo_id TEXT PRIMARY KEY REFERENCES photos(id), data_url TEXT NOT NULL); CREATE TABLE recipes (photo_id TEXT PRIMARY KEY, exposure_tenths INTEGER, processing_version INTEGER); PRAGMA user_version=5;");
  fixture.prepare('INSERT INTO photos VALUES (?, ?, ?, ?, 5, ?)').run(id, file, 'photo.jpg', createHash('sha256').update(readFileSync(file)).digest('hex'), 'selected');
  fixture.prepare('INSERT INTO thumbnails VALUES (?, ?)').run(id, 'cached');
  fixture.prepare('INSERT INTO recipes VALUES (?, -13, 1)').run(id); fixture.close();
  const catalog = new Catalog(db), library = new Library(catalog, decoder);
  t.after(() => { catalog.close(); rmSync(dir, { recursive: true, force: true }); });
  const opened = await library.beginEditing(id); assert.ok(opened.ok);
  assert.equal(opened.value.exposureTenths, -13); assert.equal(opened.value.undoSteps, 0); assert.equal(opened.value.redoSteps, 0);
  assert.equal(library.classification(id).value.rating, 5); assert.equal(library.classification(id).value.flag, 'selected'); assert.equal((await library.thumbnail(id)).value.dataUrl, 'cached');
  const saved = await library.saveExposure(id, opened.value.sessionId, 1, 7, 1); assert.ok(saved.ok);
  assert.equal(saved.value.undoSteps, 1); assert.equal(saved.value.redoSteps, 0);
  const undone = await library.moveExposureHistory(id, opened.value.sessionId, 2, 'undo'); assert.ok(undone.ok);
  assert.equal(undone.value.exposureTenths, -13); assert.equal(undone.value.undoSteps, 0); assert.equal(undone.value.redoSteps, 1);
});

test('checkpoints during one gesture remain one step, while two gestures within one autosave remain distinct', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-history-')), file = join(dir, 'photo.jpg');
  copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const catalog = new Catalog(join(dir, 'catalog.sqlite')), library = new Library(catalog, decoder);
  t.after(() => { catalog.close(); rmSync(dir, { recursive: true, force: true }); });
  const imported = await library.importSelected(file); assert.ok(imported.ok && !imported.value.canceled);
  const id = imported.value.photo.id, opened = await library.beginEditing(id); assert.ok(opened.ok); const session = opened.value.sessionId;
  assert.ok((await library.saveExposure(id, session, 1, 10, 1, [{ id: 1, exposureTenths: 10, complete: false }])).ok);
  assert.ok((await library.saveExposure(id, session, 2, 20, 1, [{ id: 1, exposureTenths: 20, complete: true }])).ok);
  const undone = await library.moveExposureHistory(id, session, 3, 'undo'); assert.ok(undone.ok);
  assert.equal(undone.value.exposureTenths, 0, 'a long gesture with an intermediate autosave has only one undo boundary');
  const saved = await library.saveExposure(id, session, 4, -7, 1, [{ id: 2, exposureTenths: 5, complete: true }, { id: 3, exposureTenths: -7, complete: true }]); assert.ok(saved.ok);
  assert.equal(saved.value.undoSteps, 2); assert.equal(saved.value.redoSteps, 0);
  const first = await library.moveExposureHistory(id, session, 5, 'undo'); assert.ok(first.ok); assert.equal(first.value.exposureTenths, 5);
  const second = await library.moveExposureHistory(id, session, 6, 'undo'); assert.ok(second.ok); assert.equal(second.value.exposureTenths, 0);
});

async function editable(t: any) {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-history-')), file = join(dir, 'photo.jpg'), db = join(dir, 'catalog.sqlite');
  copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), file);
  let catalog = new Catalog(db), library = new Library(catalog, decoder);
  t.after(() => { catalog.close(); rmSync(dir, { recursive: true, force: true }); });
  const imported = await library.importSelected(file); assert.ok(imported.ok && !imported.value.canceled);
  const id = imported.value.photo.id;
  async function reopen() { catalog.close(); catalog = new Catalog(db); library = new Library(catalog, decoder); const result = await library.beginEditing(id); assert.ok(result.ok); return { library, session: result.value.sessionId, state: result.value }; }
  const opened = await library.beginEditing(id); assert.ok(opened.ok);
  return { dir, file, db, id, library, session: opened.value.sessionId, reopen };
}

test('undo cursor survives reopening, reset is reversible and a new adjustment removes redo', async t => {
  const f = await editable(t);
  await f.library.saveExposure(f.id, f.session, 1, 12, 1);
  await f.library.saveExposure(f.id, f.session, 2, 0, 1);
  assert.equal((await f.library.moveExposureHistory(f.id, f.session, 3, 'undo')).value.exposureTenths, 12);
  const reopened = await f.reopen(); assert.equal(reopened.state.redoSteps, 1);
  assert.equal((await reopened.library.moveExposureHistory(f.id, reopened.session, 1, 'redo')).value.exposureTenths, 0);
  await reopened.library.moveExposureHistory(f.id, reopened.session, 2, 'undo');
  const saved = await reopened.library.saveExposure(f.id, reopened.session, 3, -8, 1); assert.ok(saved.ok); assert.equal(saved.value.redoSteps, 0);
  assert.equal((await reopened.library.moveExposureHistory(f.id, reopened.session, 4, 'redo')).value.exposureTenths, -8);
});

test('a gesture returning to its initial value is a no-op and preserves redo even across checkpoints', async t => {
  const f = await editable(t);
  await f.library.saveExposure(f.id, f.session, 1, 10, 1);
  await f.library.moveExposureHistory(f.id, f.session, 2, 'undo');
  await f.library.saveExposure(f.id, f.session, 3, 7, 1, [{ id: 3, exposureTenths: 7, complete: false }]);
  const saved = await f.library.saveExposure(f.id, f.session, 4, 0, 1, [{ id: 3, exposureTenths: 0, complete: true }]); assert.ok(saved.ok);
  assert.equal(saved.value.undoSteps, 0); assert.equal(saved.value.redoSteps, 1);
  const reopened = await f.reopen(); assert.equal(reopened.state.undoSteps, 0); assert.equal(reopened.state.redoSteps, 1);
  assert.equal((await reopened.library.moveExposureHistory(f.id, reopened.session, 1, 'redo')).value.exposureTenths, 10);
});

test('reopening an unfinished gesture recovers only its persisted checkpoint as one undo step', async t => {
  const f = await editable(t);
  await f.library.saveExposure(f.id, f.session, 1, 10, 1, [{ id: 1, exposureTenths: 10, complete: false }]);
  await f.library.saveExposure(f.id, f.session, 2, 17, 1, [{ id: 1, exposureTenths: 17, complete: false }]);
  const reopened = await f.reopen(); assert.equal(reopened.state.exposureTenths, 17); assert.equal(reopened.state.undoSteps, 1);
  const undone = await reopened.library.moveExposureHistory(f.id, reopened.session, 1, 'undo'); assert.ok(undone.ok);
  assert.equal(undone.value.exposureTenths, 0); assert.equal(undone.value.redoSteps, 1);
});

test('locked commits and retries preserve recipe, history and cursor together without duplicate save or undo', async t => {
  const f = await editable(t), { DatabaseSync } = await import('node:sqlite');
  const saved = await f.library.saveExposure(f.id, f.session, 1, 10, 1);
  assert.deepEqual(await f.library.saveExposure(f.id, f.session, 1, 10, 1), saved);
  const lock = new DatabaseSync(f.db); lock.exec('BEGIN IMMEDIATE');
  try {
    assert.equal((await f.library.saveExposure(f.id, f.session, 2, 20, 1)).code, 'catalog-error');
    assert.equal(f.library.recipe(f.id).value.exposureTenths, 10);
    assert.equal((await f.library.moveExposureHistory(f.id, f.session, 2, 'undo')).code, 'catalog-error');
  } finally { lock.exec('ROLLBACK'); lock.close(); }
  const second = await f.library.saveExposure(f.id, f.session, 2, 20, 1); assert.ok(second.ok); assert.equal(second.value.undoSteps, 2);
  const undone = await f.library.moveExposureHistory(f.id, f.session, 3, 'undo'); assert.ok(undone.ok); assert.equal(undone.value.exposureTenths, 10);
  assert.deepEqual(await f.library.moveExposureHistory(f.id, f.session, 3, 'undo'), undone);
  assert.equal((await f.library.moveExposureHistory(f.id, f.session, 3, 'redo')).code, 'invalid-request');
  const reopened = await f.reopen(); assert.equal(reopened.state.exposureTenths, 10); assert.equal(reopened.state.undoSteps, 1); assert.equal(reopened.state.redoSteps, 1);
});

test('completed gesture IDs cannot be replayed as fresh edits under a newer revision', async t => {
  const f = await editable(t);
  const saved = await f.library.saveExposure(f.id, f.session, 1, 10, 1, [{ id: 1, exposureTenths: 10, complete: true }]); assert.ok(saved.ok);
  const replay = await f.library.saveExposure(f.id, f.session, 2, 20, 1, [{ id: 1, exposureTenths: 20, complete: true }]);
  assert.equal(replay.code, 'invalid-request'); assert.equal(f.library.recipe(f.id).value.exposureTenths, 10);
});

test('history is isolated by photo, follows relocation and refuses mutation when original identity is unavailable', async t => {
  const f = await editable(t), { renameSync, writeFileSync, unlinkSync } = await import('node:fs');
  const bytes = readFileSync(f.file), secondFile = join(f.dir, 'second.jpg'); copyFileSync(f.file, secondFile);
  await f.library.saveExposure(f.id, f.session, 1, 12, 1);
  const second = await f.library.importSelected(secondFile); assert.ok(second.ok && !second.value.canceled);
  const openedSecond = await f.library.beginEditing(second.value.photo.id); assert.ok(openedSecond.ok); assert.equal(openedSecond.value.undoSteps, 0);
  await f.library.saveExposure(second.value.photo.id, openedSecond.value.sessionId, 1, -9, 1);
  assert.equal(f.library.recipe(f.id).value.exposureTenths, 12);
  const opened = await f.library.beginEditing(f.id); assert.ok(opened.ok); const session = opened.value.sessionId;
  writeFileSync(f.file, Buffer.concat([bytes, Buffer.from('changed')]));
  assert.equal((await f.library.moveExposureHistory(f.id, session, 1, 'undo')).code, 'identity-mismatch');
  unlinkSync(f.file); assert.equal((await f.library.moveExposureHistory(f.id, session, 1, 'undo')).code, 'unreadable');
  assert.equal(f.library.recipe(f.id).value.exposureTenths, 12);
  writeFileSync(f.file, bytes); const moved = join(f.dir, 'moved.jpg'); renameSync(f.file, moved);
  assert.equal((await f.library.relocateSelected(f.id, moved)).ok, true);
  assert.equal((await f.library.moveExposureHistory(f.id, session, 1, 'undo')).value.exposureTenths, 0);
  assert.equal((await f.library.moveExposureHistory(f.id, session, 2, 'redo')).value.exposureTenths, 12);
  const reimport = await f.library.importSelected(moved); assert.ok(reimport.ok && !reimport.value.canceled); assert.equal(reimport.value.photo.id, f.id);
  const restored = await f.library.beginEditing(f.id); assert.ok(restored.ok); assert.equal(restored.value.undoSteps, 1);
  assert.deepEqual(readFileSync(moved), bytes); assert.deepEqual(readFileSync(secondFile), bytes);
});

test('history IPC rejects paths, malformed gestures, oversized batches and mismatched latest values', async () => {
  const { parseRequest } = await import('../src/shared/requests.ts');
  const id = '420ce72c-2bb7-4e40-89ec-e3945c5b5425', sessionId = 'e354a57b-41a0-4fd2-9510-2a0db64db026';
  const request = { op: 'exposure', id, sessionId, revision: 1, exposureTenths: 12, processingVersion: 1, gestures: [{ id: 1, exposureTenths: 12, complete: true }] };
  assert.deepEqual(parseRequest(request), request);
  for (const gestures of [[], null, [{ id: 0, exposureTenths: 12, complete: true }], [{ id: 1, exposureTenths: 12, complete: true, path: '/free.jpg' }], [{ id: 1, exposureTenths: 11, complete: true }], [{ id: 1, exposureTenths: 12, complete: 'true' }], [{ id: 1, exposureTenths: 12, complete: false }, { id: 2, exposureTenths: 12, complete: true }], [{ id: 2, exposureTenths: 0, complete: true }, { id: 1, exposureTenths: 12, complete: true }], Array.from({length:1025}, (_, i) => ({ id: i + 1, exposureTenths: 12, complete: true }))]) assert.equal(parseRequest({ ...request, gestures }), null);
  const move = { op: 'exposure-history', id, sessionId, revision: 1, direction: 'undo' }; assert.deepEqual(parseRequest(move), move);
  for (const invalid of [{ path: '/free.jpg' }, { direction: 'delete' }, { revision: 0 }, { id: '/free.jpg' }, { sessionId: 'bad' }]) assert.equal(parseRequest({ ...move, ...invalid }), null);
});

test('retains exactly the latest 100 completed exposure steps per photo across reopening', async t => {
  const f = await editable(t);
  for (let revision = 1; revision <= 101; revision++) {
    const saved = await f.library.saveExposure(f.id, f.session, revision, revision % 2 ? 10 : 20, 1);
    assert.ok(saved.ok);
  }
  const reopened = await f.reopen();
  assert.equal(reopened.state.undoSteps, 100, '101st edit evicts only the oldest undo step');
  assert.equal(reopened.state.redoSteps, 0);
  let state = reopened.state;
  for (let revision = 1; revision <= 100; revision++) {
    const undone = await reopened.library.moveExposureHistory(f.id, reopened.session, revision, 'undo');
    assert.ok(undone.ok); state = undone.value;
  }
  assert.equal(state.exposureTenths, 10, 'oldest retained baseline is the first adjustment, not the original neutral');
  assert.equal(state.undoSteps, 0); assert.equal(state.redoSteps, 100);
  const exhausted = await reopened.library.moveExposureHistory(f.id, reopened.session, 101, 'undo'); assert.ok(exhausted.ok);
  assert.equal(exhausted.value.exposureTenths, 10);
  const again = await f.reopen(); assert.equal(again.state.redoSteps, 100); assert.equal(again.state.undoSteps, 0);
  for (let revision = 1; revision <= 100; revision++) assert.ok((await again.library.moveExposureHistory(f.id, again.session, revision, 'redo')).ok);
  const final = await f.reopen(); assert.equal(final.state.undoSteps, 100); assert.equal(final.state.exposureTenths, 10);
});

test('a checkpoint at capacity offers 100 undos without evicting history for a completed no-op', async t => {
  const f = await editable(t);
  for (let revision = 1; revision <= 100; revision++) assert.ok((await f.library.saveExposure(f.id, f.session, revision, revision % 2 ? 10 : 20, 1)).ok);
  const checkpoint = await f.library.saveExposure(f.id, f.session, 101, 15, 1, [{id:101, exposureTenths:15, complete:false}]); assert.ok(checkpoint.ok);
  assert.equal(checkpoint.value.undoSteps, 100, 'active checkpoint must not advertise an unreachable 101st undo');
  const noOp = await f.library.saveExposure(f.id, f.session, 102, 20, 1, [{id:101, exposureTenths:20, complete:true}]); assert.ok(noOp.ok);
  assert.equal(noOp.value.undoSteps, 100);
  for (let revision = 103; revision <= 202; revision++) assert.ok((await f.library.moveExposureHistory(f.id, f.session, revision, 'undo')).ok);
  assert.equal(f.library.recipe(f.id).value.exposureTenths, 0, 'a gesture returning to its start did not evict the oldest step');
  const branch = await f.library.saveExposure(f.id, f.session, 203, -13, 1); assert.ok(branch.ok);
  assert.equal(branch.value.undoSteps, 1); assert.equal(branch.value.redoSteps, 0);
  const reopened = await f.reopen(); assert.equal(reopened.state.undoSteps, 1); assert.equal(reopened.state.redoSteps, 0);
});

test('checkpoint recovery and a locked overflow commit preserve bounded history and photo isolation', async t => {
  const f = await editable(t), { DatabaseSync } = await import('node:sqlite');
  for (let revision = 1; revision <= 100; revision++) assert.ok((await f.library.saveExposure(f.id, f.session, revision, revision % 2 ? 10 : 20, 1)).ok);
  const lock = new DatabaseSync(f.db); lock.exec('BEGIN IMMEDIATE');
  try { assert.equal((await f.library.saveExposure(f.id, f.session, 101, 15, 1, [{id:101, exposureTenths:15, complete:false}])).code, 'catalog-error'); }
  finally { lock.exec('ROLLBACK'); lock.close(); }
  const checkpoint = await f.library.saveExposure(f.id, f.session, 101, 15, 1, [{id:101, exposureTenths:15, complete:false}]); assert.ok(checkpoint.ok);
  assert.deepEqual(await f.library.saveExposure(f.id, f.session, 101, 15, 1, [{id:101, exposureTenths:15, complete:false}]), checkpoint);
  const reopened = await f.reopen(); assert.equal(reopened.state.undoSteps, 100); assert.equal(reopened.state.exposureTenths, 15);
  for (let revision = 1; revision <= 100; revision++) assert.ok((await reopened.library.moveExposureHistory(f.id, reopened.session, revision, 'undo')).ok);
  assert.equal(reopened.library.recipe(f.id).value.exposureTenths, 10);
  const cursor = await f.reopen(); assert.equal(cursor.state.undoSteps, 0); assert.equal(cursor.state.redoSteps, 100);
  const secondFile = join(f.dir, 'second.jpg'); copyFileSync(f.file, secondFile);
  const imported = await cursor.library.importSelected(secondFile); assert.ok(imported.ok && !imported.value.canceled);
  const second = await cursor.library.beginEditing(imported.value.photo.id); assert.ok(second.ok); assert.equal(second.value.undoSteps, 0);
  assert.ok((await cursor.library.saveExposure(imported.value.photo.id, second.value.sessionId, 1, -7, 1)).ok);
  const unchanged = await f.reopen(); assert.equal(unchanged.state.redoSteps, 100); assert.equal(unchanged.state.exposureTenths, 10);
});
