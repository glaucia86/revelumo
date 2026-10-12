import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat, open, chmod, appendFile, truncate, link, symlink, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readVerifiedExportSource } from '../src/main/export-source.ts';

const original = Buffer.from('verified original bytes');
// SHA-256 generated independently with sha256sum; no recomputation of expected identity.
const sha256 = '925180315c34a6f857b152519752f58b338c8791cab51d73d9806a8c8d939dcc';
async function fixture(t: import('node:test').TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'revelumo-export-source-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'original.jpg');
  await writeFile(path, original, { mode: 0o400 });
  return { path, directory };
}
test('returns authenticated original bytes without changing source content or inode', async t => {
  const { path } = await fixture(t), before = await stat(path);
  const bytes = await readVerifiedExportSource({ path, sha256, maximumBytes: 1024 });
  assert.deepEqual(bytes, original);
  assert.deepEqual(await readFile(path), original);
  assert.equal((await stat(path)).ino, before.ino);
});
test('rejects content that differs from the already recorded identity', async t => {
  const { path } = await fixture(t);
  await assert.rejects(readVerifiedExportSource({ path, sha256: '0'.repeat(64), maximumBytes: 1024 }), { code: 'IDENTITY_MISMATCH' });
});
test('does not enroll a missing or malformed recorded identity', async t => {
  const { path } = await fixture(t);
  for (const identity of [null, '', 'malformed', sha256.toUpperCase()]) {
    await assert.rejects(readVerifiedExportSource({ path, sha256: identity, maximumBytes: 1024 }), { code: 'IDENTITY_UNVERIFIED' });
  }
});
test('requires an explicit positive safe-integer byte budget and rejects oversized source', async t => {
  const { path } = await fixture(t);
  for (const maximumBytes of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(readVerifiedExportSource({ path, sha256, maximumBytes }), { code: 'INVALID_BUDGET' });
  }
  await assert.rejects(readVerifiedExportSource({ path, sha256, maximumBytes: original.length - 1 }), { code: 'SOURCE_TOO_LARGE' });
  assert.deepEqual(await readVerifiedExportSource({ path, sha256, maximumBytes: original.length }), original);
});
test('rejects non-regular source paths instead of treating them as image bytes', async t => {
  const { directory } = await fixture(t);
  await assert.rejects(readVerifiedExportSource({ path: directory, sha256, maximumBytes: 1024 * 1024 }), { code: 'NOT_REGULAR_FILE' });
});
test('cancellation before opening wins even when the original is absent', async t => {
  const { directory } = await fixture(t);
  await assert.rejects(readVerifiedExportSource({ path: join(directory, 'missing.jpg'), sha256, maximumBytes: 1024, signal: AbortSignal.abort() }), { code: 'CANCELED' });
});

