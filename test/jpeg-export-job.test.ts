import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Catalog } from '../src/main/catalog.ts';
import { Library } from '../src/main/library.ts';
import { createJpegExporter } from '../src/main/jpeg-export-circuit.ts';
import { JpegExportJobs, JPEG_EXPORT_OUTPUT_LIMIT } from '../src/main/jpeg-export-job.ts';
async function fixture(t, choose?) {
  const dir = await fs.mkdtemp(join(tmpdir(), 'revelumo-export-job-')), source = join(dir, 'source.jpg'), data = join(dir, 'data');
  await fs.mkdir(data); await fs.copyFile(new URL('./fixtures/export/ascii-credits-gps.jpg', import.meta.url), source);
  const catalog = new Catalog(join(data, 'catalog.sqlite')), library = new Library(catalog, async b => 'data:image/jpeg;base64,' + b.toString('base64'));
  t.after(async () => { catalog.close(); await fs.rm(dir, { recursive: true, force: true }); });
  const imported = await library.importSelected(source); assert.ok(imported.ok && !imported.value.canceled);
  const edit = await library.beginEditing(imported.value.photo.id); assert.ok(edit.ok);
  const encoded = await fs.readFile(new URL('./fixtures/export/encoded.jpg', import.meta.url));
  const output = join(dir, 'export.jpg'), owner = {};
  const exporter = createJpegExporter(async () => ({ bytes: encoded, width: 8, height: 6 }));
  const jobs = new JpegExportJobs(library, choose ?? (async () => output), exporter.exportJpeg, [data]);
  const request = { attemptId: '44444444-4444-4444-8444-444444444444', id: imported.value.photo.id, sessionId: edit.value.sessionId, revision: 0 };
  return { dir, source, data, output, owner, library, jobs, request };
}
const terminal = async (jobs, owner, id) => {
  for (let i = 0; i < 200; i++) { const result = jobs.status(owner, id); if (result.ok && ['succeeded','failed','canceled'].includes(result.value.state)) return result.value; await new Promise(r => setTimeout(r, 5)); }
  throw new Error('job did not finish');
};
test('starts a main-owned job and retains the actual published outcome without pixel buffers', async t => {
  const f = await fixture(t), started = f.jobs.start(f.owner, f.request);
  assert.ok(started.ok); assert.match(started.value.jobId, /^[a-f0-9-]{36}$/);
  const done = await terminal(f.jobs, f.owner, started.value.jobId);
  assert.equal(done.state, 'succeeded'); assert.equal(done.result.path, f.output);
  assert.equal(done.result.bytesWritten, (await fs.stat(f.output)).size);
  assert.equal(JSON.stringify(done).includes('sourcePath'), false);
  assert.equal(JPEG_EXPORT_OUTPUT_LIMIT, 32 * 1024 * 1024);
});

test('acknowledges before dialog settles, refuses duplicate allocation and cancels eventual selection', async t => {
  let resolve; const selection = new Promise(r => { resolve = r; });
  const f = await fixture(t, () => selection), started = f.jobs.start(f.owner, f.request); assert.ok(started.ok);
  assert.equal(f.jobs.start(f.owner, f.request).code, 'BUSY');
  assert.equal(f.jobs.cancel({}, started.value.jobId).ok, false);
  assert.equal(f.jobs.cancel(f.owner, started.value.jobId).value.state, 'canceling');
  resolve(f.output);
  assert.equal((await terminal(f.jobs, f.owner, started.value.jobId)).state, 'canceled');
  await assert.rejects(fs.stat(f.output), { code: 'ENOENT' });
  assert.equal(f.jobs.status({}, started.value.jobId).ok, false);
});

test('dialog failure unlocks the next attempt and old job IDs cannot cancel it', async t => {
  let fail = true;
  const f = await fixture(t, async () => { if (fail) throw new Error('private path'); return f.output; });
  const first = f.jobs.start(f.owner, f.request); assert.ok(first.ok);
  assert.equal((await terminal(f.jobs, f.owner, first.value.jobId)).state, 'failed');
  fail = false;
  const next = f.jobs.start(f.owner, { ...f.request, attemptId: '55555555-5555-4555-8555-555555555555' }); assert.ok(next.ok);
  assert.equal(f.jobs.cancel(f.owner, first.value.jobId).ok, false);
  assert.equal((await terminal(f.jobs, f.owner, next.value.jobId)).state, 'succeeded');
});

test('owner loss cancels and joins a choosing job without losing its terminal record', async t => {
  let resolve; const selection = new Promise(r => { resolve = r; });
  const f = await fixture(t, () => selection), started = f.jobs.start(f.owner, f.request); assert.ok(started.ok);
  const settled = f.jobs.cancelOwner(f.owner);
  resolve(f.output);
  await settled;
  assert.equal(f.jobs.status(f.owner, started.value.jobId).value.state, 'canceled');
  await assert.rejects(fs.stat(f.output), { code: 'ENOENT' });
});

