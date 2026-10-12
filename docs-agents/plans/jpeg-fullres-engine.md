# Full-resolution JPEG engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Demonstrate an isolated full-resolution JPEG v2 engine without connecting UI, crop or publication.
**Architecture:** One main-owned disposable sandboxed renderer, no second worker, strict private job IPC, existing per-pixel WB/exposure applied in strips, observed renderer termination before release of the single-flight gate.
**Tech Stack:** Existing Electron 44.7.0, React/TypeScript build, Node24 and Canvas; no new dependency.
**Spec:** `docs-agents/jpeg-fullres-engine-design.md`, coordinator approved 2026-10-12.

## Global constraints

- Base d7694cc43d145cefa9c730bbcffc7c4ec3c01e67 (docs-only PR #42 reconciled); do not alter translated editor/provider/descriptors or crop WIP.
- Recipe exactly processingVersion2 + exposureTenths -30..30 + temperature/tint -100..100, canonical integers; reject crop/extra keys.
- Source ≤32MiB, ≤40,000,000 SOF pixels; JPEG quality0.90, sRGB, full dimensions, explicit output budget, no64MiB product default.
- No free path/URL in request; source bytes never reopened; originals readonly; no dependencies/network/installer/release.
- Native implementation by assigned worker; final independent Standards/Spec reviewers. Commit related slices, publish only complete preparatory scope as draft after review.

## Review focus

- Unknown recipe/crop: reject rather than exporting an incomplete edit (Task1).
- Result from unrelated sender, wrong job or oversized typed-array backing store: reject before copying (Task1/3).
- Abort/failure before PID exists: settle and remove listeners, with no deadlock (Task3).
- Renderer death/late output or cleanup timeout: no next job until owned renderer termination established (Task3).
- Wide rows, multiple strips and P3/orientations: full dimensions, independent color/orientation oracles, bounded live strip buffers (Task2/4).

### Task1: Strict job contracts

Files: create `src/processing/jpeg-export-contract.ts`, `test/jpeg-export-contract.test.ts`.
Interfaces: `parseExportRecipe(unknown)` returns exact v2 recipe/null; `validateExportOutput(unknown, jobId, expectedDimensions, maximumBytes)` validates a JPEG byte view and dimensions without copying an oversized response. The contract fixes input cap, pixel cap, MIME and quality; existing JPEG SOF preflight is reused. Main creates jobId; callers never select it.
- [x] Add one failing test for valid strict v2 recipe; implement minimum; rerun.
- [x] Add one failing test per unknown/version/crop/range class; implement and rerun separately.
- [x] Add response happy-path then wrong job/schema/view/oversize/dimensions tests, one red-green cycle each.
- [x] Run `node --test test/jpeg-export-contract.test.ts` and typecheck; commit.

### Task2: Raster pipeline with real Canvas boundary

Files: create `src/export-renderer/encode.ts`, `src/export-renderer/index.ts`, `src/export-renderer/index.html`, `src/export-preload.ts`, `vite.export.config.mts`; add independent build entries in forge config and required engine declarations only. Test `test/jpeg-export-strips.test.ts` and later packaged harness.
Interfaces: `encodeFullResolution(source, recipe, maximumOutputBytes)` returns JPEG bytes/dimensions in renderer; strip helper uses existing `applyJpegAdjustments`. Preload exposes only one-shot input subscription and result submission.
- [x] Write failing strip-transform oracle test with a fixture spanning multiple strips; implement transform using the existing per-pixel operator; verify exact output against existing frozen scalar fixtures.
- [x] Add boundary/odd-row/no mutation tests one cycle at a time; preserve alpha and no hidden resize.
- [x] Add real-Canvas neutral JPEG test through packaged engine harness, then implement decode→orient→sRGB→strips→quality.90 encoding.
- [x] Verify crop/unknown recipe is rejected before decoding; MIME/Blob size before creating ArrayBuffer; finally releases bitmap/canvas.
- [x] Build isolated assets and run typecheck; commit when paired host test can execute.

### Task3: Single-flight isolated host

Files: create `src/main/jpeg-export-engine.ts`; add its independent build entry, new npm script `test:jpeg-engine`; create `test/electron-jpeg-engine.cjs`; update CI with that real packaged scenario after baseline existing scenarios.
Interface: `encodeJpegSnapshot({ source: Uint8Array, recipe, maximumOutputBytes }, signal?:AbortSignal): Promise<{bytes:Uint8Array,width:number,height:number}>`. No main application/UI call site in this stage.
- [x] Start with failing successful encode→independent decode test; minimal host and local renderer assets, then green.
- [x] Add single-flight BUSY, private request snapshot and strict result sender/mainframe/jobId cases, separately red-green.
- [x] Add cancel-before-create, active cancellation, invalid source, decoder failure, load failure, crash and timeout; prove caller settles and subsequent jobs work only after cleanup.
- [x] Prove editor sentinel PID differs, stays responsive, owned PID disappears after success/failure/cancel; no kill-by-PID. Test early failure with no PID. Confirm late output cannot publish result or affect next job.
- [x] Prove network/local-file escapes, navigation, popup, permission and download denied; sandbox/noNode/contextIsolation remain enabled.
- [x] Run focus/typecheck/package; commit.

### Task4: Fidelity, resource corpus, review

Files: extend `test/electron-jpeg-engine.cjs`, existing synthetic fixtures/provenance when necessary, `evidence/issue-19-engine/`, engine design/status report; no user photos.
- [x] Add full-resolution >2048 test, orientations1–8 quadrant oracles, sRGB/P3 and neutral/combined exposure-WB scalar samples with explicit JPEG tolerance.
- [x] Reopen real outputs independently; inspect ICC and frame sizes. Quality option verified at external Canvas boundary, not an unsupported universal numeric quality claim.
- [x] Measure per-process working sets/process lifetime for40MP flat/detail/noise and extremes; record input/output sizes, sampling interval, resource cleanup observations. Do not elect output budget without corpus.
- [x] Full suite, docs, typecheck, package, real packaged harness; independent Standards/Spec fixed-base review and red-green fixes.
- [ ] Publish draft with exact verified tree, monitor CI, resolve failures before merge, verify postmerge. Do not close issue19 or announce complete export.

## Next circuit boundary

After this engine is reviewed, re-review legacy writer/metadata contracts before adding source→engine→credits→no-clobber writer→independent reopen. No implicit cherry-pick of e40ff70 and no UI/crop bypass. This plan produces a running engine rather than another unconsumed type-only module.
