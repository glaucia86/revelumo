import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Catalog } from '../src/main/catalog.ts';
import { Library } from '../src/main/library.ts';
import type { Result } from '../src/shared/contracts.ts';

const decoder = async (bytes: Buffer) => 'data:image/jpeg;base64,' + bytes.toString('base64');
async function setup(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'revelumo-descriptors-'));
  const file = join(dir, 'Original 日本語.jpg'), db = join(dir, 'catalog.sqlite');
  await copyFile(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const catalog = new Catalog(db), library = new Library(catalog, decoder);
  t.after(async () => { try { catalog.close(); } catch { /* Test may already close the public catalog. */ } await rm(dir, { recursive: true, force: true }); });
  const imported = await library.importSelected(file);
  assert.ok(imported.ok && !imported.value.canceled);
  return { dir, file, db, catalog, library, photo: imported.value.photo };
}
function expectFailure(result: Result<unknown>, key: string, code: string) {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('Expected failure');
  assert.equal(result.code, code);
  assert.deepEqual(result.descriptor, { key });
  assert.ok(result.message.length > 0, 'legacy clients retain the explanatory message');
}

test('editing failures expose stable descriptors while preserving the confirmed exposure and white balance', async t => {
  const { library, photo, file, db } = await setup(t);
  const opened = await library.beginEditing(photo.id); assert.ok(opened.ok);
  const session = opened.value.sessionId;
  const saved = await library.saveAdjustments(photo.id, session, 1, { exposureTenths: 10, temperature: 15, tint: -5 }, 2, [{ id: 1, exposureTenths: 10, complete: true }]);
  assert.ok(saved.ok);
  expectFailure(await library.saveExposure(photo.id, session, 1, 20, 2), 'errors.obsoleteRevision', 'invalid-request');
  expectFailure(await library.saveExposure(photo.id, session, 2, 20, 2, [{ id: 1, exposureTenths: 20, complete: true }]), 'errors.obsoleteGesture', 'invalid-request');
  const lock = new DatabaseSync(db);
  try {
    lock.exec('BEGIN IMMEDIATE');
    expectFailure(await library.moveExposureHistory(photo.id, session, 2, 'undo'), 'errors.saveAdjustment', 'catalog-error');
  } finally { lock.exec('ROLLBACK'); lock.close(); }
  const original = await readFile(file);
  await writeFile(file, Buffer.concat([original, Buffer.from('modified')]));
  expectFailure(await library.saveAdjustments(photo.id, session, 2, { exposureTenths: 10, temperature: 20, tint: 0 }, 2, []), 'errors.adjustmentIdentity', 'identity-mismatch');
  expectFailure(await library.moveExposureHistory(photo.id, session, 2, 'undo'), 'errors.adjustmentIdentity', 'identity-mismatch');
  assert.deepEqual(library.recipe(photo.id), { ok: true, value: { photo, exposureTenths: 10, temperature: 15, tint: -5, processingVersion: 2 } });
  await library.endEditing(photo.id, session);
  expectFailure(await library.endEditing(photo.id, session), 'errors.sessionEnded', 'invalid-request');
});

test('catalog failures keep readable legacy messages and distinguish saved recipe from classification', async t => {
  const { library, catalog, db, photo } = await setup(t);
  const lock = new DatabaseSync(db);
  try {
    lock.exec('BEGIN IMMEDIATE');
    expectFailure(library.classify(photo.id, 5, 'selected'), 'errors.saveClassification', 'catalog-error');
  } finally { lock.exec('ROLLBACK'); lock.close(); }
  assert.deepEqual(library.classification(photo.id), { ok: true, value: { photo, rating: null, flag: 'neutral' } });
  catalog.close();
  expectFailure(library.recipe(photo.id), 'errors.readRecipe', 'catalog-error');
  expectFailure(library.classification(photo.id), 'errors.readClassification', 'catalog-error');
});

