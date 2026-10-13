import type { MessageDescriptor } from '../shared/i18n/messages.ts';
import { open, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { Catalog } from './catalog.ts';
import { parseExportRecipe } from '../processing/jpeg-export-contract.ts';
import { parseRequest } from '../shared/requests.ts';
import type { PhotoClassification, PhotoFlag, PhotoRecipe, PhotoAdjustments, EditSession, ExposureGesture, LibraryFilters, LibraryResults } from '../shared/contracts.ts';
import type { BatchItem, BatchOutcome, ImportProgress, FailureCode, ImportOutcome, PhotoSummary, PhotoStatus, PhotoAvailability, Preview, PreviewResult, Result } from '../shared/contracts.ts';

const MAX_BYTES = 32 * 1024 * 1024;
export type PreviewDecoder = (bytes: Buffer) => Promise<string>;
const failure = (code: FailureCode, message: string, descriptor: MessageDescriptor): Result<never> => ({ ok: false, code, message, descriptor });
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
      if (!info.isFile()) return failure('unreadable', 'Escolha um arquivo JPEG.', { key: 'errors.chooseJpeg' });
      if (info.size > MAX_BYTES) return failure('too-large', 'Esta primeira versão aceita JPEGs de até 32 MiB.', { key: 'errors.tooLarge' });
      // Bound the allocation/read even if another process grows the file.
      const bytes = Buffer.alloc(info.size + 1);
      let count = 0;
      while (count < bytes.length) {
        const result = await handle.read(bytes, count, bytes.length - count, null);
        if (result.bytesRead === 0) break;
        count += result.bytesRead;
      }
      if (count !== info.size) return failure('unreadable', 'O arquivo mudou durante a leitura. Tente novamente.', { key: 'errors.changedDuringRead' });
      const content = bytes.subarray(0, count);
      if (count < 4 || content[0] !== 0xff || content[1] !== 0xd8 || content[2] !== 0xff) {
        return failure('invalid-jpeg', 'O arquivo não é um JPEG válido.', { key: 'errors.invalidJpeg' });
      }
      return { ok: true, value: content };
    } finally { await handle.close(); }
  } catch {
    return failure('unreadable', 'Não foi possível ler o original. Verifique sua localização e permissão.', { key: 'errors.unreadable' });
  }
}

