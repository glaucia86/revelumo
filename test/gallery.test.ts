import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as gallery from '../src/renderer/gallery.ts';
const photos = Array.from({ length: 105 }, (_, index) => ({ id: String(index), name: `${index}.jpg` }));
test('gallery bounds each page and retains photo identity for preview selection', () => {
  assert.equal(gallery.PAGE_SIZE, 48);
  assert.deepEqual(gallery.pagePhotos(photos, 0), photos.slice(0, 48));
  assert.deepEqual(gallery.pagePhotos(photos, 1), photos.slice(48, 96));
  assert.deepEqual(gallery.pagePhotos(photos, 2), photos.slice(96));
  assert.equal(gallery.pagePhotos(photos, 1)[3].id, '51');
});
test('gallery clamps pages when the library shrinks and handles an empty library', () => {
  assert.equal(gallery.lastPage(105), 2);
  assert.equal(gallery.lastPage(0), 0);
  assert.deepEqual(gallery.pagePhotos([], 99), []);
  assert.deepEqual(gallery.pagePhotos(photos, -1), photos.slice(0, 48));
  assert.deepEqual(gallery.pagePhotos(photos, 99), photos.slice(96));
});
