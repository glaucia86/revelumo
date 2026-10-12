import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { parseRequest } from '../src/shared/requests.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Catalog } from '../src/main/catalog.ts';
import { Library } from '../src/main/library.ts';

const decoder = async (bytes: Buffer) => 'data:image/jpeg;base64,' + bytes.toString('base64');
test('white balance saves the full JPEG recipe and recovers it on reopening without modifying the original', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-white-balance-'));
  const file = join(dir, 'photo.jpg'), db = join(dir, 'catalog.sqlite');
  copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const original = readFileSync(file);
  let catalog = new Catalog(db), library = new Library(catalog, decoder);
  t.after(() => { catalog.close(); rmSync(dir, { recursive: true, force: true }); });
  const imported = await library.importSelected(file); assert.ok(imported.ok && !imported.value.canceled);
  const photo = imported.value.photo;
  const opened = await library.beginEditing(photo.id); assert.ok(opened.ok);
  const adjustments = { exposureTenths: 0, temperature: 100, tint: -20 };
  const saved = await library.saveAdjustments(photo.id, opened.value.sessionId, 1, adjustments, 2, []);
  assert.deepEqual(saved, { ok: true, value: { photo, ...adjustments, processingVersion: 2, sessionId: opened.value.sessionId, revision: 1, undoSteps: 0, redoSteps: 0 } });
  catalog.close(); catalog = new Catalog(db); library = new Library(catalog, decoder);
  assert.deepEqual(library.recipe(photo.id), { ok: true, value: { photo, ...adjustments, processingVersion: 2 } });
  assert.deepEqual(readFileSync(file), original);
});

async function photoFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-white-balance-')), file = join(dir, 'photo.jpg'), db = join(dir, 'catalog.sqlite');
  copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const catalog = new Catalog(db), library = new Library(catalog, decoder);
  t.after(() => { catalog.close(); rmSync(dir, { recursive: true, force: true }); });
  const imported = await library.importSelected(file); assert.ok(imported.ok && !imported.value.canceled);
  const id = imported.value.photo.id, opened = await library.beginEditing(id); assert.ok(opened.ok);
  return { dir, file, db, catalog, library, id, session: opened.value.sessionId };
}

test('white-balance-only saves and resets preserve exposure Undo and future Redo through reopening', async (t) => {
  const f = await photoFixture(t);
  assert.ok((await f.library.saveAdjustments(f.id, f.session, 1, { exposureTenths: 10, temperature: 40, tint: -25 }, 2, [{ id: 1, exposureTenths: 10, complete: true }])).ok);
  assert.ok((await f.library.saveAdjustments(f.id, f.session, 2, { exposureTenths: 20, temperature: 40, tint: -25 }, 2, [{ id: 2, exposureTenths: 20, complete: true }])).ok);
  const undone = await f.library.moveExposureHistory(f.id, f.session, 3, 'undo'); assert.ok(undone.ok);
  assert.deepEqual([undone.value.exposureTenths, undone.value.temperature, undone.value.tint, undone.value.undoSteps, undone.value.redoSteps], [10, 40, -25, 1, 1]);
  const wb = await f.library.saveAdjustments(f.id, f.session, 4, { exposureTenths: 10, temperature: -90, tint: 70 }, 2, []); assert.ok(wb.ok);
  assert.deepEqual([wb.value.undoSteps, wb.value.redoSteps], [1, 1]);
  const reset = await f.library.saveAdjustments(f.id, f.session, 5, { exposureTenths: 10, temperature: 0, tint: 0 }, 2, []); assert.ok(reset.ok);
  assert.deepEqual([reset.value.undoSteps, reset.value.redoSteps], [1, 1]);
  const again = await f.library.saveAdjustments(f.id, f.session, 6, { exposureTenths: 10, temperature: 15, tint: -60 }, 2, []); assert.ok(again.ok);
  assert.ok((await f.library.endEditing(f.id, f.session)).ok);
  const reopenedCatalog = new Catalog(f.db), reopened = new Library(reopenedCatalog, decoder);
  try {
    const editing = await reopened.beginEditing(f.id); assert.ok(editing.ok);
    const redone = await reopened.moveExposureHistory(f.id, editing.value.sessionId, 1, 'redo'); assert.ok(redone.ok);
    assert.deepEqual([redone.value.exposureTenths, redone.value.temperature, redone.value.tint, redone.value.undoSteps, redone.value.redoSteps], [20, 15, -60, 2, 0]);
  } finally { reopenedCatalog.close(); }
});