export class Library {
  private catalog: Catalog;
  private decoder: PreviewDecoder;
  private thumbnailDecoder?: PreviewDecoder;
  private pending: Promise<void> = Promise.resolve();
  private editing: EditSession | null = null;
  private editingOperation: string | null = null;
  private editingGesture = { id: 0, complete: true };
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
        result.ok ? failure('unreadable', 'Seleção vazia.', { key: 'errors.emptySelection' }) : result });
      report(progress());
      await setImmediate();
    }
    return { canceled: false, stopped: items.length < filenames.length, items };
  }

  list(): PhotoSummary[] { return this.catalog.list().map(summary); }

  recipe(id: string): Result<PhotoRecipe> {
    if (!parseRequest({ op: 'recipe', id })) return failure('invalid-request', 'Solicitação inválida.', { key: 'errors.invalidRequest' });
    try {
      const photo = this.catalog.find(id);
      if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.', { key: 'errors.notFound' });
      return { ok: true, value: { photo: summary(photo), ...this.catalog.recipe(id) } };
    } catch { return failure('catalog-error', 'Não foi possível ler o ajuste salvo.', { key: 'errors.readRecipe' }); }
  }

  beginEditing(id: string): Promise<Result<EditSession>> {
    return this.serial(async () => {
      const recipe = this.recipe(id);
      if (!recipe.ok) return recipe;
      this.editing = { ...recipe.value, sessionId: randomUUID(), revision: 0, ...this.catalog.exposureHistory(id) };
      this.editingOperation = null; this.editingGesture = { id: 0, complete: true };
      return { ok: true, value: { ...this.editing } };
    });
  }

  captureExport(id: string, sessionId: string, revision: number): Promise<Result<{ sourcePath: string; sourceSha256: string | null; name: string; recipe: PhotoAdjustments & { processingVersion: 2 }; originalPaths: string[] }>> {
    return this.serial(async () => {
      if (!parseRequest({ op: 'end-edit', id, sessionId }) || !Number.isSafeInteger(revision) || revision < 0 ||
          this.editing?.photo.id !== id || this.editing.sessionId !== sessionId || this.editing.revision !== revision) {
        return failure('invalid-request', 'Export revision is no longer current.', { key: 'errors.obsoleteRevision' });
      }
      const photo = this.catalog.find(id);
      if (!photo) return failure('not-found', 'Photo not found.', { key: 'errors.notFound' });
      const recipe = parseExportRecipe(this.catalog.recipe(id));
      if (!recipe || recipe.exposureTenths !== this.editing.exposureTenths || recipe.temperature !== this.editing.temperature || recipe.tint !== this.editing.tint) {
        return failure('invalid-request', 'Export recipe differs from the confirmed session.', { key: 'errors.obsoleteRevision' });
      }
      return { ok: true, value: { sourcePath: photo.path, sourceSha256: photo.sha256, name: photo.name,
        recipe, originalPaths: this.catalog.list().map(photo => photo.path) } };
    });
  }

  endEditing(id: string, sessionId: string): Promise<Result<null>> {
    if (!parseRequest({ op: 'end-edit', id, sessionId })) return Promise.resolve(failure('invalid-request', 'Solicitação inválida.', { key: 'errors.invalidRequest' }));
    return this.serial(async () => {
      if (this.editing?.photo.id !== id || this.editing.sessionId !== sessionId) return failure('invalid-request', 'Sessão de edição encerrada.', { key: 'errors.sessionEnded' });
      this.editing = null;
      return { ok: true, value: null };
    });
  }

  saveExposure(id: string, sessionId: string, revision: number, exposureTenths: number, processingVersion: number, gestures?: ExposureGesture[]): Promise<Result<EditSession>> {
    if (!parseRequest({ op: 'exposure', id, sessionId, revision, exposureTenths, processingVersion, ...(gestures === undefined ? {} : { gestures }) })) return Promise.resolve(failure('invalid-request', 'Solicitação inválida.', { key: 'errors.invalidRequest' }));
    const edits = (gestures ?? [{ id: revision, exposureTenths, complete: true }]).map(gesture => ({ ...gesture }));
    return this.mutateExposure(id, sessionId, revision, JSON.stringify(['exposure', edits]), sha256 => {
      const exposure = this.catalog.saveAdjustmentCheckpoint(id, sha256, sessionId, edits);
      const last = edits.at(-1)!; this.editingGesture = { id: last.id, complete: last.complete };
      return exposure;
    }, () => edits[0].id > this.editingGesture.id || (edits[0].id === this.editingGesture.id && !this.editingGesture.complete));
  }

  saveAdjustments(id: string, sessionId: string, revision: number, adjustments: PhotoAdjustments, processingVersion: number, gestures: ExposureGesture[]): Promise<Result<EditSession>> {
    const request = parseRequest({ op: 'adjustments', id, sessionId, revision, adjustments, processingVersion, gestures });
    if (!request || request.op !== 'adjustments') return Promise.resolve(failure('invalid-request', 'Solicitação inválida.', { key: 'errors.invalidRequest' }));
    const edits = request.gestures.map(gesture => ({ ...gesture })), values = { ...request.adjustments };
    return this.mutateExposure(id, sessionId, revision, JSON.stringify(['adjustments', values, edits]), sha256 => {
      const exposure = this.catalog.saveAdjustmentCheckpoint(id, sha256, sessionId, edits, values);
      const last = edits.at(-1); if (last) this.editingGesture = { id: last.id, complete: last.complete };
      return exposure;
    }, () => edits.length ? edits[0].id > this.editingGesture.id || (edits[0].id === this.editingGesture.id && !this.editingGesture.complete) : values.exposureTenths === this.editing?.exposureTenths);
  }

  moveExposureHistory(id: string, sessionId: string, revision: number, direction: 'undo' | 'redo'): Promise<Result<EditSession>> {
    if (!parseRequest({ op: 'exposure-history', id, sessionId, revision, direction })) return Promise.resolve(failure('invalid-request', 'Solicitação inválida.', { key: 'errors.invalidRequest' }));
    return this.mutateExposure(id, sessionId, revision, JSON.stringify(['history', direction]), sha256 => {
      const exposure = this.catalog.moveExposureHistory(id, sha256, direction);
      this.editingGesture = { ...this.editingGesture, complete: true }; return exposure;
    });
  }

  private mutateExposure(id: string, sessionId: string, revision: number, operation: string, commit: (sha256: string) => number, valid: () => boolean = () => true): Promise<Result<EditSession>> {
    return this.serial(async () => {
      try {
        const photo = this.catalog.find(id);
        if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.', { key: 'errors.notFound' });
        const session = this.editing;
        if (!session || session.photo.id !== id || session.sessionId !== sessionId || revision < session.revision ||
            (revision === session.revision && operation !== this.editingOperation)) return failure('invalid-request', 'Revisão de edição obsoleta.', { key: 'errors.obsoleteRevision' });
        if (revision === session.revision) return { ok: true, value: { ...session } };
        if (!valid()) return failure('invalid-request', 'Gesto de edição obsoleto.', { key: 'errors.obsoleteGesture' });
        if (!photo.sha256) return failure('identity-unverified', 'Abra o original disponível para comprovar sua identidade antes de salvar.', { key: 'errors.verifyBeforeSave' });
        const image = await readJpeg(photo.path);
        if (!image.ok) return image;
        if (digest(image.value) !== photo.sha256) return failure('identity-mismatch', 'O arquivo difere do original catalogado. O ajuste salvo foi preservado.', { key: 'errors.adjustmentIdentity' });
        // The same protected queue covers session retirement, relocation and
        // identity read/commit; never admit an old revision after an await.
        if (this.editing !== session) return failure('invalid-request', 'Sessão de edição encerrada.', { key: 'errors.sessionEnded' });
        const exposureTenths = commit(photo.sha256);
        this.editing = { ...session, ...this.catalog.recipe(id), revision, exposureTenths, ...this.catalog.exposureHistory(id) };
        this.editingOperation = operation;
        return { ok: true, value: { ...this.editing } };
      } catch { return failure('catalog-error', 'Não foi possível salvar o ajuste. O último ajuste confirmado foi preservado. Tente novamente.', { key: 'errors.saveAdjustment' }); }
    });
  }

  query(filters: LibraryFilters): Result<LibraryResults> {
    if (!parseRequest({ ...filters, op: 'query' })) return failure('invalid-request', 'Solicitação inválida.', { key: 'errors.invalidRequest' });
    try { return { ok: true, value: this.catalog.query(filters) }; }
    catch { return failure('catalog-error', 'Não foi possível consultar a biblioteca. Tente novamente.', { key: 'errors.query' }); }
  }

  classification(id: string): Result<PhotoClassification> {
    if (!parseRequest({ op: 'classification', id })) return failure('invalid-request', 'Solicitação inválida.', { key: 'errors.invalidRequest' });
    try {
      const photo = this.catalog.find(id);
      if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.', { key: 'errors.notFound' });
      return { ok: true, value: { photo: summary(photo), rating: photo.rating, flag: photo.flag } };
    } catch { return failure('catalog-error', 'Não foi possível ler a classificação.', { key: 'errors.readClassification' }); }
  }

  classify(id: string, rating: number | null, flag: PhotoFlag): Result<PhotoClassification> {
    if (!parseRequest({ op: 'classify', id, rating, flag })) return failure('invalid-request', 'Solicitação inválida.', { key: 'errors.invalidRequest' });
    try {
      if (!this.catalog.find(id)) return failure('not-found', 'Foto não encontrada no catálogo.', { key: 'errors.notFound' });
      const photo = this.catalog.classify(id, rating, flag);
      return { ok: true, value: { photo: summary(photo), rating: photo.rating, flag: photo.flag } };
    } catch { return failure('catalog-error', 'Não foi possível salvar a classificação. O estado anterior foi preservado.', { key: 'errors.saveClassification' }); }
  }

  // Presence is a cheap snapshot, never proof of content identity. No JPEG
  // bytes are read, decoded or hashed, and legacy records are not enrolled.
  async availability(id: string): Promise<Result<PhotoAvailability>> {
    const photo = this.catalog.find(id);
    if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.', { key: 'errors.notFound' });
    let state: PhotoAvailability['state'];
    try {
      const handle = await open(photo.path, constants.O_RDONLY | constants.O_NONBLOCK);
      try { state = (await handle.stat()).isFile() ? 'present' : 'unreadable'; }
      finally { await handle.close(); }
    } catch (error) { state = ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '') ? 'missing' : 'unreadable'; }
    const message = state === 'present' ? 'Arquivo acessível. Conteúdo ainda não verificado.' : state === 'missing' ? 'Original ausente.' : 'Não foi possível acessar o original.';
    const descriptor: MessageDescriptor = { key: state === 'present' ? 'availability.present' : state === 'missing' ? 'availability.missing' : 'availability.unreadable' };
    return { ok: true, value: { photo: summary(photo), state, identityRecorded: photo.sha256 !== null, contentVerified: false, message, descriptor } };
  }

  status(id: string): Promise<Result<PhotoStatus>> {
    return this.serial(async () => {
      const photo = this.catalog.find(id);
      if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.', { key: 'errors.notFound' });
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
            catch { return failure('catalog-error', 'Não foi possível registrar a identificação do original no catálogo.', { key: 'errors.rememberIdentity' }); }
          }
        }
      }
      let message = state === 'available' ? 'Original disponível.' : state === 'missing' ? 'Original ausente. Localize o arquivo para continuar.' :
        state === 'changed' ? 'O arquivo neste caminho é diferente do original catalogado.' : 'Não foi possível ler o original. Verifique sua localização e permissão.';
      if (state !== 'available' && !photo.sha256) message += ' Este registro antigo não possui identificação comprovada. Importe o arquivo como uma nova foto; o registro anterior será preservado.';
      const descriptor: MessageDescriptor = { key: state === 'available' ? 'original.available' :
        state === 'missing' ? (photo.sha256 ? 'original.missing' : 'original.missingLegacy') :
        state === 'changed' ? 'original.changed' : (photo.sha256 ? 'original.unreadable' : 'original.unreadableLegacy') };
      return { ok: true, value: { photo: summary(photo), state, canRelocate: state !== 'available' && photo.sha256 !== null, message, descriptor } };
    });
  }


  importSelected(filename: string | null): Promise<Result<ImportOutcome>> {
    return this.serial(() => this.importOne(filename));
  }

  relocateSelected(id: string, filename: string | null, shouldStop: () => boolean = () => false): Promise<Result<ImportOutcome>> {
    return this.serial(async () => {
      if (shouldStop()) return { ok: true, value: { canceled: true } };
      const photo = this.catalog.find(id);
      if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.', { key: 'errors.notFound' });
      if (filename === null) return { ok: true, value: { canceled: true } };
      if (!photo.sha256) return failure('identity-unverified', 'Este registro antigo não possui identificação comprovada. Importe o arquivo como uma nova foto; o registro anterior será preservado.', { key: 'errors.legacyIdentity' });
      let canonical: string;
      try { canonical = await realpath(filename); }
      catch { return failure('unreadable', 'Não foi possível localizar o arquivo escolhido.', { key: 'errors.locateFile' }); }
      if (shouldStop()) return { ok: true, value: { canceled: true } };
      const image = await readJpeg(canonical);
      if (shouldStop()) return { ok: true, value: { canceled: true } };
      if (!image.ok) return image;
      if (digest(image.value) !== photo.sha256) return failure('identity-mismatch', 'O arquivo escolhido é diferente do original catalogado. Escolha exatamente o mesmo arquivo.', { key: 'errors.relocationIdentity' });
      const occupied = this.catalog.findByPath(canonical);
      if (occupied && occupied.id !== photo.id) return failure('path-conflict', 'Este arquivo já pertence a outra foto do catálogo. Nenhum registro foi alterado.', { key: 'errors.pathConflict' });
      try { return { ok: true, value: { canceled: false, photo: summary(this.catalog.relocate(id, canonical, photo.sha256)) } }; }
      catch { return failure('catalog-error', 'Não foi possível salvar a nova localização. O registro anterior foi preservado.', { key: 'errors.saveRelocation' }); }
    });
  }

  private async importOne(filename: string | null, shouldStop: () => boolean = () => false): Promise<Result<ImportOutcome>> {
    if (filename === null || shouldStop()) return { ok: true, value: { canceled: true } };
    let canonical: string;
    try { canonical = await realpath(filename); }
    catch { return failure('unreadable', 'Não foi possível localizar o arquivo escolhido.', { key: 'errors.locateFile' }); }
    const image = await readJpeg(canonical);
    if (!image.ok) return image;
    const sha256 = digest(image.value);
    const existing = this.catalog.findByPath(canonical);
    if (identityDiffers(existing?.sha256, sha256)) return failure('identity-mismatch', 'O arquivo é diferente do original catalogado. O registro anterior foi preservado.', { key: 'errors.importIdentity' });
    if (shouldStop()) return { ok: true, value: { canceled: true } };
    let thumbnail: string | undefined;
    try { if (this.thumbnailDecoder) thumbnail = await this.thumbnailDecoder(image.value); else await this.decoder(image.value); }
    catch { return failure('invalid-jpeg', 'Não foi possível decodificar este JPEG dentro dos limites desta versão.', { key: 'errors.decodeJpeg' }); }
    if (shouldStop()) return { ok: true, value: { canceled: true } };
    try {
      return { ok: true, value: { canceled: false, photo: summary(this.catalog.add(canonical, thumbnail, sha256)) } };
    } catch { return failure('catalog-error', 'Não foi possível salvar a referência no catálogo.', { key: 'errors.saveReference' }); }
  }

  thumbnail(id: string): Promise<Result<Preview>> {
    return this.serial(async () => {
      const photo = this.catalog.find(id);
      if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.', { key: 'errors.notFound' });
      const cached = this.catalog.thumbnail(id);
      if (cached) return { ok: true, value: { photo: summary(photo), dataUrl: cached } };
      if (!this.thumbnailDecoder) return failure('not-found', 'Miniatura indisponível.', { key: 'catalog.thumbnailUnavailable' });
      const image = await readJpeg(photo.path);
      if (!image.ok) return image;
      if (identityDiffers(photo.sha256, digest(image.value))) return failure('identity-mismatch', 'O arquivo neste caminho é diferente do original catalogado. A miniatura anterior não foi substituída.', { key: 'errors.thumbnailIdentity' });
      let dataUrl: string;
      try { dataUrl = await this.thumbnailDecoder(image.value); }
      catch { return failure('invalid-jpeg', 'Não foi possível criar a miniatura.', { key: 'errors.createThumbnail' }); }
      try { this.catalog.add(photo.path, dataUrl, digest(image.value)); }
      catch { return failure('catalog-error', 'Não foi possível salvar a miniatura.', { key: 'errors.saveThumbnail' }); }
      return { ok: true, value: { photo: summary(photo), dataUrl } };
    });
  }

  preview(id: string, isCurrent: () => boolean = () => true): Promise<PreviewResult> {
    // Check after acquiring the protected queue, before any lookup/read/hash/decode.
    // Once started, preserve the entire authentication/identity/error pipeline.
    return this.serial<PreviewResult>(() => isCurrent() ? this.openPreview(id) : Promise.resolve({ ok: false, canceled: true } as const));
  }

  private async openPreview(id: string): Promise<Result<Preview>> {
    const photo = this.catalog.find(id);
    if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.', { key: 'errors.notFound' });
    const image = await readJpeg(photo.path);
    if (!image.ok) return image;
    if (identityDiffers(photo.sha256, digest(image.value))) return failure('identity-mismatch', 'O arquivo neste caminho é diferente do original catalogado. Localize o original para continuar.', { key: 'errors.previewIdentity' });
    let dataUrl: string;
    try {
      dataUrl = await this.decoder(image.value);
    } catch { return failure('invalid-jpeg', 'Não foi possível abrir a prévia deste JPEG.', { key: 'errors.openPreview' }); }
    if (!photo.sha256) {
      try { this.catalog.rememberIdentity(id, digest(image.value)); }
      catch { return failure('catalog-error', 'Não foi possível registrar a identificação do original no catálogo.', { key: 'errors.rememberIdentity' }); }
    }
    return { ok: true, value: { photo: summary(photo), dataUrl } };
  }
}
