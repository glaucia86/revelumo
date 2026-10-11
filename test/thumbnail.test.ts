import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as thumbnails from '../src/main/thumbnail.ts';
const original = readFileSync(new URL('./fixtures/qa-orientation-6.jpg', import.meta.url));
const plain = readFileSync(new URL('./fixtures/sample.jpg', import.meta.url));
function oriented(value: number): Buffer {
  const tag = Buffer.from('ffe100224578696600004d4d002a00000008000101120003000000010001000000000000', 'hex');
  tag.writeUInt16BE(value, 28);
  return Buffer.concat([plain.subarray(0, 2), tag, plain.subarray(2)]);
}
test('thumbnail is bounded and carries orientation rather than replacing the original', () => {
  const before = Buffer.from(original);
  let dimensions: number[] = [];
  const data = thumbnails.jpegThumbnail(original, (_bytes, width, height) => { dimensions = [width, height]; return plain; });
  assert.deepEqual(dimensions, [256, 171]);
  assert.equal(thumbnails.jpegOrientation(Buffer.from(data.split(',')[1], 'base64')), 6);
  assert.deepEqual(original, before);
});
test('all eight EXIF orientation values survive derivative encoding', () => {
  for (let orientation = 1; orientation <= 8; orientation++) {
    const encoded = thumbnails.jpegThumbnail(oriented(orientation), () => plain);
    assert.equal(thumbnails.jpegOrientation(Buffer.from(encoded.split(',')[1], 'base64')), orientation);
  }
});
test('missing or malformed orientation falls back safely without out-of-range reads', () => {
  assert.equal(thumbnails.jpegOrientation(plain), 1);
  for (let length = 0; length < 40; length++) assert.equal(thumbnails.jpegOrientation(original.subarray(0, length)), 1);
  assert.equal(thumbnails.jpegOrientation(oriented(999)), 1);
});
test('thumbnail rejects over-budget originals before decoding and oversized derivatives', () => {
  let decoded = false;
  assert.throws(() => thumbnails.jpegThumbnail(Buffer.from('invalid'), () => { decoded = true; return plain; }));
  assert.equal(decoded, false);
  assert.throws(() => thumbnails.jpegThumbnail(original, () => Buffer.alloc(256 * 1024 + 1)), /budget/);
});

test('orientation survives legal JPEG fill bytes and standalone markers', () => {
  for (const prefix of [Buffer.from([0xff]), Buffer.from([0xff, 0x01])]) {
    const padded = Buffer.concat([original.subarray(0, 2), prefix, original.subarray(2)]);
    assert.equal(thumbnails.jpegOrientation(padded), 6);
    const encoded = thumbnails.jpegThumbnail(padded, () => plain);
    assert.equal(thumbnails.jpegOrientation(Buffer.from(encoded.split(',')[1], 'base64')), 6);
  }
});
