import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A separate process bounds a regression: opening a FIFO for blocking read can
// otherwise leave a filesystem worker waiting forever, even after test timeout.
for (const operation of ['import', 'preview']) {
  test(`${operation} rejects a named pipe without waiting for a writer`, { skip: process.platform === 'win32' }, (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'revelumo-pipe-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const file = join(dir, 'photo.jpg');
    const fifo = spawnSync('mkfifo', [file], { encoding: 'utf8' });
    if (fifo.error?.code === 'ENOENT') { t.skip('mkfifo is unavailable'); return; }
    assert.equal(fifo.status, 0, fifo.stderr);
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { Catalog } from ${JSON.stringify(new URL('../src/main/catalog.ts', import.meta.url).href)};
      import { Library } from ${JSON.stringify(new URL('../src/main/library.ts', import.meta.url).href)};
      const catalog = new Catalog(':memory:');
      const library = new Library(catalog, async () => { throw new Error('Decoder must not run'); });
      const file = ${JSON.stringify(file)};
      const result = ${operation === 'import' ? 'await library.importSelected(file)' : 'await library.preview(catalog.add(file).id)'};
      console.log(JSON.stringify(result));
      catalog.close();
    `], { encoding: 'utf8', timeout: 2000 });
    assert.equal(result.status, 0, `The operation must finish, not block: ${result.error?.message ?? result.stderr}`);
    assert.equal(JSON.parse(result.stdout).code, 'unreadable');
  });
}