test('late cancellation keeps committed publication and cleanup warning', async t => {
  const f = await fixture(t);
  const encoded = await fs.readFile(new URL('./fixtures/export/encoded.jpg', import.meta.url));
  let release, entered; const held = new Promise(r => { release = r; }), linked = new Promise(r => { entered = r; });
  const exporter = createJpegExporter(async () => ({ bytes: encoded, width: 8, height: 6 }), {
    ...fs, link: async (...args) => { await fs.link(...args); entered(); await held; },
    unlink: async () => { throw Object.assign(new Error(), { code: 'EBUSY' }); },
  });
  const jobs = new JpegExportJobs(f.library, async () => f.output, exporter.exportJpeg, [f.data]);
  const started = jobs.start(f.owner, f.request); assert.ok(started.ok); await linked;
  jobs.cancel(f.owner, started.value.jobId); release();
  const done = await terminal(jobs, f.owner, started.value.jobId);
  assert.equal(done.state, 'succeeded'); assert.equal(done.result.cleanupPending, true);
  assert.ok((await fs.stat(f.output)).size > 0);
});

test('protects user data and refuses non-JPEG destination names', async t => {
  const f = await fixture(t, async () => join(f.data, 'catalog.sqlite'));
  const started = f.jobs.start(f.owner, f.request); assert.ok(started.ok);
  assert.equal((await terminal(f.jobs, f.owner, started.value.jobId)).error, 'INVALID_DESTINATION');
});

test('IPC binds export start and cancellation to the exact trusted renderer frame', async t => {
  const { handleJpegExportRequest } = await import('../src/main/jpeg-export-ipc.ts');
  const f = await fixture(t), mainFrame = { url: 'app://revelumo/index.html' }, owner = { mainFrame };
  const request = { op: 'start', ...f.request };
  for (const event of [{ sender: {}, senderFrame: mainFrame }, { sender: owner, senderFrame: { ...mainFrame } }, { sender: owner, senderFrame: null }]) {
    assert.equal(handleJpegExportRequest(f.jobs, event, owner, mainFrame.url, request).ok, false);
  }
  const started = handleJpegExportRequest(f.jobs, { sender: owner, senderFrame: mainFrame }, owner, mainFrame.url, request); assert.ok(started.ok);
  assert.equal((await terminal(f.jobs, mainFrame, started.value.jobId)).state, 'succeeded');
});

test('retains partial cleanup warnings on failed publication without leaking raw errors', async t => {
  const f = await fixture(t), encoded = await fs.readFile(new URL('./fixtures/export/encoded.jpg', import.meta.url));
  const exporter = createJpegExporter(async () => ({ bytes: encoded, width: 8, height: 6 }), {
    ...fs, link: async () => { throw Object.assign(new Error('private path'), { code: 'ENOTSUP' }); },
    unlink: async () => { throw Object.assign(new Error('private path'), { code: 'EBUSY' }); },
  });
  const jobs = new JpegExportJobs(f.library, async () => f.output, exporter.exportJpeg, [f.data]);
  const started = jobs.start(f.owner, f.request); assert.ok(started.ok);
  const done = await terminal(jobs, f.owner, started.value.jobId);
  assert.equal(done.state, 'failed'); assert.equal(done.cleanupPending, true); assert.equal(JSON.stringify(done).includes('private path'), false);
});

test('a replaced renderer generation cannot inspect or cancel the previous generation job', async t => {
  const { handleJpegExportRequest } = await import('../src/main/jpeg-export-ipc.ts');
  const f = await fixture(t), mainFrame = { url: 'app://revelumo/index.html' }, owner = { mainFrame }, event = { sender: owner, senderFrame: mainFrame };
  const generation = {}, replacement = {};
  const start = handleJpegExportRequest(f.jobs, event, owner, mainFrame.url, { op: 'start', ...f.request }, generation); assert.ok(start.ok);
  assert.equal(handleJpegExportRequest(f.jobs, event, owner, mainFrame.url, { op: 'status', jobId: start.value.jobId }, replacement).ok, false);
  await f.jobs.cancelOwner(generation);
});

test('recovers a lost start acknowledgement only for its exact owner and selected revision', async t => {
  const f = await fixture(t), start = f.jobs.start(f.owner, f.request); assert.ok(start.ok);
  assert.equal(f.jobs.recover({}, f.request).ok, false);
  assert.equal(f.jobs.recover(f.owner, { ...f.request, revision: 1 }).ok, false);
  assert.equal(f.jobs.recover(f.owner, f.request).value.jobId, start.value.jobId);
  await terminal(f.jobs, f.owner, start.value.jobId);
  assert.equal(f.jobs.recover(f.owner, f.request).value.state, 'succeeded');
});

test('recovery never returns an earlier export receipt for a new unaccepted attempt of the same revision', async t => {
  const f = await fixture(t), start = f.jobs.start(f.owner, f.request); assert.ok(start.ok);
  await terminal(f.jobs, f.owner, start.value.jobId);
  assert.equal(f.jobs.recover(f.owner, { ...f.request, attemptId: '33333333-3333-4333-8333-333333333333' }).ok, false);
});

test('a completed attempt replay returns its retained receipt while a fresh attempt may export the same revision', async t => {
  const f = await fixture(t), first = f.jobs.start(f.owner, f.request); assert.ok(first.ok);
  await terminal(f.jobs, f.owner, first.value.jobId);
  const replay = f.jobs.start(f.owner, f.request); assert.ok(replay.ok);
  assert.equal(replay.value.jobId, first.value.jobId);
  const fresh = f.jobs.start(f.owner, { ...f.request, attemptId: '55555555-5555-4555-8555-555555555555' }); assert.ok(fresh.ok);
  assert.notEqual(fresh.value.jobId, first.value.jobId);
  assert.equal((await terminal(f.jobs, f.owner, fresh.value.jobId)).error, 'DESTINATION_EXISTS');
});
