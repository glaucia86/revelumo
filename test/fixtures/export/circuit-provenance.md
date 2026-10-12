# Independent JPEG circuit fixture and oracle

`test/verify-jpeg-export-circuit.py --generate .test-temp/jpeg-export-circuit`
creates `source.jpg` and `expected.json` in an ignored laboratory directory. Byte-identical committed copies `circuit-source.jpg` and `circuit-expected.json` let the packaged Windows CI run without Python.
No personal photograph, real coordinates, or private metadata is used. Names,
credits, the camera string and locations are synthetic. The source combines all
supported legacy credit containers in one JPEG:

- EXIF ASCII Artist/Copyright and UTF-16LE XPAuthor; orientation 6; GPS latitude
  and longitude zero, and a synthetic camera string.
- Standard XMP UTF-8 creators, escaped characters, Portuguese/Japanese text,
  and copyright alternatives with `x-default`, `pt-BR`, and `ja` languages;
  GPS latitude `0,0N` and longitude `0,0E`.
- Photoshop IPTC IIM Byline, Credit and CopyrightNotice with an explicit UTF-8
  declaration; synthetic City and Sublocation values, including `0,0`.

The underlying raster is the existing synthetic
`test/fixtures/exposure-orientation-6.jpg`, documented in
[`../exposure-provenance.md`](../exposure-provenance.md). Its compressed color
quadrants and generated sRGB ICC are retained byte-for-byte; only its old
orientation-only EXIF is replaced and the credit/location packets are added.
The ICC retains its original copyright text, **No copyright, use freely**.
The generator checks that text and records source/base/ICC SHA-256 hashes.
Rerunning generation accepts only byte-identical existing fixtures, rather
than silently overwriting another test run.

The expected recipe is v2, EV −1.0 (`exposureTenths: -10`), temperature 100,
tint 100. Input dimensions are 80×40 with orientation 6; output is a normalized
40×80 raster. `expected.json` records these requirements and exact credits,
including all Unicode strings and language alternatives.

Verify a file actually published by the packaged circuit with:

```sh
python3 test/verify-jpeg-export-circuit.py \
  .test-temp/jpeg-export-circuit/source.jpg \
  .test-temp/jpeg-export-circuit/published.jpg \
  .test-temp/jpeg-export-circuit/expected.json
```

The oracle independently reopens the complete JPEG using Pillow, inspects the
entire container including markers after image scans, reads EXIF with Pillow
and a TIFF directory check, reads XMP with Python ElementTree, and reads IPTC
IIM/Photoshop resource lengths directly. It requires exact credits in all three
containers and a credits-only metadata allowlist: no EXIF GPS/orientation/
thumbnail/camera, no XMP GPS or other non-credit properties/attributes, no IPTC
location or other non-credit datasets, and no unknown metadata containers.
This is a controlled synthetic test, not a claim to remove private information
from arbitrary credits or visible pixels.

Pillow fully decodes the raster. LittleCMS checks the embedded output ICC's
sRGB equivalence over a fixed 343-color RGB cube, rather than trusting its name.
The independent engine-corpus scalar formula supplies the v2 WB/EV expectation
after source orientation and ICC conversion. Four 5×5 center patches provide
compact readable examples; an additional check covers 1,536 flat-quadrant
interior pixels, including frame edges. Eight pixels on either side of each
internal color boundary are excluded: a 4:2:0 chroma DCT block spans 16 raster
pixels, so quantization ringing extends beyond interpolation's nearest neighbors.
The predeclared maximum absolute channel error remains 8 encoded RGB levels.
Calibration against the first packaged Chromium output found four errors above
8 with a four-pixel exclusion (maximum 10), all in the 4:2:0 block crossing the
horizontal quadrant boundary. The eight-pixel exclusion reduced the maximum to
4 without changing the tolerance or recipe. An independent Pillow recompression
at quality 90 with 4:2:0 subsampling reproduced the same four failures and the
same reduction from 10 to 4. Sampling boundaries are fixed in the oracle and
are not inferred from each output's errors.
The expanded sampling catches premature-EOI damage outside the center patches
that libjpeg may tolerate and fill during decode. These tolerances allow JPEG
generation and decoder/CMS differences; they do not certify perceptual fidelity.
The report records patch errors, output SHA-256, output ICC details and tool
versions as JSON.

No production function is imported or invoked by generation or verification.
Only the existing independent test harness `verify-jpeg-engine-corpus.py` is
imported for its scalar formula, fixed tolerance and ICC checks. The fixture
generator uses Pillow's EXIF serializer and standard XML serialization; the
published file must come from the separately run packaged application test.
Pillow 12.3.0 and its LittleCMS 2.19 are local laboratory tools, neither added to
npm nor shipped as product or CI dependencies. Their original fixture/license
provenance remains in `../exposure-provenance.md` and `provenance.md`.
