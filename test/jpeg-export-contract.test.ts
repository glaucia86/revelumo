import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExportRecipe } from '../src/processing/jpeg-export-contract.ts';
const recipe = { processingVersion: 2, exposureTenths: 10, temperature: 30, tint: -20 };
test('accepts and detaches the complete current JPEG recipe', () => {
  const result = parseExportRecipe(recipe);
  assert.deepEqual(result, recipe); assert.notEqual(result, recipe);
});
test('rejects unknown recipe versions, crop, missing and extra keys without discarding edits', () => {
  for (const input of [null, [], {}, { ...recipe, processingVersion: 1 }, { ...recipe, processingVersion: 3 }, { ...recipe, crop: null }, { ...recipe, ignored: 1 }, { exposureTenths: 0, processingVersion: 2 }]) assert.equal(parseExportRecipe(input), null);
});
test('rejects coercion, fractions and controls beyond their existing canonical ranges', () => {
  for (const field of ['exposureTenths', 'temperature', 'tint']) {
    const limit = field === 'exposureTenths' ? 30 : 100;
    for (const value of [limit + 1, -limit - 1, 0.1, NaN, Infinity, '1', null, undefined]) assert.equal(parseExportRecipe({ ...recipe, [field]: value }), null, `${field}=${value}`);
  }
});