test('mid-read cancellation closes the descriptor and never returns bytes', async t => {
  const { path } = await fixture(t), controller = new AbortController();
  let closed = false;
  const filesystem = { open: async (...args: Parameters<typeof open>) => {
    const handle = await open(...args);
    return new Proxy(handle, { get(target, property) {
      if (property === 'read') return async (...readArgs: Parameters<typeof handle.read>) => {
        const result = await handle.read(...readArgs); controller.abort(); return result;
      };
      if (property === 'close') return async () => { await handle.close(); closed = true; };
      const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
  await assert.rejects(readVerifiedExportSource({ path, sha256, maximumBytes: 1024, signal: controller.signal }, filesystem), { code: 'CANCELED' });
  assert.equal(closed, true);
});
test('changing the request during I/O cannot replace the identity being authenticated', async t => {
  const { path } = await fixture(t);
  const request = { path, sha256: '0'.repeat(64), maximumBytes: 1024 };
  const filesystem = { open: async (...args: Parameters<typeof open>) => {
    const handle = await open(...args); request.sha256 = sha256; return handle;
  } };
  await assert.rejects(readVerifiedExportSource(request, filesystem), { code: 'IDENTITY_MISMATCH' });
});
test('reports an unavailable original without returning a partial snapshot', async t => {
  const { directory } = await fixture(t);
  await assert.rejects(readVerifiedExportSource({ path: join(directory, 'missing.jpg'), sha256, maximumBytes: 1024 }), { code: 'SOURCE_UNREADABLE' });
});

test('rejects growth or truncation during the read before exposing changed bytes', async t => {
  for (const mutation of ['grow', 'shrink'] as const) {
    const { path } = await fixture(t); await chmod(path, 0o600);
    const filesystem = { open: async (...args: Parameters<typeof open>) => {
      const handle = await open(...args);
      return new Proxy(handle, { get(target, property) {
        if (property === 'stat') return async () => {
          const info = await handle.stat();
          if (mutation === 'grow') await appendFile(path, '!'); else await truncate(path, 0);
          return info;
        };
        const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
      } });
    } };
    await assert.rejects(readVerifiedExportSource({ path, sha256, maximumBytes: 1024 }, filesystem), { code: 'SOURCE_CHANGED' });
  }
});
test('checks cancellation between bounded 64 KiB filesystem reads', async t => {
  const { path } = await fixture(t); await chmod(path, 0o600); await writeFile(path, Buffer.alloc(256 * 1024));
  const controller = new AbortController(); let largestRead = 0;
  const filesystem = { open: async (...args: Parameters<typeof open>) => {
    const handle = await open(...args);
    return new Proxy(handle, { get(target, property) {
      if (property === 'read') return async (...args: Parameters<typeof handle.read>) => {
        const result = await handle.read(...args); largestRead = Math.max(largestRead, result.bytesRead); controller.abort(); return result;
      };
      const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
  await assert.rejects(readVerifiedExportSource({ path, sha256, maximumBytes: 1024 * 1024, signal: controller.signal }, filesystem), { code: 'CANCELED' });
  assert.ok(largestRead > 0 && largestRead <= 64 * 1024, `read ${largestRead} bytes before honoring cancellation`);
});
for (const kind of ['hardlink', 'symlink'] as const) {
  test(`source ${kind} is a readonly alias, never an output`, async t => {
    const { path, directory } = await fixture(t), before = await stat(path);
    const alias = join(directory, `${kind}.jpg`);
    if (kind === 'hardlink') await link(path, alias);
    else {
      try { await symlink(path, alias); }
      catch (error) {
        if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') {
          t.skip('Windows requires file-symlink permission for this source alias case'); return;
        }
        throw error;
      }
    }
    const aliasBefore = await lstat(alias);
    const bytes = await readVerifiedExportSource({ path: alias, sha256, maximumBytes: 1024 });
    bytes.fill(0); // Caller owns snapshot memory, not a mapping of the original file.
    assert.deepEqual(await readFile(path), original);
    assert.deepEqual(await readFile(alias), original);
    assert.equal((await stat(path)).ino, before.ino);
    assert.equal((await lstat(alias)).ino, aliasBefore.ino);
    assert.equal((await lstat(alias)).isSymbolicLink(), kind === 'symlink');
  });
}
test('returned snapshot stays authentic even if the pathname changes later', async t => {
  const { path } = await fixture(t);
  const bytes = await readVerifiedExportSource({ path, sha256, maximumBytes: 1024 });
  await chmod(path, 0o600); await writeFile(path, 'a later unrelated original');
  assert.deepEqual(bytes, original);
  await assert.rejects(readVerifiedExportSource({ path, sha256, maximumBytes: 1024 }), { code: 'IDENTITY_MISMATCH' });
});
test('a filesystem read failure closes the descriptor', async t => {
  const { path } = await fixture(t); let closed = false;
  const filesystem = { open: async (...args: Parameters<typeof open>) => {
    const handle = await open(...args);
    return new Proxy(handle, { get(target, property) {
      if (property === 'read') return async () => { throw Object.assign(new Error('injected read failure'), { code: 'EIO' }); };
      if (property === 'close') return async () => { await handle.close(); closed = true; };
      const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
  await assert.rejects(readVerifiedExportSource({ path, sha256, maximumBytes: 1024 }, filesystem), { code: 'SOURCE_UNREADABLE' });
  assert.equal(closed, true);
});
test('cancellation during stat wins over size rejection before allocating the source', async t => {
  const { path } = await fixture(t), controller = new AbortController();
  let closed = false;
  const filesystem = { open: async (...args: Parameters<typeof open>) => {
    const handle = await open(...args);
    return new Proxy(handle, { get(target, property) {
      if (property === 'stat') return async () => { const info = await handle.stat(); controller.abort(); return info; };
      if (property === 'close') return async () => { await handle.close(); closed = true; };
      const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
  await assert.rejects(readVerifiedExportSource({ path, sha256, maximumBytes: 1, signal: controller.signal }, filesystem), { code: 'CANCELED' });
  assert.equal(closed, true);
});