test('full-recipe revisions are idempotent, reject stale snapshots, and keep the confirmed recipe after a failed commit', async (t) => {
  const f = await photoFixture(t);
  const values = { exposureTenths: 0, temperature: 30, tint: 20 };
  const first = await f.library.saveAdjustments(f.id, f.session, 2, values, 2, []); assert.ok(first.ok);
  assert.deepEqual(await f.library.saveAdjustments(f.id, f.session, 2, values, 2, []), first);
  assert.equal((await f.library.saveAdjustments(f.id, f.session, 2, { ...values, tint: 21 }, 2, [])).code, 'invalid-request');
  assert.equal((await f.library.saveAdjustments(f.id, f.session, 1, { ...values, tint: 22 }, 2, [])).code, 'invalid-request');
  assert.equal((await f.library.saveAdjustments(f.id, f.session, 3, { ...values, exposureTenths: 10 }, 2, [])).code, 'invalid-request', 'WB-only cannot silently change exposure without a gesture');
  const lock = new DatabaseSync(f.db);
  try {
    lock.exec('BEGIN IMMEDIATE');
    assert.equal((await f.library.saveAdjustments(f.id, f.session, 3, { ...values, temperature: 80 }, 2, [])).code, 'catalog-error');
  } finally { lock.exec('ROLLBACK'); lock.close(); }
  assert.deepEqual(f.library.recipe(f.id).value, { photo: first.value.photo, ...values, processingVersion: 2 });
  const retry = await f.library.saveAdjustments(f.id, f.session, 3, { ...values, temperature: 80 }, 2, []); assert.ok(retry.ok);
  assert.equal(retry.value.temperature, 80);
  assert.ok((await f.library.endEditing(f.id, f.session)).ok);
  assert.equal((await f.library.saveAdjustments(f.id, f.session, 4, values, 2, [])).code, 'invalid-request');
});

test('white balance remains attached to identity during relocation and unavailable or replaced originals refuse changes', async (t) => {
  const f = await photoFixture(t), original = readFileSync(f.file), moved = join(f.dir, 'moved.jpg');
  const values = { exposureTenths: 0, temperature: -45, tint: 70 };
  const saved = await f.library.saveAdjustments(f.id, f.session, 1, values, 2, []); assert.ok(saved.ok);
  renameSync(f.file, moved);
  assert.equal((await f.library.saveAdjustments(f.id, f.session, 2, { ...values, tint: 0 }, 2, [])).code, 'unreadable');
  const relocated = await f.library.relocateSelected(f.id, moved); assert.ok(relocated.ok && !relocated.value.canceled); assert.equal(relocated.value.photo.id, f.id);
  assert.deepEqual([f.library.recipe(f.id).value.temperature, f.library.recipe(f.id).value.tint], [-45, 70]);
  writeFileSync(moved, Buffer.concat([original, Buffer.from('replacement')]));
  assert.equal((await f.library.saveAdjustments(f.id, f.session, 2, { ...values, tint: 0 }, 2, [])).code, 'identity-mismatch');
  assert.equal(f.library.recipe(f.id).value.tint, 70);
  writeFileSync(moved, original);
  assert.ok((await f.library.saveAdjustments(f.id, f.session, 2, { ...values, tint: 0 }, 2, [])).ok);
  assert.deepEqual(readFileSync(moved), original);
});

