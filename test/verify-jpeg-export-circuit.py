"""Independent manual oracle for a published JPEG export circuit result.

  python3 test/verify-jpeg-export-circuit.py --generate .test-temp/jpeg-export-circuit
  python3 test/verify-jpeg-export-circuit.py SOURCE.jpg PUBLISHED.jpg EXPECTED.json

Pillow/LittleCMS and ElementTree are laboratory tools, not product dependencies.
No production code is imported, invoked, or used to parse the expected result.
The existing independent engine corpus supplies only its scalar color formula,
fixed tolerances, and LittleCMS sRGB-equivalence check. All three credit
containers coexist in one synthetic source, with deliberately distinct values.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from hashlib import sha256
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import struct
import sys
import xml.etree.ElementTree as ET

from PIL import Image, ImageCms, ImageOps, TiffImagePlugin

ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("independent_engine_oracle", ROOT / "verify-jpeg-engine-corpus.py")
assert SPEC and SPEC.loader
ENGINE_ORACLE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ENGINE_ORACLE)
RECIPE = {"processingVersion": 2, "exposureTenths": -10, "temperature": 100, "tint": 100}
BOUNDARY_MARGIN = 8
EXIF = b"Exif\0\0"
XMP = b"http://ns.adobe.com/xap/1.0/\0"
PHOTOSHOP = b"Photoshop 3.0\0"
NS = {"x": "adobe:ns:meta/", "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      "dc": "http://purl.org/dc/elements/1.1/", "exif": "http://ns.adobe.com/exif/1.0/"}
XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"
CREDITS = {
    "exif": {"artist": "Synthetic Artist", "copyright": "(c) 2026 Synthetic Studio",
             "xpAuthor": "João & Gláucia · laboratório"},
    "xmp": {"creators": ["João & <Equipe>", "Gláucia — 日本語"],
            "rights": [{"language": "x-default", "value": "© 2026 Estúdio Sintético"},
                       {"language": "pt-BR", "value": "Créditos de teste: João & Gláucia"},
                       {"language": "ja", "value": "© 2026 合成スタジオ"}]},
    "iptc": {"byline": ["João & Gláucia"], "credit": ["Estúdio Sintético — São Paulo"],
             "copyright": ["© 2026 Créditos de teste"]},
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


@dataclass(frozen=True)
class Segment:
    marker: int
    start: int
    end: int
    payload: bytes


def jpeg_segments(data: bytes) -> list[Segment]:
    """Inspect the complete container, including metadata between/after scans."""
    require(data[:2] == b"\xff\xd8", "JPEG SOI is missing")
    result, at = [], 2
    while at < len(data):
        start = at
        require(data[at] == 0xff, f"JPEG marker missing at {at}")
        while at < len(data) and data[at] == 0xff:
            at += 1
        require(at < len(data), "Truncated JPEG marker")
        marker, at = data[at], at + 1
        if marker == 0xd9:
            require(at == len(data), "Unexpected bytes after JPEG EOI")
            return result
        require(marker not in (0, 0xd8, 0x01) and not 0xd0 <= marker <= 0xd7, "Unexpected standalone JPEG marker")
        require(at + 2 <= len(data), "Truncated JPEG segment length")
        length = int.from_bytes(data[at:at + 2], "big")
        require(length >= 2 and at + length <= len(data), "Truncated JPEG segment")
        end = at + length
        result.append(Segment(marker, start, end, data[at + 2:end]))
        at = end
        if marker == 0xda:
            while at < len(data):
                if data[at] != 0xff:
                    at += 1
                    continue
                marker_at = at
                while at < len(data) and data[at] == 0xff:
                    at += 1
                require(at < len(data), "Truncated JPEG scan")
                if data[at] == 0 or 0xd0 <= data[at] <= 0xd7:
                    at += 1
                    continue
                at = marker_at
                break
    raise AssertionError("JPEG EOI is missing")


def segment(marker: int, payload: bytes) -> bytes:
    require(len(payload) + 2 <= 65535, "Fixture segment exceeds JPEG limit")
    return bytes((0xff, marker)) + struct.pack(">H", len(payload) + 2) + payload


def metadata_payloads(data: bytes) -> dict[str, bytes]:
    found = {}
    for item in jpeg_segments(data):
        kind = None
        if item.marker == 0xe1 and item.payload.startswith(EXIF):
            kind = "exif"
        elif item.marker == 0xe1 and item.payload.startswith(XMP):
            kind = "xmp"
        elif item.marker == 0xed and item.payload.startswith(PHOTOSHOP):
            kind = "iptc"
        elif (item.marker == 0xe0 and item.payload.startswith(b"JFIF\0") or
              item.marker == 0xe2 and item.payload.startswith(b"ICC_PROFILE\0") or
              item.marker == 0xee and item.payload.startswith(b"Adobe") and len(item.payload) == 12):
            continue
        elif item.marker == 0xfe or 0xe0 <= item.marker <= 0xef:
            raise AssertionError(f"Unexpected metadata container APP{item.marker - 0xe0}/COM")
        if kind:
            require(kind not in found, f"Duplicate {kind} container")
            found[kind] = item.payload
    require(set(found) == {"exif", "xmp", "iptc"}, "Expected one EXIF, XMP and IPTC container")
    return found


def read_exif(payload: bytes, published: bool) -> tuple[dict, dict]:
    exif = Image.Exif()
    exif.load(payload)
    # Inspect the serialized directory as well: Pillow maps can hide duplicate
    # entries and ignore thumbnail directories. The published block is credits-only.
    tiff = payload[len(EXIF):]
    require(tiff[:2] in (b"II", b"MM"), "Invalid EXIF byte order")
    endian = "<" if tiff[:2] == b"II" else ">"
    require(struct.unpack_from(endian + "H", tiff, 2)[0] == 42, "Invalid TIFF magic")
    first = struct.unpack_from(endian + "I", tiff, 4)[0]
    count = struct.unpack_from(endian + "H", tiff, first)[0]
    tags = [struct.unpack_from(endian + "H", tiff, first + 2 + i * 12)[0] for i in range(count)]
    require(len(tags) == len(set(tags)), "Duplicate EXIF entries")
    next_ifd = struct.unpack_from(endian + "I", tiff, first + 2 + count * 12)[0]
    if published:
        require(set(tags) == {0x013b, 0x8298, 0x9c9d} and next_ifd == 0,
                "Published EXIF retains GPS, orientation, thumbnail, or another non-credit field")
    xp_bytes = bytes(exif[0x9c9d])
    require(len(xp_bytes) % 2 == 0 and xp_bytes[-2:] == b"\0\0", "XPAuthor must be terminated UTF-16LE")
    credits = {"artist": exif[0x013b], "copyright": exif[0x8298], "xpAuthor": xp_bytes[:-2].decode("utf-16le")}
    for key in ("artist", "copyright"):
        require(isinstance(credits[key], str) and credits[key].isascii(), f"EXIF {key} is not ASCII")
    return credits, {"tags": tags, "orientation": exif.get(0x0112, 1), "hasGps": 0x8825 in exif}


def read_xmp(payload: bytes, published: bool) -> tuple[dict, dict]:
    xml = payload[len(XMP):].decode("utf-8")
    require("<!DOCTYPE" not in xml.upper() and "<!ENTITY" not in xml.upper(), "XMP declarations are not allowed")
    root = ET.fromstring(xml)
    creators = root.findall(".//dc:creator", NS)
    rights = root.findall(".//dc:rights", NS)
    require(len(creators) == len(rights) == 1, "Missing or duplicate XMP credit properties")
    sequence = creators[0].find("rdf:Seq", NS)
    alternatives = rights[0].find("rdf:Alt", NS)
    require(sequence is not None and alternatives is not None, "Unsupported XMP credit structure")
    creator_items, right_items = list(sequence), list(alternatives)
    require(all(item.tag == "{" + NS["rdf"] + "}li" and len(item) == 0 for item in creator_items + right_items), "Unexpected structured XMP credit")
    credits = {"creators": [item.text or "" for item in creator_items],
               "rights": [{"language": item.attrib.get(XML_LANG), "value": item.text or ""} for item in right_items]}
    gps = [node.tag for node in root.iter() if "gps" in node.tag.lower() or any("gps" in key.lower() for key in node.attrib)]
    if published:
        allowed = {"{" + NS[prefix] + "}" + name for prefix, name in
                   (("x", "xmpmeta"), ("rdf", "RDF"), ("rdf", "Description"), ("dc", "creator"),
                    ("dc", "rights"), ("rdf", "Seq"), ("rdf", "Alt"), ("rdf", "li"))}
        require(not gps and all(node.tag in allowed for node in root.iter()), "Published XMP retains GPS or non-credit properties")
        require(all(set(node.attrib) <= {XML_LANG, "{" + NS["rdf"] + "}about"} for node in root.iter()), "Published XMP retains non-credit attributes")
    return credits, {"gpsProperties": gps}


def read_iptc(payload: bytes, published: bool) -> tuple[dict, dict]:
    at, resources = len(PHOTOSHOP), []
    while at < len(payload):
        require(payload[at:at + 4] == b"8BIM", "Invalid Photoshop resource signature")
        resource_id = int.from_bytes(payload[at + 4:at + 6], "big")
        at += 6
        name_size = 1 + payload[at]
        at += name_size + name_size % 2
        require(at + 4 <= len(payload), "Truncated Photoshop resource")
        size = int.from_bytes(payload[at:at + 4], "big")
        at += 4
        require(at + size <= len(payload), "Truncated Photoshop data")
        resources.append((resource_id, payload[at:at + size]))
        at += size + size % 2
    require(at == len(payload) and len(resources) == 1 and resources[0][0] == 0x0404, "Expected one IPTC image resource")
    data, at, records = resources[0][1], 0, []
    while at < len(data):
        require(at + 5 <= len(data) and data[at] == 0x1c, "Invalid IPTC dataset")
        size = int.from_bytes(data[at + 3:at + 5], "big")
        require(size < 0x8000 and at + 5 + size <= len(data), "Unsupported or truncated IPTC dataset")
        records.append((data[at + 1], data[at + 2], data[at + 5:at + 5 + size]))
        at += 5 + size
    encodings = [value for record, tag, value in records if (record, tag) == (1, 90)]
    require(encodings == [b"\x1b%G"], "IPTC must declare UTF-8 exactly once")
    credits = {key: [value.decode("utf-8") for record, field, value in records if (record, field) == (2, tag)]
               for key, tag in (("byline", 80), ("credit", 110), ("copyright", 116))}
    other = [(record, tag) for record, tag, _ in records if (record, tag) not in {(1, 90), (2, 80), (2, 110), (2, 116)}]
    if published:
        require(not other, "Published IPTC retains location or another non-credit dataset")
    return credits, {"otherDatasets": [list(item) for item in other]}


def read_credits(data: bytes, published: bool) -> tuple[dict, dict]:
    payloads = metadata_payloads(data)
    credits, details = {}, {}
    for key, reader in (("exif", read_exif), ("xmp", read_xmp), ("iptc", read_iptc)):
        credits[key], details[key] = reader(payloads[key], published)
    return credits, details


def source_metadata() -> bytes:
    exif = Image.Exif()
    exif[0x013b], exif[0x8298] = CREDITS["exif"]["artist"], CREDITS["exif"]["copyright"]
    exif[0x9c9d] = (CREDITS["exif"]["xpAuthor"] + "\0").encode("utf-16le")
    exif[0x0112], exif[0x010f] = 6, "Synthetic Camera"
    zeros = tuple(TiffImagePlugin.IFDRational(0) for _ in range(3))
    exif[0x8825] = {1: "N", 2: zeros, 3: "E", 4: zeros}
    for prefix, uri in NS.items():
        ET.register_namespace(prefix, uri)
    root = ET.Element("{" + NS["x"] + "}xmpmeta")
    rdf = ET.SubElement(root, "{" + NS["rdf"] + "}RDF")
    description = ET.SubElement(rdf, "{" + NS["rdf"] + "}Description")
    creators = ET.SubElement(ET.SubElement(description, "{" + NS["dc"] + "}creator"), "{" + NS["rdf"] + "}Seq")
    for value in CREDITS["xmp"]["creators"]:
        ET.SubElement(creators, "{" + NS["rdf"] + "}li").text = value
    rights = ET.SubElement(ET.SubElement(description, "{" + NS["dc"] + "}rights"), "{" + NS["rdf"] + "}Alt")
    for item in CREDITS["xmp"]["rights"]:
        ET.SubElement(rights, "{" + NS["rdf"] + "}li", {XML_LANG: item["language"]}).text = item["value"]
    for name, value in (("GPSLatitude", "0,0N"), ("GPSLongitude", "0,0E")):
        ET.SubElement(description, "{" + NS["exif"] + "}" + name).text = value
    datasets = [(1, 90, b"\x1b%G")]
    for key, tag in (("byline", 80), ("credit", 110), ("copyright", 116)):
        datasets += [(2, tag, value.encode("utf-8")) for value in CREDITS["iptc"][key]]
    datasets += [(2, 90, b"Synthetic location"), (2, 92, b"0,0")]
    iim = b"".join(bytes((0x1c, record, tag)) + struct.pack(">H", len(value)) + value for record, tag, value in datasets)
    photoshop = PHOTOSHOP + b"8BIM\x04\x04\0\0" + struct.pack(">I", len(iim)) + iim + bytes(len(iim) % 2)
    return segment(0xe1, exif.tobytes()) + segment(0xe1, XMP + ET.tostring(root, encoding="utf-8")) + segment(0xed, photoshop)


def generate(directory: Path) -> dict:
    base = ROOT / "fixtures/exposure-orientation-6.jpg"
    original = base.read_bytes()
    # Keep the original encoded quadrants and ICC byte-for-byte; replace only
    # the old orientation-only EXIF block, without another JPEG generation.
    clean, last = bytearray(), 0
    for item in jpeg_segments(original):
        if item.marker == 0xe1 and item.payload.startswith(EXIF):
            clean += original[last:item.start]
            last = item.end
    clean += original[last:]
    first = jpeg_segments(bytes(clean))[0]
    insertion = first.end if first.marker == 0xe0 and first.payload.startswith(b"JFIF\0") else 2
    source = bytes(clean[:insertion]) + source_metadata() + bytes(clean[insertion:])
    actual_credits, details = read_credits(source, published=False)
    require(actual_credits == CREDITS, "Generated source credits do not match the declared fixture")
    require(details["exif"]["hasGps"] and len(details["xmp"]["gpsProperties"]) == 2 and len(details["iptc"]["otherDatasets"]) == 2,
            "Generated source lacks the intended synthetic location fields")
    with Image.open(BytesIO(source)) as image:
        image.load()
        icc = image.info["icc_profile"]
        profile = ImageCms.ImageCmsProfile(BytesIO(icc))
        copyright_text = ImageCms.getProfileCopyright(profile).strip()
        require(copyright_text == "No copyright, use freely", "Source ICC copyright differs from documented fixture provenance")
        with ImageOps.exif_transpose(image) as oriented:
            output_size = list(oriented.size)
        expected = {"schemaVersion": 1, "sourceFixture": "test/fixtures/exposure-orientation-6.jpg",
                    "sourceFixtureSha256": sha256(original).hexdigest(), "sourceSha256": sha256(source).hexdigest(),
                    "sourceBytes": len(source), "sourceDimensions": list(image.size), "sourceOrientation": 6,
                    "outputDimensions": output_size, "outputOrientation": 1, "recipe": RECIPE,
                    "maximumChannelError": ENGINE_ORACLE.COMBINED_TOLERANCE, "credits": CREDITS,
                    "sourceIccSha256": sha256(icc).hexdigest(), "sourceIccCopyright": copyright_text,
                    "syntheticLocation": {"exifGps": "0 N, 0 E", "xmpGps": ["0,0N", "0,0E"], "iptc": ["Synthetic location", "0,0"]}}
    directory.mkdir(parents=True, exist_ok=True)
    for name, data in (("source.jpg", source), ("expected.json", (json.dumps(expected, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))):
        path = directory / name
        if path.exists():
            require(path.read_bytes() == data, f"Refusing to replace a different existing fixture: {path}")
        else:
            with path.open("xb") as stream:
                stream.write(data)
    return {"status": "generated", "sourcePath": str((directory / "source.jpg").resolve()),
            "expectedPath": str((directory / "expected.json").resolve()), "sourceSha256": expected["sourceSha256"], "recipe": RECIPE}


def verify(source_path: Path, output_path: Path, expected_path: Path) -> dict:
    expected = json.loads(expected_path.read_text(encoding="utf-8"))
    require(expected["schemaVersion"] == 1 and expected["recipe"] == RECIPE, "Unexpected fixture schema or recipe")
    require(expected["maximumChannelError"] == ENGINE_ORACLE.COMBINED_TOLERANCE, "Do not loosen the predefined pixel tolerance")
    source_data, output_data = source_path.read_bytes(), output_path.read_bytes()
    require(sha256(source_data).hexdigest() == expected["sourceSha256"], "Source hash changed")
    require(len(source_data) == expected["sourceBytes"], "Source size changed")
    source_credits, source_details = read_credits(source_data, published=False)
    require(source_credits == expected["credits"], "Source credit provenance differs from expectation")
    require(source_details["exif"]["hasGps"] and len(source_details["xmp"]["gpsProperties"]) == 2 and len(source_details["iptc"]["otherDatasets"]) == 2,
            "Source GPS/location removal challenge is missing")
    output_credits, output_details = read_credits(output_data, published=True)
    require(output_credits == expected["credits"], "Published EXIF/XMP/IPTC credits differ, including Unicode, language or order")
    patches, maximum_error, checked, interior_checked = [], 0, 0, 0
    # verify() checks JPEG structure; load() then decodes the entire raster.
    with Image.open(BytesIO(output_data)) as header:
        header.verify()
    with Image.open(BytesIO(source_data)) as source, Image.open(BytesIO(output_data)) as output:
        source.load()
        output.load()
        require(output.format == source.format == "JPEG", "Expected source and output JPEGs")
        require(list(source.size) == expected["sourceDimensions"] and source.getexif().get(274, 1) == expected["sourceOrientation"], "Source dimensions/orientation mismatch")
        require(output.getexif().get(274, 1) == expected["outputOrientation"] == 1, "Output orientation was not normalized")
        require(sha256(source.info["icc_profile"]).hexdigest() == expected["sourceIccSha256"], "Source ICC changed")
        output_profile = ENGINE_ORACLE.validate_output_profile(output.info.get("icc_profile"))
        source_profile = ImageCms.ImageCmsProfile(BytesIO(source.info["icc_profile"]))
        with ImageOps.exif_transpose(source) as oriented:
            require(list(output.size) == list(oriented.size) == expected["outputDimensions"], "Orientation-aware output dimensions mismatch")
            for fx, fy in ((0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)):
                x, y = int(oriented.width * fx), int(oriented.height * fy)
                box = (x - 2, y - 2, x + 3, y + 3)
                with oriented.crop(box) as patch, output.crop(box).convert("RGB") as actual_patch:
                    with ImageCms.profileToProfile(patch, source_profile, ENGINE_ORACLE.SRGB, outputMode="RGB") as converted:
                        reference = [ENGINE_ORACLE.scalar_rgb(rgb, expected["recipe"]) for rgb in ENGINE_ORACLE.pixels(converted)]
                    actual = list(ENGINE_ORACLE.pixels(actual_patch))
                error = max(abs(a - b) for observed, wanted in zip(actual, reference) for a, b in zip(observed, wanted))
                require(error <= expected["maximumChannelError"], f"WB/EV patch {(x, y)} error {error} exceeds {expected['maximumChannelError']}")
                maximum_error, checked = max(maximum_error, error), checked + len(actual)
                patches.append({"box": list(box), "expectedCenter": list(reference[12]), "actualCenter": list(actual[12]), "maximumChannelError": error})
            # libjpeg can tolerate a premature EOI and fill missing rows. Four
            # center patches alone miss that damage. Check every flat-quadrant
            # interior pixel too, excluding an eight-pixel transition on either
            # side of each boundary. A 4:2:0 chroma DCT block spans 16 raster
            # pixels: quantization ringing extends beyond interpolation's
            # nearest neighbors. Keep the independent channel tolerance fixed.
            with ImageCms.profileToProfile(oriented, source_profile, ENGINE_ORACLE.SRGB, outputMode="RGB") as converted, output.convert("RGB") as actual_image:
                for index, (original, observed) in enumerate(zip(ENGINE_ORACLE.pixels(converted), ENGINE_ORACLE.pixels(actual_image))):
                    x, y = index % oriented.width, index // oriented.width
                    if (oriented.width // 2 - BOUNDARY_MARGIN <= x < oriented.width // 2 + BOUNDARY_MARGIN or
                            oriented.height // 2 - BOUNDARY_MARGIN <= y < oriented.height // 2 + BOUNDARY_MARGIN):
                        continue
                    wanted = ENGINE_ORACLE.scalar_rgb(original, expected["recipe"])
                    error = max(abs(a - b) for a, b in zip(observed, wanted))
                    require(error <= expected["maximumChannelError"], f"WB/EV flat interior {(x, y)} error {error} exceeds {expected['maximumChannelError']}")
                    maximum_error, interior_checked = max(maximum_error, error), interior_checked + 1
            require(interior_checked == 1536, "Synthetic quadrant interior coverage changed")
    require(sha256(source_path.read_bytes()).hexdigest() == expected["sourceSha256"], "Source changed during independent verification")
    return {"schemaVersion": 1, "status": "passed", "sourcePath": str(source_path.resolve()), "publishedPath": str(output_path.resolve()),
            "sourceSha256": expected["sourceSha256"], "publishedSha256": sha256(output_data).hexdigest(), "publishedBytes": len(output_data),
            "dimensions": expected["outputDimensions"], "orientation": 1, "fullRasterDecoded": True,
            "pixelsChecked": interior_checked, "centerPatchPixelsChecked": checked, "maximumChannelError": maximum_error,
            "channelTolerance": expected["maximumChannelError"], "boundaryMarginPixels": BOUNDARY_MARGIN,
            "recipe": expected["recipe"], "outputProfile": output_profile,
            "credits": output_credits, "metadata": output_details, "patches": patches,
            "pillowVersion": Image.__version__, "littleCmsVersion": ImageCms.core.littlecms_version}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--generate", type=Path, metavar="DIRECTORY")
    parser.add_argument("paths", type=Path, nargs="*", metavar="PATH")
    args = parser.parse_args()
    if (args.generate and args.paths) or (not args.generate and len(args.paths) != 3):
        parser.error("provide --generate DIRECTORY or SOURCE.jpg PUBLISHED.jpg EXPECTED.json")
    try:
        report = generate(args.generate) if args.generate else verify(*args.paths)
    except Exception as error:
        print(json.dumps({"status": "failed", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
