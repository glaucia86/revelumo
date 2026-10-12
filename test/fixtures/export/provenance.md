# Synthetic export metadata fixtures

No personal photograph is used. `generate.py` uses Pillow 12.3.0 only as laboratory tooling, not a product or CI dependency. All names/credits/coordinates are synthetic test data.

- `ascii-credits-gps.jpg`: 8×6 uniform RGB; ASCII Artist/Copyright, orientation 6, synthetic camera and GPS.
- `little-endian-credits.jpg`: equivalent metadata in little-endian TIFF.
- `encoded.jpg`: uniform 8×6 Pillow JPEG, quality 90, without metadata. It is a metadata-assembly fixture, not a full export resolution test.
- `odd-credit-values.jpg` / `odd-credits-exif.bin`: independent Pillow EXIF serialization for odd-length fields and required word alignment.
- `xpauthor-portuguese.jpg`: defined UTF-16LE XPAuthor.
- `chromium-srgb.jpg`: copied unchanged from the earlier isolated export probe, synthetic 160×80 output produced by Electron 44.7.0 / Chromium 152.0.7977.130 canvas, quality 90; SHA-256 d9a8cb25b3479dd21ced6f85c5db3f3a6189328b2b73eb6fdcb1b6b18b3f2e28. Embedded sRGB ICC is 456 bytes, SHA-256 12afb4d9953adee0607d347daee5b78b18d6b3cab2d572b88970703f5edb37bc.
- `xmp-portuguese-gps.jpg`: that Chromium fixture with synthetic UTF-8 dc:creator, copyright language alternatives, and GPS property.
- `iptc-portuguese.jpg`: that Chromium fixture with synthetic UTF-8 IIM Byline/Credit/Copyright and a location field.

These fixtures were reviewed from preparation commit `e40ff70953909f2e19562f9591f3b95b9ac40c22`. Current integrated publication and independent reopen evidence is in [issue-19-circuit/report.md](../../../evidence/issue-19-circuit/report.md). The legacy metadata-only fixtures do not themselves prove renderer fidelity or resource use; those are checked separately by the packaged circuit.
