import { jpegDimensions } from './jpeg-dimensions.ts';

// Only the orientation tag is copied. Arbitrary EXIF, embedded previews and GPS
// are not needed in a small derived image. Bounds are checked before every read.
export function jpegOrientation(bytes: Buffer): number {
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8) return 1;
  let offset = 2;
  while (offset < bytes.length && bytes[offset++] === 0xff) {
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    const end = offset + length;
    if (length < 2 || end > bytes.length) break;
    if (marker === 0xe1 && length >= 16 && bytes.subarray(offset + 2, offset + 8).equals(Buffer.from('Exif\0\0'))) {
      const tiff = bytes.subarray(offset + 8, end);
      const little = tiff.toString('ascii', 0, 2) === 'II';
      if (!little && tiff.toString('ascii', 0, 2) !== 'MM') return 1;
      const short = (at: number) => little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at);
      const long = (at: number) => little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at);
      if (short(2) !== 42) return 1;
      const ifd = long(4);
      if (ifd + 2 > tiff.length) return 1;
      const count = short(ifd);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > tiff.length) return 1;
        if (short(entry) === 0x112 && short(entry + 2) === 3 && long(entry + 4) === 1) {
          const value = short(entry + 8);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
    }
    offset = end;
  }
  return 1;
}

export function jpegThumbnail(bytes: Buffer, resize: (bytes: Buffer, width: number, height: number) => Buffer): string {
  const { width, height } = jpegDimensions(bytes);
  const scale = Math.min(1, 256 / Math.max(width, height));
  const encoded = resize(bytes, Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  if (encoded.length > 256 * 1024) throw new Error('Thumbnail exceeds byte budget');
  if (encoded.length < 4 || encoded.readUInt16BE(0) !== 0xffd8) throw new Error('Invalid thumbnail JPEG');
  const orientation = Buffer.from('ffe100224578696600004d4d002a00000008000101120003000000010001000000000000', 'hex');
  orientation.writeUInt16BE(jpegOrientation(bytes), 28);
  return 'data:image/jpeg;base64,' + Buffer.concat([encoded.subarray(0, 2), orientation, encoded.subarray(2)]).toString('base64');
}
