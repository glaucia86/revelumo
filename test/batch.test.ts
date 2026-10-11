import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, copyFile, writeFile, readFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { Catalog } from '../src/main/catalog.ts';
import { Library } from '../src/main/library.ts';
const thumb = 'data:image/jpeg;base64,/9j/2Q==';
const preview = async (bytes: Buffer) => 'data:image/jpeg;base64,' + bytes.toString('base64');
async function setup(t: any, decoder = async (_: Buffer) => thumb) {
  const dir = await mkdtemp(join(tmpdir(), 'revelumo-batch-'));
  const files = [join(dir, 'first.jpg'), join(dir, 'bad.jpg'), join(dir, 'last.jpg')];
  await copyFile(new URL('./fixtures/sample.jpg', import.meta.url), files[0]);
  await writeFile(files[1], 'not a jpeg');
  await copyFile(new URL('./fixtures/oriented.jpg', import.meta.url), files[2]);
  const db = join(dir, 'catalog.sqlite');
  const catalog = new Catalog(db);
  t.after(async () => { try { catalog.close(); } catch {} await rm(dir, { recursive: true, force: true }); });
  return { dir, files, db, catalog, library: new Library(catalog, preview, decoder) };
}
test('mixed batch commits valid references, reports each failure and emits monotonic progress', async (t) => {
  const { files, library } = await setup(t);
  const before = await Promise.all(files.map(async p => createHash('sha256').update(await readFile(p)).digest('hex')));
  const progress: number[] = [];
  const result = await library.importBatch(files, state => progress.push(state.completed));
  assert.equal(result.canceled, false);
  assert.deepEqual(result.items.map(x => x.result.ok), [true, false, true]);
  assert.equal(result.items[1].name, 'bad.jpg');
  assert.equal(result.items[1].result.code, 'invalid-jpeg');
  assert.deepEqual(progress, [0, 1, 2, 3]);
  assert.equal(library.list().length, 2);
  const after = await Promise.all(files.map(async p => createHash('sha256').update(await readFile(p)).digest('hex')));
  assert.deepEqual(after, before);
});
test('canonical path deduplication includes symlink aliases and preserves identifier', async (t) => {
  const { dir, files, library } = await setup(t);
  const alias = join(dir, 'alias.jpg'); await symlink(files[0], alias);
  const result = await library.importBatch([files[0], alias, files[0]]);
  assert.equal(library.list().length, 1);
  assert.equal(new Set(result.items.map(x => x.result.value.id)).size, 1);
});
test('decoding stays serial even with overlapping service requests', async (t) => {
  let active = 0, peak = 0;
  const decoder = async (_: Buffer) => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 15)); active--; return thumb; };
  const { files, library } = await setup(t, decoder);
  await Promise.all([library.importBatch([files[0], files[2]]), library.importSelected(files[0]), library.importSelected(files[2])]);
  assert.equal(peak, 1);
});
test('stopping a batch preserves committed photos and cached thumbnails after reopening', async (t) => {
  const { files, library, catalog, db } = await setup(t);
  let stop = false;
  const result = await library.importBatch(files, state => { if (state.completed === 1) stop = true; }, () => stop);
  assert.equal(result.stopped, true); assert.equal(result.items.length, 1);
  const photo = library.list()[0]; catalog.close();
  await rm(files[0]);
  const reopened = new Catalog(db); t.after(() => reopened.close());
  const second = new Library(reopened, preview, async () => { throw new Error('must use cache'); });
  assert.equal(second.list().length, 1);
  assert.equal((await second.thumbnail(photo.id)).value.dataUrl, thumb);
  assert.equal((await second.preview(photo.id)).code, 'unreadable');
});
test('canceling multiple selection creates nothing; a missing legacy cache is generated once', async (t) => {
  let calls = 0;
  const { library, catalog, files } = await setup(t, async () => { calls++; return thumb; });
  assert.deepEqual(await library.importBatch(null), { canceled: true });
  assert.deepEqual(library.list(), []);
  const old = catalog.add(files[0]);
  assert.equal((await library.thumbnail(old.id)).value.dataUrl, thumb);
  assert.equal((await library.thumbnail(old.id)).value.dataUrl, thumb);
  assert.equal(calls, 1);
  assert.equal((await library.thumbnail('/etc/passwd')).code, 'not-found');
});

test('closing while an import waits behind a preview does not start or commit the queued item', async (t) => {
  const { catalog, files } = await setup(t);
  const existing = catalog.add(files[0]);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let calls = 0, stopped = false;
  const library = new Library(catalog, async () => { entered.resolve(); await release.promise; return thumb; }, async () => { calls++; return thumb; });
  const pendingPreview = library.preview(existing.id); await entered.promise;
  const pendingBatch = library.importBatch([files[2]], () => {}, () => stopped);
  stopped = true; release.resolve(); await pendingPreview;
  const result = await pendingBatch;
  assert.equal(calls, 0); assert.equal(result.stopped, true); assert.equal(result.items.length, 0);
  assert.equal(catalog.list().length, 1);
});

test('closing during derivative generation prevents a later commit of that unfinished item', async (t) => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let stopped = false;
  const { library, files, catalog } = await setup(t, async () => { entered.resolve(); await release.promise; return thumb; });
  const pending = library.importBatch([files[0]], () => {}, () => stopped);
  await entered.promise; stopped = true; release.resolve();
  const result = await pending;
  assert.equal(result.stopped, true); assert.equal(result.items.length, 0);
  assert.equal(catalog.list().length, 0);
});
