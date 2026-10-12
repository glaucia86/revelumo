import { open, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { Catalog } from './catalog.ts';
import { parseRequest } from '../shared/requests.ts';
import type { PhotoClassification, PhotoFlag, PhotoRecipe, EditSession, LibraryFilters, LibraryResults } from '../shared/contracts.ts';
import type { BatchItem, BatchOutcome, ImportProgress, FailureCode, ImportOutcome, PhotoSummary, PhotoStatus, PhotoAvailability, Preview, Result } from '../shared/contracts.ts';

const MAX_BYTES = 32 * 1024 * 1024;
export type PreviewDecoder = (bytes: Buffer) => Promise<string>;
const failure = (code: FailureCode, message: string): Result<never> => ({ ok: false, code, message });
const summary = ({ id, name }: PhotoSummary): PhotoSummary => ({ id, name });
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const identityDiffers = (recorded: string | null | undefined, incoming: string): boolean => Boolean(recorded && recorded !== incoming);

async function readJpeg(filename: string): Promise<Result<Buffer>> {
  try {
    // Do not wait for a writer if the selected path became a named pipe.
    // The descriptor check below still rejects every non-regular file.
    const handle = await open(filename, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const info = await handle.stat();
      if (!info.isFile()) return failure('unreadable', 'Escolha um arquivo JPEG.');
      if (info.size > MAX_BYTES) return failure('too-large', 'Esta primeira versão aceita JPEGs de até 32 MiB.');
      // Bound the allocation/read even if another process grows the file.
      const bytes = Buffer.alloc(info.size + 1);
      let count = 0;
      while (count < bytes.length) {
        const result = await handle.read(bytes, count, bytes.length - count, null);
        if (result.bytesRead === 0) break;
        count += result.bytesRead;
      }
      if (count !== info.size) return failure('unreadable', 'O arquivo mudou durante a leitura. Tente novamente.');
      const content = bytes.subarray(0, count);
      if (count < 4 || content[0] !== 0xff || content[1] !== 0xd8 || content[2] !== 0xff) {
        return failure('invalid-jpeg', 'O arquivo não é um JPEG válido.');
      }
      return { ok: true, value: content };
    } finally { await handle.close(); }
  } catch {
    return failure('unreadable', 'Não foi possível ler o original. Verifique sua localização e permissão.');
  }
}

export class Library {
  private catalog: Catalog;
  private decoder: PreviewDecoder;
  private thumbnailDecoder?: PreviewDecoder;
  private pending: Promise<void> = Promise.resolve();
  private editing: EditSession | null = null;
  constructor(catalog: Catalog, decoder: PreviewDecoder, thumbnailDecoder?: PreviewDecoder) {
    this.catalog = catalog; this.decoder = decoder; this.thumbnailDecoder = thumbnailDecoder;
  }

  // Queue before reading: concurrent requests cannot retain a batch of full JPEG buffers.
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.pending.then(work);
    this.pending = next.then(() => {}, () => {});
    return next;
  }

  async importBatch(filenames: string[] | null, report: (progress: ImportProgress) => void = () => {}, shouldStop: () => boolean = () => false): Promise<BatchOutcome> {
    if (filenames === null) return { canceled: true };
    const items: BatchItem[] = [];
    const progress = (): ImportProgress => ({ running: items.length < filenames.length && !shouldStop(), total: filenames.length, completed: items.length,
      succeeded: items.filter(item => item.result.ok).length, failed: items.filter(item => !item.result.ok).length,
      currentName: items.length < filenames.length ? basename(filenames[items.length]) : null });
    report(progress());
    for (const filename of filenames) {
      if (shouldStop()) break;
      const result = await this.serial(() => this.importOne(filename, shouldStop));
      if (result.ok && result.value.canceled) break;
      items.push({ name: basename(filename), result: result.ok && !result.value.canceled ? { ok: true, value: result.value.photo } :
        result.ok ? failure('unreadable', 'Seleção vazia.') : result });
      report(progress());
      await setImmediate();
    }
    return { canceled: false, stopped: items.length < filenames.length, items };
  }

  list(): PhotoSummary[] { return this.catalog.list().map(summary); }

  recipe(id: string): Result<PhotoRecipe> {
    if (!parseRequest({ op: 'recipe', id })) return failure('invalid-request', 'Solicitação inválida.');
    try {
      const photo = this.catalog.find(id);
      if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.');
      return { ok: true, value: { photo: summary(photo), ...this.catalog.recipe(id) } };
    } catch { return failure('catalog-error', 'Não foi possível ler o ajuste salvo.'); }
  }

  beginEditing(id: string): Promise<Result<EditSession>> {
    return this.serial(async () => {
      const recipe = this.recipe(id);
      if (!recipe.ok) return recipe;
      this.editing = { ...recipe.value, sessionId: randomUUID(), revision: 0 };
      return { ok: true, value: { ...this.editing } };
    });
  }

  endEditing(id: string, sessionId: string): Promise<Result<null>> {
    if (!parseRequest({ op: 'end-edit', id, sessionId })) return Promise.resolve(failure('invalid-request', 'Solicitação inválida.'));
    return this.serial(async () => {
      if (this.editing?.photo.id !== id || this.editing.sessionId !== sessionId) return failure('invalid-request', 'Sessão de edição encerrada.');
      this.editing = null;
      return { ok: true, value: null };
    });
  }

  saveExposure(id: string, sessionId: string, revision: number, exposureTenths: number, processingVersion: number): Promise<Result<EditSession>> {
    if (!parseRequest({ op: 'exposure', id, sessionId, revision, exposureTenths, processingVersion })) return Promise.resolve(failure('invalid-request', 'Solicitação inválida.'));
    return this.serial(async () => {
      try {
        const photo = this.catalog.find(id);
        if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.');
        const session = this.editing;
        if (!session || session.photo.id !== id || session.sessionId !== sessionId || revision < session.revision ||
            (revision === session.revision && exposureTenths !== session.exposureTenths)) return failure('invalid-request', 'Revisão de edição obsoleta.');
        if (!photo.sha256) return failure('identity-unverified', 'Abra o original disponível para comprovar sua identidade antes de salvar.');
        const image = await readJpeg(photo.path);
        if (!image.ok) return image;
        if (digest(image.value) !== photo.sha256) return failure('identity-mismatch', 'O arquivo difere do original catalogado. O ajuste salvo foi preservado.');
        // The same protected queue covers session retirement, relocation and
        // identity read/commit; never admit an old revision after an await.
        if (this.editing !== session) return failure('invalid-request', 'Sessão de edição encerrada.');
        this.catalog.saveExposure(id, photo.sha256, exposureTenths);
        this.editing = { ...session, revision, exposureTenths };
        return { ok: true, value: { ...this.editing } };
      } catch { return failure('catalog-error', 'Não foi possível salvar o ajuste. O último ajuste confirmado foi preservado. Tente novamente.'); }
    });
  }

  query(filters: LibraryFilters): Result<LibraryResults> {
    if (!parseRequest({ ...filters, op: 'query' })) return failure('invalid-request', 'Solicitação inválida.');
    try { return { ok: true, value: this.catalog.query(filters) }; }
    catch { return failure('catalog-error', 'Não foi possível consultar a biblioteca. Tente novamente.'); }
  }

  classification(id: string): Result<PhotoClassification> {
    if (!parseRequest({ op: 'classification', id })) return failure('invalid-request', 'Solicitação inválida.');
    try {
      const photo = this.catalog.find(id);
      if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.');
      return { ok: true, value: { photo: summary(photo), rating: photo.rating, flag: photo.flag } };
    } catch { return failure('catalog-error', 'Não foi possível ler a classificação.'); }
  }

  classify(id: string, rating: number | null, flag: PhotoFlag): Result<PhotoClassification> {
    if (!parseRequest({ op: 'classify', id, rating, flag })) return failure('invalid-request', 'Solicitação inválida.');
    try {
      if (!this.catalog.find(id)) return failure('not-found', 'Foto não encontrada no catálogo.');
      const photo = this.catalog.classify(id, rating, flag);
      return { ok: true, value: { photo: summary(photo), rating: photo.rating, flag: photo.flag } };
    } catch { return failure('catalog-error', 'Não foi possível salvar a classificação. O estado anterior foi preservado.'); }
  }

  // Presence is a cheap snapshot, never proof of content identity. No JPEG
  // bytes are read, decoded or hashed, and legacy records are not enrolled.
  async availability(id: string): Promise<Result<PhotoAvailability>> {
    const photo = this.catalog.find(id);
    if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.');
    let state: PhotoAvailability['state'];
    try {
      const handle = await open(photo.path, constants.O_RDONLY | constants.O_NONBLOCK);
      try { state = (await handle.stat()).isFile() ? 'present' : 'unreadable'; }
      finally { await handle.close(); }
    } catch (error) { state = ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '') ? 'missing' : 'unreadable'; }
    const message = state === 'present' ? 'Arquivo acessível. Conteúdo ainda não verificado.' : state === 'missing' ? 'Original ausente.' : 'Não foi possível acessar o original.';
    return { ok: true, value: { photo: summary(photo), state, identityRecorded: photo.sha256 !== null, contentVerified: false, message } };
  }

  status(id: string): Promise<Result<PhotoStatus>> {
    return this.serial(async () => {
      const photo = this.catalog.find(id);
      if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.');
      let state: PhotoStatus['state'];
      try { state = (await stat(photo.path)).isFile() ? 'available' : 'unreadable'; }
      catch (error) { state = ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '') ? 'missing' : 'unreadable'; }
      if (state === 'available') {
        const image = await readJpeg(photo.path);
        if (!image.ok) state = 'unreadable';
        else if (identityDiffers(photo.sha256, digest(image.value))) state = 'changed';
        else if (!photo.sha256) {
          try { await this.decoder(image.value); }
          catch { state = 'unreadable'; }
          if (state === 'available') {
            try { this.catalog.rememberIdentity(id, digest(image.value)); }
            catch { return failure('catalog-error', 'Não foi possível registrar a identificação do original no catálogo.'); }
          }
        }
      }
      let message = state === 'available' ? 'Original disponível.' : state === 'missing' ? 'Original ausente. Localize o arquivo para continuar.' :
        state === 'changed' ? 'O arquivo neste caminho é diferente do original catalogado.' : 'Não foi possível ler o original. Verifique sua localização e permissão.';
      if (state !== 'available' && !photo.sha256) message += ' Este registro antigo não possui identificação comprovada. Importe o arquivo como uma nova foto; o registro anterior será preservado.';
      return { ok: true, value: { photo: summary(photo), state, canRelocate: state !== 'available' && photo.sha256 !== null, message } };
    });
  }


  importSelected(filename: string | null): Promise<Result<ImportOutcome>> {
    return this.serial(() => this.importOne(filename));
  }

  relocateSelected(id: string, filename: string | null, shouldStop: () => boolean = () => false): Promise<Result<ImportOutcome>> {
    return this.serial(async () => {
      if (shouldStop()) return { ok: true, value: { canceled: true } };
      const photo = this.catalog.find(id);
      if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.');
      if (filename === null) return { ok: true, value: { canceled: true } };
      if (!photo.sha256) return failure('identity-unverified', 'Este registro antigo não possui identificação comprovada. Importe o arquivo como uma nova foto; o registro anterior será preservado.');
      let canonical: string;
      try { canonical = await realpath(filename); }
      catch { return failure('unreadable', 'Não foi possível localizar o arquivo escolhido.'); }
      if (shouldStop()) return { ok: true, value: { canceled: true } };
      const image = await readJpeg(canonical);
      if (shouldStop()) return { ok: true, value: { canceled: true } };
      if (!image.ok) return image;
      if (digest(image.value) !== photo.sha256) return failure('identity-mismatch', 'O arquivo escolhido é diferente do original catalogado. Escolha exatamente o mesmo arquivo.');
      const occupied = this.catalog.findByPath(canonical);
      if (occupied && occupied.id !== photo.id) return failure('path-conflict', 'Este arquivo já pertence a outra foto do catálogo. Nenhum registro foi alterado.');
      try { return { ok: true, value: { canceled: false, photo: summary(this.catalog.relocate(id, canonical, photo.sha256)) } }; }
      catch { return failure('catalog-error', 'Não foi possível salvar a nova localização. O registro anterior foi preservado.'); }
    });
  }

  private async importOne(filename: string | null, shouldStop: () => boolean = () => false): Promise<Result<ImportOutcome>> {
    if (filename === null || shouldStop()) return { ok: true, value: { canceled: true } };
    let canonical: string;
    try { canonical = await realpath(filename); }
    catch { return failure('unreadable', 'Não foi possível localizar o arquivo escolhido.'); }
    const image = await readJpeg(canonical);
    if (!image.ok) return image;
    const sha256 = digest(image.value);
    const existing = this.catalog.findByPath(canonical);
    if (identityDiffers(existing?.sha256, sha256)) return failure('identity-mismatch', 'O arquivo é diferente do original catalogado. O registro anterior foi preservado.');
    if (shouldStop()) return { ok: true, value: { canceled: true } };
    let thumbnail: string | undefined;
    try { if (this.thumbnailDecoder) thumbnail = await this.thumbnailDecoder(image.value); else await this.decoder(image.value); }
    catch { return failure('invalid-jpeg', 'Não foi possível decodificar este JPEG dentro dos limites desta versão.'); }
    if (shouldStop()) return { ok: true, value: { canceled: true } };
    try {
      return { ok: true, value: { canceled: false, photo: summary(this.catalog.add(canonical, thumbnail, sha256)) } };
    } catch { return failure('catalog-error', 'Não foi possível salvar a referência no catálogo.'); }
  }

  thumbnail(id: string): Promise<Result<Preview>> {
    return this.serial(async () => {
      const photo = this.catalog.find(id);
      if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.');
      const cached = this.catalog.thumbnail(id);
      if (cached) return { ok: true, value: { photo: summary(photo), dataUrl: cached } };
      if (!this.thumbnailDecoder) return failure('not-found', 'Miniatura indisponível.');
      const image = await readJpeg(photo.path);
      if (!image.ok) return image;
      if (identityDiffers(photo.sha256, digest(image.value))) return failure('identity-mismatch', 'O arquivo neste caminho é diferente do original catalogado. A miniatura anterior não foi substituída.');
      let dataUrl: string;
      try { dataUrl = await this.thumbnailDecoder(image.value); }
      catch { return failure('invalid-jpeg', 'Não foi possível criar a miniatura.'); }
      try { this.catalog.add(photo.path, dataUrl, digest(image.value)); }
      catch { return failure('catalog-error', 'Não foi possível salvar a miniatura.'); }
      return { ok: true, value: { photo: summary(photo), dataUrl } };
    });
  }

  preview(id: string): Promise<Result<Preview>> { return this.serial(() => this.openPreview(id)); }

  private async openPreview(id: string): Promise<Result<Preview>> {
    const photo = this.catalog.find(id);
    if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.');
    const image = await readJpeg(photo.path);
    if (!image.ok) return image;
    if (identityDiffers(photo.sha256, digest(image.value))) return failure('identity-mismatch', 'O arquivo neste caminho é diferente do original catalogado. Localize o original para continuar.');
    let dataUrl: string;
    try {
      dataUrl = await this.decoder(image.value);
    } catch { return failure('invalid-jpeg', 'Não foi possível abrir a prévia deste JPEG.'); }
    if (!photo.sha256) {
      try { this.catalog.rememberIdentity(id, digest(image.value)); }
      catch { return failure('catalog-error', 'Não foi possível registrar a identificação do original no catálogo.'); }
    }
    return { ok: true, value: { photo: summary(photo), dataUrl } };
  }
}
