import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTrustedDocument } from '../src/main/trusted-document.ts';
test('normalizes the development URL trailing slash without weakening document identity', () => {
  assert.equal(isTrustedDocument('http://localhost:5173/', 'http://localhost:5173'), true);
  assert.equal(isTrustedDocument('app://revelumo/index.html#selection', 'app://revelumo/index.html'), true);
});
test('rejects foreign ports, hosts, documents, credentials and malformed URLs', () => {
  for (const input of ['http://localhost:5174/', 'http://evil.test:5173/', 'http://localhost:5173/other',
    'http://localhost:5173/?redirect=1', 'http://user@localhost:5173/', 'bad URL']) {
    assert.equal(isTrustedDocument(input, 'http://localhost:5173'), false, input);
  }
  assert.equal(isTrustedDocument('app://evil/index.html', 'app://revelumo/index.html'), false);
});
