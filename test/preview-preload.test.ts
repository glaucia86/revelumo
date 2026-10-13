import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Electron's bridge/IPC is the system boundary. Execute the actual preload.
test('preload keeps the document handshake private and reserves monotonic preview intents', async () => {
  const calls: any[] = [];
  const api = await bridge(async (channel, request) => {
    calls.push({ channel, request });
    return request.op === 'context' ? { ok: true, value: 'document-token' } : { ok: true, value: null };
  });
  assert.equal(typeof api.invalidatePreview, 'function');
  const first = await api.invalidatePreview();
  assert.equal(first.ok, true); assert.equal(first.value, 1);
  await api.previewPhoto('photo-a', first.value);
  await api.previewPhoto('photo-b');
  const third = await api.invalidatePreview();
  assert.equal(third.value, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { channel: 'revelumo:preview', request: { op: 'context' } },
    { channel: 'revelumo:preview', request: { op: 'invalidate', document: 'document-token', generation: 1 } },
    { channel: 'revelumo:preview', request: { op: 'preview', id: 'photo-a', document: 'document-token', generation: 1 } },
    { channel: 'revelumo:preview', request: { op: 'preview', id: 'photo-b', document: 'document-token', generation: 2 } },
    { channel: 'revelumo:preview', request: { op: 'invalidate', document: 'document-token', generation: 3 } },
  ]);
  assert.equal('document' in api, false); assert.equal('context' in api, false);
});

async function bridge(invoke: (channel: string, request: any) => Promise<any>) {
  const exposed: Record<string, any> = {};
  const source = await readFile(new URL('../src/preload.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText;
  runInNewContext(code, { exports: {}, require: () => ({ ipcRenderer: { on() {}, invoke }, contextBridge: { exposeInMainWorld: (name: string, api: any) => { exposed[name] = api; } } }), queueMicrotask });
  return exposed.revelumo;
}

test('a direct preview overtakes an earlier reservation without reusing its generation', async () => {
  let release!: (result: any) => void;
  const handshake = new Promise(resolve => { release = resolve; });
  const requests: any[] = [];
  const api = await bridge(async (_channel, request) => {
    if (request.op === 'context') return handshake;
    requests.push(request); return { ok: true, value: null };
  });
  const intent = api.invalidatePreview();
  const direct = api.previewPhoto('direct');
  release({ ok: true, value: 'old-document' });
  const reserved = await intent; await direct;
  assert.deepEqual(JSON.parse(JSON.stringify(await api.previewPhoto('obsolete', reserved.value))), { ok: false, canceled: true });
  assert.deepEqual(requests.map(r => [r.op, r.generation]), [['invalidate', 1], ['preview', 2]]);
});

test('a failed preload handshake fails closed and is never silently retried', async () => {
  let handshakes = 0;
  const failure = { ok: false, code: 'invalid-request', message: 'retired document' };
  const api = await bridge(async (_channel, request) => { assert.equal(request.op, 'context'); handshakes++; return failure; });
  assert.equal((await api.invalidatePreview()).code, 'invalid-request');
  assert.equal((await api.previewPhoto('photo')).code, 'invalid-request');
  assert.equal(handshakes, 1);
});

test('preload retries an unconfirmed release before another preview without discarding its generation', async () => {
  const calls: any[] = [];
  let fail = true;
  const reservation = { lease: 'source-lease', generation: 1 };
  const api = await bridge(async (_channel, request) => {
    calls.push(request);
    if (request.op === 'context') return { ok: true, value: 'document-token' };
    if (request.op === 'release' && fail) { fail = false; throw new Error('ACK lost'); }
    return { ok: true, value: request.op === 'preview' ? { reservation } : null };
  });
  await api.previewPhoto('photo-a');
  assert.equal(typeof api.releasePreview, 'function');
  await assert.rejects(api.releasePreview(reservation), /ACK lost/);
  await api.previewPhoto('photo-b');
  assert.deepEqual(calls.slice(2).map(request => request.op), ['release', 'release', 'preview']);
  assert.equal(calls[3].generation, 1);
});
