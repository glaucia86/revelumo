"""Independent manual oracle; Pillow/LittleCMS are test tools, not app dependencies.

Usage:
  python3 test/verify-jpeg-engine-corpus.py --generate-40mp .test-temp/jpeg-engine-corpus/40mp.jpg
  python3 test/verify-jpeg-engine-corpus.py --generate-fixtures .test-temp/jpeg-engine-corpus
  python3 test/verify-jpeg-engine-corpus.py .test-temp/jpeg-engine-corpus/<run>/manifest.json

This script never imports or invokes production code. Pillow decodes JPEG and
ImageOps.exif_transpose orients the source. LittleCMS converts sampled source
patches to sRGB before the scalar EV/WB operator. The operator composes relative
linear gains with EV, clips once, and rounds half-up, independently of JS LUTs.

Tolerance is fixed before capture: absolute error <= 6 encoded RGB levels for
neutral and <= 8 for combined WB/EV, across all 100 pixels sampled per image.
Four patches up to 5x5 are centered at quadrant centers, away from color edges.
Elongated images use smaller patches to stay inside their four-pixel height.
Noise/detail images have no color assertion: their JPEG subsampling error model
is outside this gate. Dimensions, ICC, hashes, memory and lifecycle still apply.
These tolerances allow two JPEG generations and decoder/CMS differences; they
do not certify perceptual fidelity or replace exact pure-transform unit tests.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
from io import BytesIO
import json
import math
from pathlib import Path
import random
import sys

from PIL import Image, ImageCms, ImageOps

NEUTRAL_TOLERANCE = 6
COMBINED_TOLERANCE = 8
PATCH_SIDE = 5
RECIPES = {
    "neutral": {"processingVersion": 2, "exposureTenths": 0, "temperature": 0, "tint": 0},
    "wb-ev": {"processingVersion": 2, "exposureTenths": -10, "temperature": 100, "tint": 100},
}
SRGB = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))


def digest_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def generate_40mp(path: Path) -> None:
    """Synthetic geometry only; keep preexisting fixture bytes stable across runs."""
    if path.exists():
        with Image.open(path) as existing:
            require(existing.format == "JPEG" and existing.size == (8000, 5000), "Existing 40 MP fixture has wrong format or dimensions")
            require(bool(existing.info.get("icc_profile")), "Existing 40 MP fixture lacks ICC")
        print(f"40 MP fixture already exists: {path} ({path.stat().st_size} bytes)")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with Image.new("RGB", (8000, 5000)) as fixture:
        fixture.paste((128, 64, 32), (0, 0, 4000, 2500))
        fixture.paste((48, 140, 72), (4000, 0, 8000, 2500))
        fixture.paste((56, 80, 168), (0, 2500, 4000, 5000))
        fixture.paste((196, 164, 76), (4000, 2500, 8000, 5000))
        with path.open("xb") as target:
            fixture.save(target, format="JPEG", quality=95, subsampling=0, icc_profile=SRGB.tobytes())
    print(f"Generated synthetic four-quadrant 40 MP fixture: {path} ({path.stat().st_size} bytes)")


def generate_extended_fixtures(directory: Path) -> None:
    generate_40mp(directory / "40mp.jpg")
    for name, size in (("noise40mp", (8000, 5000)), ("elongated", (10000, 4))):
        path = directory / f"{name}.jpg"
        if path.exists():
            with Image.open(path) as existing:
                require(existing.format == "JPEG" and existing.size == size and bool(existing.info.get("icc_profile")), f"Existing {name} fixture is invalid")
            require(path.stat().st_size <= 32 * 1024 * 1024, f"{name} exceeds engine input budget")
            print(f"Fixture already exists: {path} ({path.stat().st_size} bytes)")
            continue
        with Image.new("RGB", size, (71, 116, 169)) as fixture:
            if name == "noise40mp":
                # Bounded, deterministic high-frequency detail. A repeated tile
                # keeps generation inexpensive; JPEG does not deduplicate tiles.
                # Limiting channel range permits an input below the 32 MiB cap.
                tile_bytes = random.Random(19).randbytes(256 * 256 * 3).translate(bytes(64 + value // 2 for value in range(256)))
                with Image.frombytes("RGB", (256, 256), tile_bytes) as tile:
                    for top in range(0, size[1], 256):
                        for left in range(0, size[0], 256):
                            fixture.paste(tile, (left, top))
            with path.open("xb") as target:
                fixture.save(target, format="JPEG", quality=80 if name == "noise40mp" else 95, subsampling=2 if name == "noise40mp" else 0, icc_profile=SRGB.tobytes())
        require(path.stat().st_size <= 32 * 1024 * 1024, f"Generated {name} exceeds engine input budget")
        print(f"Generated {name}: {path} ({size[0]}x{size[1]}, {path.stat().st_size} bytes)")


def pixels(image: Image.Image):
    # Pillow 12.3 renamed this accessor; retain compatibility with older tools.
    return image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()


def scalar_rgb(rgb: tuple[int, int, int], recipe: dict) -> tuple[int, int, int]:
    """Direct scalar evaluation; no LUT and no production imports."""
    temperature, tint, exposure = recipe["temperature"], recipe["tint"], recipe["exposureTenths"]
    if temperature == tint == exposure == 0:
        return rgb
    red, green, blue = 2.0 ** (temperature / 200), 2.0 ** (-tint / 200), 2.0 ** (-temperature / 200)
    normalization = (87098 / 409605) * red + (175762 / 245763) * green + (12673 / 175545) * blue
    exposure_gain = 2.0 ** (exposure / 10)
    result = []
    for byte, white_balance_gain in zip(rgb, (red, green, blue)):
        encoded = byte / 255.0
        linear = encoded / 12.92 if encoded <= 0.04045 else ((encoded + 0.055) / 1.055) ** 2.4
        adjusted = min(1.0, max(0.0, linear * white_balance_gain / normalization * exposure_gain))
        encoded_adjusted = 12.92 * adjusted if adjusted <= 0.0031308 else 1.055 * adjusted ** (1 / 2.4) - 0.055
        result.append(math.floor(255.0 * encoded_adjusted + 0.5))
    return tuple(result)


def validate_output_profile(data: bytes | None) -> dict:
    require(bool(data), "Output JPEG has no embedded ICC profile; explicit sRGB ICC gate failed")
    require(data[16:20] == b"RGB ", "Output ICC profile is not RGB")
    profile = ImageCms.ImageCmsProfile(BytesIO(data))
    # Profile labels alone are not proof: the synthetic P3 fixture retains an
    # sRGB description. Verify the profile's behavior over a fixed RGB cube.
    levels = (0, 32, 96, 128, 192, 224, 255)
    probes = [(r, g, b) for r in levels for g in levels for b in levels]
    with Image.new("RGB", (len(probes), 1)) as patch:
        patch.putdata(probes)
        with ImageCms.profileToProfile(patch, profile, SRGB, outputMode="RGB") as converted:
            maximum_error = max(abs(a - b) for expected, actual in zip(probes, pixels(converted)) for a, b in zip(expected, actual))
    require(maximum_error <= 2, f"Output ICC is not sRGB-equivalent: RGB cube conversion changes channels by {maximum_error}")
    return {"bytes": len(data), "sha256": sha256(data).hexdigest(), "description": ImageCms.getProfileDescription(profile).strip(), "identityProbeMaximumError": maximum_error}


def verify_case(case: dict, sentinel_pid: int) -> dict:
    label = case["id"]
    require(case["status"] == "passed", f"{label}: capture did not pass")
    source_path, output_path = Path(case["sourcePath"]), Path(case["outputPath"])
    recipe_name = "wb-ev" if label.endswith("-wb-ev") else "neutral"
    require(case["recipe"] == RECIPES[recipe_name], f"{label}: unexpected recipe")
    source_digest = digest_file(source_path)
    require(source_digest == case["sourceSha256Before"] == case["sourceSha256After"] == case["sourceBufferSha256After"], f"{label}: source hash changed")
    require(digest_file(output_path) == case["outputSha256"], f"{label}: captured output hash changed")
    require(output_path.stat().st_size == case["outputBytes"] <= 32 * 1024 * 1024, f"{label}: output budget or byte count mismatch")
    require(source_path.stat().st_size == case["sourceBytes"] <= 32 * 1024 * 1024, f"{label}: source size or budget mismatch")
    require(case["sentinelValue"] == 42, f"{label}: sentinel response missing")
    require(len(case["ownedRenderers"]) == 1, f"{label}: renderer lifecycle evidence missing")
    renderer = case["ownedRenderers"][0]
    require(renderer["pid"] > 0 and renderer["pid"] != sentinel_pid and renderer["destroyed"] and renderer["absentAtSettlement"], f"{label}: renderer isolation/cleanup failed")
    require(any(any(process["pid"] == renderer["pid"] for process in sample["processes"]) for sample in case["samples"]), f"{label}: renderer was not sampled alive")
    for phase in ("before", "settled", "post-job-baseline"):
        require(any(sample["phase"] == phase for sample in case["samples"]), f"{label}: missing {phase} memory sample")
    samples = []
    tolerance = NEUTRAL_TOLERANCE if recipe_name == "neutral" else COMBINED_TOLERANCE
    maximum_error = 0
    pixels_checked = 0
    pixel_validation = "independent-scalar-color-oracle"
    with Image.open(source_path) as source, Image.open(output_path) as output:
        require(output.format == "JPEG", f"{label}: output is not JPEG")
        source_icc = source.info.get("icc_profile")
        require(bool(source_icc), f"{label}: source ICC missing")
        source_profile = ImageCms.ImageCmsProfile(BytesIO(source_icc))
        output_profile = validate_output_profile(output.info.get("icc_profile"))
        require(output.getexif().get(274, 1) == 1, f"{label}: raster output retains a non-normal EXIF orientation")
        with ImageOps.exif_transpose(source) as oriented:
            require(output.size == oriented.size == (case["width"], case["height"]), f"{label}: orientation-aware dimensions mismatch; expected {oriented.size}, output {output.size}")
            if case["fixture"] in ("40mp", "noise40mp"):
                require(output.width * output.height == 40_000_000 and min(output.size) > 2048, f"{label}: full 40 MP raster was resized")
            if case["fixture"] == "elongated":
                require(output.size == (10000, 4), f"{label}: elongated raster was resized")
            fractions = ((0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75))
            if case["fixture"] == "noise40mp":
                output.load()  # Confirm the complete JPEG is decodable, not just its header.
                pixel_validation = "not-asserted-high-frequency-jpeg"
                tolerance = maximum_error = None
                fractions = ()
            for fraction_x, fraction_y in fractions:
                x, y = int(oriented.width * fraction_x), int(oriented.height * fraction_y)
                half_width = min(2, x, oriented.width - 1 - x)
                half_height = min(2, y, oriented.height - 1 - y)
                box = (x - half_width, y - half_height, x + half_width + 1, y + half_height + 1)
                with oriented.crop(box) as source_patch, output.crop(box) as output_patch:
                    with ImageCms.profileToProfile(source_patch, source_profile, SRGB, outputMode="RGB") as converted:
                        expected = [scalar_rgb(rgb, case["recipe"]) for rgb in pixels(converted)]
                    with output_patch.convert("RGB") as actual_patch:
                        actual = list(pixels(actual_patch))
                errors = [max(abs(a - b) for a, b in zip(observed, reference)) for observed, reference in zip(actual, expected)]
                patch_error = max(errors)
                maximum_error = max(maximum_error, patch_error)
                center = len(expected) // 2
                pixels_checked += len(expected)
                samples.append({"center": [x, y], "box": list(box), "expectedCenter": list(expected[center]), "actualCenter": list(actual[center]), "maximumChannelError": patch_error})
                require(patch_error <= tolerance, f"{label}: patch at {(x, y)} exceeds tolerance {tolerance}, max error {patch_error}; center expected {expected[center]}, got {actual[center]}")
            dimensions = list(output.size)
    return {"id": label, "status": "passed", "dimensions": dimensions, "pixelValidation": pixel_validation, "pixelsChecked": pixels_checked, "tolerance": tolerance, "maximumChannelError": maximum_error, "sourceSha256": source_digest, "outputProfile": output_profile, "patches": samples, "encodeDurationMs": case["encodeDurationMs"], "sampledPeakAggregateWorkingSetKiB": case["sampledPeakAggregateWorkingSetKiB"], "sampledPeakWorkingSets": case["sampledPeakWorkingSets"]}


def verify_manifest(path: Path) -> int:
    manifest = json.loads(path.read_text())
    require(manifest["schemaVersion"] == 1 and manifest["status"] == "capture-passed", "Corpus capture did not finish successfully")
    require(manifest["sampleIntervalMs"] == 25, "Expected 25 ms memory sampling")
    fixtures = ["srgb", "p3"] + [f"orientation-{index}" for index in range(1, 9)] + ["40mp"]
    if manifest.get("corpusVersion", 1) == 2:
        fixtures += ["noise40mp", "elongated"]
    expected_ids = {f"{fixture}-{recipe}" for fixture in fixtures for recipe in RECIPES}
    actual_ids = [case["id"] for case in manifest["cases"]]
    require(len(actual_ids) == len(expected_ids) and set(actual_ids) == expected_ids, "Corpus coverage is incomplete or contains duplicate cases")
    cancellation = manifest.get("cancellation", {})
    require(cancellation.get("status") == "passed" and cancellation.get("observedCode") == "CANCELED", "40 MP cancellation did not pass")
    require(cancellation["abortRequestedElapsedMs"] > cancellation["didFinishLoadElapsedMs"], "40 MP cancellation happened before load")
    require(cancellation["rendererPid"] > 0 and cancellation["rendererPid"] != manifest["sentinelPid"], "Cancellation renderer PID was not isolated")
    require(cancellation["rendererDestroyed"] and cancellation["rendererAbsentAtSettlement"] and cancellation["sentinelValue"] == 42, "Cancellation cleanup/sentinel gate failed")
    require(digest_file(Path(cancellation["sourcePath"])) == cancellation["sourceSha256Before"] == cancellation["sourceSha256After"] == cancellation["sourceBufferSha256After"], "Canceled source was modified")
    report = {"schemaVersion": 1, "status": "passed", "manifestPath": str(path.resolve()), "pillowVersion": Image.__version__, "littleCmsVersion": ImageCms.core.littlecms_version, "neutralChannelTolerance": NEUTRAL_TOLERANCE, "combinedChannelTolerance": COMBINED_TOLERANCE, "measurementNotes": manifest["measurementNotes"], "cases": []}
    report["cancellation"] = cancellation
    for case in manifest["cases"]:
        try:
            result = verify_case(case, manifest["sentinelPid"])
            detail = "color pixels not asserted (high-frequency JPEG)" if not result["pixelsChecked"] else f"max channel error {result['maximumChannelError']}/{result['tolerance']}"
            print(f"PASS {case['id']}: {result['dimensions']}, {detail}")
        except Exception as error:
            report["status"] = "failed"
            result = {"id": case["id"], "status": "failed", "error": str(error)}
            print(f"FAIL {case['id']}: {error}", file=sys.stderr)
        report["cases"].append(result)
    report_path = path.with_name("oracle-report.json")
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Independent oracle {report['status']}: {report_path}")
    return 0 if report["status"] == "passed" else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, nargs="?")
    parser.add_argument("--generate-40mp", type=Path, dest="generate")
    parser.add_argument("--generate-fixtures", type=Path, dest="generate_fixtures")
    args = parser.parse_args()
    if args.generate:
        generate_40mp(args.generate)
        return 0
    if args.generate_fixtures:
        generate_extended_fixtures(args.generate_fixtures)
        return 0
    if not args.manifest:
        parser.error("provide a manifest path or --generate-40mp PATH")
    return verify_manifest(args.manifest)


if __name__ == "__main__":
    sys.exit(main())
