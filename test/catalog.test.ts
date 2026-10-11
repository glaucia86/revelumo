import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Catalog } from '../src/main/catalog.ts';

function workspace(t: any) {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-catalog-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'catalog.sqlite');
}

test('photo reference survives closing and reopening the SQLite catalog', (t) => {
  const path = workspace(t);
  const first = new Catalog(path);
  const photo = first.add('/photos/one.jpg');
  first.close();
  const reopened = new Catalog(path);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.list(), [photo]);
  assert.equal(reopened.find(photo.id)?.path, '/photos/one.jpg');
});

test('reimporting the same path reuses its reference', (t) => {
  const catalog = new Catalog(workspace(t)); t.after(() => catalog.close());
  const first = catalog.add('/photos/one.jpg');
  assert.deepEqual(catalog.add('/photos/one.jpg'), first);
  assert.equal(catalog.list().length, 1);
});

test('unknown identifiers never return another photo', (t) => {
  const catalog = new Catalog(workspace(t)); t.after(() => catalog.close());
  catalog.add('/photos/one.jpg');
  assert.equal(catalog.find('unknown'), undefined);
});

test('a newer schema is refused without overwriting its version or data', (t) => {
  const path = workspace(t);
  const db = new DatabaseSync(path);
  db.exec('PRAGMA user_version = 99; CREATE TABLE sentinel (value TEXT); INSERT INTO sentinel VALUES (\'keep\');');
  db.close();
  assert.throws(() => new Catalog(path), /newer schema/);
  const check = new DatabaseSync(path); t.after(() => check.close());
  assert.equal(check.prepare('PRAGMA user_version').get()?.user_version, 99);
  assert.equal(check.prepare('SELECT value FROM sentinel').get()?.value, 'keep');
});
