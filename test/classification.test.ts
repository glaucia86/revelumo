import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, readFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Catalog } from '../src/main/catalog.ts';
import { Library } from '../src/main/library.ts';
import { DatabaseSync } from 'node:sqlite';

const decoder = async (bytes: Buffer) => 'data:image/jpeg;base64,' + bytes.toString('base64');
test('classification persists by identity across reimport and catalog restart without touching the JPEG', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-classification-'));
  const file = join(dir, 'photo.jpg'), db = join(dir, 'catalog.sqlite');
  copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const before = readFileSync(file);
  let catalog = new Catalog(db);
  t.after(() => { catalog.close(); rmSync(dir, { recursive: true, force: true }); });
  let library = new Library(catalog, decoder, decoder);
  const imported = await library.importSelected(file);
  assert.ok(imported.ok && !imported.value.canceled);
  const photo = imported.value.photo;
  assert.deepEqual(library.classification(photo.id), { ok: true, value: { photo, rating: null, flag: 'neutral' } });
  assert.deepEqual(library.classify(photo.id, 4, 'selected'), { ok: true, value: { photo, rating: 4, flag: 'selected' } });
  assert.deepEqual(await library.importSelected(file), imported);
  catalog.close(); catalog = new Catalog(db); library = new Library(catalog, decoder, decoder);
  assert.deepEqual(library.classification(photo.id), { ok: true, value: { photo, rating: 4, flag: 'selected' } });
  assert.deepEqual(readFileSync(file), before);
});

test('legacy schemas migrate with no rating/flag while preserving identity, JPEG preview and cached thumbnails', async (t) => {
  for (const version of [1, 2, 3]) {
    const dir = mkdtempSync(join(tmpdir(), 'revelumo-classification-'));
    const file = join(dir, 'legacy.jpg'), db = join(dir, 'catalog.sqlite');
    copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), file);
    const fixture = new DatabaseSync(db), id = '420ce72c-2bb7-4e40-89ec-e3945c5b5425';
    fixture.exec(`CREATE TABLE photos (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL${version === 3 ? ', sha256 TEXT' : ''}); PRAGMA user_version=${version}`);
    fixture.prepare('INSERT INTO photos (id, path, name) VALUES (?, ?, ?)').run(id, file, 'legacy.jpg');
    if (version >= 2) {
      fixture.exec('CREATE TABLE thumbnails (photo_id TEXT PRIMARY KEY REFERENCES photos(id), data_url TEXT NOT NULL)');
      fixture.prepare('INSERT INTO thumbnails VALUES (?, ?)').run(id, 'data:image/jpeg;base64,AA==');
    }
    fixture.close();
    const catalog = new Catalog(db), library = new Library(catalog, decoder, decoder);
    try {
      const photo = { id, name: 'legacy.jpg' };
      assert.deepEqual(library.list(), [photo]);
      assert.deepEqual(library.classification(id), { ok: true, value: { photo, rating: null, flag: 'neutral' } });
      if (version >= 2) assert.deepEqual(await library.thumbnail(id), { ok: true, value: { photo, dataUrl: 'data:image/jpeg;base64,AA==' } });
      assert.equal((await library.preview(id)).ok, true);
    } finally { catalog.close(); rmSync(dir, { recursive: true, force: true }); }
  }
});

test('relocation and canceled selection keep the classification associated with the same UUID', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-classification-'));
  const file = join(dir, 'photo.jpg'), moved = join(dir, 'moved.jpg');
  copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const catalog = new Catalog(join(dir, 'catalog.sqlite')), library = new Library(catalog, decoder, decoder);
  t.after(() => { catalog.close(); rmSync(dir, { recursive: true, force: true }); });
  const imported = await library.importSelected(file); assert.ok(imported.ok && !imported.value.canceled);
  const id = imported.value.photo.id;
  library.classify(id, 2, 'rejected'); const before = library.classification(id);
  renameSync(file, moved);
  assert.deepEqual(await library.relocateSelected(id, null), { ok: true, value: { canceled: true } });
  assert.deepEqual(await library.importSelected(null), { ok: true, value: { canceled: true } });
  assert.deepEqual(library.classification(id), before);
  assert.equal((await library.relocateSelected(id, moved)).ok, true);
  assert.deepEqual(library.classification(id), before);
});

test('change, repeat and clear are atomic; invalid input, unknown UUID and locked SQLite preserve the last classification', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-classification-'));
  const db = join(dir, 'catalog.sqlite'), catalog = new Catalog(db);
  t.after(() => { catalog.close(); rmSync(dir, { recursive: true, force: true }); });
  const library = new Library(catalog, decoder), photo = library.list();
  const id = catalog.add('/synthetic/photo.jpg').id;
  assert.equal(photo.length, 0);
  assert.equal(library.classify(id, 5, 'rejected').ok, true);
  const previous = library.classification(id);
  assert.deepEqual(library.classify(id, 5, 'rejected'), previous);
  for (const [rating, flag] of [[0, 'neutral'], [6, 'selected'], [2.5, 'neutral'], [3, 'wrong'], [undefined, 'neutral']]) {
    assert.equal((library.classify as Function)(id, rating, flag).code, 'invalid-request');
    assert.deepEqual(library.classification(id), previous);
  }
  assert.equal(library.classify('/synthetic/photo.jpg', null, 'neutral').code, 'invalid-request');
  assert.equal(library.classify('420ce72c-2bb7-4e40-89ec-e3945c5b5425', null, 'neutral').code, 'not-found');
  const blocker = new DatabaseSync(db);
  try {
    blocker.exec('BEGIN EXCLUSIVE');
    assert.equal(library.classify(id, 1, 'selected').code, 'catalog-error');
  } finally { blocker.exec('ROLLBACK'); blocker.close(); }
  assert.deepEqual(library.classification(id), previous);
  assert.equal(library.classify(id, null, 'neutral').ok, true);
  assert.deepEqual(library.classification(id), { ok: true, value: { photo: { id, name: 'photo.jpg' }, rating: null, flag: 'neutral' } });
});
