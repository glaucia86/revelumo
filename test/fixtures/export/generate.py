# Synthetic metadata fixtures. Laboratory tooling only; not a product dependency.
from PIL import Image, TiffImagePlugin
from pathlib import Path
import struct
root = Path(__file__).parent
image = Image.new('RGB', (8, 6), (34, 56, 78))
exif = Image.Exif()
exif[0x013b] = 'Ana Silva'
exif[0x8298] = '(c) 2026 Ana Silva'
exif[0x0112] = 6
exif[0x010f] = 'Synthetic Camera'
exif[0x8825] = {1: 'N', 2: (TiffImagePlugin.IFDRational(12), TiffImagePlugin.IFDRational(34), TiffImagePlugin.IFDRational(56)), 3: 'E', 4: (TiffImagePlugin.IFDRational(45), TiffImagePlugin.IFDRational(6), TiffImagePlugin.IFDRational(7))}
image.save(root / 'ascii-credits-gps.jpg', quality=90, exif=exif)
image.save(root / 'encoded.jpg', quality=90)
# Separate byte order and odd-sized text are checked against Pillow serialization.
exif.endian = '<'
image.save(root / 'little-endian-credits.jpg', quality=90, exif=exif)
odd = Image.Exif()
odd[0x013b] = 'ABCD'
odd[0x8298] = '(c) AB'
image.save(root / 'odd-credit-values.jpg', quality=90, exif=odd)
(root / 'odd-credits-exif.bin').write_bytes(odd.tobytes())

xp = Image.Exif()
xp[0x9c9d] = 'João & Gláucia\0'.encode('utf-16le')
image.save(root / 'xpauthor-portuguese.jpg', quality=90, exif=xp)

# Chromium fixture is an existing, separately recorded codec output, not rebuilt
# by Pillow. Only new metadata segments are inserted into those original bytes.
chromium = (root / 'chromium-srgb.jpg').read_bytes()
def with_segment(marker, payload):
    return chromium[:2] + bytes([0xff, marker]) + struct.pack('>H', len(payload) + 2) + payload + chromium[2:]

xml = ('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
       '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:exif="http://ns.adobe.com/exif/1.0/">'
       '<dc:creator><rdf:Seq><rdf:li>João &amp; Gláucia</rdf:li></rdf:Seq></dc:creator>'
       '<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">© 2026 João</rdf:li>'
       '<rdf:li xml:lang="pt-BR">Todos os direitos reservados a João</rdf:li></rdf:Alt></dc:rights>'
       '<exif:GPSLatitude>12,34N</exif:GPSLatitude></rdf:Description></rdf:RDF></x:xmpmeta>')
(root / 'xmp-portuguese-gps.jpg').write_bytes(with_segment(0xe1, b'http://ns.adobe.com/xap/1.0/\0' + xml.encode('utf8')))

def dataset(record, tag, value):
    return bytes([0x1c, record, tag]) + struct.pack('>H', len(value)) + value
iim = dataset(1, 90, b'\x1b%G') + b''.join(dataset(2, tag, value.encode('utf8')) for tag, value in [
    (80, 'João & Gláucia'), (110, 'Estúdio São Paulo'), (116, '© 2026 João'), (90, 'Private city')])
photoshop = b'Photoshop 3.0\0' + b'8BIM\x04\x04\0\0' + struct.pack('>I', len(iim)) + iim + b'\0' * (len(iim) % 2)
(root / 'iptc-portuguese.jpg').write_bytes(with_segment(0xed, photoshop))
