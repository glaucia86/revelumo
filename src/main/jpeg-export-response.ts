import { jpegDimensions } from './jpeg-dimensions.ts';
export type ExportOutput = { bytes: Uint8Array; width: number; height: number };
export function validateExportOutput(input: unknown, jobId: string, dimensions: { width: number; height: number }, maximumBytes: number): ExportOutput | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !== 'bytes,height,jobId,width' || value.jobId !== jobId
    || !(value.bytes instanceof Uint8Array) || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height)) return null;
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0 || !(value.bytes.buffer instanceof ArrayBuffer)
    || value.bytes.byteLength > maximumBytes || value.bytes.buffer.byteLength > maximumBytes) return null;
  const bytes = value.bytes;
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) return null;
  try {
    const frame = jpegDimensions(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    if (frame.width !== value.width || frame.height !== value.height
      || !((frame.width === dimensions.width && frame.height === dimensions.height)
        || (frame.width === dimensions.height && frame.height === dimensions.width))) return null;
  } catch { return null; }
  return input as ExportOutput;
}
