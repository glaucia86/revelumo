import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { parseRequest } from '../src/shared/requests.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Catalog } from '../src/main/catalog.ts';
import { Library } from '../src/main/library.ts';

const decoder = async (bytes: Buffer) => 'data:image/jpeg;base64,' + bytes.toString('base64');
test('editing saves exposure by UUID and recovers the confirmed recipe after reopening without changing the JPEG', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-exposure-'));
  const file = join(dir, 'photo.jpg'), db = join(dir, 'catalog.sqlite');
  copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const original = readFileSync(file);
  let catalog = new Catalog(db), library = new Library(catalog, decoder);
  t.after(() => { catalog.close(); rmSync(dir, { recursive: true, force: true }); });
  const imported = await library.importSelected(file); assert.ok(imported.ok && !imported.value.canceled);
  const photo = imported.value.photo;
  assert.deepEqual(library.recipe(photo.id), { ok: true, value: { photo, exposureTenths: 0, temperature: 0, tint: 0, processingVersion: 2 } });
  const opened = await library.beginEditing(photo.id); assert.ok(opened.ok);
  const saved = await library.saveExposure(photo.id, opened.value.sessionId, 1, 10, 2);
  assert.deepEqual(saved, { ok: true, value: { photo, exposureTenths: 10, temperature: 0, tint: 0, processingVersion: 2, sessionId: opened.value.sessionId, revision: 1, undoSteps: 1, redoSteps: 0 } });
  catalog.close(); catalog = new Catalog(db); library = new Library(catalog, decoder);
  assert.deepEqual(library.recipe(photo.id), { ok: true, value: { photo, exposureTenths: 10, temperature: 0, tint: 0, processingVersion: 2 } });
  assert.deepEqual(readFileSync(file), original);
});

test('obsolete revisions and retired sessions cannot overwrite the newest confirmed exposure; failures keep the recipe', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-exposure-')), file = join(dir, 'photo.jpg'), db = join(dir, 'catalog.sqlite');
  copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const original = readFileSync(file), catalog = new Catalog(db), library = new Library(catalog, decoder);
  t.after(() => { catalog.close(); rmSync(dir, { recursive: true, force: true }); });
  const imported = await library.importSelected(file); assert.ok(imported.ok && !imported.value.canceled); const id = imported.value.photo.id;
  const opened = await library.beginEditing(id); assert.ok(opened.ok); const session = opened.value.sessionId;
  const saves = await Promise.all([library.saveExposure(id, session, 2, 20, 2), library.saveExposure(id, session, 1, -10, 2)]);
  assert.equal(saves[0].ok, true); assert.equal(saves[1].ok, false);
  const confirmed = library.recipe(id);
  const lock = new DatabaseSync(db);
  try { lock.exec('BEGIN IMMEDIATE'); assert.equal((await library.saveExposure(id, session, 3, 30, 2)).code, 'catalog-error'); }
  finally { lock.exec('ROLLBACK'); lock.close(); }
  assert.deepEqual(library.recipe(id), confirmed);
  writeFileSync(file, Buffer.concat([original, Buffer.from('different bytes')]));
  assert.equal((await library.saveExposure(id, session, 3, 30, 2)).code, 'identity-mismatch');
  assert.deepEqual(library.recipe(id), confirmed);
  unlinkSync(file); assert.equal((await library.saveExposure(id, session, 3, 30, 2)).code, 'unreadable'); assert.deepEqual(library.recipe(id), confirmed);
  writeFileSync(file, original); assert.equal((await library.saveExposure(id, session, 3, 30, 2)).ok, true);
  assert.equal((await library.endEditing(id, session)).ok, true);
  assert.equal((await library.saveExposure(id, session, 4, -30, 2)).code, 'invalid-request');
  const second = await library.beginEditing(id); assert.ok(second.ok);
  assert.equal((await library.saveExposure(id, session, 5, -30, 2)).code, 'invalid-request');
  assert.equal((await library.saveExposure(id, second.value.sessionId, 1, 0, 2)).ok, true);
  assert.equal(library.recipe(id).value.exposureTenths, 0);
  assert.deepEqual(readFileSync(file), original);
});

test('v4 migration preserves thumbnail, classification, identity, reimport and relocated recipe', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-exposure-')), file = join(dir, 'photo.jpg'), moved = join(dir, 'moved.jpg'), db = join(dir, 'catalog.sqlite');
  copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), file); const original = readFileSync(file);
  const fixture = new DatabaseSync(db), id = '420ce72c-2bb7-4e40-89ec-e3945c5b5425';
  fixture.exec("CREATE TABLE photos (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, sha256 TEXT, rating INTEGER, flag TEXT NOT NULL DEFAULT 'neutral'); CREATE TABLE thumbnails (photo_id TEXT PRIMARY KEY REFERENCES photos(id), data_url TEXT NOT NULL); PRAGMA user_version=4");
  fixture.prepare('INSERT INTO photos VALUES (?, ?, ?, ?, ?, ?)').run(id, file, 'photo.jpg', createHash('sha256').update(original).digest('hex'), 5, 'rejected');
  fixture.prepare('INSERT INTO thumbnails VALUES (?, ?)').run(id, 'cached'); fixture.close();
  const catalog = new Catalog(db), library = new Library(catalog, decoder); t.after(() => { catalog.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.equal(library.recipe(id).value.exposureTenths, 0); assert.equal(library.classification(id).value.rating, 5); assert.equal(library.classification(id).value.flag, 'rejected');
  assert.equal((await library.thumbnail(id)).value.dataUrl, 'cached');
  const opened = await library.beginEditing(id); assert.ok(opened.ok); assert.equal((await library.saveExposure(id, opened.value.sessionId, 1, -13, 2)).ok, true);
  const again = await library.importSelected(file); assert.ok(again.ok && !again.value.canceled, JSON.stringify(again)); assert.equal(again.value.photo.id, id);
  renameSync(file, moved); assert.equal((await library.relocateSelected(id, moved)).value.photo.id, id);
  assert.equal(library.recipe(id).value.exposureTenths, -13); assert.deepEqual(readFileSync(moved), original);
});

test('strict recipe requests reject extra fields, paths, unsupported versions and noncanonical values', () => {
  const id = '420ce72c-2bb7-4e40-89ec-e3945c5b5425', sessionId = 'e354a57b-41a0-4fd2-9510-2a0db64db026';
  const request = { op: 'exposure', id, sessionId, revision: 1, exposureTenths: 0, processingVersion: 2 };
  assert.deepEqual(parseRequest(request), request);
  for (const exposureTenths of [-31, 31, 0.1, NaN, Infinity, '10', null]) assert.equal(parseRequest({ ...request, exposureTenths }), null);
  for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(parseRequest({ ...request, revision }), null);
  for (const invalid of [{ path: 'C:/free.jpg' }, { processingVersion: 3 }, { sessionId: 'bad' }, { id: 'C:/free.jpg' }]) assert.equal(parseRequest({ ...request, ...invalid }), null);
});
