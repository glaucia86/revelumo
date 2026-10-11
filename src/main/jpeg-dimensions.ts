// Safety preflight only: the Electron decoder still determines validity.
export function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Invalid JPEG');
  let cursor = 2;
  while (cursor < bytes.length) {
    if (bytes[cursor++] !== 0xff) throw new Error('Invalid JPEG marker');
    while (bytes[cursor] === 0xff) cursor++;
    const marker = bytes[cursor++];
    if (marker === undefined || marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(cursor);
    if (length < 2 || cursor + length > bytes.length) throw new Error('Truncated JPEG segment');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) throw new Error('Invalid JPEG frame');
      const height = bytes.readUInt16BE(cursor + 3);
      const width = bytes.readUInt16BE(cursor + 5);
      if (!width || !height || width * height > 40_000_000) throw new Error('JPEG exceeds 40 megapixels');
      return { width, height };
    }
    cursor += length;
  }
  throw new Error('Unsupported or malformed JPEG frame');
}
