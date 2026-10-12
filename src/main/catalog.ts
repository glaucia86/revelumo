import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { PhotoSummary } from '../shared/contracts.ts';

export type PhotoReference = PhotoSummary & { path: string; sha256: string | null };

export class Catalog {
  private db: DatabaseSync;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    try {
      const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version);
      if (version > 3) throw new Error('Catalog uses a newer schema');
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
      if (version < 3) {
        this.db.exec(`BEGIN;
          ALTER TABLE photos ADD COLUMN sha256 TEXT;
          PRAGMA user_version = 3;
          COMMIT;`);
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  add(path: string, thumbnail?: string, sha256?: string): PhotoReference {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT INTO photos (id, path, name) VALUES (?, ?, ?) ON CONFLICT(path) DO NOTHING')
        .run(randomUUID(), path, basename(path));
      if (sha256 !== undefined) {
        const existing = this.findByPath(path);
        if (existing?.sha256 && existing.sha256 !== sha256) throw new Error('Original identity differs');
        this.db.prepare('UPDATE photos SET sha256 = ? WHERE path = ? AND sha256 IS NULL').run(sha256, path);
      }
      const photo = this.findByPath(path)!;
      if (thumbnail !== undefined) this.db.prepare('INSERT INTO thumbnails (photo_id, data_url) VALUES (?, ?) ON CONFLICT(photo_id) DO UPDATE SET data_url = excluded.data_url').run(photo.id, thumbnail);
      this.db.exec('COMMIT');
      return photo;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  thumbnail(id: string): string | undefined {
    return this.db.prepare('SELECT data_url FROM thumbnails WHERE photo_id = ?').get(id)?.data_url as string | undefined;
  }

  list(): PhotoReference[] {
    return this.db.prepare('SELECT id, path, name, sha256 FROM photos ORDER BY rowid').all()
      .map((row) => ({ ...row }) as PhotoReference);
  }

  find(id: string): PhotoReference | undefined {
    const row = this.db.prepare('SELECT id, path, name, sha256 FROM photos WHERE id = ?').get(id);
    return row ? { ...row } as PhotoReference : undefined;
  }

  findByPath(path: string): PhotoReference | undefined {
    const row = this.db.prepare('SELECT id, path, name, sha256 FROM photos WHERE path = ?').get(path);
    return row ? { ...row } as PhotoReference : undefined;
  }

  relocate(id: string, path: string, sha256: string): PhotoReference {
    // One SQLite statement atomically changes only the reference. UNIQUE(path)
    // refuses conflicts; the identity predicate protects the recorded hash.
    const result = this.db.prepare('UPDATE photos SET path = ? WHERE id = ? AND sha256 = ?').run(path, id, sha256);
    if (result.changes !== 1) throw new Error('Photo identity is unavailable or changed');
    return this.find(id)!;
  }

  rememberIdentity(id: string, sha256: string): void {
    const result = this.db.prepare('UPDATE photos SET sha256 = ? WHERE id = ? AND sha256 IS NULL').run(sha256, id);
    if (result.changes !== 1) throw new Error('Photo identity is unavailable or already recorded');
  }

  close(): void { this.db.close(); }
}
