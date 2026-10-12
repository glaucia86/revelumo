import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishNewExport } from '../src/main/export-file.ts';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'revelumo-export-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const original = join(directory, 'original.jpg');
  await fs.writeFile(original, 'original bytes', { flag: 'wx' });
  return { directory, original, request: {
    bytes: Buffer.from('completed export'), destination: join(directory, 'export.jpg'),
    originalPaths: [original], protectedDirectories: [join(directory, 'catalog')], maximumBytes: 1024,
  } };
}

async function fileSymlinkOrSkip(t: import('node:test').TestContext, target: string, path: string): Promise<boolean> {
  try { await fs.symlink(target, path); return true; }
  catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      t.skip('Windows file-symlink permission unavailable; hardlink cases still run'); return false;
    }
    throw error;
  }
}

test('publishes complete bytes to a new file and leaves the original unchanged', async (t) => {
  const { directory, original, request } = await fixture(t);
  assert.deepEqual(await publishNewExport(request), { path: request.destination, cleanupPending: false });
  assert.equal(await fs.readFile(request.destination, 'utf8'), 'completed export');
  assert.equal(await fs.readFile(original, 'utf8'), 'original bytes');
  assert.deepEqual((await fs.readdir(directory)).sort(), ['export.jpg', 'original.jpg']);
});

test('reports an existing destination without replacing its bytes', async (t) => {
  const { request } = await fixture(t);
  await fs.writeFile(request.destination, 'existing export', { flag: 'wx' });
  await assert.rejects(publishNewExport(request), { code: 'DESTINATION_EXISTS' });
  assert.equal(await fs.readFile(request.destination, 'utf8'), 'existing export');
});

for (const kind of ['symlink', 'dangling symlink', 'hardlink'] as const) {
  test(`refuses a destination that is a ${kind}`, async (t) => {
    const { request, original, directory } = await fixture(t);
    if (kind === 'hardlink') await fs.link(original, request.destination);
    else if (!await fileSymlinkOrSkip(t, kind === 'symlink' ? original : join(directory, 'absent.jpg'), request.destination)) return;
    const before = await fs.lstat(request.destination);
    await assert.rejects(publishNewExport(request), { code: 'DESTINATION_EXISTS' });
    const after = await fs.lstat(request.destination);
    assert.equal(after.ino, before.ino);
    assert.equal(await fs.readFile(original, 'utf8'), 'original bytes');
  });
}

test('exactly one concurrent publisher wins without overwriting the winner', async (t) => {
  const { request } = await fixture(t);
  const outcomes = await Promise.allSettled([
    publishNewExport(request), publishNewExport({ ...request, bytes: Buffer.from('second export') }),
  ]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(result => result.status === 'rejected' && result.reason.code === 'DESTINATION_EXISTS').length, 1);
  assert.ok(['completed export', 'second export'].includes(await fs.readFile(request.destination, 'utf8')));
});

test('protects the registered original path even after the original disappears', async (t) => {
  const { request, original, directory } = await fixture(t);
  await fs.unlink(original);
  await assert.rejects(publishNewExport({ ...request, destination: original }), { code: 'PROTECTED_DESTINATION' });
  assert.deepEqual(await fs.readdir(directory), []);
});

test('protects a missing original through a symlinked parent directory', async (t) => {
  const { request, directory, original } = await fixture(t);
  const alias = join(directory, 'alias');
  await fs.symlink(directory, alias, 'junction');
  await fs.unlink(original);
  await assert.rejects(publishNewExport({ ...request, destination: join(alias, 'original.jpg') }), { code: 'PROTECTED_DESTINATION' });
  await assert.rejects(fs.readFile(original), { code: 'ENOENT' });
});

test('refuses internal catalog directories including a symlinked alias', async (t) => {
  const { request, directory } = await fixture(t);
  const catalog = join(directory, 'catalog');
  await fs.mkdir(catalog);
  const alias = join(directory, 'catalog-alias');
  await fs.symlink(catalog, alias, 'junction');
  await assert.rejects(publishNewExport({ ...request, destination: join(alias, 'photo.jpg') }), { code: 'PROTECTED_DESTINATION' });
  assert.deepEqual(await fs.readdir(catalog), []);
});

test('rejects bytes over the explicit output budget without creating a file', async (t) => {
  const { request, directory } = await fixture(t);
  await assert.rejects(publishNewExport({ ...request, maximumBytes: 3 }), { code: 'OUTPUT_TOO_LARGE' });
  assert.deepEqual(await fs.readdir(directory), ['original.jpg']);
});

test('requires a finite positive integer budget and nonempty bytes', async (t) => {
  const { request, directory } = await fixture(t);
  for (const maximumBytes of [0, -1, NaN, Infinity, 3.5]) {
    await assert.rejects(publishNewExport({ ...request, maximumBytes }), { code: 'INVALID_OUTPUT' });
  }
  await assert.rejects(publishNewExport({ ...request, bytes: Buffer.alloc(0) }), { code: 'INVALID_OUTPUT' });
  assert.deepEqual(await fs.readdir(directory), ['original.jpg']);
});

