import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PreviewSource } from '../src/renderer/preview-source.ts';

const photo = { id: 'photo-a', name: 'a.jpg' };
test('a preview delivers its owned compressed payload only once, before transfer', () => {
  const bytes = new Uint8Array([255, 216, 255, 217]).buffer;
  const source = new PreviewSource({ photo, bytes });
  assert.equal(source.take(), bytes);
  assert.equal(source.take(), null);
  const delivered = structuredClone(bytes, { transfer: [bytes] });
  assert.equal(bytes.byteLength, 0);
  assert.deepEqual([...new Uint8Array(delivered)], [255, 216, 255, 217]);
  source.release(); source.release();
  assert.equal(source.take(), null);
  assert.deepEqual(source.photo, photo);
});
test('retiring before delivery drops the payload and is idempotent', () => {
  const source = new PreviewSource({ photo, bytes: new Uint8Array([255, 216, 255, 217]).buffer });
  source.release(); source.release();
  assert.equal(source.take(), null);
  assert.deepEqual(source.photo, photo);
});
