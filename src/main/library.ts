import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { Catalog } from './catalog.ts';
import type { FailureCode, ImportOutcome, PhotoSummary, Preview, Result } from '../shared/contracts.ts';

const MAX_BYTES = 32 * 1024 * 1024;
export type PreviewDecoder = (bytes: Buffer) => Promise<string>;
const failure = (code: FailureCode, message: string): Result<never> => ({ ok: false, code, message });
const summary = ({ id, name }: PhotoSummary): PhotoSummary => ({ id, name });

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
  constructor(catalog: Catalog, decoder: PreviewDecoder) { this.catalog = catalog; this.decoder = decoder; }

  list(): PhotoSummary[] { return this.catalog.list().map(summary); }

  async importSelected(filename: string | null): Promise<Result<ImportOutcome>> {
    if (filename === null) return { ok: true, value: { canceled: true } };
    let canonical: string;
    try { canonical = await realpath(filename); }
    catch { return failure('unreadable', 'Não foi possível localizar o arquivo escolhido.'); }
    const image = await readJpeg(canonical);
    if (!image.ok) return image;
    try { await this.decoder(image.value); }
    catch { return failure('invalid-jpeg', 'Não foi possível decodificar este JPEG dentro dos limites desta versão.'); }
    try {
      return { ok: true, value: { canceled: false, photo: summary(this.catalog.add(canonical)) } };
    } catch { return failure('catalog-error', 'Não foi possível salvar a referência no catálogo.'); }
  }

  async preview(id: string): Promise<Result<Preview>> {
    const photo = this.catalog.find(id);
    if (!photo) return failure('not-found', 'Foto não encontrada no catálogo.');
    const image = await readJpeg(photo.path);
    if (!image.ok) return image;
    try {
      return { ok: true, value: { photo: summary(photo), dataUrl: await this.decoder(image.value) } };
    } catch { return failure('invalid-jpeg', 'Não foi possível abrir a prévia deste JPEG.'); }
  }
}
