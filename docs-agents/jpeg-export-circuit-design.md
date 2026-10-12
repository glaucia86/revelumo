# JPEG export circuit: main-only integration for issue #19

Approved scope: authenticated readonly snapshot → full-resolution engine → selected credits without GPS → exclusive new-file publication → independent test reopen. Base `214a4d67197a967144fd4803d5e9e4239e4ee947`. No UI, crop, new recipe format, app IPC, autosave or catalog/schema changes. This still does not make export available to users.

## Reuse decision

Selectively port `export-file.ts`, `export-metadata.ts`, `xmp-credits.ts`, `iptc-credits.ts`, their focused tests/fixtures and notice from original preparation `e40ff70953909f2e19562f9591f3b95b9ac40c22`. Do not cherry-pick its old package manifest, Library, security or documentation state. Preserve the current engine, source snapshot and translated editor unchanged unless an integrated test proves a required fix.

Promote the already-locked `@xmldom/xmldom`0.9.12 to exact direct runtime dependency. This was explicitly approved for this integration. The inspected package is MIT with no runtime dependencies; include its original notice in the actual app bundle and test it. Refresh lockfile without unrelated upgrades and run npm audit. Parser input remains local string-only, with explicit DTD/ENTITY rejection, strict errors, JPEG segment/byte/node/depth bounds and fail-closed unsupported/ambiguous credits. Official [release](https://github.com/xmldom/xmldom/releases/tag/0.9.12) and [security advisories](https://github.com/xmldom/xmldom/security/advisories) were checked on2026-10-12; this is not an absence-of-vulnerabilities guarantee.

## Public main-only seam

`createJpegExporter(encode, filesystem?)` creates a serial owner with `exportJpeg(request, signal?)`. `encode` is the native-process image-codec boundary: receives source bytes, strict v2 recipe and maximum output bytes; returns JPEG bytes and dimensions. Production service supplies the existing `encodeJpegSnapshot`; tests can substitute this external boundary for deterministic I/O/commit races while real packaged tests exercise the actual engine.

Request: `{ sourcePath, sourceSha256, recipe, destination, originalPaths, protectedDirectories, maximumOutputBytes }`. Paths are absolute main-selected paths; no renderer-supplied free paths or URLs. Source cap is the existing32 MiB; output quota is caller-explicit positive safe integer. Snapshot request/recipe/path arrays before any await, reject unknown recipe/crop before I/O. Include `sourcePath` automatically among protected originals.

Result: `{ path, width, height, bytesWritten, cleanupPending }`. Never return retained source/encoded arrays. Preserve typed source/engine/metadata/writer errors; BUSY is explicit. Main service exposes one owner. Reject overlap before reading/hashing/copying, not by queuing allocated sources. Engine's own busy/quarantine rules remain authoritative for renderer cleanup.

Run: validate → acquire owner → readonly authenticated source → same buffer into codec → verify bounded JPEG geometry/container result → rebuild credits from that same source snapshot and new raster → exclusive writer. No path reopening to recover metadata. Source substitution after authentication does not change output provenance; each new operation authenticates anew. The writer's original-path protection is additional to exclusive publication, not a claim of absolute same-UID/TOCTOU defense.

## Metadata and publication

Keep selected EXIF Artist/Copyright ASCII and XPAuthor UTF-16LE, standard XMP dc:creator/dc:rights including Unicode/languages, IPTC Byline/Credit/CopyrightNotice with declared UTF-8 or unambiguous ASCII. Preserve each supported container without inventing precedence. Rebuild selected fields only: old EXIF orientation/GPS/thumbnail and arbitrary source metadata are not copied. Encoded sRGB ICC/JFIF/image bytes remain intact. Unsupported/ambiguous provenance fails before staging; do not claim removal of all private information from credits or pixels.

Writer remains exclusive hardlink publication from a private same-directory staged file opened wx/0600 and synced. Existing file/hardlink/symlink/dangling alias or concurrent final-name winner is never overwritten. Unsupported hardlinks fail closed without unsafe rename/copy fallback. Cancellation is honored before commit submission. After `link` is submitted, return the actual eventual outcome; a successful committed file is not deleted to simulate cancellation. Cleanup never removes the final file and reports `cleanupPending` on safe cleanup failure. No power-loss durability promise or adversarial same-UID staging immunity.

## Memory and cancellation

Keep source only through credit assembly, then drop references. Engine disposes renderer before returning. Metadata assembly and writer private snapshot can temporarily coexist with compressed output; preserve that immutability contract rather than adding an unreviewed ownership-transfer optimization. Check output quota before metadata allocation/publication and again after credit assembly. No64 MiB default. Measure actual complete-circuit main/process working sets with the existing deterministic40 MP noise fixture, including output and writer copies; record baseline/final and sampling gaps. Avoid repeating the whole prior color benchmark.

Abort checks between read/encode/metadata/writer phases; synchronous metadata work is bounded and cannot process an abort until control returns. The writer checks signal just before submission and owns the post-submission semantics. Release the circuit gate on all terminal outcomes; distinguish committed success+cleanupPending from failure.

## Verification and next gate

Node seam tests use real filesystem/metadata/writer and a controlled native-codec boundary. Test authenticated success, mismatch/no output, caller mutation, crop rejection, overlap before source I/O, changed source path after read with snapshot provenance, output quota including credits, aliases/competition, cancellation before encode/during staging/after commit, write/sync/link failures and conservative cleanup flags. Existing focused legacy tests are retained and reconciled for Windows symlink availability without hiding hardlink failures.

Packaged Electron test uses the real engine, authenticated snapshot, metadata and writer. Independently reopen JPEG with Pillow/LittleCMS and parse EXIF/XMP/IPTC using independent test tooling, checking Unicode credits, no GPS, fresh sRGB ICC, orientation/dimensions and unchanged source/alias hashes+identity. Repeat portable runtime scenarios in existing Windows CI; independent Python corpus is manual, not a product dependency. Test packaged MIT notice presence. Independent Standards/Spec review before draft, then CI/merge/postmerge. Publish compact evidence summaries and relevant RED/GREEN outcomes, not duplicated full logs.

Next application gate remains destination UI plus recipe/autosave ownership and crop support; this circuit accepts only known full-frame v2. Issue #19 stays open.
