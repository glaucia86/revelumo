import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeFullResolution } from '../src/export-renderer/encode.ts';
const recipe = { processingVersion: 2, exposureTenths: 0, temperature: 0, tint: 0 };
// External browser-codec boundary. Pixel fidelity is tested separately in real Electron.
function browser(t: import('node:test').TestContext, failure: boolean | 'context' = false) {
  const originalBitmap = globalThis.createImageBitmap, originalCanvas = globalThis.OffscreenCanvas;
  const observed = { closed: 0, orientation: undefined as unknown, context: undefined as unknown, encoding: undefined as unknown, surface: null as unknown as { width: number; height: number } };
  globalThis.createImageBitmap = async (_blob, options) => { observed.orientation = options; return { width: 2, height: 2, close() { observed.closed++; } } as ImageBitmap; };
  globalThis.OffscreenCanvas = class {
    width: number; height: number;
    constructor(width: number, height: number) { this.width = width; this.height = height; observed.surface = this; }
    getContext(_type: string, options: unknown) { observed.context = options; if (failure === 'context') return null; return { drawImage() {}, getImageData() { return { data: new Uint8ClampedArray(16) }; }, putImageData() {} }; }
    async convertToBlob(options: unknown) { observed.encoding = options; if (failure) throw new Error('injected codec failure'); return new Blob([readFileSync(new URL('./fixtures/sample.jpg', import.meta.url))], { type: 'image/jpeg' }); }
  } as unknown as typeof OffscreenCanvas;
  t.after(() => { globalThis.createImageBitmap = originalBitmap; globalThis.OffscreenCanvas = originalCanvas; });
  return observed;
}
test('uses fixed .90 JPEG, EXIF decode orientation and explicit sRGB Canvas, then releases surfaces', async t => {
  const observed = browser(t);
  const result = await encodeFullResolution(new Uint8Array([1, 2]), recipe, 1024 * 1024);
  assert.deepEqual(observed.orientation, { imageOrientation: 'from-image', colorSpaceConversion: 'default' });
  assert.deepEqual(observed.context, { colorSpace: 'srgb', willReadFrequently: true });
  assert.deepEqual(observed.encoding, { type: 'image/jpeg', quality: .90 });
  assert.equal(result.width, 2); assert.equal(observed.closed, 1);
  assert.equal(observed.surface.width, 1); assert.equal(observed.surface.height, 1);
});
test('codec failure also closes the bitmap and drops Canvas dimensions', async t => {
  const observed = browser(t, true);
  await assert.rejects(encodeFullResolution(new Uint8Array([1]), recipe, 1024), /injected codec failure/);
  assert.equal(observed.closed, 1); assert.equal(observed.surface.width, 1); assert.equal(observed.surface.height, 1);
});

test('unavailable Canvas context closes decoded bitmap and releases surface', async t => {
  const observed = browser(t, 'context');
  await assert.rejects(encodeFullResolution(new Uint8Array([1]), recipe, 1024), /CANVAS_UNAVAILABLE/);
  assert.equal(observed.closed, 1);
  assert.equal(observed.surface.width, 1); assert.equal(observed.surface.height, 1);
  assert.equal(observed.encoding, undefined);
});
