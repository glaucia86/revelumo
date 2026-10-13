# JPEG full-resolution engine: design for issue #19

Status: coordinator-approved architecture, 2026-10-12; engine implemented with TDD and independent review. Base `d7694cc43d145cefa9c730bbcffc7c4ec3c01e67` (docs-only PR #42 reconciled), following source-snapshot PR #40. The approved outcome is a demonstrable engine stage for one original-resolution JPEG, quality 0.90, sRGB and the complete current exposure/WB v2 recipe. No UI action, destination dialog, crop WIP, new dependency or claim that export is complete.

## Why an auxiliary renderer

The current `exposure.worker.ts` owns session state, a 2048 px reduced base and preview messages. Extending that same worker would couple full-resolution memory/lifecycle to preview state. A separate worker in the editor could avoid state reuse but still shares the editor renderer's failure/memory domain. A Node worker lacks the existing browser JPEG/Canvas pipeline; adding a codec/native dependency is not approved.

Recommendation: one disposable sandboxed auxiliary renderer per job, without an extra browser worker. It needs no interactive thread, and the main can destroy it without relying on a cancel message processed by a busy pixel loop. Reuse only the pure `applyJpegAdjustments` function. Before relying on process isolation, the packaged test must prove the auxiliary OS PID differs from an editor sentinel window, and destruction removes that PID from Electron app metrics while the sentinel remains responsive. Unique nonpersistent session partition per job; reject the job if the observed PID is shared. Do not infer isolation solely from separate BrowserWindow objects.

## Public main-only contract

`encodeJpegSnapshot({ source, recipe, maximumOutputBytes }, signal?)` returns `{ bytes, width, height }` or a typed error. `source` is the exact-length bytes produced by `readVerifiedExportSource`; the engine makes its own bounded private copy before its first asynchronous boundary, because the caller can otherwise mutate a Buffer after submitting it. Source authentication remains the caller's responsibility; this API never reopens a path or enrolls identity.

Recipe must have exactly `processingVersion: 2`, `exposureTenths` integer -30..30, `temperature` and `tint` integers -100..100. Reject unknown keys/version/crop rather than ignoring them. Fixed JPEG/quality .90/sRGB/full-frame behavior. Input cap remains 32 MiB and 40,000,000 SOF pixels, with actual decoder/canvas failure surfaced; no silent resize. Output quota is an explicit positive integer call budget, not a new hardcoded 64 MiB product policy. Reject unsupported output, size or dimensions before returning it. No caller-selected quality/profile/path/URL/jobId.

The main creates an unpredictable jobId and accepts only a response from that job's webContents main frame at the exact local engine entry URL. Validate schema, byte view bounds, jobId, JPEG markers, output quota and frame dimensions. Decoder output dimensions must be either raw SOF dimensions or their orientation transpose; fixture tests independently enforce all eight orientation positions. This is not a general strict EXIF orientation parser: malformed/conflicting metadata remains a later metadata-preservation gate. Unknown or stale output never settles another job.

The engine is single-flight: reject overlapping calls with BUSY before copying/launching. The integrating owner must serialize source read + engine + metadata/publication before allocating another source; queueing already allocated full input buffers here would not provide a total-memory bound.

## Restricted host and lifecycle

New separate preload and bundled local renderer assets. `sandbox:true`, `contextIsolation:true`, `nodeIntegration:false`, `webSecurity:true`, no remote content. A unique session permits only the exact local engine HTML and its bundled assets; block other file paths and all network requests, permissions, navigation, popups, webviews and downloads. CSP defaults to none with only local bundled scripts allowed. Two narrow fixed IPC channels carry input/result; no generic Electron object is exposed.

Abort before launch returns CANCELED. Abort, timeout, load/renderer failure or schema failure destroys the owned window, ignores late output and removes listeners/timers. Success also destroys the window. Before accepting the next job or reporting normal completion, confirm the owned renderer PID disappears from app metrics. A bounded cleanup timeout returns CLEANUP_UNCONFIRMED and keeps further work blocked rather than assuming resources were released. No arbitrary process kill or editor destruction. The tests observe renderer PID lifetime; they do not prove GPU/global Chromium caches are immediately reclaimed.

## Pixel and memory pipeline

Decode `createImageBitmap(new Blob([source]), { imageOrientation:'from-image', colorSpaceConversion:'default' })`; create full-size OffscreenCanvas sRGB; draw once, then close bitmap. Process rows in strips targeting at most 1 MiB RGBA per strip (one full row if wider). As of issue #53, prepare the validated EV/WB LUTs once per operation and apply them in place only to each private ImageData readback before writing it to the same canvas. The public `applyJpegAdjustments` wrapper used by preview still returns an independent copy; no preview base is mutated. See [allocation evidence](../evidence/issue-53/report.md). The operator is per-pixel, so completed strips do not change subsequent input. Prove equality with fixed scalar oracles and full-buffer results. Do not create full-image ImageData or retain a second 40 MP adjusted array.

Encode `convertToBlob({ type:'image/jpeg', quality:0.90 })`; check type/size before arrayBuffer. Free surfaces in finally, then terminate the renderer via the owned host lifecycle. No Base64. Electron transport may clone compressed buffers; count that copy plus the private main snapshot and retained source needed for credits. A 40 MP RGBA surface is 160 MB, and Canvas/decoder/encoder may allocate additional native storage. Output quota checks occur after Blob creation and are not a hard RAM ceiling.

Measure sampled per-process working sets, job duration, process termination and post-job baseline on a corpus including uniform 40 MP, noise/detail, P3, orientations and elongated dimensions. Report sample interval, peak limitations, shared-page double-counting and fixture compressed sizes. Do not claim 8 GB support from the cloud machine. Select a future output budget only from measured evidence; no silent quality/resolution fallback.

## Tests and integration boundary

Public seams: strict engine request/result validation; strip adjustment against existing frozen oracles; packaged main engine with real Canvas/IPC/session and real source snapshots. Synthetic fixtures only. Cover identity source unchanged, full dimensions, orientations1–8, sRGB/P3, combined WB/exposure, exact strip equality, invalid/truncated JPEG, quotas, context/codec failure, overlap, abort at multiple stages, timeout/crash, wrong sender/jobId, late output, forbidden capabilities and process cleanup with responsive editor sentinel.

Engine output is only a raster JPEG; no claim to preserve credits by itself. The next circuit test must re-review the separate e40ff70 metadata/writer contracts and explicitly join authenticated original → engine → selected credits → no-clobber writer → independent reopen. Do not silently import that legacy branch. Crop support is a gate before enabling full export in the app if crop has joined the recipe. No buttons, shared editor files or crop WIP are changed in this stage.

## Verification record

See [engine evidence and remaining circuit boundary](../evidence/issue-19-engine/report.md). The engine is not connected to the application. Session callbacks are isolated from the job closure and removed after observed renderer termination; unique session objects may remain managed by Electron. PID/creationTime observations and sampled working sets are not proof that every Chromium/GPU allocation is reclaimed.