test('WB IPC accepts only canonical versioned snapshots and bounded exposure gestures', () => {
  const id = '420ce72c-2bb7-4e40-89ec-e3945c5b5425', sessionId = 'e354a57b-41a0-4fd2-9510-2a0db64db026';
  const request = { op: 'adjustments', id, sessionId, revision: 1, adjustments: { exposureTenths: 0, temperature: 0, tint: 0 }, processingVersion: 2, gestures: [] };
  assert.deepEqual(parseRequest(request), request);
  for (const field of ['temperature', 'tint']) for (const value of [-101, 101, 0.5, NaN, Infinity, '1', null]) {
    assert.equal(parseRequest({ ...request, adjustments: { ...request.adjustments, [field]: value } }), null);
  }
  for (const invalid of [{ processingVersion: 1 }, { processingVersion: 3 }, { revision: 0 }, { sessionId: 'bad' }, { path: '/free.jpg' }, { gestures: null }, { adjustments: { ...request.adjustments, path: '/free.jpg' } }]) {
    assert.equal(parseRequest({ ...request, ...invalid }), null);
  }
  assert.equal(parseRequest({ ...request, gestures: [{ id: 1, exposureTenths: 10, complete: true }] }), null);
  assert.equal(parseRequest({ ...request, gestures: Array.from({ length: 1025 }, (_, index) => ({ id: index + 1, exposureTenths: 0, complete: true })) }), null);
});

test('v6 migration adds neutral WB without changing the exposure cursor, identity, or existing metadata', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-wb-migration-')), file = join(dir, 'legacy.jpg'), db = join(dir, 'catalog.sqlite');
  copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const bytes = readFileSync(file), id = '420ce72c-2bb7-4e40-89ec-e3945c5b5425';
  const fixture = new DatabaseSync(db);
  fixture.exec("CREATE TABLE photos (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, sha256 TEXT, rating INTEGER, flag TEXT NOT NULL DEFAULT 'neutral'); CREATE TABLE thumbnails (photo_id TEXT PRIMARY KEY, data_url TEXT NOT NULL); CREATE TABLE recipes (photo_id TEXT PRIMARY KEY, exposure_tenths INTEGER, processing_version INTEGER); CREATE TABLE exposure_history (photo_id TEXT PRIMARY KEY, states TEXT NOT NULL, cursor INTEGER NOT NULL, active TEXT); PRAGMA user_version=6");
  fixture.prepare('INSERT INTO photos VALUES (?, ?, ?, ?, 5, ?)').run(id, file, 'legacy.jpg', createHash('sha256').update(bytes).digest('hex'), 'selected');
  fixture.prepare('INSERT INTO thumbnails VALUES (?, ?)').run(id, 'cached-thumbnail');
  fixture.prepare('INSERT INTO recipes VALUES (?, -13, 1)').run(id);
  fixture.prepare('INSERT INTO exposure_history VALUES (?, ?, 0, NULL)').run(id, '[-13,20]'); fixture.close();
  const catalog = new Catalog(db), library = new Library(catalog, decoder);
  t.after(() => { catalog.close(); rmSync(dir, { recursive: true, force: true }); });
  const opened = await library.beginEditing(id); assert.ok(opened.ok);
  assert.deepEqual([opened.value.exposureTenths, opened.value.temperature, opened.value.tint, opened.value.processingVersion, opened.value.undoSteps, opened.value.redoSteps], [-13, 0, 0, 2, 0, 1]);
  assert.deepEqual(library.classification(id).value, { photo: { id, name: 'legacy.jpg' }, rating: 5, flag: 'selected' });
  assert.equal((await library.thumbnail(id)).value.dataUrl, 'cached-thumbnail');
  const reimported = await library.importSelected(file); assert.ok(reimported.ok && !reimported.value.canceled); assert.equal(reimported.value.photo.id, id);
  assert.ok((await library.saveAdjustments(id, opened.value.sessionId, 1, { exposureTenths: -13, temperature: 25, tint: -75 }, 2, [])).ok);
  const redone = await library.moveExposureHistory(id, opened.value.sessionId, 2, 'redo'); assert.ok(redone.ok);
  assert.deepEqual([redone.value.exposureTenths, redone.value.temperature, redone.value.tint], [20, 25, -75]);
  assert.deepEqual(readFileSync(file), bytes);
});
