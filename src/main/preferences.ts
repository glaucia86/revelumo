import { constants } from 'node:fs';
import { open, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isLanguageChoice, resolveLanguage, type LanguageChoice } from '../shared/i18n/locale.ts';
import type { LanguageSnapshot, PreferencesResult } from '../shared/preferences-contract.ts';

export class PreferencesStore {
  private filename: string;
  private preferred: unknown;
  private queue: Promise<unknown> = Promise.resolve();
  private initialization: Promise<LanguageSnapshot> | undefined;
  private snapshot: LanguageSnapshot | undefined;
  constructor(directory: string, preferred: unknown) {
    this.filename = join(directory, 'preferences.json');
    this.preferred = preferred;
  }
  async read(): Promise<LanguageSnapshot> {
    if (this.snapshot && !this.snapshot.writable) { this.snapshot = undefined; this.initialization = undefined; }
    this.initialization ??= this.load();
    await this.initialization;
    return { ...this.snapshot! };
  }
  private async load(): Promise<LanguageSnapshot> {
    if (!this.snapshot) {
      let choice: LanguageChoice = 'system';
      let notice: LanguageSnapshot['notice'] = null;
      let oversized = false;
      try {
        const file = await open(this.filename, constants.O_RDONLY | constants.O_NONBLOCK);
        let content: string;
        try {
          if (!(await file.stat()).isFile()) throw new Error('Preferences must be a regular file');
          const buffer = Buffer.alloc(4097);
          const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
          if (bytesRead > 4096) { oversized = true; throw new SyntaxError('Preferences exceed size limit'); }
          content = buffer.subarray(0, bytesRead).toString('utf8');
        } finally { await file.close(); }
        const value: unknown = JSON.parse(content);
        if (value && typeof value === 'object' && 'schemaVersion' in value && value.schemaVersion === 1 &&
          'language' in value && isLanguageChoice(value.language) && Object.keys(value).length === 2) choice = value.language;
        else if (value && typeof value === 'object' && 'schemaVersion' in value && typeof value.schemaVersion === 'number' && value.schemaVersion > 1) notice = 'future';
        else notice = 'invalid';
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') notice = error instanceof SyntaxError ? 'invalid' : 'unreadable'; }
      this.snapshot = { choice, resolved: resolveLanguage(choice, this.preferred), writable: notice !== 'future' && notice !== 'unreadable' && !oversized, notice };
    }
    return { ...this.snapshot };
  }
  setLanguage(choice: LanguageChoice): Promise<PreferencesResult<LanguageSnapshot>> {
    if (!isLanguageChoice(choice)) return Promise.resolve({ ok: false, code: 'invalid-request', message: { key: 'preferences.invalidRequest' } });
    const result = this.queue.then(() => this.persist(choice));
    this.queue = result.catch(() => {});
    return result;
  }
  private async persist(choice: LanguageChoice): Promise<PreferencesResult<LanguageSnapshot>> {
    const confirmed = await this.read();
    if (!confirmed.writable) return { ok: false, code: 'settings-unavailable', message: { key: confirmed.notice === 'future' ? 'preferences.future' : 'preferences.saveFailed' } };
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ schemaVersion: 1, language: choice }), { flag: 'wx', mode: 0o600 });
      await rename(temporary, this.filename);
    } catch {
      return { ok: false, code: 'settings-unavailable', message: { key: 'preferences.saveFailed' } };
    } finally { await rm(temporary, { force: true }).catch(() => {}); }
    this.snapshot = { choice, resolved: resolveLanguage(choice, this.preferred), writable: true, notice: null };
    return { ok: true, value: { ...this.snapshot } };
  }
}
