# Issue #19 — authenticated JPEG publication circuit

2026-10-12; base `214a4d67197a967144fd4803d5e9e4239e4ee947`. Main-only integration, without application UI, destination dialog, autosave/crop support or new recipe schema. Issue #19 remains open. The engine/snapshot from PR #45/#40 are reused unchanged.

## Delivered boundary

One serial owner validates absolute paths, quota and exact v2 recipe before filesystem access; acquires exclusivity before source allocation; reads/authenticates readonly bytes; passes the same snapshot to the native encoder and selected-credit assembler; validates actual JPEG SOF against source/returned dimensions; and publishes through the reviewed no-clobber writer. Returns only path/dimensions/bytesWritten/cleanupPending. No source reopening for metadata and no queued full-resolution inputs.

Four original modules were selectively reused from `e40ff70953909f2e19562f9591f3b95b9ac40c22`, after contract review: EXIF/container, XMP, IPTC and writer. Old project/license/editor state was not imported. Writer uses exclusive hardlink publication, never replacement rename/copy. Existing paths, hardlinks, symlinks and normal final-name races preserve the originals/winner. Unsupported filesystems fail closed. Before link submission cancellation leaves no output; after submission the actual result wins, including successful publication after a late abort. Safe cleanup failure is preserved as cleanupPending, never converted into a false “not published.”

Selected credits preserve ASCII EXIF Artist/Copyright, UTF-16LE XPAuthor, standard XMP Unicode creator/copyright language alternatives, and declared UTF-8/ASCII IPTC Byline/Credit/Copyright. Ambiguous/unsupported forms fail closed. Old GPS, orientation, thumbnails and arbitrary original metadata are not copied. This is not anonymization of credits or pixels, nor a guarantee about arbitrary proprietary schemas.

## Verification

- Node full suite: **273 passed, 0 failed, 0 skipped** locally. Focused writer/metadata/circuit: 87 passed. Typecheck, docs and Linux package passed.
- Actual packaged `.asar` circuit generated a **40×80 JPEG, 2,000 bytes**, from authenticated 80×40 orientation6 source with all three credit containers. Verified source/alias dev+ino/hash, destination no-clobber, authentication/crop/early-cancel failures, renderer termination and responsive editor sentinel.
- The package includes `xmldom-MIT.txt` byte-for-byte, checked from `.vite/renderer/main_window/licenses/` inside app.asar. Exact runtime @xmldom/xmldom0.9.12 was already locked transitively; promotion preserved integrity and adds no other version upgrade. [Fresh npm audit](npm-audit.json): zero advisories reported; not proof against future vulnerabilities.
- [Independent final-file reopen](independent-reopen.json): Pillow/LittleCMS/ElementTree and independent TIFF/IPTC/container parsing verified exact Unicode/credits/languages, no GPS/location/camera/old orientation, full raster decode and sRGB ICC behavior. **1,536 flat-interior pixels, max RGB error4/8**. No product code computes the oracle.
- The fixed transition exclusion is8 pixels around sharp quadrant boundaries; tolerance remains8. An independent Pillow quality90/4:2:0 control reproduced why4-pixel exclusion caused four false failures (max10), matching Chromium's subsampling. All13 adversarial oracle controls remained rejected, including truncation filled by libjpeg, removed WB/EV, incorrect Unicode/languages, GPS, missing/P3 ICC and post-scan metadata. See [fixture/oracle provenance](../../test/fixtures/export/circuit-provenance.md).
- Existing serializer rejection tests cover DTD/ENTITY, malformed XML, node/depth/segment budgets and ambiguous credits. Parser does not resolve external content. Runtime checks validate the known engine's envelope/JPEG structure, not arbitrary color profiles; independent ICC/decode evidence is a test gate, not a general runtime CMS validator.
- Portable packaged scenario joins the existing Windows CI job. File-symlink tests explicitly skip only Windows EPERM/EACCES; hardlink scenarios are never hidden. Linux/macOS/network/exFAT compatibility is not inferred from Windows CI; no macOS run or installer is claimed.

## Full-circuit memory and time

One deterministic40 MP noise case, not a repeated broad corpus or concurrent benchmark. The request used a32 MiB test output quota, not a product default. Source18,895,394 bytes; output20,495,358 bytes; full circuit **1303.1 ms**. The [published noise file was independently reopened](noise-reopen.json): 8000×5000, complete decode and sRGB ICC; exact high-frequency color fidelity is not asserted.

[Measured process/memory JSON](memory.json) contains sample timestamps, main RSS/external counters, process peaks and baseline/final values. Nominal interval25 ms, largest observed gap52.8 ms; native peaks can be missed.

| Observation | MiB |
| --- | ---: |
| Auxiliary renderer sampled peak working set | 579.0 |
| Aggregate sampled peak working sets | 1017.4 |
| Aggregate before /100 ms after cleanup | 398.2 /479.3 |
| Main RSS before /after | 155.6 /236.9 |
| Main external-memory sampled peak | 97.3 |

Working-set sums can double-count shared pages and are not private/unique RAM. Metadata assembly and the writer's private compressed copy add cost after rendering. Code releases its source/encoded/output references once their stage no longer needs them; that does not force GC. Main memory had **not returned to baseline**100 ms after completion. Renderer exit proves observed process termination only, not all Chromium/GPU/global allocation reclamation or an8 GB support guarantee. Electron reports arrayBuffers0 in these samples; do not interpret that as zero buffer allocation. This stage is not described as lightweight.

## Reproduction

`npm ci`, `npm run install:electron`, `npm test`, `npm run typecheck`, `npm run check:docs`, `npm run package`.

In a normal graphical session, without disabling sandbox: `npm run test:jpeg-export-circuit -- <new directory> full`.

Independent manual oracle: `python3 test/verify-jpeg-export-circuit.py <run>/source.jpg <run>/published.jpg test/fixtures/export/circuit-expected.json`. Python/Pillow/LittleCMS are laboratory tools, not product/CI dependencies. The committed synthetic source/expected files make Windows runtime CI independent of Python.

Optional single resource case: generate the existing deterministic fixture with `python3 test/verify-jpeg-engine-corpus.py --generate-fixtures .test-temp/jpeg-engine-corpus`, then `npm run test:jpeg-export-circuit -- <new directory> memory`. Reuse the existing fixture without changing its bytes.

## Review and residual limits

[Review and RED/GREEN summary](review.md). No source/credit/license code from external applications was copied. The writer's lstat/link/unlink checks are not atomic inode-conditional operations against an equally privileged attacker who deliberately replaces staging/ancestors; no absolute same-UID/TOCTOU protection is claimed. Directory fsync/power-loss durability and arbitrary filesystems remain outside demonstrated guarantees.

Next application work must freeze/flush a confirmed recipe revision, choose destination through the approved UI and surface committed/cleanup outcomes. Crop remains a gate before exporting any recipe that contains it; this circuit rejects crop rather than silently omitting it. No user-facing export action is available yet.

Final XMP review correction was repackaged and the real circuit plus independent reopen passed again (same output SHA). The 40 MP memory sample predates only this missing-language rejection and was not repeated.
