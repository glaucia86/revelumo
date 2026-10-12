import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Catalog } from '../src/main/catalog.ts';
import { Library } from '../src/main/library.ts';

const decoder = async (bytes: Buffer) => 'data:image/jpeg;base64,' + bytes.toString('base64');
async function setup(t: any) {
  const dir = await mkdtemp(join(tmpdir(), 'revelumo-relocation-'));
  const file = join(dir, 'original.jpg');
  await copyFile(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const db = join(dir, 'catalog.sqlite');
  const connections: Catalog[] = [];
  const open = () => { const catalog = new Catalog(db); connections.push(catalog); return { catalog, library: new Library(catalog, decoder, decoder) }; };
  t.after(async () => { for (const catalog of connections) { try { catalog.close(); } catch {} } await rm(dir, { recursive: true, force: true }); });
  return { dir, file, db, open, ...open() };
}

// Change a legal quantization coefficient: the JPEG remains structurally valid
// and retains its exact name/byte length, but its complete content differs.
function differentJpeg(original: Buffer): Buffer {
  const bytes = Buffer.from(original);
  const marker = bytes.indexOf(Buffer.from([0xff, 0xdb]));
  assert.ok(marker >= 0);
  bytes[marker + 5] = bytes[marker + 5] === 8 ? 9 : 8;
  return bytes;
}

async function legacy(t: any, version: 1 | 2) {
  const fixture = await setup(t);
  const id = 'e354a57b-41a0-4fd2-9510-2a0db64db026';
  const thumbnail = await decoder(await readFile(fixture.file));
  fixture.catalog.close();
  const db = new DatabaseSync(fixture.db);
  db.exec(`DROP TABLE recipes; DROP TABLE thumbnails; DROP TABLE photos;
    CREATE TABLE photos (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
    PRAGMA user_version = ${version};`);
  db.prepare('INSERT INTO photos VALUES (?, ?, ?)').run(id, fixture.file, 'legacy-name.jpg');
  if (version === 2) {
    db.exec('CREATE TABLE thumbnails (photo_id TEXT PRIMARY KEY REFERENCES photos(id), data_url TEXT NOT NULL)');
    db.prepare('INSERT INTO thumbnails VALUES (?, ?)').run(id, thumbnail);
  }
  db.close();
  return { ...fixture, ...fixture.open(), photo: { id, name: 'legacy-name.jpg' }, thumbnail };
}

test('reimporting distinct content at the same name and size cannot replace the cataloged original or cache', async (t) => {
  const { file, library } = await setup(t);
  const before = await readFile(file);
  const imported = await library.importSelected(file);
  assert.equal(imported.ok, true); if (!imported.ok || imported.value.canceled) throw new Error('fixture import failed');
  const photo = imported.value.photo;
  const cached = await library.thumbnail(photo.id);
  const different = differentJpeg(before); assert.equal(different.length, before.length);
  await writeFile(file, different);
  const result = await library.importSelected(file);
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('different original was accepted');
  assert.equal(result.code, 'identity-mismatch');
  assert.deepEqual(library.list(), [photo]);
  assert.deepEqual(await library.thumbnail(photo.id), cached);
});

test('a second catalog connection never previews a replacement at the original path as the cataloged photo', async (t) => {
  const { file, library, catalog, open } = await setup(t);
  const before = await readFile(file);
  const imported = await library.importSelected(file);
  if (!imported.ok || imported.value.canceled) throw new Error('fixture import failed');
  catalog.close();
  await writeFile(file, differentJpeg(before));
  const reopened = open().library;
  const rejected = await reopened.preview(imported.value.photo.id);
  assert.equal(rejected.ok, false);
  if (rejected.ok) throw new Error('replacement preview was accepted');
  assert.equal(rejected.code, 'identity-mismatch');
  await writeFile(file, before);
  const restored = await reopened.preview(imported.value.photo.id);
  assert.equal(restored.ok, true);
  if (restored.ok) assert.equal(restored.value.dataUrl, await decoder(before));
});

test('an externally moved original is marked missing while its photo and cached thumbnail remain available', async (t) => {
  const { file, dir, library } = await setup(t);
  const imported = await library.importSelected(file);
  if (!imported.ok || imported.value.canceled) throw new Error('fixture import failed');
  const photo = imported.value.photo;
  const cached = await library.thumbnail(photo.id);
  await rename(file, join(dir, 'moved.jpg'));
  const state = await library.status(photo.id);
  assert.equal(state.ok, true);
  if (!state.ok) throw new Error(state.message);
  assert.equal(state.value.state, 'missing');
  assert.equal(state.value.canRelocate, true);
  assert.deepEqual(state.value.photo, photo);
  assert.equal('path' in state.value, false); assert.equal('sha256' in state.value, false);
  assert.deepEqual(library.list(), [photo]);
  assert.deepEqual(await library.thumbnail(photo.id), cached);
});

test('relocating identical bytes with a new filename preserves the photo and cache after reopening', async (t) => {
  const { file, dir, library, catalog, open } = await setup(t);
  const before = await readFile(file);
  const imported = await library.importSelected(file);
  if (!imported.ok || imported.value.canceled) throw new Error('fixture import failed');
  const photo = imported.value.photo;
  const cached = await library.thumbnail(photo.id);
  const moved = join(dir, 'new-name.jpg'); await rename(file, moved);
  const result = await library.relocateSelected(photo.id, moved);
  assert.deepEqual(result, { ok: true, value: { canceled: false, photo } });
  assert.deepEqual(library.list(), [photo]);
  assert.deepEqual(await library.thumbnail(photo.id), cached);
  assert.deepEqual(await readFile(moved), before);
  await assert.rejects(readFile(file), { code: 'ENOENT' });
  catalog.close();
  const reopened = open().library;
  assert.deepEqual(reopened.list(), [photo]);
  const preview = await reopened.preview(photo.id);
  assert.equal(preview.ok, true);
  if (preview.ok) assert.equal(preview.value.dataUrl, await decoder(before));
  const status = await reopened.status(photo.id);
  assert.equal(status.ok, true); if (status.ok) assert.equal(status.value.state, 'available');
});

test('a readable version-two original acquires identity before a later external move without changing legacy data', async (t) => {
  const { file, dir, library, photo, thumbnail } = await legacy(t, 2);
  assert.deepEqual(library.list(), [photo]);
  const present = await library.status(photo.id);
  assert.equal(present.ok, true); if (present.ok) assert.equal(present.value.state, 'available');
  const moved = join(dir, 'legacy-moved.jpg'); await rename(file, moved);
  assert.deepEqual(await library.relocateSelected(photo.id, moved), { ok: true, value: { canceled: false, photo } });
  assert.deepEqual(library.list(), [photo]);
  const cached = await library.thumbnail(photo.id);
  assert.equal(cached.ok, true); if (cached.ok) assert.equal(cached.value.dataUrl, thumbnail);
});

test('previewing an accessible version-one original establishes identity before it is moved', async (t) => {
  const { file, dir, library, photo } = await legacy(t, 1);
  assert.equal((await library.preview(photo.id)).ok, true);
  const moved = join(dir, 'v1-moved.jpg'); await rename(file, moved);
  assert.deepEqual(await library.relocateSelected(photo.id, moved), { ok: true, value: { canceled: false, photo } });
  assert.deepEqual(library.list(), [photo]);
});

test('a legacy original missing before identification cannot be relinked using the candidate as retroactive proof', async (t) => {
  const { file, dir, library, photo, thumbnail } = await legacy(t, 2);
  const moved = join(dir, 'legacy-already-moved.jpg'); await rename(file, moved);
  const status = await library.status(photo.id);
  assert.equal(status.ok, true);
  if (status.ok) { assert.equal(status.value.state, 'missing'); assert.equal(status.value.canRelocate, false); assert.match(status.value.message, /nova foto/); }
  const blocked = await library.relocateSelected(photo.id, moved);
  assert.equal(blocked.ok, false); if (!blocked.ok) assert.equal(blocked.code, 'identity-unverified');
  assert.deepEqual(library.list(), [photo]);
  const cached = await library.thumbnail(photo.id); assert.equal(cached.ok, true); if (cached.ok) assert.equal(cached.value.dataUrl, thumbnail);
  const fresh = await library.importSelected(moved);
  assert.equal(fresh.ok, true); if (!fresh.ok || fresh.value.canceled) throw new Error('new import failed');
  assert.notEqual(fresh.value.photo.id, photo.id);
  assert.deepEqual(library.list(), [photo, fresh.value.photo]);
  assert.equal((await library.preview(photo.id)).ok, false);
});

test('canceling relocation leaves the missing reference, identity and cached data unchanged', async (t) => {
  const { file, dir, library } = await setup(t);
  const imported = await library.importSelected(file); if (!imported.ok || imported.value.canceled) throw new Error('fixture import failed');
  const photo = imported.value.photo;
  await rename(file, join(dir, 'canceled-move.jpg'));
  const status = await library.status(photo.id), cache = await library.thumbnail(photo.id);
  assert.deepEqual(await library.relocateSelected(photo.id, null), { ok: true, value: { canceled: true } });
  assert.deepEqual(await library.status(photo.id), status);
  assert.deepEqual(await library.thumbnail(photo.id), cache);
  assert.deepEqual(library.list(), [photo]);
});

test('a different JPEG with the original name and byte length cannot be relinked', async (t) => {
  const { file, dir, library } = await setup(t);
  const bytes = await readFile(file);
  const imported = await library.importSelected(file); if (!imported.ok || imported.value.canceled) throw new Error('fixture import failed');
  const photo = imported.value.photo;
  const moved = join(dir, 'real-original.jpg'); await rename(file, moved);
  await writeFile(file, differentJpeg(bytes));
  assert.equal((await readFile(file)).length, bytes.length);
  const rejected = await library.relocateSelected(photo.id, file);
  assert.equal(rejected.ok, false); if (!rejected.ok) assert.equal(rejected.code, 'identity-mismatch');
  const status = await library.status(photo.id); assert.equal(status.ok, true); if (status.ok) assert.equal(status.value.state, 'changed');
  assert.deepEqual(library.list(), [photo]);
  assert.deepEqual(await readFile(moved), bytes);
});

test('a destination already owned by another record is refused even when its bytes are identical', async (t) => {
  const { file, dir, library } = await setup(t);
  const occupied = join(dir, 'occupied.jpg'); await copyFile(file, occupied);
  const first = await library.importSelected(file), second = await library.importSelected(occupied);
  if (!first.ok || first.value.canceled || !second.ok || second.value.canceled) throw new Error('fixture import failed');
  const snapshot = library.list();
  await rename(file, join(dir, 'unregistered-move.jpg'));
  const rejected = await library.relocateSelected(first.value.photo.id, occupied);
  assert.equal(rejected.ok, false); if (!rejected.ok) assert.equal(rejected.code, 'path-conflict');
  assert.deepEqual(library.list(), snapshot);
  assert.equal((await library.preview(first.value.photo.id)).ok, false);
  assert.equal((await library.preview(second.value.photo.id)).ok, true);
});

test('a real SQLite write lock cannot partially commit a new reference', async (t) => {
  const { file, dir, db, library, catalog, open } = await setup(t);
  const imported = await library.importSelected(file); if (!imported.ok || imported.value.canceled) throw new Error('fixture import failed');
  const photo = imported.value.photo, before = await library.thumbnail(photo.id);
  const moved = join(dir, 'write-locked.jpg'); await rename(file, moved);
  const lock = new DatabaseSync(db); lock.exec('BEGIN IMMEDIATE');
  try {
    const rejected = await library.relocateSelected(photo.id, moved);
    assert.equal(rejected.ok, false); if (!rejected.ok) assert.equal(rejected.code, 'catalog-error');
  } finally { lock.exec('ROLLBACK'); lock.close(); }
  catalog.close(); const reopened = open().library;
  assert.deepEqual(reopened.list(), [photo]);
  assert.equal((await reopened.preview(photo.id)).ok, false);
  assert.deepEqual(await reopened.thumbnail(photo.id), before);
  assert.deepEqual(await reopened.relocateSelected(photo.id, moved), { ok: true, value: { canceled: false, photo } });
});

test('an invalid candidate and an unknown record never change the catalog', async (t) => {
  const { file, dir, library } = await setup(t);
  const imported = await library.importSelected(file); if (!imported.ok || imported.value.canceled) throw new Error('fixture import failed');
  const photo = imported.value.photo;
  const invalid = join(dir, 'invalid.jpg'); await writeFile(invalid, 'synthetic invalid');
  const result = await library.relocateSelected(photo.id, invalid);
  assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, 'invalid-jpeg');
  const unknown = await library.relocateSelected('unknown', file);
  assert.equal(unknown.ok, false); if (!unknown.ok) assert.equal(unknown.code, 'not-found');
  assert.deepEqual(library.list(), [photo]);
  assert.equal((await library.preview(photo.id)).ok, true);
});

