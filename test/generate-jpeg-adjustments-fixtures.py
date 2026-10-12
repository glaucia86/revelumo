"""Offline scalar Decimal oracle. Never imports or executes the product module.

Run from the repository root with Python 3; no third-party packages are needed.
The JSON is a committed test input and is not regenerated during tests/CI.
"""
from decimal import Decimal as D, ROUND_HALF_UP, localcontext
from pathlib import Path
import json

# The independent oracle evaluates each channel with 60 decimal digits. The
# product instead builds Number/Float64 lookup tables and applies them to bytes.
# W3C CSS Color 4 sample code: rational Y row of linear sRGB -> XYZ D65.
WEIGHTS = [(87098, 409605), (175762, 245763), (12673, 175545)]
PIXELS = [
    [0, 0, 0, 255], [10, 11, 12, 255], [64, 128, 192, 200],
    [128, 128, 128, 100], [255, 200, 180, 255], [255, 0, 0, 255],
    [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 255, 0],
]
CASES = [
    ('warm', 100, 0, 0), ('cool', -100, 0, 0),
    ('magenta', 0, 100, 0), ('green', 0, -100, 0),
    ('warm-magenta', 100, 100, 0), ('cool-green', -100, -100, 0),
    ('cool-magenta', -100, 100, 0), ('warm-green', 100, -100, 0),
    ('warm-magenta-minus-one-ev', 100, 100, -10),
    ('warm-magenta-plus-one-ev', 100, 100, 10),
    ('minimum-exposure', -100, -100, -30),
    ('maximum-exposure', 100, 100, 30),
    ('one-step', 1, -1, 1), ('interior-controls', 37, -62, -13),
]


def output_channel(byte, gain):
    encoded = D(byte) / 255
    linear = encoded / D('12.92') if encoded <= D('0.04045') else ((encoded + D('0.055')) / D('1.055')) ** D('2.4')
    adjusted = min(D(1), linear * gain)
    encoded = adjusted * D('12.92') if adjusted <= D('0.0031308') else D('1.055') * adjusted ** (D(1) / D('2.4')) - D('0.055')
    return int((255 * encoded).to_integral_value(rounding=ROUND_HALF_UP))


with localcontext() as context:
    context.prec = 60
    weights = [D(numerator) / denominator for numerator, denominator in WEIGHTS]
    cases = []
    for name, temperature, tint, exposure in CASES:
        raw = [D(2) ** (D(temperature) / 200), D(2) ** (-D(tint) / 200), D(2) ** (-D(temperature) / 200)]
        normalization = sum(weight * gain for weight, gain in zip(weights, raw))
        gains = [gain / normalization * D(2) ** (D(exposure) / 10) for gain in raw]
        expected = [[output_channel(pixel[channel], gains[channel]) for channel in range(3)] + [pixel[3]] for pixel in PIXELS]
        cases.append({'name': name, 'adjustments': {'exposureTenths': exposure, 'temperature': temperature, 'tint': tint}, 'expected': expected})

fixture = {'oracle': 'Python Decimal, 60 digits, scalar per-channel; never product code', 'input': PIXELS, 'cases': cases}
Path('test/fixtures/jpeg-adjustments-reference.json').write_text(json.dumps(fixture, indent=2) + '\n')

# Real-decoder references compose the independently generated LittleCMS sRGB
# baseline with the same Decimal oracle, never Chromium or the product LUTs.
with localcontext() as context:
    context.prec = 60
    raw = [D(2) ** D('.5'), D(2) ** D('-.5'), D(2) ** D('-.5')]
    normalization = sum(D(n) / d * gain for (n, d), gain in zip(WEIGHTS, raw))
    gains = [gain / normalization / 2 for gain in raw]
    transform = lambda pixel: [output_channel(byte, gain) for byte, gain in zip(pixel, gains)]
    profiles = json.loads(Path('test/fixtures/exposure-color-reference.json').read_text())['profiles']
    decoder = {
        'oracle': 'LittleCMS baseline + Python Decimal 60 digits; T100 M100 EV-1',
        'profiles': {name: {'expected': transform(item['srgb']), 'tolerance': 4} for name, item in profiles.items()},
        'quadrants': {name: transform(pixel) for name, pixel in {'R': [255, 0, 0], 'G': [0, 255, 0], 'B': [0, 0, 255], 'Y': [255, 255, 0]}.items()},
        'quadrantTolerance': 6,
    }
Path('test/fixtures/white-balance-decoder-reference.json').write_text(json.dumps(decoder, indent=2) + '\n')
