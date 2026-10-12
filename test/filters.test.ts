import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, renameSync, promises } from 'node:fs';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Catalog } from '../src/main/catalog.ts';
import { Library } from '../src/main/library.ts';

test('minimum stars and one flag combine by AND in import order without reading missing originals', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-filters-'));
  const catalog = new Catalog(join(dir, 'catalog.sqlite'));
  let decodingAllowed = true;
  const decoder = async (bytes: Buffer) => {
    assert.ok(decodingAllowed, 'filter queries must not decode originals');
    return 'data:image/jpeg;base64,' + bytes.toString('base64');
  };
  const library = new Library(catalog, decoder, decoder);
  t.after(() => { catalog.close(); rmSync(dir, { recursive: true, force: true }); });
  const photos = [];
  for (const [name, rating, flag] of [
    ['unrated.jpg', null, 'neutral'], ['three.jpg', 3, 'selected'],
    ['four.jpg', 4, 'selected'], ['five.jpg', 5, 'rejected'],
  ] as const) {
    const file = join(dir, name);
    copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), file);
    const imported = await library.importSelected(file);
    assert.ok(imported.ok && !imported.value.canceled);
    photos.push(imported.value.photo);
    assert.equal(library.classify(imported.value.photo.id, rating, flag).ok, true);
    renameSync(file, file + '.moved');
  }
  decodingAllowed = false;
  assert.deepEqual(library.query({ rating: 4, flag: 'selected' }), { ok: true, value: { photos: [photos[2]], total: 4 } });
  const saved = { open: promises.open, stat: promises.stat, realpath: promises.realpath, createHash: crypto.createHash };
  const forbidden = () => { throw new Error('Filter attempted original I/O or hashing'); };
  try {
    Object.assign(promises, { open: forbidden, stat: forbidden, realpath: forbidden });
    Object.assign(crypto, { createHash: forbidden }); syncBuiltinESMExports();
    for (const [rating, flag, expected] of [
      ['all', 'all', photos], ['unrated', 'all', [photos[0]]],
      [1, 'all', [photos[1], photos[2], photos[3]]], [2, 'all', [photos[1], photos[2], photos[3]]],
      [3, 'all', [photos[1], photos[2], photos[3]]], [4, 'all', [photos[2], photos[3]]], [5, 'all', [photos[3]]],
      ['all', 'neutral', [photos[0]]], ['all', 'selected', [photos[1], photos[2]]], ['all', 'rejected', [photos[3]]],
      ['unrated', 'selected', []], [5, 'selected', []],
    ] as const) assert.deepEqual(library.query({ rating, flag }), { ok: true, value: { photos: expected, total: 4 } });
    assert.deepEqual(library.classification(photos[2].id), { ok: true, value: { photo: photos[2], rating: 4, flag: 'selected' } });
  } finally {
    Object.assign(promises, { open: saved.open, stat: saved.stat, realpath: saved.realpath });
    Object.assign(crypto, { createHash: saved.createHash }); syncBuiltinESMExports();
  }
});

test('query rejects invalid filters and reports catalog failures separately from empty results', () => {
  const catalog = new Catalog(':memory:'), library = new Library(catalog, async () => 'unused');
  for (const filters of [null, {}, { rating: 0, flag: 'all' }, { rating: 6, flag: 'all' },
    { rating: 1.5, flag: 'all' }, { rating: '4', flag: 'all' }, { rating: null, flag: 'all' },
    { rating: 'all', flag: 'wrong' }, { rating: 'all', flag: 'all', path: '/free/path' }]) {
    assert.equal((library.query as Function)(filters).code, 'invalid-request');
  }
  assert.deepEqual(library.query({ rating: 'all', flag: 'all' }), { ok: true, value: { photos: [], total: 0 } });
  catalog.close();
  assert.equal(library.query({ rating: 'all', flag: 'all' }).code, 'catalog-error');
});

test('all minimum boundaries and null combine with each saved flag without changing classification', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-filter-matrix-'));
  const catalog = new Catalog(join(dir, 'catalog.sqlite'));
  const decoder = async (bytes: Buffer) => 'data:image/jpeg;base64,' + bytes.toString('base64');
  const library = new Library(catalog, decoder, decoder);
  t.after(() => { catalog.close(); rmSync(dir, { recursive: true, force: true }); });
  for (const rating of [null, 1, 2, 3, 4, 5]) for (const flag of ['neutral', 'selected', 'rejected'] as const) {
    const file = join(dir, `${rating ?? 'unrated'}-${flag}.jpg`);
    copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), file);
    const imported = await library.importSelected(file); assert.ok(imported.ok && !imported.value.canceled);
    assert.equal(library.classify(imported.value.photo.id, rating, flag).ok, true);
  }
  const before = library.list().map(photo => library.classification(photo.id));
  for (const [rating, expectedRatings] of [
    ['all', ['unrated', 1, 2, 3, 4, 5]], ['unrated', ['unrated']],
    [1, [1, 2, 3, 4, 5]], [2, [2, 3, 4, 5]], [3, [3, 4, 5]], [4, [4, 5]], [5, [5]],
  ] as const) for (const flag of ['all', 'neutral', 'selected', 'rejected'] as const) {
    const result = library.query({ rating, flag }); assert.ok(result.ok);
    const flags = flag === 'all' ? ['neutral', 'selected', 'rejected'] : [flag];
    assert.deepEqual(result.value.photos.map(photo => photo.name), expectedRatings.flatMap(value => flags.map(savedFlag => `${value}-${savedFlag}.jpg`)));
    assert.equal(result.value.total, 18);
  }
  assert.deepEqual(library.query({ rating: 'all', flag: 'all' }), { ok: true, value: { photos: library.list(), total: 18 } });
  assert.deepEqual(library.list().map(photo => library.classification(photo.id)), before);
});
