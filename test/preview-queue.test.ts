import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fsPromises from 'node:fs/promises';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { Catalog } from '../src/main/catalog.ts';
import { Library } from '../src/main/library.ts';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
async function setup(t: any) {
  const dir = await mkdtemp(join(tmpdir(), 'revelumo-preview-queue-'));
  const file = join(dir, 'photo.jpg');
  await copyFile(new URL('./fixtures/sample.jpg', import.meta.url), file);
  const catalog = new Catalog(join(dir, 'catalog.sqlite'));
  let gate: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred>; fail?: boolean } | null = null;
  let decodes = 0;
  const library = new Library(catalog, async bytes => {
    decodes++;
    if (gate) { const held = gate; gate = null; held.entered.resolve(); await held.release.promise; if (held.fail) throw new Error('Synthetic decoder failure'); }
    return 'data:image/jpeg;base64,' + bytes.toString('base64');
  });
  t.after(async () => { catalog.close(); await rm(dir, { recursive: true, force: true }); });
  const imported = await library.importSelected(file);
  assert.ok(imported.ok && !imported.value.canceled);
  return { library, catalog, dir, file, id: imported.value.photo.id, decodes: () => decodes,
    hold: () => { gate = { entered: deferred(), release: deferred() }; return gate; } };
}

test('a retired preview waiting for the protected queue does not open its original', async t => {
  const { library, file, id, hold, decodes } = await setup(t);
  const gate = hold();
  const active = library.preview(id);
  await gate.entered.promise;
  let opens = 0, hashes = 0;
  const originalOpen = fsPromises.open, originalHash = crypto.createHash;
  fsPromises.open = ((...args: any[]) => { opens++; return originalOpen(...args); }) as typeof fsPromises.open;
  crypto.createHash = ((...args: any[]) => { hashes++; return originalHash(...args); }) as typeof crypto.createHash;
  syncBuiltinESMExports();
  t.after(() => { fsPromises.open = originalOpen; crypto.createHash = originalHash; syncBuiltinESMExports(); });
  let current = true;
  const retired = library.preview(id, () => current);
  current = false;
  // A queued request that opens the now-missing file would return unreadable.
  await rm(file);
  gate.release.resolve();
  assert.equal((await active).ok, true);
  assert.deepEqual(await retired, { ok: false, canceled: true });
  assert.equal(opens, 0); assert.equal(hashes, 0);
  assert.equal(decodes(), 2); // initial import and the already-started preview
});

test('only the latest waiting preview survives while a started preview completes', async t => {
  const { PreviewRequests } = await import('../src/main/preview-requests.ts');
  const { library, id, hold, decodes } = await setup(t);
  const requests = new PreviewRequests(library);
  const gate = hold();
  const a = requests.preview(id, 1);
  await gate.entered.promise;
  let bSettles = 0;
  const b = requests.preview(id, 2).then(result => { bSettles++; return result; });
  const c = requests.preview(id, 3);
  assert.deepEqual(await b, { ok: false, canceled: true });
  assert.equal(bSettles, 1);
  assert.equal(decodes(), 2);
  gate.release.resolve();
  assert.equal((await a).ok, true);
  assert.equal((await c).ok, true);
  assert.equal(decodes(), 3);
  assert.equal(bSettles, 1);
});

test('old or duplicate generations cannot supersede the current selection', { timeout: 1000 }, async t => {
  const { PreviewRequests } = await import('../src/main/preview-requests.ts');
  const { library, id, hold } = await setup(t);
  const requests = new PreviewRequests(library);
  const gate = hold();
  const a = requests.preview(id, 4); await gate.entered.promise;
  const latest = requests.preview(id, 6);
  assert.deepEqual(await requests.preview(id, 5), { ok: false, canceled: true });
  assert.deepEqual(await requests.preview(id, 6), { ok: false, canceled: true });
  gate.release.resolve();
  assert.equal((await a).ok, true);
  assert.equal((await latest).ok, true);
});

test('leaving the viewer retires queued previews without retiring a started pipeline', async t => {
  const { PreviewRequests } = await import('../src/main/preview-requests.ts');
  const { library, id, hold, decodes } = await setup(t);
  const requests = new PreviewRequests(library);
  const gate = hold();
  const a = requests.preview(id, 1); await gate.entered.promise;
  const b = requests.preview(id, 2);
  requests.invalidate(3);
  assert.deepEqual(await b, { ok: false, canceled: true });
  assert.deepEqual(await requests.preview(id, 2), { ok: false, canceled: true });
  gate.release.resolve(); assert.equal((await a).ok, true);
  assert.equal(decodes(), 2);
  assert.equal((await requests.preview(id, 3)).ok, true);
  requests.retire();
  assert.deepEqual(await requests.preview(id, 100), { ok: false, canceled: true });
});

