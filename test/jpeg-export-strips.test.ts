import test from 'node:test';
import assert from 'node:assert/strict';
import { applyJpegAdjustments } from '../src/processing/jpeg-adjustments.ts';
import { adjustJpegCanvas } from '../src/export-renderer/strips.ts';
const recipe = { processingVersion: 2 as const, exposureTenths: 0, temperature: 100, tint: 0 };
// Canvas is the external boundary; this memory-backed surface records pixel behavior and read footprints.
function surface(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([128, 128, 128, 255], i);
  let largestRead = 0;
  const context = {
    getImageData(x: number, y: number, w: number, h: number) {
      assert.equal(x, 0); assert.equal(w, width); largestRead = Math.max(largestRead, w * h * 4);
      return { data: data.slice(y * width * 4, (y + h) * width * 4), width: w, height: h };
    },
    putImageData(image: { data: Uint8ClampedArray }, x: number, y: number) { assert.equal(x, 0); data.set(image.data, y * width * 4); },
  };
  return { data, context, largestRead: () => largestRead };
}
test('applies the existing scalar WB oracle to every full-resolution canvas pixel', () => {
  const f = surface(7, 5); adjustJpegCanvas(f.context, 7, 5, recipe);
  for (let i = 0; i < f.data.length; i += 4) assert.deepEqual(Array.from(f.data.subarray(i, i + 4)), [146, 124, 106, 255]);
});
test('caps strip readback at 1 MiB and includes the final partial rows without seams', () => {
  const width = 1025, height = 513, f = surface(width, height);
  adjustJpegCanvas(f.context, width, height, recipe);
  assert.ok(f.largestRead() <= 1024 * 1024, `${f.largestRead()} bytes read at once`);
  for (const y of [0, 254, 255, 256, 511, 512]) {
    for (const x of [0, 1024]) assert.deepEqual(Array.from(f.data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)), [146, 124, 106, 255]);
  }
});
test('rejects invalid geometry instead of looping or silently processing nothing', () => {
  const f = surface(1, 1);
  for (const [width, height] of [[0, 1], [1, 0], [-1, 1], [1.5, 1], [NaN, 1], [Infinity, 1]]) assert.throws(() => adjustJpegCanvas(f.context, width, height, recipe), RangeError);
});
test('one wide row is preserved even when wider than the target strip budget', () => {
  const width = 262145, f = surface(width, 1); adjustJpegCanvas(f.context, width, 1, recipe);
  assert.equal(f.largestRead(), width * 4);
  assert.deepEqual(Array.from(f.data.slice(-4)), [146, 124, 106, 255]);
});

test('varied multi-strip raster is byte-identical to full-buffer processing including alpha', () => {
  const width = 1025, height = 513, f = surface(width, height);
  for (let i = 0; i < f.data.length; i++) f.data[i] = (i * 37 + Math.floor(i / (width * 4)) * 13) % 256;
  const original = f.data.slice();
  const combined = { processingVersion: 2 as const, exposureTenths: -13, temperature: 79, tint: -63 };
  const expected = applyJpegAdjustments(original, combined);
  adjustJpegCanvas(f.context, width, height, combined);
  assert.deepEqual(f.data, expected);
  for (let i = 3; i < f.data.length; i += 4) assert.equal(f.data[i], original[i]);
  assert.ok(f.largestRead() <= 1024 * 1024);
});
