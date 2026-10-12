import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, copyFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Catalog } from '../src/main/catalog.ts';
import { Library } from '../src/main/library.ts';
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'revelumo-export-session-')), source = join(directory, 'source.jpg');
  copyFileSync(new URL('./fixtures/sample.jpg', import.meta.url), source);
  const catalog = new Catalog(join(directory, 'catalog.sqlite'));
  const library = new Library(catalog, async bytes => 'data:image/jpeg;base64,' + bytes.toString('base64'));
  t.after(() => { catalog.close(); rmSync(directory, { recursive: true, force: true }); });
  const imported = await library.importSelected(source); assert.ok(imported.ok && !imported.value.canceled);
  const id = imported.value.photo.id, editing = await library.beginEditing(id); assert.ok(editing.ok);
  return { directory, source, catalog, library, id, sessionId: editing.value.sessionId };
}
test('captures the exact confirmed export revision and original references without reading source bytes', async t => {
  const f = await fixture(t);
  const values = { exposureTenths: 0, temperature: 40, tint: -20 };
  assert.ok((await f.library.saveAdjustments(f.id, f.sessionId, 1, values, 2, [])).ok);
  renameSync(f.source, f.source + '.moved'); // Capture is metadata only; circuit authenticates later.
  const captured = await f.library.captureExport(f.id, f.sessionId, 1);
  assert.ok(captured.ok);
  assert.deepEqual(captured.value, { sourcePath: f.source, sourceSha256: f.catalog.find(f.id).sha256,
    recipe: { ...values, processingVersion: 2 }, name: 'source.jpg', originalPaths: [f.source] });
});

test('refuses stale, malformed and retired export sessions without falling back to another revision', async t => {
  const f = await fixture(t);
  for (const args of [[f.id, f.sessionId, -1], [f.id, f.sessionId, 1], [f.id, 'foreign', 0], ['missing', f.sessionId, 0]]) {
    assert.equal((await f.library.captureExport(...args)).ok, false);
  }
  assert.ok((await f.library.endEditing(f.id, f.sessionId)).ok);
  assert.equal((await f.library.captureExport(f.id, f.sessionId, 0)).ok, false);
});

test('does not label a recipe changed outside the editing session as the confirmed revision', async t => {
  const f = await fixture(t);
  const { DatabaseSync } = await import('node:sqlite');
  const external = new DatabaseSync(join(f.directory, 'catalog.sqlite'));
  try { external.prepare('INSERT INTO recipes(photo_id, exposure_tenths, temperature, tint, processing_version) VALUES (?,0,80,0,2)').run(f.id); }
  finally { external.close(); }
  assert.equal((await f.library.captureExport(f.id, f.sessionId, 0)).ok, false);
});
