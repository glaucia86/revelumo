import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PreferencesStore } from '../src/main/preferences.ts';

async function profile(t: { after: (fn: () => Promise<void>) => void }) {
  const path = await mkdtemp(join(tmpdir(), 'revelumo-language-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test('missing preferences follow the system and an explicit choice survives a new process', async t => {
  const path = await profile(t);
  const store = new PreferencesStore(path, ['pt-BR']);
  assert.deepEqual(await store.read(), { choice: 'system', resolved: 'pt-BR', writable: true, notice: null });
  assert.deepEqual(await store.setLanguage('es'), { ok: true, value: { choice: 'es', resolved: 'es', writable: true, notice: null } });
  const process = spawnSync(globalThis.process.execPath, ['--input-type=module', '-e', `import { PreferencesStore } from ${JSON.stringify(new URL('../src/main/preferences.ts', import.meta.url).href)}; console.log(JSON.stringify(await new PreferencesStore(${JSON.stringify(path)}, ['en']).read()));`], { encoding: 'utf8' });
  assert.equal(process.status, 0, process.stderr);
  assert.deepEqual(JSON.parse(process.stdout), { choice: 'es', resolved: 'es', writable: true, notice: null });
});

test('corrupt preferences warn without overwriting and an explicit choice repairs them', async t => {
  const path = await profile(t);
  await writeFile(join(path, 'preferences.json'), '{broken');
  const store = new PreferencesStore(path, ['es-419']);
  assert.deepEqual(await store.read(), { choice: 'system', resolved: 'es', writable: true, notice: 'invalid' });
  assert.equal(await readFile(join(path, 'preferences.json'), 'utf8'), '{broken');
  assert.equal((await store.setLanguage('en')).ok, true);
  assert.equal((await new PreferencesStore(path, ['pt']).read()).resolved, 'en');
});

test('future schema stays read-only and byte-for-byte intact', async t => {
  const path = await profile(t);
  const content = '{"schemaVersion":2,"language":"es","newSetting":true}';
  await writeFile(join(path, 'preferences.json'), content);
  const store = new PreferencesStore(path, ['pt-BR']);
  assert.deepEqual(await store.read(), { choice: 'system', resolved: 'pt-BR', writable: false, notice: 'future' });
  assert.deepEqual(await store.setLanguage('en'), { ok: false, code: 'settings-unavailable', message: { key: 'preferences.future' } });
  assert.equal(await readFile(join(path, 'preferences.json'), 'utf8'), content);
});

test('unreadable files and oversized files fall back visibly without writes', async t => {
  const path = await profile(t);
  await mkdir(join(path, 'preferences.json'));
  assert.deepEqual(await new PreferencesStore(path, ['es']).read(), { choice: 'system', resolved: 'es', writable: false, notice: 'unreadable' });
  const largePath = await profile(t);
  const bytes = ' '.repeat(4096) + '{"schemaVersion":1,"language":"pt-BR"}';
  await writeFile(join(largePath, 'preferences.json'), bytes);
  assert.equal((await new PreferencesStore(largePath, ['en']).read()).notice, 'invalid');
  assert.equal(await readFile(join(largePath, 'preferences.json'), 'utf8'), bytes);
});

test('failed writes retain confirmed selection and retry can recover', async t => {
  const path = await profile(t);
  const store = new PreferencesStore(path, ['pt-BR']);
  await store.setLanguage('es');
  await rm(join(path, 'preferences.json'));
  await mkdir(join(path, 'preferences.json'));
  assert.deepEqual(await store.setLanguage('en'), { ok: false, code: 'settings-unavailable', message: { key: 'preferences.saveFailed' } });
  assert.equal((await store.read()).choice, 'es');
  await rm(join(path, 'preferences.json'), { recursive: true });
  assert.equal((await store.setLanguage('en')).ok, true);
  assert.equal((await new PreferencesStore(path, ['pt-BR']).read()).choice, 'en');
});

test('invalid selections never write and concurrent selections commit in request order', async t => {
  const path = await profile(t);
  const store = new PreferencesStore(path, ['en']);
  for (const value of ['../../es', 'pt', 'EN', null, { language: 'es' }]) {
    assert.deepEqual(await store.setLanguage(value as never), { ok: false, code: 'invalid-request', message: { key: 'preferences.invalidRequest' } });
  }
  const results = await Promise.all([store.setLanguage('es'), store.setLanguage('pt-BR'), store.setLanguage('en'), store.setLanguage('system')]);
  assert.deepEqual(results.map(result => result.ok && result.value.choice), ['es', 'pt-BR', 'en', 'system']);
  assert.equal((await store.read()).choice, 'system');
  assert.equal((await new PreferencesStore(path, ['es']).read()).resolved, 'es');
});

test('profiles stay isolated and malformed v1 selections are ignored', async t => {
  const first = await profile(t), second = await profile(t);
  await new PreferencesStore(first, ['pt']).setLanguage('es');
  assert.equal((await new PreferencesStore(second, ['pt']).read()).choice, 'system');
  for (const content of ['null', '[]', '{"schemaVersion":1,"language":"pt"}', '{"schemaVersion":1,"language":"es","path":"other"}']) {
    await writeFile(join(second, 'preferences.json'), content);
    assert.deepEqual(await new PreferencesStore(second, []).read(), { choice: 'system', resolved: 'en', writable: true, notice: 'invalid' });
  }
});

test('OS read and disk permission failures use an explicit safe fallback', async t => {
  const { chmod } = await import('node:fs/promises');
  const path = await profile(t);
  await writeFile(join(path, 'preferences.json'), '{"schemaVersion":1,"language":"es"}');
  await chmod(join(path, 'preferences.json'), 0);
  t.after(() => chmod(join(path, 'preferences.json'), 0o600).catch(() => {}));
  if (process.platform === 'win32' || process.getuid?.() === 0) { t.skip('POSIX mode denial requires a non-root POSIX user'); return; }
  const store = new PreferencesStore(path, undefined);
  assert.deepEqual(await store.read(), { choice: 'system', resolved: 'en', writable: false, notice: 'unreadable' });
  await chmod(path, 0o500);
  try {
    assert.deepEqual(await store.setLanguage('pt-BR'), { ok: false, code: 'settings-unavailable', message: { key: 'preferences.saveFailed' } });
    assert.equal((await store.read()).choice, 'system');
  } finally { await chmod(path, 0o700); }
});

test('oversized future preferences cannot be downgraded when version cannot safely be read', async t => {
  const path = await profile(t);
  const bytes = JSON.stringify({ schemaVersion: 2, language: 'es', future: 'x'.repeat(4096) });
  await writeFile(join(path, 'preferences.json'), bytes);
  const store = new PreferencesStore(path, ['en']);
  assert.equal((await store.read()).writable, false);
  assert.equal((await store.setLanguage('pt-BR')).ok, false);
  assert.equal(await readFile(join(path, 'preferences.json'), 'utf8'), bytes);
});

test('unreadable future files stay intact; corrected read permission allows a safe retry', async t => {
  const { chmod } = await import('node:fs/promises');
  if (process.platform === 'win32' || process.getuid?.() === 0) { t.skip('POSIX mode denial requires a non-root POSIX user'); return; }
  const path = await profile(t), filename = join(path, 'preferences.json');
  const bytes = '{"schemaVersion":2,"language":"es"}';
  await writeFile(filename, bytes); await chmod(filename, 0);
  t.after(() => chmod(filename, 0o600).catch(() => {}));
  const store = new PreferencesStore(path, ['en']);
  assert.equal((await store.read()).writable, false);
  assert.equal((await store.setLanguage('pt-BR')).ok, false);
  await chmod(filename, 0o600);
  assert.equal(await readFile(filename, 'utf8'), bytes);
  assert.equal((await store.setLanguage('pt-BR')).ok, false);
  await writeFile(filename, '{"schemaVersion":1,"language":"es"}');
  assert.equal((await store.setLanguage('pt-BR')).ok, true);
});

test('read-only fallback can be rechecked after a user repairs the file', async t => {
  const path = await profile(t), filename = join(path, 'preferences.json');
  await writeFile(filename, '{"schemaVersion":2,"language":"es"}');
  const store = new PreferencesStore(path, ['en']);
  assert.equal((await store.read()).writable, false);
  await writeFile(filename, '{"schemaVersion":1,"language":"es"}');
  assert.deepEqual(await store.read(), { choice: 'es', resolved: 'es', writable: true, notice: null });
});

test('a non-regular preferences file cannot block startup', async t => {
  if (process.platform === 'win32') { t.skip('POSIX FIFO fixture'); return; }
  const path = await profile(t);
  const fifo = spawnSync('mkfifo', [join(path, 'preferences.json')], { encoding: 'utf8' });
  assert.equal(fifo.status, 0, fifo.stderr);
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import { PreferencesStore } from ${JSON.stringify(new URL('../src/main/preferences.ts', import.meta.url).href)}; console.log(JSON.stringify(await new PreferencesStore(${JSON.stringify(path)}, ['en']).read()));`], { encoding: 'utf8', timeout: 2000 });
  assert.equal(child.status, 0, String(child.error ?? child.stderr));
  assert.deepEqual(JSON.parse(child.stdout), { choice: 'system', resolved: 'en', writable: false, notice: 'unreadable' });
});
