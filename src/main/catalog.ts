import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { PhotoSummary } from '../shared/contracts.ts';

export type PhotoReference = PhotoSummary & { path: string };

export class Catalog {
  private db: DatabaseSync;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    try {
      const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version);
      if (version > 1) throw new Error('Catalog uses a newer schema');
      if (version === 0) {
        this.db.exec(`BEGIN;
          CREATE TABLE photos (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
          PRAGMA user_version = 1;
          COMMIT;`);
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  add(path: string): PhotoReference {
    this.db.prepare('INSERT INTO photos (id, path, name) VALUES (?, ?, ?) ON CONFLICT(path) DO NOTHING')
      .run(randomUUID(), path, basename(path));
    return { ...this.db.prepare('SELECT id, path, name FROM photos WHERE path = ?').get(path) } as PhotoReference;
  }

  list(): PhotoReference[] {
    return this.db.prepare('SELECT id, path, name FROM photos ORDER BY rowid').all()
      .map((row) => ({ ...row }) as PhotoReference);
  }

  find(id: string): PhotoReference | undefined {
    const row = this.db.prepare('SELECT id, path, name FROM photos WHERE id = ?').get(id);
    return row ? { ...row } as PhotoReference : undefined;
  }

  close(): void { this.db.close(); }
}
