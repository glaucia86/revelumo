import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jpegPreview } from '../src/main/preview.ts';
const bytes = readFileSync(new URL('./fixtures/oriented.jpg', import.meta.url));
test('preview carries the original JPEG bytes including EXIF orientation to the renderer', () => {
  const data = jpegPreview(bytes);
  assert.ok(data instanceof ArrayBuffer);
  assert.deepEqual(Buffer.from(data), bytes);
  assert.ok(bytes.includes(Buffer.from('Exif\0\0')));
});
test('malformed bytes cannot create a preview', () => {
  assert.throws(() => jpegPreview(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), /JPEG/);
});

test('preview owns exactly the authenticated byte view, without surrounding allocation bytes', () => {
  const storage = Buffer.alloc(bytes.length + 16, 0xa5);
  bytes.copy(storage, 7);
  const view = storage.subarray(7, 7 + bytes.length);
  const payload = jpegPreview(view);
  assert.ok(payload instanceof ArrayBuffer);
  assert.equal(payload.byteLength, bytes.length);
  assert.deepEqual(Buffer.from(payload), bytes);
  storage.fill(0);
  assert.deepEqual(Buffer.from(payload), bytes);
});
