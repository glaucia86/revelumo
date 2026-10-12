import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
export interface ExportSourceRequest {
  path: string;
  sha256: string | null;
  maximumBytes: number;
  signal?: AbortSignal;
}
export type ExportSourceErrorCode = 'CANCELED' | 'IDENTITY_UNVERIFIED' | 'INVALID_BUDGET' | 'SOURCE_TOO_LARGE'
  | 'NOT_REGULAR_FILE' | 'SOURCE_CHANGED' | 'IDENTITY_MISMATCH' | 'SOURCE_UNREADABLE';

export class ExportSourceError extends Error {
  readonly code: ExportSourceErrorCode;
  constructor(code: ExportSourceErrorCode, message: string, cause?: unknown) {
    super(message, { cause }); this.name = 'ExportSourceError'; this.code = code;
  }
}
/** Main-only content snapshot. The caller must process these returned bytes,
 * never reopen the pathname after authentication. No JPEG decoding occurs here.
 */
export async function readVerifiedExportSource(request: ExportSourceRequest, filesystem: { open: typeof open } = { open }): Promise<Buffer> {
  request = { ...request };
  if (request.signal?.aborted) throw new ExportSourceError('CANCELED', 'Export source preparation canceled.');
  if (typeof request.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(request.sha256)) {
    throw new ExportSourceError('IDENTITY_UNVERIFIED', 'Export requires an already recorded canonical SHA-256.');
  }
  if (!Number.isSafeInteger(request.maximumBytes) || request.maximumBytes <= 0) {
    throw new ExportSourceError('INVALID_BUDGET', 'Export requires an explicit positive integer source byte budget.');
  }
  try {
    const handle = await filesystem.open(request.path, constants.O_RDONLY | constants.O_NONBLOCK);
    let bytes: Buffer;
    try {
      if (request.signal?.aborted) throw new ExportSourceError('CANCELED', 'Export source preparation canceled.');
      const info = await handle.stat();
      if (request.signal?.aborted) throw new ExportSourceError('CANCELED', 'Export source preparation canceled.');
      if (!info.isFile()) throw new ExportSourceError('NOT_REGULAR_FILE', 'Export source must be a regular file.');
      if (info.size > request.maximumBytes) throw new ExportSourceError('SOURCE_TOO_LARGE', 'Source exceeds the export byte budget.');
      bytes = Buffer.alloc(info.size + 1);
      let count = 0;
      while (count < bytes.length) {
        if (request.signal?.aborted) throw new ExportSourceError('CANCELED', 'Export source preparation canceled.');
        const result = await handle.read(bytes, count, Math.min(64 * 1024, bytes.length - count), null);
        if (!result.bytesRead) break;
        count += result.bytesRead;
      }
      if (count !== info.size) throw new ExportSourceError('SOURCE_CHANGED', 'The source size changed during preparation.');
      bytes = bytes.subarray(0, count);
    } finally { await handle.close(); }
    if (request.signal?.aborted) throw new ExportSourceError('CANCELED', 'Export source preparation canceled.');
    if (createHash('sha256').update(bytes).digest('hex') !== request.sha256) {
      throw new ExportSourceError('IDENTITY_MISMATCH', 'The source differs from the recorded original.');
    }
    return bytes;
  } catch (error) {
    if (error instanceof ExportSourceError) throw error;
    throw new ExportSourceError('SOURCE_UNREADABLE', 'The original could not be read completely.', error);
  }
}
