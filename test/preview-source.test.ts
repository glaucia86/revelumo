import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PreviewSource } from '../src/renderer/preview-source.ts';

test('retiring a preview releases its compressed payload without changing photo identity', () => {
  const source = new PreviewSource({ photo: { id: 'photo-a', name: 'a.jpg' }, dataUrl: 'data:image/jpeg;base64,YQ==' });
  assert.equal(source.read(), 'data:image/jpeg;base64,YQ==');
  source.release();
  assert.equal(source.read(), null);
  assert.deepEqual(source.photo, { id: 'photo-a', name: 'a.jpg' });
  source.release();
  assert.equal(source.read(), null);
});
