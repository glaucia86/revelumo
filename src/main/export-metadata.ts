import { ExportFileError } from './export-file.ts';
import { rebuildXmpCredits, XMP_HEADER } from './xmp-credits.ts';
import { rebuildIptcCredits } from './iptc-credits.ts';

const EXIF = Buffer.from('Exif\0\0');
const CREDIT_TAGS = new Set([0x013b, 0x8298, 0x9c9d]);

export class MetadataPreservationError extends Error {
  readonly code = 'METADATA_NOT_PRESERVABLE';
  constructor(detail: string) {
    super(`Credits cannot be safely preserved: ${detail}. The export was not created.`);
    this.name = 'MetadataPreservationError';
  }
}

interface Segment { marker: number; start: number; end: number; payload: Buffer }
function segments(jpeg: Buffer): Segment[] {
  if (jpeg.length < 4 || jpeg.readUInt16BE(0) !== 0xffd8) throw new MetadataPreservationError('invalid JPEG');
  const result: Segment[] = [];
  let offset = 2;
  let inScan = false;
  while (offset < jpeg.length) {
    if (inScan) {
      offset = jpeg.indexOf(0xff, offset);
      if (offset < 0) break;
    }
    const start = offset;
    if (jpeg[offset++] !== 0xff) throw new MetadataPreservationError('invalid JPEG marker');
    while (jpeg[offset] === 0xff) offset++;
    const marker = jpeg[offset++];
    if (inScan && (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    if (marker === 0xd9) {
      if (offset !== jpeg.length) throw new MetadataPreservationError('trailing metadata is unsupported');
      return result;
    }
    if (marker === 0x01) continue;
    if (marker === undefined || marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      throw new MetadataPreservationError('invalid JPEG marker');
    }
    if (offset + 2 > jpeg.length) throw new MetadataPreservationError('truncated JPEG segment');
    const length = jpeg.readUInt16BE(offset);
    if (length < 2 || offset + length > jpeg.length) throw new MetadataPreservationError('invalid JPEG segment length');
    if (result.length >= 4096) throw new MetadataPreservationError('JPEG container complexity exceeds the supported limit');
    result.push({ marker, start, end: offset + length, payload: jpeg.subarray(offset + 2, offset + length) });
    offset += length;
    inScan = marker === 0xda;
  }
  throw new MetadataPreservationError('missing JPEG end marker');
}

function readCredits(payload: Buffer): Map<number, Buffer> {
  const tiff = payload.subarray(EXIF.length);
  const requireBytes = (at: number, count: number) => {
    if (at < 0 || at + count > tiff.length) throw new MetadataPreservationError('truncated EXIF');
  };
  requireBytes(0, 8);
  const little = tiff.subarray(0, 2).equals(Buffer.from('II'));
  if (!little && !tiff.subarray(0, 2).equals(Buffer.from('MM'))) throw new MetadataPreservationError('unknown EXIF byte order');
  const short = (at: number) => { requireBytes(at, 2); return little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at); };
  const long = (at: number) => { requireBytes(at, 4); return little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at); };
  if (short(2) !== 42) throw new MetadataPreservationError('unknown EXIF format');
  const inspected = new Set<number>();
  const inspectDirectory = (at: number, depth = 0) => {
    if (at < 8 || depth > 4 || inspected.has(at)) throw new MetadataPreservationError('invalid nested EXIF directory');
    inspected.add(at);
    const entries = short(at);
    requireBytes(at + 2, entries * 12 + 4);
    for (let index = 0; index < entries; index++) {
      const entry = at + 2 + index * 12;
      const tag = short(entry);
      if (CREDIT_TAGS.has(tag) || [0xa437, 0xa438, 0x02bc, 0x83bb, 0x8649, 0x014a].includes(tag)) {
        throw new MetadataPreservationError('nested or alternate EXIF credits need a supported adapter');
      }
      if ([0x8769, 0xa005].includes(tag)) {
        if (short(entry + 2) !== 4 || long(entry + 4) !== 1) throw new MetadataPreservationError('invalid nested EXIF pointer');
        inspectDirectory(long(entry + 8), depth + 1);
      }
    }
    const next = long(at + 2 + entries * 12);
    if (next !== 0) inspectDirectory(next, depth + 1);
  };
  const offset = long(4);
  const count = short(offset);
  requireBytes(offset + 2, count * 12 + 4);
  if (long(offset + 2 + count * 12) !== 0) throw new MetadataPreservationError('additional EXIF directories need a supported adapter');
  const credits = new Map<number, Buffer>();
  for (let index = 0; index < count; index++) {
    const entry = offset + 2 + index * 12;
    const tag = short(entry);
    if (tag === 0x8769) {
      if (short(entry + 2) !== 4 || long(entry + 4) !== 1) throw new MetadataPreservationError('invalid ExifIFD pointer');
      inspectDirectory(long(entry + 8));
    }
    if ([0x02bc, 0x83bb, 0x8649, 0x014a, 0xa437, 0xa438].includes(tag)) {
      throw new MetadataPreservationError('nested XMP/IPTC/Photoshop credits need a supported adapter');
    }
    if (!CREDIT_TAGS.has(tag)) continue;
    if (credits.has(tag)) throw new MetadataPreservationError('duplicate EXIF credit fields are ambiguous');
    const size = long(entry + 4);
    if (short(entry + 2) !== (tag === 0x9c9d ? 1 : 2) || size === 0) throw new MetadataPreservationError('unsupported EXIF credit type');
    const at = size <= 4 ? entry + 8 : long(entry + 8);
    requireBytes(at, size);
    const value = tiff.subarray(at, at + size);
    if (tag === 0x9c9d) {
      if (value.length < 2 || value.length % 2 !== 0 || value.readUInt16LE(value.length - 2) !== 0) throw new MetadataPreservationError('malformed XPAuthor');
      try { new TextDecoder('utf-16le', { fatal: true }).decode(value); }
      catch { throw new MetadataPreservationError('invalid UTF-16LE XPAuthor'); }
    } else if (value[value.length - 1] !== 0 || value.some(byte => byte > 0x7f || (byte < 0x20 && byte !== 0))) {
      throw new MetadataPreservationError('non-ASCII or malformed EXIF credits need a supported encoding adapter');
    }
    credits.set(tag, Buffer.from(value));
  }
  return credits;
}