test('retired document tokens cannot become current again after reload or crash', async t => {
  const { PreviewIpc } = await import('../src/main/preview-ipc.ts');
  const { library, id, decodes } = await setup(t);
  const ipc = new PreviewIpc(library);
  const frame = { url: 'app://revelumo/index.html' }, owner = { mainFrame: frame };
  const event = { sender: owner, senderFrame: frame };
  ipc.reset(owner);
  const oldHandshake = ipc.handle(event, owner, frame.url, { op: 'context' });
  ipc.reset(owner); // reload while the preload is still awaiting its handshake
  const old = await oldHandshake;
  const fresh = await ipc.handle(event, owner, frame.url, { op: 'context' });
  assert.ok(old.ok && fresh.ok); assert.notEqual(old.value, fresh.value);
  const oldRequest = { op: 'preview', id, generation: 1, document: old.value };
  assert.deepEqual(await ipc.handle(event, owner, frame.url, oldRequest), { ok: false, canceled: true });
  const result = await ipc.handle(event, owner, frame.url, { ...oldRequest, document: fresh.value });
  assert.equal(result.ok, true);
  assert.deepEqual(await ipc.handle(event, owner, frame.url, { ...oldRequest, generation: 1000 }), { ok: false, canceled: true });
  ipc.retire(); // crash/destruction, before the next owner is admitted
  assert.equal((await ipc.handle(event, owner, frame.url, { op: 'context' })).ok, false);
  ipc.reset(owner);
  assert.deepEqual(await ipc.handle(event, owner, frame.url, { ...oldRequest, document: fresh.value, generation: 1001 }), { ok: false, canceled: true });
  assert.equal(decodes(), 2);
});

test('untrusted owners, frames, origins and malformed preview payloads cannot change a selection', async t => {
  const { PreviewIpc } = await import('../src/main/preview-ipc.ts');
  const { library, id, hold } = await setup(t);
  const ipc = new PreviewIpc(library);
  const frame = { url: 'app://revelumo/index.html' }, owner = { mainFrame: frame };
  const event = { sender: owner, senderFrame: frame };
  ipc.reset(owner);
  const context = await ipc.handle(event, owner, frame.url, { op: 'context' });
  assert.ok(context.ok);
  const request = { op: 'preview', id, generation: 1, document: context.value };
  const gate = hold(); const first = ipc.handle(event, owner, frame.url, request); await gate.entered.promise;
  const latest = ipc.handle(event, owner, frame.url, { ...request, generation: 2 });
  for (const bad of [{ sender: {}, senderFrame: frame }, { sender: owner, senderFrame: { url: frame.url } }, { sender: owner, senderFrame: null }]) {
    assert.equal((await ipc.handle(bad, owner, frame.url, { op: 'context' })).code, 'invalid-request');
    assert.equal((await ipc.handle(bad, owner, frame.url, { ...request, generation: 100 })).code, 'invalid-request');
  }
  assert.equal((await ipc.handle(event, owner, 'https://other.invalid/', request)).code, 'invalid-request');
  for (const payload of [null, [], { op: 'context', extra: true }, { ...request, path: '/etc/passwd' }, { ...request, id: '/etc/passwd' },
    ...[0, -1, 1.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '3'].map(generation => ({ ...request, generation }))]) {
    assert.equal((await ipc.handle(event, owner, frame.url, payload)).code, 'invalid-request');
  }
  gate.release.resolve(); assert.equal((await first).ok, true); assert.equal((await latest).ok, true);
});

