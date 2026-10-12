import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest } from '../src/shared/requests.ts';
const id = '905861ac-38d5-482c-b2b6-00f507a1d582';

test('accepts the initial three typed operations', () => {
  for (const input of [{ op: 'import' }, { op: 'list' }, { op: 'preview', id }]) {
    assert.deepEqual(parseRequest(input), input);
  }
});

test('rejects malformed, unknown and overprivileged IPC payloads', () => {
  for (const input of [null, [], 'list', { op: 'delete' }, { op: 'import', path: '/etc/passwd' },
    { op: 'preview', id: '../../secret' }, { op: 'preview', id: 123 }, { op: 'list', extra: true },
    { op: 'preview', id, path: '/etc/passwd' }, { op: 'preview' }]) {
    assert.equal(parseRequest(input), null, JSON.stringify(input));
  }
});

test('accepts progress and UUID-scoped thumbnails but rejects paths and excess fields', () => {
  assert.deepEqual(parseRequest({ op: 'progress' }), { op: 'progress' });
  assert.deepEqual(parseRequest({ op: 'thumbnail', id }), { op: 'thumbnail', id });
  assert.equal(parseRequest({ op: 'thumbnail', id: '/tmp/file.jpg' }), null);
  assert.equal(parseRequest({ op: 'progress', path: '/tmp' }), null);
  assert.equal(parseRequest({ op: 'thumbnail', id, dataUrl: 'untrusted' }), null);
});

test('status and relocation accept only a UUID-scoped operation without file paths or identity supplied by the renderer', () => {
  for (const op of ['status', 'relocate']) {
    assert.deepEqual(parseRequest({ op, id }), { op, id });
    for (const input of [{ op }, { op, id: '/private/original.jpg' }, { op, id, path: '/private/original.jpg' },
      { op, id, sha256: 'a'.repeat(64) }, { op, id, confirmed: true }, { op, id: { id } }]) {
      assert.equal(parseRequest(input), null);
    }
  }
});
