import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { preserveExportCredits } from '../src/main/export-metadata.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/export/${name}.jpg`, import.meta.url));
const original = fixture('ascii-credits-gps');
const encoded = fixture('encoded');

test('rebuilds EXIF artist and copyright without copying GPS, orientation or the original EXIF block', () => {
  const result = preserveExportCredits(original, encoded, 1024 * 1024);
  assert.ok(result.includes(Buffer.from('Ana Silva\0')));
  assert.ok(result.includes(Buffer.from('(c) 2026 Ana Silva\0')));
  assert.equal(result.includes(Buffer.from('Synthetic Camera')), false);
  assert.notDeepEqual(result, original);
  assert.deepEqual(original, fixture('ascii-credits-gps'));
});

function segment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}
function addMetadata(jpeg: Buffer, marker: number, payload: Buffer): Buffer {
  return Buffer.concat([jpeg.subarray(0, 2), segment(marker, payload), jpeg.subarray(2)]);
}

for (const [label, marker, payload] of [
  ['extended XMP', 0xe1, 'http://ns.adobe.com/xmp/extension/\0extended packet'],
  ['IPTC', 0xed, 'Photoshop 3.0\0author and copyright metadata'],
] as const) {
  test(`blocks unsupported ${label} instead of silently losing credits or copying GPS`, () => {
    const source = addMetadata(original, marker, Buffer.from(payload));
    assert.throws(() => preserveExportCredits(source, encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
  });
}

test('blocks non-ASCII EXIF credits including Portuguese names rather than corrupting them', () => {
  const source = Buffer.from(original);
  source[source.indexOf(Buffer.from('Ana Silva')) + 2] = 0xe3;
  assert.throws(() => preserveExportCredits(source, encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
});

test('checks the output budget after adding preserved credits', () => {
  assert.throws(() => preserveExportCredits(original, encoded, encoded.length), { code: 'OUTPUT_TOO_LARGE' });
});

test('refuses encoder bytes carrying old EXIF or GPS instead of appending conflicting metadata', () => {
  assert.throws(() => preserveExportCredits(original, original, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
});

test('does not silently discard credits hidden in another metadata container or comment', () => {
  for (const marker of [0xe3, 0xeb, 0xfe]) {
    const source = addMetadata(original, marker, Buffer.from('Copyright Ana Silva'));
    assert.throws(() => preserveExportCredits(source, encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
  }
});

test('finds XMP after the JPEG scan instead of treating the scan as the end of metadata', () => {
  const source = Buffer.concat([original.subarray(0, -2), segment(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0Copyright João')), original.subarray(-2)]);
  assert.throws(() => preserveExportCredits(source, encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
});

test('blocks duplicate EXIF blocks whose competing credit provenance is ambiguous', () => {
  const start = original.indexOf(Buffer.from('Exif\0\0'));
  const length = original.readUInt16BE(start - 2);
  const duplicated = addMetadata(original, 0xe1, original.subarray(start, start + length - 2));
  assert.throws(() => preserveExportCredits(duplicated, encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
});

function replaceMakeTag(source: Buffer, tag: number): Buffer {
  const result = Buffer.from(source);
  const tiff = result.indexOf(Buffer.from('Exif\0\0')) + 6;
  const ifd = tiff + result.readUInt32BE(tiff + 4);
  for (let i = 0; i < result.readUInt16BE(ifd); i++) {
    const entry = ifd + 2 + i * 12;
    if (result.readUInt16BE(entry) === 0x010f) { result.writeUInt16BE(tag, entry); return result; }
  }
  throw new Error('Synthetic fixture missing Make');
}

test('blocks unsupported alternate credit containers nested in EXIF', () => {
  for (const tag of [0x02bc, 0x83bb, 0x8649, 0x9c9d]) {
    assert.throws(() => preserveExportCredits(replaceMakeTag(original, tag), encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
  }
});

test('does not silently choose the last duplicate Artist entry', () => {
  assert.throws(() => preserveExportCredits(replaceMakeTag(original, 0x013b), encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
});

test('requires an explicit finite positive integer metadata output budget', () => {
  for (const maximumBytes of [0, -1, NaN, Infinity, 3.5]) {
    assert.throws(() => preserveExportCredits(original, encoded, maximumBytes), { code: 'INVALID_OUTPUT' });
  }
});

test('blocks an additional EXIF IFD rather than silently discarding another credit source', () => {
  const source = Buffer.from(original);
  const tiff = source.indexOf(Buffer.from('Exif\0\0')) + 6;
  const ifd = tiff + source.readUInt32BE(tiff + 4);
  const next = ifd + 2 + source.readUInt16BE(ifd) * 12;
  source.writeUInt32BE(8, next);
  assert.throws(() => preserveExportCredits(source, encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
});

test('bounds JPEG container complexity before collecting unbounded metadata records', () => {
  const jfif = segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'binary'));
  const source = Buffer.concat([original.subarray(0, 2), ...Array(4097).fill(jfif), original.subarray(2)]);
  assert.throws(() => preserveExportCredits(source, encoded, 1048576), /container complexity/);
});

test('bounds original input bytes independently from the configured output budget', () => {
  assert.throws(() => preserveExportCredits(Buffer.alloc(32 * 1024 * 1024 + 1), encoded, 1048576), /input byte budget/);
});

test('keeps JFIF in its required first-marker position', () => {
  const result = preserveExportCredits(original, encoded, 1048576);
  assert.equal(result.readUInt16BE(2), 0xffe0);
  const app0End = 4 + result.readUInt16BE(4);
  assert.equal(result.readUInt16BE(app0End), 0xffe1);
});

test('does not invent credits when the original has no supported credit fields', () => {
  const result = preserveExportCredits(encoded, encoded, 1048576);
  assert.deepEqual(result, encoded);
});

test('reads little-endian EXIF credits without copying orientation or GPS', () => {
  const result = preserveExportCredits(fixture('little-endian-credits'), encoded, 1048576);
  assert.ok(result.includes(Buffer.from('Ana Silva\0')));
  assert.ok(result.includes(Buffer.from('(c) 2026 Ana Silva\0')));
  assert.equal(result.includes(Buffer.from('Synthetic Camera')), false);
});

test('keeps freshly encoded ICC and image bytes unchanged while adding credits', () => {
  const jpeg = fixture('chromium-srgb');
  const result = preserveExportCredits(original, jpeg, 1048576);
  const exifStart = result.indexOf(Buffer.from('Exif\0\0')) - 4;
  const exifEnd = exifStart + 2 + result.readUInt16BE(exifStart + 2);
  const stripped = Buffer.concat([result.subarray(0, exifStart), result.subarray(exifEnd)]);
  assert.deepEqual(stripped, jpeg);
  assert.ok(result.includes(Buffer.from('ICC_PROFILE\0')));
});

test('reports oversized reconstructed metadata with a controlled error', () => {
  const tiff = Buffer.alloc(60039, 0x41);
  tiff.write('MM'); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4); tiff.writeUInt16BE(2, 8);
  for (const [entry, tag] of [[10, 0x013b], [22, 0x8298]]) {
    tiff.writeUInt16BE(tag, entry); tiff.writeUInt16BE(2, entry + 2);
    tiff.writeUInt32BE(60001, entry + 4); tiff.writeUInt32BE(38, entry + 8);
  }
  tiff.writeUInt32BE(0, 34); tiff[tiff.length - 1] = 0;
  const source = addMetadata(encoded, 0xe1, Buffer.concat([Buffer.from('Exif\0\0'), tiff]));
  assert.throws(() => preserveExportCredits(source, encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
});

test('rebuilds word-aligned EXIF text without changing its values', () => {
  const result = preserveExportCredits(fixture('odd-credit-values'), encoded, 1048576);
  const tiff = result.subarray(result.indexOf(Buffer.from('Exif\0\0')) + 6);
  const little = tiff.toString('ascii', 0, 2) === 'II';
  const short = (offset: number) => little ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
  const long = (offset: number) => little ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
  const ifd = long(4);
  const values = new Map<number, string>();
  for (let index = 0; index < short(ifd); index++) {
    const entry = ifd + 2 + index * 12;
    assert.equal(short(entry + 2), 2);
    const size = long(entry + 4);
    const offset = size <= 4 ? entry + 8 : long(entry + 8);
    assert.equal(offset % 2, 0);
    assert.equal(tiff[offset + size - 1], 0);
    values.set(short(entry), tiff.toString('ascii', offset, offset + size - 1));
  }
  assert.deepEqual(values, new Map([[0x013b, 'ABCD'], [0x8298, '(c) AB']]));
});

test('malformed offsets, markers and truncated inputs fail with a controlled metadata error', () => {
  const invalid: Buffer[] = [Buffer.alloc(0), original.subarray(0, -1), Buffer.concat([original, Buffer.from('trailer')])];
  const badOffset = Buffer.from(original);
  const tiff = badOffset.indexOf(Buffer.from('Exif\0\0')) + 6;
  badOffset.writeUInt32BE(0xffffffff, tiff + 4);
  invalid.push(badOffset);
  const badSegment = Buffer.from(original); badSegment.writeUInt16BE(0xffff, 4); invalid.push(badSegment);
  for (const source of invalid) {
    assert.throws(() => preserveExportCredits(source, encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
  }
});

const xmp = (properties: string, namespaces = '') => Buffer.from('http://ns.adobe.com/xap/1.0/\0' +
  `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:exif="http://ns.adobe.com/exif/1.0/" ${namespaces}>${properties}</rdf:Description></rdf:RDF></x:xmpmeta>`);

test('preserves Portuguese UTF-8 XMP creators and copyright while removing GPS properties', () => {
  const source = addMetadata(original, 0xe1, xmp('<dc:creator><rdf:Seq><rdf:li>João &amp; Gláucia</rdf:li></rdf:Seq></dc:creator><dc:rights><rdf:Alt><rdf:li xml:lang="x-default">© 2026 João</rdf:li></rdf:Alt></dc:rights><exif:GPSLatitude>12,34N</exif:GPSLatitude>'));
  const result = preserveExportCredits(source, encoded, 1048576);
  assert.ok(result.includes(Buffer.from('João &amp; Gláucia')));
  assert.ok(result.includes(Buffer.from('© 2026 João')));
  assert.equal(result.includes(Buffer.from('GPSLatitude')), false);
  assert.equal(result.includes(Buffer.from('12,34N')), false);
});

test('rejects XMP copyright alternatives without an explicit nonempty language', () => {
  for (const qualifier of ['', ' xml:lang=""', ' xml:lang=" "']) {
    const source = addMetadata(original, 0xe1, xmp(`<dc:rights><rdf:Alt><rdf:li${qualifier}>Rights</rdf:li></rdf:Alt></dc:rights>`));
    assert.throws(() => preserveExportCredits(source, encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
  }
});

test('rejects malformed or structured XMP credits instead of flattening or silently discarding them', () => {
  for (const properties of [
    '<dc:creator>João</dc:creator>',
    '<dc:creator><rdf:Seq><rdf:li><rdf:Description>João</rdf:Description></rdf:li></rdf:Seq></dc:creator>',
    '<dc:rights><rdf:Alt><rdf:li xml:lang="pt-BR">© João</rdf:li><rdf:li xml:lang="pt-BR">© Another</rdf:li></rdf:Alt></dc:rights>',
  ]) {
    assert.throws(() => preserveExportCredits(addMetadata(encoded, 0xe1, xmp(properties)), encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
  }
});

test('does not overlook attribute-form or alternative XMP credit properties', () => {
  for (const [properties, namespaces] of [
    ['', 'dc:creator="João"'],
    ['<tiff:Artist>João</tiff:Artist>', 'xmlns:tiff="http://ns.adobe.com/tiff/1.0/"'],
    ['<xmpRights:Owner>João</xmpRights:Owner>', 'xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"'],
  ]) {
    assert.throws(() => preserveExportCredits(addMetadata(encoded, 0xe1, xmp(properties, namespaces)), encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
  }
});

test('matches XMP namespace URIs and preserves escaped and numeric-looking strings', () => {
  const source = addMetadata(encoded, 0xe1, xmp('<credit:creator><rdf:Seq><rdf:li>123</rdf:li><rdf:li>João &amp; &lt;Equipe&gt;</rdf:li></rdf:Seq></credit:creator>', 'xmlns:credit="http://purl.org/dc/elements/1.1/"'));
  const result = preserveExportCredits(source, encoded, 1048576);
  const header = Buffer.from('http://ns.adobe.com/xap/1.0/\0');
  const start = result.indexOf(header);
  const end = start + result.readUInt16BE(start - 2) - 2;
  const document = new DOMParser().parseFromString(result.toString('utf8', start + header.length, end), 'application/xml');
  const creators = document.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'creator');
  assert.equal(creators.length, 1);
  assert.deepEqual(Array.from(creators[0].getElementsByTagNameNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'li')).map(item => item.textContent), ['123', 'João & <Equipe>']);
});

test('rejects DTDs, entity declarations, invalid UTF-8 and malformed XML before copying any credits', () => {
  const header = Buffer.from('http://ns.adobe.com/xap/1.0/\0');
  const payloads = [
    Buffer.concat([header, Buffer.from('<!DOCTYPE x SYSTEM "https://invalid.example/test.dtd"><x/>')]),
    Buffer.concat([header, Buffer.from('<!DOCTYPE x [<!ENTITY owner "João">]><x>&owner;</x>')]),
    Buffer.concat([header, Buffer.from([0xff, 0xfe])]),
    Buffer.concat([header, Buffer.from('<x></x\njunk>')]),
  ];
  for (const payload of payloads) assert.throws(() => preserveExportCredits(addMetadata(encoded, 0xe1, payload), encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
});

test('bounds XMP XML structure before metadata extraction', () => {
  const payload = xmp('<exif:container>'.repeat(40) + 'value' + '</exif:container>'.repeat(40));
  assert.throws(() => preserveExportCredits(addMetadata(encoded, 0xe1, payload), encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
});

test('rejects qualified or resource-based XMP credit values instead of losing their meaning', () => {
  const source = addMetadata(encoded, 0xe1, xmp('<dc:creator><rdf:Seq><rdf:li rdf:resource="https://example.com/joao"/></rdf:Seq></dc:creator>'));
  assert.throws(() => preserveExportCredits(source, encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
});

test('preserves defined UTF-16LE XPAuthor credits without guessing legacy EXIF encodings', () => {
  const result = preserveExportCredits(fixture('xpauthor-portuguese'), encoded, 1048576);
  assert.ok(result.includes(Buffer.from('João & Gláucia\0', 'utf16le')));
});

function iptc(records: Array<[number, number, Buffer]>): Buffer {
  const iim = Buffer.concat(records.map(([record, tag, bytes]) => {
    const header = Buffer.from([0x1c, record, tag, 0, 0]); header.writeUInt16BE(bytes.length, 3);
    return Buffer.concat([header, bytes]);
  }));
  const resource = Buffer.alloc(12); resource.write('8BIM'); resource.writeUInt16BE(0x0404, 4); resource.writeUInt32BE(iim.length, 8);
  return Buffer.concat([Buffer.from('Photoshop 3.0\0'), resource, iim, Buffer.alloc(iim.length % 2)]);
}

test('preserves declared UTF-8 IPTC byline, credit and copyright while dropping location fields', () => {
  const payload = iptc([[1, 90, Buffer.from([0x1b, 0x25, 0x47])], [2, 80, Buffer.from('João & Gláucia')], [2, 110, Buffer.from('Estúdio São Paulo')], [2, 116, Buffer.from('© 2026 João')], [2, 90, Buffer.from('Private city')]]);
  const source = addMetadata(encoded, 0xed, payload);
  const result = preserveExportCredits(source, encoded, 1048576);
  assert.ok(result.includes(Buffer.from('João & Gláucia')));
  assert.ok(result.includes(Buffer.from('Estúdio São Paulo')));
  assert.ok(result.includes(Buffer.from('© 2026 João')));
  assert.equal(result.includes(Buffer.from('Private city')), false);
});

test('rejects ambiguous legacy IPTC and malformed or duplicate credit records', () => {
  for (const payload of [
    iptc([[2, 80, Buffer.from([0x4a, 0x6f, 0xe3, 0x6f])]]),
    iptc([[1, 90, Buffer.from([0x1b, 0x25, 0x47])], [2, 80, Buffer.from([0xff])]]),
    iptc([[2, 116, Buffer.from('First copyright')], [2, 116, Buffer.from('Second copyright')]]),
  ]) {
    assert.throws(() => preserveExportCredits(addMetadata(encoded, 0xed, payload), encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
  }
});

test('requires the exact Photoshop resource signature instead of masking high bits', () => {
  const payload = iptc([[2, 80, Buffer.from('Ana')]]);
  const signature = payload.indexOf(Buffer.from('8BIM'));
  for (let index = 0; index < 4; index++) payload[signature + index] |= 0x80;
  assert.throws(() => preserveExportCredits(addMetadata(encoded, 0xed, payload), encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
});

test('rejects standard XMP author aliases that this adapter cannot preserve', () => {
  for (const [properties, attributes] of [
    ['', 'xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" photoshop:Author="Ana"'],
    ['', 'xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmp:Author="Ana"'],
    ['<xmp:Authors><rdf:Seq><rdf:li>Ana</rdf:li></rdf:Seq></xmp:Authors>', 'xmlns:xmp="http://ns.adobe.com/xap/1.0/"'],
  ]) {
    assert.throws(() => preserveExportCredits(addMetadata(encoded, 0xe1, xmp(properties, attributes)), encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
  }
});

test('does not promote a nested resource creator into the photograph author', () => {
  const source = addMetadata(encoded, 0xe1, xmp('<ex:Derivation><rdf:Description><dc:creator><rdf:Seq><rdf:li>Unrelated Creator</rdf:li></rdf:Seq></dc:creator></rdf:Description></ex:Derivation>', 'xmlns:ex="urn:example"'));
  assert.throws(() => preserveExportCredits(source, encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
});

test('does not promote a different RDF subject into the photograph author', () => {
  for (const subject of ['rdf:about="https://example.com/another-image"', 'rdf:nodeID="other-resource"']) {
    const source = addMetadata(encoded, 0xe1, xmp('<dc:creator><rdf:Seq><rdf:li>Another resource author</rdf:li></rdf:Seq></dc:creator>', subject));
    assert.throws(() => preserveExportCredits(source, encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
  }
});

test('rejects RDF IDs and inherited XML base or language instead of changing credit meaning', () => {
  const creator = '<dc:creator><rdf:Seq><rdf:li>Other author</rdf:li></rdf:Seq></dc:creator>';
  const rights = '<dc:rights><rdf:Alt><rdf:li>Direitos reservados</rdf:li></rdf:Alt></dc:rights>';
  const payloads = [
    xmp(creator, 'rdf:ID="another-photo"'),
    Buffer.from(xmp(creator, 'rdf:about=""').toString().replace('<x:xmpmeta ', '<x:xmpmeta xml:base="https://example.com/other" ')),
    xmp(rights, 'xml:lang="pt-BR"'),
  ];
  for (const payload of payloads) {
    assert.throws(() => preserveExportCredits(addMetadata(encoded, 0xe1, payload), encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
  }
});

test('rejects mixed text in XMP credit containers instead of silently dropping authors', () => {
  const source = addMetadata(encoded, 0xe1, xmp('<dc:creator>Lost Author<rdf:Seq><rdf:li>Ana</rdf:li>Lost Author Two</rdf:Seq></dc:creator>'));
  assert.throws(() => preserveExportCredits(source, encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
});

test('does not silently discard EXIF 3 Photographer and ImageEditor in ExifIFD', () => {
  const tiff = Buffer.alloc(94);
  tiff.write('MM'); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4); tiff.writeUInt16BE(2, 8);
  tiff.writeUInt16BE(0x013b, 10); tiff.writeUInt16BE(2, 12); tiff.writeUInt32BE(6, 14); tiff.writeUInt32BE(38, 18);
  tiff.writeUInt16BE(0x8769, 22); tiff.writeUInt16BE(4, 24); tiff.writeUInt32BE(1, 26); tiff.writeUInt32BE(44, 30);
  tiff.write('Alice\0', 38); tiff.writeUInt16BE(3, 44);
  tiff.writeUInt16BE(0x9000, 46); tiff.writeUInt16BE(7, 48); tiff.writeUInt32BE(4, 50); tiff.write('0300', 54);
  tiff.writeUInt16BE(0xa437, 58); tiff.writeUInt16BE(129, 60); tiff.writeUInt32BE(4, 62); tiff.write('Bob\0', 66);
  tiff.writeUInt16BE(0xa438, 70); tiff.writeUInt16BE(129, 72); tiff.writeUInt32BE(7, 74); tiff.writeUInt32BE(86, 78); tiff.write('Claire\0', 86);
  const source = addMetadata(encoded, 0xe1, Buffer.concat([Buffer.from('Exif\0\0'), tiff]));
  assert.throws(() => preserveExportCredits(source, encoded, 1048576), { code: 'METADATA_NOT_PRESERVABLE' });
});