test('original status and availability descriptors follow filesystem states without changing the photo name', async t => {
  const { library, file, photo } = await setup(t);
  const present = await library.availability(photo.id), available = await library.status(photo.id);
  assert.ok(present.ok && available.ok);
  assert.deepEqual(present.value.descriptor, { key: 'availability.present' });
  assert.deepEqual(available.value.descriptor, { key: 'original.available' });
  const original = await readFile(file);
  await writeFile(file, Buffer.concat([original, Buffer.from('modified')]));
  const changed = await library.status(photo.id); assert.ok(changed.ok);
  assert.deepEqual(changed.value.descriptor, { key: 'original.changed' });
  await writeFile(file, 'not a JPEG');
  const unreadable = await library.status(photo.id); assert.ok(unreadable.ok);
  assert.deepEqual(unreadable.value.descriptor, { key: 'original.unreadable' });
  await rename(file, file + '.moved');
  const missing = await library.status(photo.id), absent = await library.availability(photo.id);
  assert.ok(missing.ok && absent.ok);
  assert.deepEqual(missing.value.descriptor, { key: 'original.missing' });
  assert.deepEqual(absent.value.descriptor, { key: 'availability.missing' });
  for (const result of [present, available, changed, unreadable, missing, absent]) {
    assert.ok(result.ok); assert.deepEqual(result.value.photo, photo); assert.ok(result.value.message.length > 0);
  }
  assert.equal(photo.name, 'Original 日本語.jpg');
});

test('legacy originals explain unverified identity in status and refuse edits and relocation with stable descriptors', async t => {
  const { library, catalog, dir, file } = await setup(t);
  const legacyPath = join(dir, 'legacy.jpg'); await copyFile(file, legacyPath);
  const legacy = catalog.add(legacyPath);
  const session = await library.beginEditing(legacy.id); assert.ok(session.ok);
  expectFailure(await library.saveExposure(legacy.id, session.value.sessionId, 1, 10, 2), 'errors.verifyBeforeSave', 'identity-unverified');
  expectFailure(await library.relocateSelected(legacy.id, file), 'errors.legacyIdentity', 'identity-unverified');
  await writeFile(legacyPath, 'not a JPEG');
  const unreadable = await library.status(legacy.id); assert.ok(unreadable.ok);
  assert.deepEqual(unreadable.value.descriptor, { key: 'original.unreadableLegacy' });
  await rm(legacyPath);
  const missing = await library.status(legacy.id); assert.ok(missing.ok);
  assert.deepEqual(missing.value.descriptor, { key: 'original.missingLegacy' });
  assert.equal(missing.value.canRelocate, false);
});

test('preview and relocation identity failures retain stable descriptors and never replace the cataloged photo', async t => {
  const { library, dir, file, photo, db } = await setup(t);
  const candidate = join(dir, 'candidate.jpg'); await copyFile(file, candidate);
  const original = await readFile(file);
  await writeFile(candidate, Buffer.concat([original, Buffer.from('modified')]));
  expectFailure(await library.relocateSelected(photo.id, candidate), 'errors.relocationIdentity', 'identity-mismatch');
  await writeFile(file, Buffer.concat([original, Buffer.from('modified')]));
  expectFailure(await library.preview(photo.id), 'errors.previewIdentity', 'identity-mismatch');
  await writeFile(candidate, original);
  const occupied = await library.importSelected(candidate); assert.ok(occupied.ok && !occupied.value.canceled);
  expectFailure(await library.relocateSelected(photo.id, candidate), 'errors.pathConflict', 'path-conflict');
  const freeCandidate = join(dir, 'free.jpg'); await copyFile(candidate, freeCandidate);
  const lock = new DatabaseSync(db);
  try {
    lock.exec('BEGIN IMMEDIATE');
    expectFailure(await library.relocateSelected(photo.id, freeCandidate), 'errors.saveRelocation', 'catalog-error');
  } finally { lock.exec('ROLLBACK'); lock.close(); }
  assert.deepEqual(library.list(), [photo, occupied.value.photo]);
});

test('preview decoding and legacy identity recording failures have distinct descriptors', async t => {
  const { library, catalog, dir, file, photo, db } = await setup(t);
  const unavailableDecoder = new Library(catalog, async () => { throw new Error('decoder unavailable'); });
  expectFailure(await unavailableDecoder.preview(photo.id), 'errors.openPreview', 'invalid-jpeg');
  const legacyPath = join(dir, 'legacy.jpg'); await copyFile(file, legacyPath);
  const legacy = catalog.add(legacyPath);
  const lock = new DatabaseSync(db);
  try {
    lock.exec('BEGIN IMMEDIATE');
    expectFailure(await library.preview(legacy.id), 'errors.rememberIdentity', 'catalog-error');
    expectFailure(await library.status(legacy.id), 'errors.rememberIdentity', 'catalog-error');
  } finally { lock.exec('ROLLBACK'); lock.close(); }
  const original = await library.availability(legacy.id); assert.ok(original.ok);
  assert.equal(original.value.identityRecorded, false);
});
