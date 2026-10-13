# Issue #53 — prepared JPEG strip adjustment

Base: `7813ece88f579d906e8977e8f8a529a00d1f46bb`. Scope: the shared byte operator and the export strip loop only. No worker scheduling, IPC, encoder, recipe/version, dependency, product limit, or CI gate changes.

## Ownership and arithmetic

`prepareJpegAdjustments(recipe)` validates and snapshots the three integer controls, then retains three private 256-byte LUTs (zero for a neutral recipe). `applyInPlace(pixels)` validates complete RGBA tuples before mutation, transforms only that view, leaves alpha intact and retains no pixel buffer. Only the exporter's newly read private ImageData is mutated. There is no second source/destination argument: undersized destination and partially overlapping source/destination are unrepresentable, rather than silently accepted.

The existing `applyJpegAdjustments(base, recipe)` remains a detached-copy operation, including neutral recipes. Preview callers and transferable ownership remain unchanged. The same expressions/order generate the LUTs, preserving combined linear EV/WB before the single clipping and rounding operation. Each export operation prepares once, with no inter-photo cache or global pool.

## TDD and verification

- RED: prepared in-place seam absent; GREEN: byte-exact warm gray inside an offset view, sentinels and alpha preserved.
- RED: multi-strip path still constructed three RGBA clones and nine LUTs; GREEN: three LUTs total and no intermediate RGBA clone.
- Regression: all 61 frozen EV hashes and 14 independent Decimal-60 combined-WB fixtures; recipe snapshot reuse; neutral/empty/invalid RGBA; invalid recipe; immutable wrapper; view boundaries; final partial strip; wide single row.
- Focused Node: 26 pass. Typecheck: pass.
- Bounded Node regression: 314 pass. Two existing tests were deliberately excluded locally with `--test-skip-pattern='bounds original input bytes independently|oversized JPEG is rejected before preview decoding'`; they concern the suspended 32 MiB boundary. Node 24 reports only selected tests, so its `skipped 0` is not a full-suite pass. CI retains both unchanged.
- Linux x64 package: pass, using `XDG_CACHE_HOME="$PWD/.test-temp/cache" npm run package`. The initial default cache path was unavailable; setting a workspace-local XDG cache resolved packaging without changing build configuration or dependencies. Packaged small publication circuit and independent Pillow/LittleCMS reopen: **pass** on the cloud Linux graphical session, Node 24.19.0. The existing `electron-jpeg-export-circuit.cjs <fresh-dir> full` harness exported the 80×40 orientation-6 fixture as a 40×80 JPEG (2,000 bytes), preserving selected credits and the source hash, rejecting aliases/collisions/crop/early cancellation, and confirming auxiliary renderer cleanup. Independent `verify-jpeg-export-circuit.py SOURCE PUBLISHED EXPECTED` decoded the output, checked ICC/metadata/orientation and 1,536 flat-interior pixels plus 100 center-patch pixels, maximum RGB error **4/8**. See [circuit log](circuit.txt) and [independent report](independent-reopen.json). This 40×80 output does not visually validate multi-strip seams: multi-strip coverage is the 1025×513 memory-backed Canvas unit test and exact RGBA comparison. Quality .90 options remain pinned by the Canvas boundary test; this circuit does not re-prove every orientation/P3 case locally.

Final-SHA Windows/Ubuntu CI is required before merge. No macOS or native Windows local run is claimed.

## Deterministic allocation evidence

Run `node test/helpers/jpeg-strip-allocation-probe.mjs` in a fresh Node process. The optional first argument is a path to the baseline strip module. For baseline reproduction, materialize `src/export-renderer/strips.ts` and `src/processing/jpeg-adjustments.ts` from the pinned base in a temporary directory, preserving their relative paths, then pass the strip path.

The synthetic 1025×513 raster produces three Canvas readbacks: 1,045,500 + 1,045,500 + 12,300 = 2,103,300 bytes. The probe intercepts explicit `new Uint8ClampedArray` calls while the public strip operation runs; its memory-backed Canvas uses the captured native constructor and records readbacks separately. It does not observe allocations through typed-array intrinsics, JavaScript object/closure overhead, V8/native internals, GC, or Canvas/codec memory. It is not a heap/RSS profiler.

- Baseline: 12 explicit arrays (3 strip copies + 9 LUTs), 2,105,604 cumulative bytes.
- Updated: 3 explicit LUT arrays, 768 cumulative bytes; unchanged readbacks.
- Both RGBA SHA-256: `b401d01234a4f70024e78397711fc0d9121dc0535d176cc216dcfb0da6195eb6`.
- Neutral path: no explicit adjustment arrays; Canvas readbacks still occur.

These are cumulative constructor-observed bytes, not simultaneously-live bytes or peak/RSS reduction. No timing, heap, RSS, 8 GB suitability or immediate reclamation claim is made.

## Remaining full-frame costs and suspended loads

The strip target remains 1 MiB, with a single complete row allowed to exceed it. `getImageData` still allocates each strip. Decoder, full canvas and JPEG encoder remain full-frame; this does not create streaming decode or a total memory bound. No 20/40 MP fixture or 32 MiB boundary is run locally for this change. The existing engine `basic` mode includes a 32 MiB+1 rejection-only allocation before decode and is intentionally not invoked locally; the small publication circuit uses an 80×40 source and its 32 MiB quota does not allocate that amount. Existing CI gates and product limits are unchanged.
