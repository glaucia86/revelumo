import { jpegDimensions } from './jpeg-dimensions.ts';
// Preserve EXIF/ICC rather than re-encoding through nativeImage (which ignores
// EXIF orientation). The sandboxed editing Worker decodes these bytes.
export function jpegPreview(bytes: Buffer): ArrayBuffer {
  jpegDimensions(bytes);
  // Copy the authenticated view, never the pooled/read-ahead backing store.
  return Uint8Array.from(bytes).buffer;
}