test('cancellation before publication creates no output or temporary file', async (t) => {
  const { request, directory } = await fixture(t);
  await assert.rejects(publishNewExport({ ...request, signal: AbortSignal.abort() }), { code: 'CANCELED' });
  assert.deepEqual(await fs.readdir(directory), ['original.jpg']);
});

test('fails closed with a clear error when atomic hardlink publication is unsupported', async (t) => {
  const { request, directory } = await fixture(t);
  await assert.rejects(publishNewExport(request, {
    ...fs, link: async () => { throw Object.assign(new Error('unsupported'), { code: 'ENOTSUP' }); },
  }), { code: 'ATOMIC_PUBLICATION_UNAVAILABLE' });
  assert.deepEqual(await fs.readdir(directory), ['original.jpg']);
});

test('cancellation while preparing the file aborts before publication', async (t) => {
  const { request, directory } = await fixture(t);
  const controller = new AbortController();
  await assert.rejects(publishNewExport({ ...request, signal: controller.signal }, {
    ...fs, open: async (...args) => {
      const handle = await fs.open(...args);
      controller.abort();
      return handle;
    },
  }), { code: 'CANCELED' });
  assert.deepEqual(await fs.readdir(directory), ['original.jpg']);
});

test('cancellation after the atomic commit reports the completed export', async (t) => {
  const { request } = await fixture(t);
  const controller = new AbortController();
  const result = await publishNewExport({ ...request, signal: controller.signal }, {
    ...fs, link: async (...args) => { await fs.link(...args); controller.abort(); },
  });
  assert.equal(result.path, request.destination);
  assert.equal(await fs.readFile(request.destination, 'utf8'), 'completed export');
});

for (const kind of ['file', 'symlink'] as const) {
  test(`does not replace a ${kind} created by another process immediately before commit`, async (t) => {
    const { request, original } = await fixture(t);
    if (kind === 'symlink') {
      if (!await fileSymlinkOrSkip(t, original, request.destination)) return;
      await fs.unlink(request.destination);
    }
    await assert.rejects(publishNewExport(request, {
      ...fs, link: async (...args) => {
        if (kind === 'file') await fs.writeFile(request.destination, 'external winner', { flag: 'wx' });
        else await fs.symlink(original, request.destination);
        await fs.link(...args);
      },
    }), { code: 'DESTINATION_EXISTS' });
    assert.equal(await fs.readFile(request.destination, 'utf8'), kind === 'file' ? 'external winner' : 'original bytes');
    assert.equal(await fs.readFile(original, 'utf8'), 'original bytes');
  });
}

test('owns an immutable copy of output bytes across asynchronous filesystem work', async (t) => {
  const { request } = await fixture(t);
  const publishing = publishNewExport(request);
  request.bytes.fill(0);
  await publishing;
  assert.equal(await fs.readFile(request.destination, 'utf8'), 'completed export');
});

test('removes its staging directory when opening the temporary file fails', async (t) => {
  const { request, directory } = await fixture(t);
  await assert.rejects(publishNewExport(request, {
    ...fs, open: async () => { throw Object.assign(new Error('no space'), { code: 'ENOSPC' }); },
  }), { code: 'WRITE_FAILED' });
  assert.deepEqual(await fs.readdir(directory), ['original.jpg']);
});

for (const operation of ['writeFile', 'sync'] as const) {
  test(`a ${operation} failure removes incomplete staging bytes and preserves the original`, async (t) => {
    const { request, directory, original } = await fixture(t);
    await assert.rejects(publishNewExport(request, {
      ...fs, open: async (...args) => {
        const handle = await fs.open(...args);
        const method = handle[operation];
        handle[operation] = async () => {
          if (operation === 'writeFile') await handle.write(Buffer.from('partial'));
          throw Object.assign(new Error('no space'), { code: 'ENOSPC' });
        };
        t.after(() => { handle[operation] = method as never; });
        return handle;
      },
    }), { code: 'WRITE_FAILED' });
    assert.deepEqual(await fs.readdir(directory), ['original.jpg']);
    assert.equal(await fs.readFile(original, 'utf8'), 'original bytes');
  });
}

test('reports cleanup as pending after commit without deleting the completed export', async (t) => {
  const { request } = await fixture(t);
  const result = await publishNewExport(request, {
    ...fs, unlink: async () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); },
  });
  assert.deepEqual(result, { path: request.destination, cleanupPending: true });
  assert.equal(await fs.readFile(request.destination, 'utf8'), 'completed export');
});

