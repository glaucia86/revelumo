import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Catalog } from '../src/main/catalog.ts';
import { Library } from '../src/main/library.ts';
import { PreviewIpc } from '../src/main/preview-ipc.ts';

async function setup(t: any, capacity: number, validate: (bytes: Buffer) => Promise<void> = async () => {}) {
  const dir = await mkdtemp(join(tmpdir(), 'revelumo-admission-'));
  const file = join(dir, 'photo.jpg');
  await copyFile(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const catalog = new Catalog(join(dir, 'catalog.sqlite'));
  const library = new Library(catalog, validate);
  const imported = await library.importSelected(file);
  assert.ok(imported.ok && !imported.value.canceled);
  t.after(async () => { catalog.close(); await rm(dir, { recursive: true, force: true }); });
  const ipc = new PreviewIpc(library, { capacity });
  const frame = { url: 'app://revelumo/index.html' }, owner = { mainFrame: frame };
  const event = { sender: owner, senderFrame: frame };
  ipc.reset(owner);
  const context = await ipc.handle(event, owner, frame.url, { op: 'context' });
  assert.ok(context.ok);
  const send = (request: Record<string, unknown>) => ipc.handle(event, owner, frame.url, { ...request, document: context.value });
  return { ipc, library, file, id: imported.value.photo.id, send, size: (await stat(file)).size };
}

test('a preview larger than its compressed envelope allowance is refused recoverably', async t => {
  const { send, id } = await setup(t, 1);
  const result = await send({ op: 'preview', id, generation: 1 });
  assert.equal(result.ok, false);
  assert.ok(!result.ok && 'code' in result);
  assert.equal(result.code, 'preview-capacity');
  assert.deepEqual(result.descriptor, { key: 'errors.previewCapacity' });
});

test('a delivered envelope consumes capacity until its matching receipt and retry then succeeds', async t => {
  // sample.jpg is 633 bytes: independently measured fixture length.
  const { send, id, size } = await setup(t, 2 * 633 + 1);
  assert.equal(size, 633);
  const first = await send({ op: 'preview', id, generation: 1 });
  assert.ok(first.ok);
  const blocked = await send({ op: 'preview', id, generation: 2 });
  assert.ok(!blocked.ok && 'code' in blocked);
  assert.equal(blocked.code, 'preview-capacity');
  assert.ok(first.value.reservation);
  assert.equal((await send({ op: 'release', ...first.value.reservation })).ok, true);
  assert.equal((await send({ op: 'preview', id, generation: 3 })).ok, true);
});

test('an old or duplicate receipt cannot release a newer envelope and invalidation alone releases nothing', async t => {
  const { send, id } = await setup(t, 1267);
  const first = await send({ op: 'preview', id, generation: 1 }); assert.ok(first.ok);
  const receipt = first.value.reservation!;
  await send({ op: 'invalidate', generation: 2 });
  assert.equal((await send({ op: 'preview', id, generation: 2 })).ok, false);
  assert.equal((await send({ op: 'release', ...receipt, generation: 2 })).ok, false);
  await send({ op: 'release', ...receipt });
  const next = await send({ op: 'preview', id, generation: 3 }); assert.ok(next.ok);
  assert.equal((await send({ op: 'release', ...receipt })).ok, true);
  assert.equal((await send({ op: 'preview', id, generation: 4 })).ok, false);
  await send({ op: 'release', ...next.value.reservation });
  assert.equal((await send({ op: 'preview', id, generation: 5 })).ok, true);
});

test('preview capacity refusal does not block authenticated saves or end editing', async t => {
  const { send, library, id } = await setup(t, 1);
  const session = await library.beginEditing(id); assert.ok(session.ok);
  assert.equal((await send({ op: 'preview', id, generation: 1 })).ok, false);
  const saved = await library.saveExposure(id, session.value.sessionId, 1, 10, 2);
  assert.ok(saved.ok); assert.equal(saved.value.exposureTenths, 10);
  assert.equal((await library.endEditing(id, session.value.sessionId)).ok, true);
  assert.equal((await library.status(id)).ok, true);
});

test('ending an owner releases its delivered envelope for the next document', async t => {
  const { ipc, send, library, id } = await setup(t, 1267);
  const result = await send({ op: 'preview', id, generation: 1 }); assert.ok(result.ok);
  ipc.retire(true);
  const frame = { url: 'app://revelumo/index.html' }, owner = { mainFrame: frame }, event = { sender: owner, senderFrame: frame };
  ipc.reset(owner);
  const context = await ipc.handle(event, owner, frame.url, { op: 'context' }); assert.ok(context.ok);
  assert.equal((await ipc.handle(event, owner, frame.url, { op: 'preview', id, generation: 1, document: context.value })).ok, true);
  assert.equal((await library.status(id)).ok, true);
});


test('decoder failure returns its real error and leaves capacity available for recovery', async t => {
  let fail = false;
  const { send, id } = await setup(t, 1267, async () => { if (fail) throw new Error('synthetic decode failure'); });
  fail = true;
  const failed = await send({ op: 'preview', id, generation: 1 });
  assert.ok(!failed.ok && 'code' in failed); assert.equal(failed.code, 'invalid-jpeg');
  fail = false;
  assert.equal((await send({ op: 'preview', id, generation: 2 })).ok, true);
});

test('two unconsumed sources bound receipt cardinality even when byte capacity remains', async t => {
  const { send, id } = await setup(t, 10000);
  const first = await send({ op: 'preview', id, generation: 1 }); assert.ok(first.ok);
  assert.equal((await send({ op: 'preview', id, generation: 2 })).ok, true);
  const rejected = await send({ op: 'preview', id, generation: 3 });
  assert.ok(!rejected.ok && 'code' in rejected); assert.equal(rejected.code, 'preview-capacity');
  await send({ op: 'release', ...first.value.reservation });
  assert.equal((await send({ op: 'preview', id, generation: 4 })).ok, true);
});

test('capacity is refused before the source Buffer allocation', async t => {
  const { send, id } = await setup(t, 1);
  const allocate = Buffer.alloc;
  let sourceAllocations = 0;
  Buffer.alloc = ((size: number, ...args: any[]) => {
    if (size === 634) sourceAllocations++;
    return allocate(size, ...args);
  }) as typeof Buffer.alloc;
  try {
    const result = await send({ op: 'preview', id, generation: 1 });
    assert.ok(!result.ok && 'code' in result); assert.equal(result.code, 'preview-capacity');
    assert.equal(sourceAllocations, 0);
  } finally { Buffer.alloc = allocate; }
});

for (const fails of [false, true]) test(`owner retirement retains an active decode's envelope until ${fails ? 'its real failure' : 'settlement'}`, async t => {
  let enter!: () => void, finish!: () => void, held = false;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const { ipc, send, id } = await setup(t, 1267, async () => {
    if (held) { enter(); await gate; if (fails) throw new Error('real decoder boundary failure'); }
  });
  held = true;
  const result = send({ op: 'preview', id, generation: 1 });
  await entered;
  try {
    assert.equal(ipc.retainedCompressedBytes, 1267);
    ipc.retire(true);
    assert.equal(ipc.retainedCompressedBytes, 1267, 'retirement is not allocation settlement');
  } finally { finish(); }
  const completed = await result;
  if (fails) {
    assert.ok(!completed.ok && 'code' in completed); assert.equal(completed.code, 'invalid-jpeg');
  } else assert.deepEqual(completed, { ok: false, canceled: true });
  assert.equal(ipc.retainedCompressedBytes, 0);
  ipc.retire(true); assert.equal(ipc.retainedCompressedBytes, 0, 'owner cleanup is idempotent');
});
