import * as fs from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { parseExportRecipe } from '../processing/jpeg-export-contract.ts';
import { readVerifiedExportSource } from './export-source.ts';
import { preserveExportCredits } from './export-metadata.ts';
import { publishNewExport } from './export-file.ts';
import type { JpegEngineRequest } from './jpeg-export-engine.ts';
import { validateExportOutput, type ExportOutput } from './jpeg-export-response.ts';
import { jpegDimensions } from './jpeg-dimensions.ts';
export type JpegCodec = (request: JpegEngineRequest, signal?: AbortSignal) => Promise<ExportOutput>;
export interface JpegExportRequest {
  sourcePath: string; sourceSha256: string | null; recipe: unknown; destination: string;
  originalPaths: readonly string[]; protectedDirectories: readonly string[]; maximumOutputBytes: number;
}
export class JpegExportError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'JpegExportError'; this.code = code; }
}
export function createJpegExporter(encode: JpegCodec, filesystem: typeof fs = fs) {
  let active = false;
  return { async exportJpeg(request: JpegExportRequest, signal?: AbortSignal) {
    if (signal?.aborted) throw new JpegExportError('CANCELED');
    if (active) throw new JpegExportError('BUSY');
    const recipe = parseExportRecipe(request.recipe);
    if (!recipe) throw new JpegExportError('UNSUPPORTED_RECIPE');
    const validPath = (path: unknown) => typeof path === 'string' && isAbsolute(path) && !path.includes('\0');
    if (!validPath(request.sourcePath) || !validPath(request.destination)
      || !Array.isArray(request.originalPaths) || !request.originalPaths.every(validPath)
      || !Array.isArray(request.protectedDirectories) || !request.protectedDirectories.every(validPath)) throw new JpegExportError('INVALID_REQUEST');
    if (!Number.isSafeInteger(request.maximumOutputBytes) || request.maximumOutputBytes <= 0) throw new JpegExportError('INVALID_BUDGET');
    request = { ...request, recipe, originalPaths: [...request.originalPaths], protectedDirectories: [...request.protectedDirectories] };
    active = true;
    try {
      let source: Buffer | undefined = await readVerifiedExportSource({ path: request.sourcePath, sha256: request.sourceSha256, maximumBytes: 32 * 1024 * 1024, signal }, filesystem);
      let dimensions: { width: number; height: number };
      try { dimensions = jpegDimensions(source); } catch { throw new JpegExportError('INVALID_SOURCE'); }
      if (signal?.aborted) throw new JpegExportError('CANCELED');
      let encoded: ExportOutput | undefined = await encode({ source, recipe, maximumOutputBytes: request.maximumOutputBytes }, signal);
      if (signal?.aborted) throw new JpegExportError('CANCELED');
      if (!validateExportOutput({ ...encoded, jobId: 'circuit' }, 'circuit', dimensions, request.maximumOutputBytes)) throw new JpegExportError('INVALID_OUTPUT');
      let bytes: Buffer | undefined = preserveExportCredits(source, Buffer.from(encoded.bytes.buffer, encoded.bytes.byteOffset, encoded.bytes.byteLength), request.maximumOutputBytes);
      const { width, height } = encoded;
      const bytesWritten = bytes.length;
      source = undefined; encoded = undefined;
      // The reviewed writer synchronously owns its private copy before yielding.
      const writing = publishNewExport({ bytes, destination: request.destination, originalPaths: [request.sourcePath, ...request.originalPaths], protectedDirectories: request.protectedDirectories, maximumBytes: request.maximumOutputBytes, signal }, filesystem);
      bytes = undefined;
      const published = await writing;
      return { ...published, width, height, bytesWritten };
    } finally { active = false; }
  } };
}
