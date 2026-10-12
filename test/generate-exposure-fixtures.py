"""Fixture tooling only, not a product dependency. Pillow + LittleCMS reference.

Run with PYTHONPATH pointing at an isolated Pillow install. P3 D50-adapted
matrix columns are the published CSS Color 4 Display-P3/Bradford conversion.
The LittleCMS transform supplies independent encoded sRGB expectations.
"""
from pathlib import Path
from io import BytesIO
import json
import struct
from PIL import Image, ImageCms

root = Path(__file__).parent / 'fixtures'
srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
p3 = bytearray(srgb)
columns = {'rXYZ': (.515102, .241182, -.001049), 'gXYZ': (.291965, .692236, .041882), 'bXYZ': (.157153, .066581, .784378)}
for n in range(struct.unpack_from('>I', p3, 128)[0]):
    tag, offset, size = struct.unpack_from('>4sII', p3, 132 + n * 12)
    if tag.decode() in columns:
        struct.pack_into('>iii', p3, offset + 8, *(round(v * 65536) for v in columns[tag.decode()]))
# Different matrix invalidates any profile ID in the source profile.
p3[84:100] = bytes(16)
expected = {}
for name, profile in [('srgb', srgb), ('p3', bytes(p3))]:
    target = root / f'exposure-{name}.jpg'
    Image.new('RGB', (80, 40), (128, 64, 32)).save(target, quality=100, subsampling=0, icc_profile=profile)
    with Image.open(target) as decoded:
        converted = ImageCms.profileToProfile(decoded, ImageCms.ImageCmsProfile(BytesIO(profile)), ImageCms.ImageCmsProfile(BytesIO(srgb)), outputMode='RGB')
        expected[name] = {'source': list(decoded.getpixel((10, 10))), 'srgb': list(converted.getpixel((10, 10))), 'tolerance': 3}
# Four labeled-by-color quadrants, encoded once. EXIF orientation is fixture-only.
image = Image.new('RGB', (80, 40))
image.paste((255, 0, 0), (0, 0, 40, 20)); image.paste((0, 255, 0), (40, 0, 80, 20))
image.paste((0, 0, 255), (0, 20, 40, 40)); image.paste((255, 255, 0), (40, 20, 80, 40))
for orientation in range(1, 9):
    exif = Image.Exif(); exif[274] = orientation
    image.save(root / f'exposure-orientation-{orientation}.jpg', quality=100, subsampling=0, exif=exif, icc_profile=srgb)
(root / 'exposure-color-reference.json').write_text(json.dumps({'generator': 'Pillow ' + Image.__version__ + ' / LittleCMS ' + ImageCms.core.littlecms_version, 'profiles': expected}, indent=2))
print(expected)
