import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('a second Node process reopens the persisted photo reference and original', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-restart-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = join(dir, 'catalog.sqlite'); const photo = join(dir, 'photo.jpg');
  copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), photo);
  const before = createHash('sha256').update(readFileSync(photo)).digest('hex');
  const imports = `import { Catalog } from ${JSON.stringify(new URL('../src/main/catalog.ts', import.meta.url).href)};
    import { Library } from ${JSON.stringify(new URL('../src/main/library.ts', import.meta.url).href)};
    const catalog = new Catalog(${JSON.stringify(db)});
    const library = new Library(catalog, async bytes => 'data:image/jpeg;base64,' + bytes.toString('base64'));`;
  const first = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', imports + `
    const result = await library.importSelected(${JSON.stringify(photo)});
    catalog.close(); console.log(JSON.stringify(result));`], { encoding: 'utf8' }));
  assert.equal(first.ok, true);
  const second = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', imports + `
    const list = library.list(); const preview = await library.preview(list[0].id);
    catalog.close(); console.log(JSON.stringify({list, preview}));`], { encoding: 'utf8' }));
  assert.deepEqual(second.list, [first.value.photo]);
  assert.equal(second.preview.ok, true);
  assert.ok(second.preview.value.dataUrl.startsWith('data:image/jpeg;base64,'));
  assert.equal(createHash('sha256').update(readFileSync(photo)).digest('hex'), before);
});
