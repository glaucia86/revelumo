import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, copyFile, readFile, writeFile, stat, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Catalog } from '../src/main/catalog.ts';
import { Library } from '../src/main/library.ts';

// Electron decoding is an explicit adapter boundary. These tests cover the real
// filesystem, SQLite and service, not the Electron decoder.
const previewAdapter = async (bytes: Buffer) => 'data:image/jpeg;base64,' + bytes.toString('base64');
async function setup(t: any, decoder = previewAdapter) {
  const dir = await mkdtemp(join(tmpdir(), 'revelumo-library-'));
  const file = join(dir, 'photo.jpg');
  await copyFile(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const catalog = new Catalog(join(dir, 'catalog.sqlite'));
  t.after(async () => { catalog.close(); await rm(dir, { recursive: true, force: true }); });
  return { dir, file, catalog, library: new Library(catalog, decoder) };
}
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test('imports by reference, returns no private path and leaves original bytes/location unchanged', async (t) => {
  const { file, catalog, library } = await setup(t);
  const before = await readFile(file);
  const imported = await library.importSelected(file);
  assert.equal(imported.ok, true);
  assert.equal(imported.value.canceled, false);
  assert.equal(imported.value.photo.name, 'photo.jpg');
  assert.equal('path' in imported.value.photo, false);
  assert.equal(catalog.list()[0].path, file);
  assert.equal(hash(await readFile(file)), hash(before));
  assert.equal((await stat(file)).size, before.length);
  const preview = await library.preview(imported.value.photo.id);
  assert.equal(preview.ok, true);
  assert.equal(preview.value.dataUrl, 'data:image/jpeg;base64,' + before.toString('base64'));
});

test('canceling selection leaves the catalog empty', async (t) => {
  const { library, catalog } = await setup(t);
  assert.deepEqual(await library.importSelected(null), { ok: true, value: { canceled: true } });
  assert.deepEqual(catalog.list(), []);
});

test('non-JPEG content cannot enter the catalog even with a .jpg suffix', async (t) => {
  const { library, catalog, file } = await setup(t);
  await writeFile(file, 'not a JPEG');
  assert.equal((await library.importSelected(file)).code, 'invalid-jpeg');
  assert.deepEqual(catalog.list(), []);
});

test('decoder rejection prevents storing malformed JPEG-shaped content', async (t) => {
  const { library, catalog, file } = await setup(t, async () => { throw new Error('decode failed'); });
  assert.equal((await library.importSelected(file)).code, 'invalid-jpeg');
  assert.deepEqual(catalog.list(), []);
});

test('missing files and directories return readable errors without a record', async (t) => {
  const { library, catalog, dir } = await setup(t);
  assert.equal((await library.importSelected(join(dir, 'absent.jpg'))).code, 'unreadable');
  assert.equal((await library.importSelected(dir)).code, 'unreadable');
  assert.deepEqual(catalog.list(), []);
});

test('oversized JPEG is rejected before preview decoding', async (t) => {
  const { library, catalog, file } = await setup(t);
  await truncate(file, 32 * 1024 * 1024 + 1);
  assert.equal((await library.importSelected(file)).code, 'too-large');
  assert.deepEqual(catalog.list(), []);
});

test('a missing original stays cataloged and reports an unavailable preview', async (t) => {
  const { library, catalog, file } = await setup(t);
  const imported = await library.importSelected(file);
  await rm(file);
  assert.equal((await library.preview(imported.value.photo.id)).code, 'unreadable');
  assert.equal(catalog.list().length, 1);
});

test('preview lookup cannot use an arbitrary filesystem path', async (t) => {
  const { library, file } = await setup(t);
  assert.equal((await library.preview(file)).code, 'not-found');
});

test('catalog failures carry stable translatable descriptors without replacing legacy codes', async t => {
  const { library, file, dir } = await setup(t);
  await writeFile(file, 'invalid JPEG');
  const invalid = await library.importSelected(file);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) { assert.equal(invalid.code, 'invalid-jpeg'); assert.deepEqual(invalid.descriptor, { key: 'errors.invalidJpeg' }); }
  const absent = await library.importSelected(join(dir, 'absent.jpg'));
  assert.equal(absent.ok, false);
  if (!absent.ok) assert.deepEqual(absent.descriptor, { key: 'errors.locateFile' });
});
