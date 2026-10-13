import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Only native Chromium decoding/canvas are substituted here. Real transfer/bridge
// and pixel fidelity run separately in the packaged Electron lifecycle/oracles.
test('editing Worker consumes compressed bytes directly without a base64 representation', async t => {
  const bytes = readFileSync(new URL('./fixtures/oriented.jpg', import.meta.url));
  const names = ['self', 'createImageBitmap', 'OffscreenCanvas'];
  const saved = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  t.after(() => names.forEach((name, i) => { if (saved[i]) Object.defineProperty(globalThis, name, saved[i]!); else Reflect.deleteProperty(globalThis, name); }));
  const replies: any[] = [];
  let observed: Uint8Array | undefined;
  let closed = false;
  const port = { onmessage: null as any, postMessage: (message: unknown) => replies.push(message) };
  Object.defineProperty(globalThis, 'self', { configurable:true, value:port });
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable:true, value:async (blob: Blob) => {
    observed = new Uint8Array(await blob.arrayBuffer());
    return { width:2, height:1, close() { closed = true; } };
  } });
  Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable:true, value:class {
    getContext() { return { drawImage() {}, getImageData() { return { data:new Uint8ClampedArray(8) }; } }; }
  } });
  await import('../src/renderer/exposure.worker.ts');
  await port.onmessage({ data:{ op:'prepare', id:'photo', sessionId:'session', bytes:Uint8Array.from(bytes).buffer } });
  assert.deepEqual(replies, [{op:'ready', id:'photo', sessionId:'session', width:2, height:1}]);
  assert.deepEqual(observed, Uint8Array.from(bytes));
  assert.equal(closed,true);
  replies.length = 0;
  for (const invalid of [new ArrayBuffer(0), new ArrayBuffer(8), 'data:image/jpeg;base64,/9j/']) {
    observed = undefined;
    await port.onmessage({data:{op:'prepare', id:'invalid', sessionId:'other', bytes:invalid}});
    assert.equal(replies.pop().op, 'error');
    assert.equal(observed, undefined, 'invalid transport is rejected before native decode');
  }
  await port.onmessage({data:{op:'render', id:'invalid', sessionId:'other', exposureTenths:0, temperature:0, tint:0}});
  assert.equal(replies.length, 0, 'a failed prepare cannot render an older neutral base under its identity');
});