test('a preview storm settles replaced requests and does not overtake an accepted save', async t => {
  const { PreviewRequests } = await import('../src/main/preview-requests.ts');
  const { library, id, hold, decodes } = await setup(t);
  const session = await library.beginEditing(id); assert.ok(session.ok);
  const requests = new PreviewRequests(library), gate = hold();
  const active = requests.preview(id, 1); await gate.entered.promise;
  let settled = 0;
  const obsolete = Array.from({ length: 64 }, (_, i) => requests.preview(id, i + 2).then(result => { settled++; return result; }));
  const order: string[] = [];
  const save = library.saveExposure(id, session.value.sessionId, 1, 10, 2).then(result => { order.push('save'); return result; });
  const latest = requests.preview(id, 66).then(result => { order.push('preview'); return result; });
  const retired = await Promise.all(obsolete);
  assert.ok(retired.every(result => !result.ok && result.canceled)); assert.equal(settled, 64);
  assert.equal(decodes(), 2);
  gate.release.resolve(); await active;
  assert.equal((await save).ok, true); assert.equal((await latest).ok, true);
  assert.deepEqual(order, ['save', 'preview']); assert.equal(decodes(), 3); assert.equal(settled, 64);
  const recipe = library.recipe(id); assert.ok(recipe.ok); assert.equal(recipe.value.exposureTenths, 10);
});

test('repeated reloads retain only one pending preview behind an old active decode', { timeout: 1500 }, async t => {
  const { PreviewIpc } = await import('../src/main/preview-ipc.ts');
  const { library, id, hold, decodes } = await setup(t);
  const ipc = new PreviewIpc(library), frame = { url: 'app://revelumo/index.html' }, owner = { mainFrame: frame };
  const event = { sender: owner, senderFrame: frame };
  async function reload() { ipc.reset(owner); const context = await ipc.handle(event, owner, frame.url, { op: 'context' }); assert.ok(context.ok); return context.value; }
  const firstDocument = await reload(), gate = hold();
  const a = ipc.handle(event, owner, frame.url, { op: 'preview', id, generation: 1, document: firstDocument }); await gate.entered.promise;
  const secondDocument = await reload();
  const b = ipc.handle(event, owner, frame.url, { op: 'preview', id, generation: 1, document: secondDocument });
  const thirdDocument = await reload();
  const c = ipc.handle(event, owner, frame.url, { op: 'preview', id, generation: 1, document: thirdDocument });
  assert.deepEqual(await b, { ok: false, canceled: true }); // settles while A remains held
  gate.release.resolve(); assert.equal((await a).ok, true); assert.equal((await c).ok, true);
  assert.equal(decodes(), 3);
});


test('superseding an already-started decode preserves its real decoder failure', async t => {
  const { PreviewRequests } = await import('../src/main/preview-requests.ts');
  const { library, id, hold } = await setup(t);
  const requests = new PreviewRequests(library), gate = hold();
  const active = requests.preview(id, 1); await gate.entered.promise;
  const current = requests.preview(id, 2);
  gate.fail = true; gate.release.resolve();
  const failure = await active;
  assert.equal(failure.ok, false); assert.equal(failure.code, 'invalid-jpeg');
  assert.equal('canceled' in failure, false);
  assert.equal((await current).ok, true);
});


test('a started legacy preview still records verified identity after its intent retires', async t => {
  const { PreviewRequests } = await import('../src/main/preview-requests.ts');
  const { library, catalog, dir, file, hold } = await setup(t);
  const legacyPath = join(dir, 'legacy.jpg'); await copyFile(file, legacyPath);
  const legacy = catalog.add(legacyPath);
  assert.equal((await library.availability(legacy.id)).value.identityRecorded, false);
  const requests = new PreviewRequests(library), gate = hold();
  const active = requests.preview(legacy.id, 1); await gate.entered.promise;
  requests.invalidate(2); gate.release.resolve();
  assert.equal((await active).ok, true);
  assert.equal((await library.availability(legacy.id)).value.identityRecorded, true);
});

test('a started original read reports its real failure after a newer intent arrives', async t => {
  const { PreviewRequests } = await import('../src/main/preview-requests.ts');
  const { library, file, id } = await setup(t);
  const entered = deferred(), release = deferred(), originalOpen = fsPromises.open;
  let failOnce = true;
  fsPromises.open = (async (...args: any[]) => {
    if (args[0] === file && failOnce) { failOnce = false; entered.resolve(); await release.promise; throw Object.assign(new Error('denied'), { code: 'EACCES' }); }
    return originalOpen(...args);
  }) as typeof fsPromises.open;
  syncBuiltinESMExports();
  t.after(() => { fsPromises.open = originalOpen; syncBuiltinESMExports(); });
  const requests = new PreviewRequests(library), active = requests.preview(id, 1);
  await entered.promise; const current = requests.preview(id, 2); release.resolve();
  const failure = await active;
  assert.equal(failure.ok, false); assert.equal(failure.code, 'unreadable'); assert.equal('canceled' in failure, false);
  assert.equal((await current).ok, true);
});
