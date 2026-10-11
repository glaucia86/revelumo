import { jpegDimensions } from './jpeg-dimensions.ts';
// Preserve EXIF/ICC rather than re-encoding through nativeImage (which ignores
// EXIF orientation). The sandboxed Chromium image element displays these bytes.
export function jpegPreview(bytes: Buffer, validate: (bytes: Buffer) => void): string {
  jpegDimensions(bytes);
  validate(bytes);
  return 'data:image/jpeg;base64,' + bytes.toString('base64');
}