function buildExif(credits: Map<number, Buffer>): Buffer {
  const entries = [...credits].sort(([a], [b]) => a - b);
  const tableEnd = 8 + 2 + entries.length * 12 + 4;
  const tiffLength = tableEnd + entries.reduce((size, [, value]) => size + (value.length > 4 ? value.length + value.length % 2 : 0), 0);
  if (2 + EXIF.length + tiffLength > 0xffff) throw new MetadataPreservationError('rebuilt EXIF exceeds a JPEG segment');
  const tiff = Buffer.alloc(tiffLength);
  tiff.write('MM', 0, 'ascii');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(entries.length, 8);
  let data = tableEnd;
  entries.forEach(([tag, value], index) => {
    const entry = 10 + index * 12;
    tiff.writeUInt16BE(tag, entry);
    tiff.writeUInt16BE(tag === 0x9c9d ? 1 : 2, entry + 2);
    tiff.writeUInt32BE(value.length, entry + 4);
    if (value.length <= 4) value.copy(tiff, entry + 8);
    else {
      tiff.writeUInt32BE(data, entry + 8);
      value.copy(tiff, data);
      data += value.length + value.length % 2;
    }
  });
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1);
  header.writeUInt16BE(2 + EXIF.length + tiff.length, 2);
  return Buffer.concat([header, EXIF, tiff]);
}

function isTechnicalSegment(segment: Segment): boolean {
  if (segment.marker === 0xe0) return segment.payload.subarray(0, 5).equals(Buffer.from('JFIF\0'));
  if (segment.marker === 0xe2) return segment.payload.subarray(0, 12).equals(Buffer.from('ICC_PROFILE\0'));
  if (segment.marker === 0xee) return segment.payload.length === 12 && segment.payload.subarray(0, 5).equals(Buffer.from('Adobe'));
  return segment.marker < 0xe0 || segment.marker > 0xef ? segment.marker !== 0xfe : false;
}

export function preserveExportCredits(original: Buffer, encoded: Buffer, maximumBytes: number): Buffer {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new ExportFileError('INVALID_OUTPUT', 'Metadata assembly requires an explicit positive integer byte budget.');
  }
  if (original.length > 32 * 1024 * 1024) throw new MetadataPreservationError('original exceeds the supported input byte budget');
  if (encoded.length > maximumBytes) throw new ExportFileError('OUTPUT_TOO_LARGE', 'Encoded JPEG exceeds the export byte budget.');
  const encodedSegments = segments(encoded);
  for (const segment of encodedSegments) {
    if (!isTechnicalSegment(segment)) throw new MetadataPreservationError('the encoded JPEG contains unexpected metadata');
  }
  const credits = new Map<number, Buffer>();
  let exifSeen = false;
  let xmpSeen = false;
  let xmpCredits: Buffer | null = null;
  let iptcSeen = false;
  let iptcCredits: Buffer | null = null;
  for (const segment of segments(original)) {
    if (segment.marker === 0xed) {
      if (iptcSeen) throw new MetadataPreservationError('multiple IPTC packets have ambiguous credit provenance');
      iptcSeen = true;
      try { iptcCredits = rebuildIptcCredits(segment.payload); }
      catch (error) { throw new MetadataPreservationError(error instanceof Error ? error.message : 'unsupported IPTC'); }
      continue;
    }
    if (segment.marker === 0xe1 && segment.payload.subarray(0, XMP_HEADER.length).equals(XMP_HEADER)) {
      if (xmpSeen) throw new MetadataPreservationError('multiple XMP packets have ambiguous credit provenance');
      xmpSeen = true;
      try { xmpCredits = rebuildXmpCredits(segment.payload); }
      catch (error) { throw new MetadataPreservationError(error instanceof Error ? error.message : 'unsupported XMP'); }
      continue;
    }
    if (!(segment.marker === 0xe1 && segment.payload.subarray(0, EXIF.length).equals(EXIF)) && !isTechnicalSegment(segment)) {
      throw new MetadataPreservationError('XMP/IPTC or another metadata container needs a supported credit-preservation adapter');
    }
    if (segment.marker === 0xe1 && segment.payload.subarray(0, EXIF.length).equals(EXIF)) {
      if (exifSeen) throw new MetadataPreservationError('multiple EXIF blocks have ambiguous credit provenance');
      exifSeen = true;
      for (const [tag, value] of readCredits(segment.payload)) credits.set(tag, value);
    }
  }
  const metadata = Buffer.concat([...(credits.size ? [buildExif(credits)] : []), ...(xmpCredits ? [xmpCredits] : []), ...(iptcCredits ? [iptcCredits] : [])]);
  if (metadata.length === 0) return Buffer.from(encoded);
  if (encoded.length + metadata.length > maximumBytes) {
    throw new ExportFileError('OUTPUT_TOO_LARGE', 'JPEG plus preserved credits exceeds the export byte budget. Quality and dimensions were not reduced.');
  }
  const insertion = encodedSegments[0]?.marker === 0xe0 ? encodedSegments[0].end : 2;
  return Buffer.concat([encoded.subarray(0, insertion), metadata, encoded.subarray(insertion)]);
}
