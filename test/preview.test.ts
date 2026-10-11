import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jpegPreview } from '../src/main/preview.ts';
const bytes = readFileSync(new URL('./fixtures/oriented.jpg', import.meta.url));
test('preview carries the original JPEG bytes including EXIF orientation to the renderer', () => {
  const data = jpegPreview(bytes, () => {});
  assert.deepEqual(Buffer.from(data.split(',')[1], 'base64'), bytes);
  assert.ok(bytes.includes(Buffer.from('Exif\0\0')));
});
test('decoder failures cannot create a preview', () => {
  assert.throws(() => jpegPreview(bytes, () => { throw new Error('Decode failed'); }), /Decode failed/);
});
