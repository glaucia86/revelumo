import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyJpegAdjustments } from '../src/processing/jpeg-adjustments.ts';

test('neutral JPEG adjustments return a detached exact copy of the original sRGB base', () => {
  const base = new Uint8ClampedArray([0, 10, 11, 255, 127, 128, 129, 100, 253, 254, 255, 0]);
  const result = applyJpegAdjustments(base, { exposureTenths: 0, temperature: 0, tint: 0 });
  assert.deepEqual(result, base);
  result[0] = 255;
  assert.equal(base[0], 0);
});

test('neutral white balance retains the established +1 EV result without changing alpha or base pixels', () => {
  const base = new Uint8ClampedArray([128, 0, 255, 100]);
  assert.deepEqual(applyJpegAdjustments(base, { exposureTenths: 10, temperature: 0, tint: 0 }), new Uint8ClampedArray([176, 0, 255, 100]));
  assert.deepEqual(base, new Uint8ClampedArray([128, 0, 255, 100]));
});

test('positive relative temperature warms middle gray with normalized linear sRGB gains', () => {
  // Fixed Decimal-60 oracle value; see fixtures/jpeg-adjustments-provenance.md.
  assert.deepEqual(
    applyJpegAdjustments(new Uint8ClampedArray([128, 128, 128, 255]), { exposureTenths: 0, temperature: 100, tint: 0 }),
    new Uint8ClampedArray([146, 124, 106, 255]),
  );
});

test('positive relative tint moves middle gray toward magenta while retaining normalized brightness', () => {
  assert.deepEqual(
    applyJpegAdjustments(new Uint8ClampedArray([128, 128, 128, 255]), { exposureTenths: 0, temperature: 0, tint: 100 }),
    new Uint8ClampedArray([143, 122, 143, 255]),
  );
});

test('JPEG adjustments reject out-of-range or noninteger controls instead of silently rounding or coercing', () => {
  const base = new Uint8ClampedArray([128, 128, 128, 255]);
  const neutral = { exposureTenths: 0, temperature: 0, tint: 0 };
  for (const field of ['temperature', 'tint', 'exposureTenths']) {
    const limit = field === 'exposureTenths' ? 30 : 100;
    for (const invalid of [-limit - 1, limit + 1, 0.5, NaN, Infinity, -Infinity, '1', null, undefined]) {
      assert.throws(() => applyJpegAdjustments(base, { ...neutral, [field]: invalid }), RangeError, `${field}=${invalid}`);
    }
  }
});

test('JPEG adjustments reject incomplete RGBA pixels', () => {
  for (const length of [1, 2, 3, 5]) {
    assert.throws(() => applyJpegAdjustments(new Uint8ClampedArray(length), { exposureTenths: 0, temperature: 0, tint: 0 }), RangeError);
  }
});


test('neutral white balance exactly preserves every established exposure output and alpha byte', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/exposure-compatibility-reference.json', import.meta.url), 'utf8'));
  const base = new Uint8ClampedArray(fixture.input);
  for (const { exposureTenths, sha256 } of fixture.cases) {
    const result = applyJpegAdjustments(base, { exposureTenths, temperature: 0, tint: 0 });
    assert.equal(createHash('sha256').update(result).digest('hex'), sha256, `${exposureTenths / 10} EV`);
  }
  assert.deepEqual(base, new Uint8ClampedArray(fixture.input));
});

test('white balance matches independently frozen scalar color fixtures at both extremes and interior values', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/jpeg-adjustments-reference.json', import.meta.url), 'utf8'));
  const base = new Uint8ClampedArray(fixture.input.flat());
  for (const { name, adjustments, expected } of fixture.cases) {
    assert.deepEqual(applyJpegAdjustments(base, adjustments), new Uint8ClampedArray(expected.flat()), name);
  }
  assert.deepEqual(base, new Uint8ClampedArray(fixture.input.flat()));
});

test('negative exposure retains highlight information until white balance and exposure are both applied', () => {
  assert.deepEqual(
    applyJpegAdjustments(new Uint8ClampedArray([255, 200, 180, 255]), { exposureTenths: -10, temperature: 100, tint: 100 }),
    new Uint8ClampedArray([234, 134, 120, 255]),
  );
});

test('repeated adjustments derive from the original base and respect its view boundaries', () => {
  const buffer = new Uint8ClampedArray([1, 2, 3, 4, 128, 128, 128, 100, 5, 6, 7, 8]);
  const base = buffer.subarray(4, 8);
  const warm = applyJpegAdjustments(base, { exposureTenths: 0, temperature: 100, tint: 0 });
  const cool = applyJpegAdjustments(base, { exposureTenths: 0, temperature: -100, tint: 0 });
  assert.deepEqual(warm, new Uint8ClampedArray([146, 124, 106, 100]));
  assert.deepEqual(cool, new Uint8ClampedArray([111, 130, 152, 100]));
  assert.deepEqual(applyJpegAdjustments(base, { exposureTenths: 0, temperature: 0, tint: 0 }), new Uint8ClampedArray([128, 128, 128, 100]));
  assert.deepEqual(buffer, new Uint8ClampedArray([1, 2, 3, 4, 128, 128, 128, 100, 5, 6, 7, 8]));
});
