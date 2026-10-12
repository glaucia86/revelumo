import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Catalog } from '../src/main/catalog.ts';

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'revelumo-catalog-'));
  return join(dir, 'catalog.sqlite');
}

// Node runs after hooks in registration order. Close SQLite before removal;
// Windows refuses to delete a database while a connection is still open.
function cleanup(t: any, path: string, catalog: { close(): void }) {
  t.after(() => { catalog.close(); rmSync(dirname(path), { recursive: true, force: true }); });
}

test('photo reference survives closing and reopening the SQLite catalog', (t) => {
  const path = workspace();
  const first = new Catalog(path);
  const photo = first.add('/photos/one.jpg');
  first.close();
  const reopened = new Catalog(path);
  cleanup(t, path, reopened);
  assert.deepEqual(reopened.list(), [photo]);
  assert.equal(reopened.find(photo.id)?.path, '/photos/one.jpg');
});

test('reimporting the same path reuses its reference', (t) => {
  const path = workspace(); const catalog = new Catalog(path); cleanup(t, path, catalog);
  const first = catalog.add('/photos/one.jpg');
  assert.deepEqual(catalog.add('/photos/one.jpg'), first);
  assert.equal(catalog.list().length, 1);
});

test('unknown identifiers never return another photo', (t) => {
  const path = workspace(); const catalog = new Catalog(path); cleanup(t, path, catalog);
  catalog.add('/photos/one.jpg');
  assert.equal(catalog.find('unknown'), undefined);
});

test('a newer schema is refused without overwriting its version or data', (t) => {
  const path = workspace();
  const db = new DatabaseSync(path);
  db.exec('PRAGMA user_version = 99; CREATE TABLE sentinel (value TEXT); INSERT INTO sentinel VALUES (\'keep\');');
  db.close();
  assert.throws(() => new Catalog(path), /newer schema/);
  const check = new DatabaseSync(path); cleanup(t, path, check);
  assert.equal(check.prepare('PRAGMA user_version').get()?.user_version, 99);
  assert.equal(check.prepare('SELECT value FROM sentinel').get()?.value, 'keep');
});

test('thumbnail is derived data persisted with the reference and survives reopening', (t) => {
  const path = workspace();
  const first = new Catalog(path);
  const photo = first.add('/photos/cache.jpg', 'data:image/jpeg;base64,AA==');
  first.close();
  const reopened = new Catalog(path); cleanup(t, path, reopened);
  assert.equal(reopened.thumbnail(photo.id), 'data:image/jpeg;base64,AA==');
  assert.equal(reopened.thumbnail('unknown'), undefined);
});

test('migrates a version-one catalog without changing photo identity', (t) => {
  const path = workspace();
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE photos (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL); INSERT INTO photos VALUES ('old-id', '/photos/old.jpg', 'old.jpg'); PRAGMA user_version=1;");
  db.close();
  const catalog = new Catalog(path); cleanup(t, path, catalog);
  assert.equal(catalog.find('old-id')?.path, '/photos/old.jpg');
  assert.equal(catalog.thumbnail('old-id'), undefined);
  assert.equal(catalog.add('/photos/old.jpg', 'data:image/jpeg;base64,AA==').id, 'old-id');
  assert.equal(catalog.thumbnail('old-id'), 'data:image/jpeg;base64,AA==');
});
