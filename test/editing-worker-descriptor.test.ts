import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the editing worker reports a stable preview-error descriptor on its message boundary', async t => {
  const originalSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
  t.after(() => {
    if (originalSelf) Object.defineProperty(globalThis, 'self', originalSelf);
    else Reflect.deleteProperty(globalThis, 'self');
  });
  const replies: unknown[] = [];
  const port = { onmessage: null as null | ((event: { data: unknown }) => Promise<void>), postMessage: (message: unknown) => replies.push(message) };
  Object.defineProperty(globalThis, 'self', { value: port, configurable: true });
  await import('../src/renderer/exposure.worker.ts');
  assert.ok(port.onmessage);
  await port.onmessage({ data: { op: 'prepare', id: 'photo-id', sessionId: 'session-id', dataUrl: 'data:image/jpeg;base64,not valid base64!' } });
  assert.deepEqual(replies, [{ op: 'error', id: 'photo-id', sessionId: 'session-id', message: 'Não foi possível preparar a prévia de edição sRGB.', descriptor: { key: 'errors.prepareEditingPreview' } }]);
});
