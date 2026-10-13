// Isolated-process instrumentation of explicit Uint8ClampedArray construction.
// Canvas readbacks use the captured native constructor and are counted separately.
// This is not a heap/RSS profiler and does not observe V8/native implicit allocation.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const { adjustJpegCanvas } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '../../src/export-renderer/strips.ts');
const NativePixels = globalThis.Uint8ClampedArray;
const width = 1025, height = 513;
const data = new NativePixels(width * height * 4);
for (let i = 0; i < data.length; i++) data[i] = (i * 37 + Math.floor(i / (width * 4)) * 13) % 256;
const allocations = [], readbacks = [];
const recipe = process.argv[3] === 'neutral'
  ? { processingVersion: 2, exposureTenths: 0, temperature: 0, tint: 0 }
  : { processingVersion: 2, exposureTenths: -13, temperature: 79, tint: -63 };
const context = {
  getImageData(_x, y, _width, rows) {
    const pixels = new NativePixels(data.subarray(y * width * 4, (y + rows) * width * 4));
    readbacks.push(pixels.byteLength);
    return { data: pixels };
  },
  putImageData(image, _x, y) { data.set(image.data, y * width * 4); },
};
globalThis.Uint8ClampedArray = new Proxy(NativePixels, {
  construct(target, args) {
    const pixels = Reflect.construct(target, args);
    allocations.push(pixels.byteLength);
    return pixels;
  },
});
try { adjustJpegCanvas(context, width, height, recipe); }
finally { globalThis.Uint8ClampedArray = NativePixels; }
console.log(JSON.stringify({ width, height, recipe, readbacks, allocations,
  explicitAllocatedBytes: allocations.reduce((sum, bytes) => sum + bytes, 0),
  sha256: createHash('sha256').update(data).digest('hex'),
}));