test('closing while relocation waits behind a preview prevents a later reference update', async (t) => {
  const { file, dir, library, catalog } = await setup(t);
  const imported = await library.importSelected(file); if (!imported.ok || imported.value.canceled) throw new Error('fixture import failed');
  const photo = imported.value.photo;
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const queued = new Library(catalog, async bytes => { entered.resolve(); await release.promise; return decoder(bytes); });
  const viewing = queued.preview(photo.id); await entered.promise;
  const moved = join(dir, 'queued-move.jpg'); await rename(file, moved);
  let stopped = false;
  const relocating = queued.relocateSelected(photo.id, moved, () => stopped);
  stopped = true; release.resolve(); await viewing;
  assert.deepEqual(await relocating, { ok: true, value: { canceled: true } });
  assert.equal((await queued.preview(photo.id)).ok, false);
  assert.deepEqual(queued.list(), [photo]);
});

test('a missing thumbnail is never regenerated from a replacement original', async (t) => {
  const { file, catalog } = await setup(t);
  const first = new Library(catalog, decoder);
  const before = await readFile(file);
  const imported = await first.importSelected(file); if (!imported.ok || imported.value.canceled) throw new Error('fixture import failed');
  await writeFile(file, differentJpeg(before));
  const withThumbnails = new Library(catalog, decoder, decoder);
  const thumbnail = await withThumbnails.thumbnail(imported.value.photo.id);
  assert.equal(thumbnail.ok, false); if (!thumbnail.ok) assert.equal(thumbnail.code, 'identity-mismatch');
  await writeFile(file, before);
  const restored = await withThumbnails.thumbnail(imported.value.photo.id);
  assert.equal(restored.ok, true); if (restored.ok) assert.equal(restored.value.dataUrl, await decoder(before));
});

test('generating a legacy thumbnail from the accessible original establishes its identity for relocation', async (t) => {
  const { file, dir, library, photo } = await legacy(t, 1);
  assert.equal((await library.thumbnail(photo.id)).ok, true);
  const moved = join(dir, 'thumbnail-legacy-moved.jpg'); await rename(file, moved);
  assert.deepEqual(await library.relocateSelected(photo.id, moved), { ok: true, value: { canceled: false, photo } });
});
