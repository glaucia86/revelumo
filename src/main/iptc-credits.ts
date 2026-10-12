const PHOTOSHOP = Buffer.from('Photoshop 3.0\0');
const UTF8 = Buffer.from([0x1b, 0x25, 0x47]);
const CREDIT_TAGS = new Set([80, 110, 116]);

function dataset(record: number, tag: number, value: Buffer): Buffer {
  const header = Buffer.from([0x1c, record, tag, 0, 0]);
  header.writeUInt16BE(value.length, 3);
  return Buffer.concat([header, value]);
}

// Bounded subset: Photoshop APP13 with one IPTC-IIM resource. Unknown resource
// containers and unspecified legacy encodings fail closed rather than lose credits.
export function rebuildIptcCredits(payload: Buffer): Buffer | null {
  if (!payload.subarray(0, PHOTOSHOP.length).equals(PHOTOSHOP)) throw new Error('Unsupported IPTC container');
  let offset = PHOTOSHOP.length;
  let iim: Buffer | undefined;
  while (offset < payload.length) {
    if (offset + 8 > payload.length || !payload.subarray(offset, offset + 4).equals(Buffer.from('8BIM'))) throw new Error('Malformed Photoshop resource');
    const resource = payload.readUInt16BE(offset + 4);
    const nameLength = 1 + payload[offset + 6];
    const lengthOffset = offset + 6 + nameLength + nameLength % 2;
    if (lengthOffset + 4 > payload.length) throw new Error('Truncated Photoshop resource');
    const size = payload.readUInt32BE(lengthOffset);
    const start = lengthOffset + 4;
    const end = start + size;
    if (end + size % 2 > payload.length) throw new Error('Truncated IPTC resource');
    if (resource !== 0x0404 || iim) throw new Error('Additional Photoshop resources need a supported preservation adapter');
    iim = payload.subarray(start, end);
    offset = end + size % 2;
  }
  if (!iim) throw new Error('Missing IPTC resource');
  const credits: Array<{ tag: number; value: Buffer }> = [];
  let charset: Buffer | undefined;
  for (offset = 0; offset < iim.length;) {
    if (offset + 5 > iim.length || iim[offset] !== 0x1c) throw new Error('Malformed IPTC dataset');
    const record = iim[offset + 1];
    const tag = iim[offset + 2];
    const size = iim.readUInt16BE(offset + 3);
    if (size & 0x8000) throw new Error('Extended IPTC lengths need a supported adapter');
    if (offset + 5 + size > iim.length) throw new Error('Truncated IPTC dataset');
    const value = iim.subarray(offset + 5, offset + 5 + size);
    if (record === 1 && tag === 90) {
      if (charset) throw new Error('Duplicate IPTC character sets are ambiguous');
      charset = value;
    }
    if (record === 2 && CREDIT_TAGS.has(tag)) {
      if (tag !== 80 && credits.some(credit => credit.tag === tag)) throw new Error('Duplicate IPTC copyright or credit fields are ambiguous');
      credits.push({ tag, value });
    }
    offset += 5 + size;
  }
  if (charset && !charset.equals(UTF8)) throw new Error('Unsupported IPTC character encoding');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (const { value } of credits) {
    if (!charset && value.some(byte => byte > 0x7f)) throw new Error('IPTC credits use an unspecified legacy encoding');
    const text = decoder.decode(value);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) throw new Error('Invalid control characters in IPTC credits');
  }
  if (credits.length === 0) return null;
  const rewritten = Buffer.concat([dataset(1, 90, UTF8), ...credits.map(({ tag, value }) => dataset(2, tag, value))]);
  const resource = Buffer.alloc(12);
  resource.write('8BIM'); resource.writeUInt16BE(0x0404, 4); resource.writeUInt32BE(rewritten.length, 8);
  const content = Buffer.concat([PHOTOSHOP, resource, rewritten, Buffer.alloc(rewritten.length % 2)]);
  if (content.length + 2 > 0xffff) throw new Error('Rebuilt IPTC exceeds a JPEG segment');
  const header = Buffer.from([0xff, 0xed, 0, 0]); header.writeUInt16BE(content.length + 2, 2);
  return Buffer.concat([header, content]);
}
