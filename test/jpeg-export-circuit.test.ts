import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJpegExporter } from '../src/main/jpeg-export-circuit.ts';
const recipe = { processingVersion: 2, exposureTenths: 0, temperature: 0, tint: 0 };
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function fixture(t: import('node:test').TestContext) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'revelumo-circuit-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const original = await fs.readFile(new URL('./fixtures/export/ascii-credits-gps.jpg', import.meta.url));
  const encoded = Uint8Array.from(await fs.readFile(new URL('./fixtures/export/encoded.jpg', import.meta.url)));
  const sourcePath = join(directory, 'source.jpg'); await fs.writeFile(sourcePath, original, { flag: 'wx' });
  return { directory, original, encoded, request: {
    sourcePath, sourceSha256: digest(original), recipe: { ...recipe }, destination: join(directory, 'new.jpg'),
    originalPaths: [] as string[], protectedDirectories: [join(directory, 'catalog')], maximumOutputBytes: 1024 * 1024,
  } };
}
test('authenticated source becomes a new JPEG with selected credits and unchanged original', async t => {
  const f = await fixture(t);
  const exporter = createJpegExporter(async input => {
    assert.deepEqual(input.source, f.original); assert.deepEqual(input.recipe, recipe);
    return { bytes: f.encoded, width: 8, height: 6 };
  });
  const result = await exporter.exportJpeg(f.request);
  const output = await fs.readFile(result.path);
  assert.equal(result.width, 8); assert.equal(result.height, 6);
  assert.equal(result.bytesWritten, output.length); assert.equal(result.cleanupPending, false);
  assert.ok(output.includes(Buffer.from('Ana Silva\0')));
  assert.equal(output.includes(Buffer.from('Synthetic Camera')), false);
  assert.equal(digest(await fs.readFile(f.request.sourcePath)), f.request.sourceSha256);
  assert.deepEqual((await fs.readdir(f.directory)).sort(), ['new.jpg', 'source.jpg']);
});
test('rejects invalid recipe, paths and budget before any filesystem access', async t => {
  const f = await fixture(t); let calls = 0;
  const exporter = createJpegExporter(async () => { throw new Error('codec must not run'); }, { ...fs, open: async (...args) => { calls++; return fs.open(...args); } });
  for (const changes of [
    { recipe: { ...recipe, crop: null } }, { recipe: { ...recipe, processingVersion: 3 } },
    { destination: 'relative.jpg' }, { sourcePath: 'relative.jpg' }, { originalPaths: ['relative.jpg'] },
    { protectedDirectories: ['relative'] }, { destination: '/bad\0name' },
    { maximumOutputBytes: 0 }, { maximumOutputBytes: Infinity }, { maximumOutputBytes: 1.5 },
  ]) await assert.rejects(exporter.exportJpeg({ ...f.request, ...changes }), error => ['INVALID_REQUEST', 'UNSUPPORTED_RECIPE', 'INVALID_BUDGET'].includes((error as { code: string }).code));
  assert.equal(calls, 0);
});
test('concurrent calls are rejected before a second original is read and gate releases', async t => {
  const f = await fixture(t); let opens = 0; let release!: () => void; let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const exporter = createJpegExporter(async () => { started(); await waiting; return { bytes: f.encoded, width: 8, height: 6 }; }, {
    ...fs, open: async (...args) => { opens++; return fs.open(...args); },
  });
  const first = exporter.exportJpeg(f.request); await entered;
  await assert.rejects(exporter.exportJpeg({ ...f.request, destination: join(f.directory, 'second.jpg') }), { code: 'BUSY' });
  assert.equal(opens, 1); release(); await first;
  await exporter.exportJpeg({ ...f.request, destination: join(f.directory, 'second.jpg') });
});
test('captures caller paths, arrays, recipe and quota before the first await', async t => {
  const f = await fixture(t);
  const exporter = createJpegExporter(async input => { assert.deepEqual(input.recipe, recipe); return { bytes: f.encoded, width: 8, height: 6 }; });
  const destination = f.request.destination;
  const promise = exporter.exportJpeg(f.request);
  f.request.destination = f.request.sourcePath; f.request.originalPaths.push(destination);
  f.request.protectedDirectories.push(f.directory); f.request.maximumOutputBytes = 1; f.request.recipe.temperature = 100;
  const result = await promise;
  assert.equal(result.path, destination); assert.ok((await fs.readFile(destination)).length > 1);
});
test('checks actual encoded JPEG geometry instead of trusting codec dimensions', async t => {
  const f = await fixture(t);
  const exporter = createJpegExporter(async () => ({ bytes: f.encoded, width: 3, height: 2 }));
  await assert.rejects(exporter.exportJpeg(f.request), { code: 'INVALID_OUTPUT' });
  assert.deepEqual(await fs.readdir(f.directory), ['source.jpg']);
});
test('cancellation after codec settles is checked before metadata and publication', async t => {
  const f = await fixture(t); const controller = new AbortController();
  const exporter = createJpegExporter(async () => { controller.abort(); return { bytes: f.encoded, width: 8, height: 6 }; });
  await assert.rejects(exporter.exportJpeg({ ...f.request, maximumOutputBytes: f.encoded.length }, controller.signal), { code: 'CANCELED' });
  assert.deepEqual(await fs.readdir(f.directory), ['source.jpg']);
});
test('rejects changed or unauthenticated originals and recovers for the next valid operation', async t => {
  const f = await fixture(t); let encoded = 0;
  const exporter = createJpegExporter(async () => { encoded++; return { bytes: f.encoded, width: 8, height: 6 }; });
  await assert.rejects(exporter.exportJpeg({ ...f.request, sourceSha256: '0'.repeat(64) }), { code: 'IDENTITY_MISMATCH' });
  await assert.rejects(exporter.exportJpeg({ ...f.request, sourceSha256: null }), { code: 'IDENTITY_UNVERIFIED' });
  assert.equal(encoded, 0); assert.deepEqual(await fs.readdir(f.directory), ['source.jpg']);
  await exporter.exportJpeg(f.request); assert.equal(encoded, 1);
});
test('uses authenticated bytes for credits even when source pathname changes after reading', async t => {
  const f = await fixture(t); const oldPath = join(f.directory, 'authenticated-original.jpg');
  const exporter = createJpegExporter(async input => {
    assert.equal(digest(input.source), f.request.sourceSha256);
    await fs.rename(f.request.sourcePath, oldPath); await fs.writeFile(f.request.sourcePath, f.encoded, { flag: 'wx' });
    return { bytes: f.encoded, width: 8, height: 6 };
  });
  const result = await exporter.exportJpeg(f.request);
  assert.ok((await fs.readFile(result.path)).includes(Buffer.from('Ana Silva\0')));
  assert.equal(digest(await fs.readFile(oldPath)), f.request.sourceSha256);
  await assert.rejects(exporter.exportJpeg({ ...f.request, destination: join(f.directory, 'later.jpg') }), { code: 'IDENTITY_MISMATCH' });
});
test('credit expansion beyond the quota fails before creating any staging or destination', async t => {
  const f = await fixture(t);
  const exporter = createJpegExporter(async () => ({ bytes: f.encoded, width: 8, height: 6 }));
  await assert.rejects(exporter.exportJpeg({ ...f.request, maximumOutputBytes: f.encoded.length }), { code: 'OUTPUT_TOO_LARGE' });
  assert.deepEqual(await fs.readdir(f.directory), ['source.jpg']);
});
test('owns the single-flight gate through publication and reports actual success after late abort', async t => {
  const f = await fixture(t); const controller = new AbortController(); let start!: () => void, finish!: () => void;
  const linking = new Promise<void>(resolve => { start = resolve; }); const proceed = new Promise<void>(resolve => { finish = resolve; });
  const exporter = createJpegExporter(async () => ({ bytes: f.encoded, width: 8, height: 6 }), { ...fs,
    link: async (...args) => { start(); await proceed; await fs.link(...args); controller.abort(); },
  });
  const first = exporter.exportJpeg(f.request, controller.signal); await linking;
  await assert.rejects(exporter.exportJpeg({ ...f.request, destination: join(f.directory, 'another.jpg') }), { code: 'BUSY' });
  finish(); const result = await first;
  assert.equal(result.path, f.request.destination); assert.ok((await fs.readFile(result.path)).length > 0);
});
test('propagates cleanupPending after successful publication and does not delete the result', async t => {
  const f = await fixture(t);
  const exporter = createJpegExporter(async () => ({ bytes: f.encoded, width: 8, height: 6 }), { ...fs,
    unlink: async () => { throw Object.assign(new Error('synthetic busy'), { code: 'EBUSY' }); },
  });
  const result = await exporter.exportJpeg(f.request);
  assert.equal(result.cleanupPending, true); assert.equal((await fs.readFile(result.path)).length, result.bytesWritten);
  assert.equal(digest(await fs.readFile(f.request.sourcePath)), f.request.sourceSha256);
});
test('protects source and hardlink destination identities while competing publishers cannot clobber', async t => {
  const f = await fixture(t); const alias = join(f.directory, 'alias.jpg'); await fs.link(f.request.sourcePath, alias);
  const before = await fs.stat(f.request.sourcePath, { bigint: true });
  const exporter = createJpegExporter(async () => ({ bytes: f.encoded, width: 8, height: 6 }));
  await assert.rejects(exporter.exportJpeg({ ...f.request, destination: f.request.sourcePath }), { code: 'PROTECTED_DESTINATION' });
  await assert.rejects(exporter.exportJpeg({ ...f.request, destination: alias }), { code: 'DESTINATION_EXISTS' });
  const competitor = createJpegExporter(async () => ({ bytes: f.encoded, width: 8, height: 6 }));
  const outcomes = await Promise.allSettled([exporter.exportJpeg(f.request), competitor.exportJpeg(f.request)]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(x => x.status === 'rejected' && x.reason.code === 'DESTINATION_EXISTS').length, 1);
  for (const path of [f.request.sourcePath, alias]) {
    const after = await fs.stat(path, { bigint: true }); assert.equal(after.dev, before.dev); assert.equal(after.ino, before.ino);
    assert.equal(digest(await fs.readFile(path)), f.request.sourceSha256);
  }
});
test('abort while staging creates no output and removes only its temporary files', async t => {
  const f = await fixture(t); const controller = new AbortController();
  const exporter = createJpegExporter(async () => ({ bytes: f.encoded, width: 8, height: 6 }), { ...fs,
    open: async (...args) => { const handle = await fs.open(...args); if (args[1] === 'wx') controller.abort(); return handle; },
  });
  await assert.rejects(exporter.exportJpeg(f.request, controller.signal), { code: 'CANCELED' });
  assert.deepEqual(await fs.readdir(f.directory), ['source.jpg']);
});
for (const operation of ['writeFile', 'sync', 'link'] as const) {
  test(`integrated ${operation} failure leaves original intact and no published file`, async t => {
    const f = await fixture(t);
    const failure = () => { throw Object.assign(new Error('synthetic storage failure'), { code: 'ENOSPC' }); };
    const exporter = createJpegExporter(async () => ({ bytes: f.encoded, width: 8, height: 6 }), { ...fs,
      link: operation === 'link' ? async () => failure() : fs.link,
      open: async (...args) => { const handle = await fs.open(...args); if (args[1] === 'wx' && operation !== 'link') handle[operation] = async () => failure(); return handle; },
    });
    await assert.rejects(exporter.exportJpeg(f.request), { code: operation === 'link' ? 'ATOMIC_PUBLICATION_UNAVAILABLE' : 'WRITE_FAILED' });
    assert.deepEqual(await fs.readdir(f.directory), ['source.jpg']); assert.equal(digest(await fs.readFile(f.request.sourcePath)), f.request.sourceSha256);
  });
}
