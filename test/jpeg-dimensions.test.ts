import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jpegDimensions } from '../src/main/jpeg-dimensions.ts';
const jpeg = readFileSync(new URL('./fixtures/sample.jpg', import.meta.url));
test('reads dimensions from an actual JPEG before invoking a decoder', () => {
  assert.deepEqual(jpegDimensions(jpeg), { width: 2, height: 2 });
});
test('refuses malformed JPEG and excessive pixel dimensions before decoding', () => {
  assert.throws(() => jpegDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8])));
  const huge = Buffer.from(jpeg);
  const offset = huge.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(offset > 0);
  huge.writeUInt16BE(65535, offset + 5); huge.writeUInt16BE(65535, offset + 7);
  assert.throws(() => jpegDimensions(huge), /40 megapixels/);
});
