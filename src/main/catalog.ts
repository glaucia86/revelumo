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
      if (version > 2) throw new Error('Catalog uses a newer schema');
      if (version === 0) {
        this.db.exec(`BEGIN;
          CREATE TABLE photos (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
          PRAGMA user_version = 1;
          COMMIT;`);
      }
      if (version < 2) {
        this.db.exec(`BEGIN;
          CREATE TABLE thumbnails (photo_id TEXT PRIMARY KEY REFERENCES photos(id), data_url TEXT NOT NULL);
          PRAGMA user_version = 2;
          COMMIT;`);
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  add(path: string, thumbnail?: string): PhotoReference {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT INTO photos (id, path, name) VALUES (?, ?, ?) ON CONFLICT(path) DO NOTHING')
        .run(randomUUID(), path, basename(path));
      const photo = { ...this.db.prepare('SELECT id, path, name FROM photos WHERE path = ?').get(path) } as PhotoReference;
      if (thumbnail !== undefined) this.db.prepare('INSERT INTO thumbnails (photo_id, data_url) VALUES (?, ?) ON CONFLICT(photo_id) DO UPDATE SET data_url = excluded.data_url').run(photo.id, thumbnail);
      this.db.exec('COMMIT');
      return photo;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  thumbnail(id: string): string | undefined {
    return this.db.prepare('SELECT data_url FROM thumbnails WHERE photo_id = ?').get(id)?.data_url as string | undefined;
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
