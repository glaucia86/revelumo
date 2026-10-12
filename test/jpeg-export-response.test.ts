import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateExportOutput } from '../src/main/jpeg-export-response.ts';
const bytes = readFileSync(new URL('./fixtures/sample.jpg', import.meta.url));
const dimensions = { width: 2, height: 2 };
const response = { jobId: 'owned-job', bytes, ...dimensions };
test('accepts a bounded JPEG response for the owning job without copying it', () => {
  const result = validateExportOutput(response, 'owned-job', dimensions, 1024 * 1024);
  assert.ok(result); assert.equal(result.bytes, bytes); assert.equal(result.width, dimensions.width);
});
test('rejects wrong job and malformed result schema before inspecting image bytes', () => {
  for (const input of [null, [], {}, { ...response, jobId: 'old-job' }, { ...response, path: '/free.jpg' }, { ...response, bytes: [] }, { ...response, width: '2' }]) assert.equal(validateExportOutput(input, 'owned-job', dimensions, 1024 * 1024), null);
});
test('rejects oversized views or hidden oversized backing storage and shared memory', () => {
  const large = new Uint8Array(1024); large.set(bytes.subarray(0, Math.min(bytes.length, 1024)));
  for (const output of [large, large.subarray(0, 10), new Uint8Array(new SharedArrayBuffer(20))]) assert.equal(validateExportOutput({ ...response, bytes: output }, 'owned-job', dimensions, 100), null);
  for (const maximumBytes of [0, -1, 1.5, NaN, Infinity]) assert.equal(validateExportOutput(response, 'owned-job', dimensions, maximumBytes), null);
});
test('rejects non-JPEG, truncated output and dimension lies without decoding an unbounded payload', () => {
  for (const output of [new Uint8Array(), new Uint8Array([1, 2, 3]), bytes.subarray(0, bytes.length - 2)]) assert.equal(validateExportOutput({ ...response, bytes: output }, 'owned-job', dimensions, 1024 * 1024), null);
  assert.equal(validateExportOutput({ ...response, width: 3 }, 'owned-job', dimensions, 1024 * 1024), null);
  assert.equal(validateExportOutput(response, 'owned-job', { width: 3, height: 2 }, 1024 * 1024), null);
});
