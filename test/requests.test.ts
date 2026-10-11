import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest } from '../src/shared/requests.ts';
const id = '905861ac-38d5-482c-b2b6-00f507a1d582';

test('accepts only the three supported typed operations', () => {
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
