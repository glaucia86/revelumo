import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePreferencesRequest } from '../src/shared/preferences-request.ts';

test('preferences IPC accepts only exact operations with a canonical language', () => {
  assert.deepEqual(parsePreferencesRequest({ op: 'get-language' }), { op: 'get-language' });
  for (const choice of ['system', 'pt-BR', 'en', 'es']) assert.deepEqual(parsePreferencesRequest({ op: 'set-language', choice }), { op: 'set-language', choice });
  for (const input of [null, [], 'es', { op: 'read', path: '/tmp' }, { op: 'get-language', extra: true }, { op: 'set-language', choice: 'pt' }, { op: 'set-language', choice: 'es', path: 'x' }, { op: 'set-language', choice: '../en' }]) assert.equal(parsePreferencesRequest(input), null);
});

test('preferences handler rejects other senders, frames and documents before reading or writing', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { PreferencesStore } = await import('../src/main/preferences.ts');
  const { handlePreferencesRequest } = await import('../src/main/preferences-ipc.ts');
  const directory = await mkdtemp(join(tmpdir(), 'revelumo-preference-ipc-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new PreferencesStore(directory, ['es']);
  const frame = { url: 'app://revelumo/index.html' };
  const owner = { mainFrame: frame };
  const trusted = { sender: owner, senderFrame: frame };
  assert.equal((await handlePreferencesRequest(store, trusted, owner, frame.url, { op: 'set-language', choice: 'pt-BR' })).ok, true);
  for (const event of [{ sender: {}, senderFrame: frame }, { sender: owner, senderFrame: { url: frame.url } }, { sender: owner, senderFrame: null }]) {
    assert.deepEqual(await handlePreferencesRequest(store, event, owner, frame.url, { op: 'set-language', choice: 'en' }), { ok: false, code: 'invalid-request', message: { key: 'preferences.invalidRequest' } });
  }
  frame.url = 'https://attacker.invalid/';
  assert.equal((await handlePreferencesRequest(store, trusted, owner, 'app://revelumo/index.html', { op: 'get-language' })).ok, false);
  assert.equal((await store.read()).choice, 'pt-BR');
});
