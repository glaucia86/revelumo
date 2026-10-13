export const MAX_PREVIEW_BYTES = 32 * 1024 * 1024;

/** Fixed, exclusively owned compressed input. No copy, decoding, or URL parsing. */
export function previewBytes(payload: unknown, maxBytes = MAX_PREVIEW_BYTES): Uint8Array<ArrayBuffer> {
  if (!(payload instanceof ArrayBuffer) || ('resizable' in payload && payload.resizable === true) || payload.byteLength < 4 || payload.byteLength > maxBytes) {
    throw new Error('Invalid preview byte payload');
  }
  const bytes = new Uint8Array(payload);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error('Invalid preview JPEG');
  return bytes;
}
