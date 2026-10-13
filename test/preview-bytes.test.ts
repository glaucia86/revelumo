import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewBytes } from '../src/shared/preview-bytes.ts';

test('compressed preview boundary rejects invalid or excessive payloads using a tiny budget', () => {
  const jpeg = new Uint8Array([255,216,255,217]).buffer;
  assert.deepEqual([...previewBytes(jpeg, 4)], [255,216,255,217]);
  for (const value of [null, '', new ArrayBuffer(0), new Uint8Array(jpeg), new SharedArrayBuffer(4), new ArrayBuffer(4)]) {
    assert.throws(() => previewBytes(value, 8));
  }
  assert.throws(() => previewBytes(jpeg, 3));
  assert.throws(() => previewBytes(new ArrayBuffer(4, {maxByteLength:8}), 8));
  const detached = jpeg.slice(0); structuredClone(detached, {transfer:[detached]});
  assert.throws(() => previewBytes(detached, 4));
});
