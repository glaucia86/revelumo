import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Catalog } from '../src/main/catalog.ts';
import { Library } from '../src/main/library.ts';

test('probing an accessible cached legacy original reports unverified presence without enrolling identity', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'revelumo-probe-'));
  const file = join(dir, 'legacy.jpg'), moved = join(dir, 'moved.jpg'), filename = join(dir, 'catalog.sqlite');
  await copyFile(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const id = 'a6b51edc-cdb1-4a7a-9d37-42a676fcb993';
  const db = new DatabaseSync(filename);
  db.exec('CREATE TABLE photos (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL); CREATE TABLE thumbnails (photo_id TEXT PRIMARY KEY REFERENCES photos(id), data_url TEXT NOT NULL); PRAGMA user_version=2');
  db.prepare('INSERT INTO photos VALUES (?, ?, ?)').run(id, file, 'legacy.jpg');
  db.prepare('INSERT INTO thumbnails VALUES (?, ?)').run(id, 'cached'); db.close();
  const catalog = new Catalog(filename);
  t.after(async () => { catalog.close(); await rm(dir, { recursive: true, force: true }); });
  let decodes = 0;
  const library = new Library(catalog, async () => { decodes++; return 'decoded'; });
  const before = library.list();
  const available = await library.availability(id);
  assert.deepEqual(available, { ok: true, value: { photo: before[0], state: 'present', identityRecorded: false, contentVerified: false, message: 'Arquivo acessível. Conteúdo ainda não verificado.' } });
  assert.equal(decodes, 0);
  await rename(file, moved);
  const missing = await library.availability(id);
  assert.equal(missing.ok, true); if (missing.ok) assert.equal(missing.value.state, 'missing');
  const rejected = await library.relocateSelected(id, moved);
  assert.equal(rejected.ok, false); if (!rejected.ok) assert.equal(rejected.code, 'identity-unverified');
  assert.deepEqual(library.list(), before);
  await writeFile(file, 'not a JPEG');
  const presentInvalid = await library.availability(id);
  assert.equal(presentInvalid.ok, true); if (presentInvalid.ok) { assert.equal(presentInvalid.value.state, 'present'); assert.equal(presentInvalid.value.contentVerified, false); }
  assert.equal(decodes, 0);
});
