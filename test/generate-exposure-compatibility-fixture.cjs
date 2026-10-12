// Offline compatibility oracle from an immutable, pre-WB production worker.
// It does not import the new processing module. Tests consume only frozen JSON.
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const baseline = '8b8aa98921760945b5d708f0f481b34d1423a314';
const worker = execFileSync('git', ['show', `${baseline}:src/renderer/exposure.worker.ts`], { encoding: 'utf8' });
const from = worker.indexOf('      const pixels = new Uint8ClampedArray(base);');
const to = worker.indexOf("      context.postMessage({ op: 'pixels'", from);
if (from < 0 || to < from) throw new Error('Could not locate the pinned worker render block');
const render = new Function('base', 'data', `${worker.slice(from, to)}\nreturn pixels;`);
const base = Uint8ClampedArray.from(Array.from({ length: 256 }, (_, byte) => [byte, 255 - byte, (byte + 127) % 256, byte]).flat());
const cases = Array.from({ length: 61 }, (_, index) => {
  const exposureTenths = index - 30;
  return { exposureTenths, sha256: createHash('sha256').update(render(base, { exposureTenths })).digest('hex') };
});
writeFileSync('test/fixtures/exposure-compatibility-reference.json', JSON.stringify({ baseline, workerPath: 'src/renderer/exposure.worker.ts', input: Array.from(base), cases }, null, 2) + '\n');