test('preserves an unrelated file that replaced the staging name before cleanup', async (t) => {
  const { request } = await fixture(t);
  let replacedTemporary = '';
  const result = await publishNewExport(request, {
    ...fs, link: async (source, destination) => {
      await fs.link(source, destination);
      replacedTemporary = String(source);
      await fs.unlink(source);
      await fs.writeFile(source, 'unrelated replacement', { flag: 'wx' });
    },
  });
  assert.equal(result.cleanupPending, true);
  assert.equal(await fs.readFile(replacedTemporary, 'utf8'), 'unrelated replacement');
  assert.equal(await fs.readFile(request.destination, 'utf8'), 'completed export');
});

test('refuses to publish staging bytes if their pathname was replaced before commit', async (t) => {
  const { request } = await fixture(t);
  let replacedTemporary = '';
  await assert.rejects(publishNewExport(request, {
    ...fs, open: async (...args) => {
      const handle = await fs.open(...args);
      const sync = handle.sync.bind(handle);
      handle.sync = async () => {
        await sync();
        replacedTemporary = String(args[0]);
        await fs.unlink(replacedTemporary);
        await fs.writeFile(replacedTemporary, 'unrelated replacement', { flag: 'wx' });
      };
      return handle;
    },
  }), { code: 'STAGING_CHANGED', cleanupPending: true });
  assert.equal(await fs.readFile(replacedTemporary, 'utf8'), 'unrelated replacement');
  await assert.rejects(fs.readFile(request.destination), { code: 'ENOENT' });
});

test('protects a filesystem root configured as an internal directory', async (t) => {
  const { request, directory } = await fixture(t);
  const root = (await import('node:path')).parse(directory).root;
  await assert.rejects(publishNewExport({ ...request, protectedDirectories: [root] }), { code: 'PROTECTED_DESTINATION' });
  assert.deepEqual(await fs.readdir(directory), ['original.jpg']);
});

test('does not traverse a replacement staging directory symlink during cleanup', async (t) => {
  const { request, directory } = await fixture(t);
  const other = join(directory, 'unrelated');
  await fs.mkdir(other);
  await fs.writeFile(join(other, 'payload'), 'unrelated file');
  const result = await publishNewExport(request, {
    ...fs, link: async (source, destination) => {
      await fs.link(source, destination);
      const staging = (await import('node:path')).dirname(String(source));
      await fs.rename(staging, staging + '-moved');
      await fs.symlink(other, staging, 'junction');
    },
  });
  assert.equal(result.cleanupPending, true);
  assert.equal(await fs.readFile(join(other, 'payload'), 'utf8'), 'unrelated file');
  assert.equal(await fs.readFile(request.destination, 'utf8'), 'completed export');
});

test('cleanup failure never masks the pre-commit failure', async (t) => {
  const { request } = await fixture(t);
  await assert.rejects(publishNewExport(request, {
    ...fs,
    link: async () => { throw Object.assign(new Error('unsupported'), { code: 'ENOTSUP' }); },
    unlink: async () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); },
  }), { code: 'ATOMIC_PUBLICATION_UNAVAILABLE', cleanupPending: true });
  await assert.rejects(fs.readFile(request.destination), { code: 'ENOENT' });
});

test('reports an unverifiable staging directory as pending cleanup without touching it', async (t) => {
  const { request, directory } = await fixture(t);
  await assert.rejects(publishNewExport(request, {
    ...fs, lstat: async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); },
  }), { code: 'WRITE_FAILED', cleanupPending: true });
  const contents = await fs.readdir(directory);
  assert.equal(contents.filter(name => name.startsWith('.revelumo-export-')).length, 1);
  await assert.rejects(fs.readFile(request.destination), { code: 'ENOENT' });
});

test('conservatively protects case aliases of the missing original on any filesystem', async (t) => {
  const { request, original, directory } = await fixture(t);
  await fs.unlink(original);
  await assert.rejects(publishNewExport({ ...request, destination: join(directory, 'ORIGINAL.JPG') }), { code: 'PROTECTED_DESTINATION' });
  assert.deepEqual(await fs.readdir(directory), []);
});

test('after publication submission, cancellation cannot turn a successful link into a canceled result', async (t) => {
  const { request } = await fixture(t);
  const controller = new AbortController();
  const result = await publishNewExport({ ...request, signal: controller.signal }, {
    ...fs, link: async (...args) => { controller.abort(); await fs.link(...args); },
  });
  assert.equal(result.path, request.destination);
  assert.equal(await fs.readFile(request.destination, 'utf8'), 'completed export');
});
test('protects canonically equivalent Unicode spelling of an absent original', async t => {
  const { request, directory } = await fixture(t);
  const recorded = join(directory, 'caf\u00e9.jpg');
  await assert.rejects(publishNewExport({ ...request, originalPaths: [recorded], destination: join(directory, 'cafe\u0301.jpg') }), { code: 'PROTECTED_DESTINATION' });
  assert.deepEqual(await fs.readdir(directory), ['original.jpg']);
});
