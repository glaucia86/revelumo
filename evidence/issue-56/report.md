# Issue 56: small JPEG baseline; do not add LRU or pool now

## Decision

Do not introduce a cache or buffer pool now. Evidence is insufficient to justify a prototype, retention policy or product integration. This is a scoped decision for this investigation, not proof that reuse could never benefit larger photos or another workload. No cache/pool candidate was implemented, so these measurements are **not** a performance comparison against a candidate.

The measured baseline already discards the worker on return to the catalog, retains one neutral base inside the current session, persists thumbnails separately, and transfers compressed/pixel results. Churn exists, but this small corpus does not establish an actionable latency or memory problem whose benefit would outweigh the new ownership, authentication and invalidation complexity.

## Provenance and reproduction

- Product SHA: `5ca817fee87e15c35d172bd61bb56be3f9c2b1de`, after #53/#54. Independent checkout; no tracked product file changed.
- These historical runs followed a fresh build from the stated clean product baseline (package log retained). Future harness runs report `checkoutSha` and `packageSourceVerified: false`: identifying HEAD and hashing app.asar does not independently prove the package was built from that checkout. Rebuild the checked-out version before collecting; do not reuse an unexplained package. The aggregate verifies consistency, not source-to-package provenance.
- Rebuilt Linux x64 app.asar SHA-256: `aee3ee97654e0ef55866850b5fcfe8664383cb31a32e334ffd4a1d3ca438761f`.
- Assistant cloud Linux desktop; Electron 44.7.0 / Chromium 152.0.7977.130 / embedded Node 24.21.0. CLI Node 24.19.0. Existing sandbox, context isolation and web security retained, Node integration disabled. No remote debugging port or forced GC.
- Own synthetic JPEGs (Pillow 12.3.0): A 640×480 / 27,579 bytes; B 800×600 / 48,334 bytes; C 720×480 / 36,478 bytes. Generator and distinct SHA-256 values are in `generate.py` and `fixtures/manifest.json`; files are separate creations, not hardlinks. Hashes checked before/after each process.
- Six fresh processes/profiles, alternated off/on/off/on/off/on: three repetitions for each instrumentation mode. Every process imports A/B/C serially, then follows A→B→A and A→B→C, returning to catalog after every opening, toggling EV between +1 and -1 once per opening and waiting for Saved. ABC follows ABA in the same process; A/B are consequently warm at OS/catalog level. This is not a cold-cache comparison.
- Reproduce package with the repository package command, then run `python3 evidence/issue-56/generate.py`, `node --test test/preview-allocation-observer.test.ts`, and `bash evidence/issue-56/run.sh` in a supported graphical terminal. `python3 evidence/issue-56/analyze.py` verifies the included final `runs/` (an optional directory argument verifies a fresh run), checks equality/invariants and produces `summary.json`. `runs/` contains the six final raw reports and logs.

## What is observed

The same real packaged app, IPC handler, Library, filesystem/SHA-256, native decoder, canvas and Worker execute in both modes. The harness substitutes native file selection, forces English for stable selectors, and loads the existing hidden-window adapter, as in prior packaged tests.

Both modes share minimal IPC timings/operation recording, UI polling (20 ms), and a Worker subclass which counts prepare/render messages, replies, transferred bytes and worker lifecycle without storing buffers or Worker references. Thus “off” means **allocation/CDP observation off**, not a completely uninstrumented application.

The on mode additionally observes actual Buffer.alloc and Uint8Array.from calls in the asynchronous IPC scope, and digest results matching the own fixture identities. Worker autoattach pauses startup only long enough to install a constructor observer and a getImageData wrapper, then immediately resumes the original script. No pixel algorithm or result message is replaced. This observer covers the constructors currently used in this path; it is not a universal TypedArray allocation meter. Numeric-only snapshots go through a local debugger binding at each actual postMessage, including the render during exit reconciliation. Constructor counts do not include allocations performed internally by native APIs; readback bytes are recorded separately.

A first laboratory round used only pre-exit snapshots and therefore omitted the exit render from allocation counts. It was not used in the final aggregate. The observer was extended to snapshot each send, and all six processes were repeated. After moving the harness into the evidence directory and tightening provenance/isolation, a further six-process validation passed. Its launcher then failed only at aggregation because the GUI shell has no `python` alias; using `python3` fixes the launcher. The six final raw reports are from that migrated harness, and aggregation was rerun without repeating image workloads. The unit regression for this extension failed before the extension and passed afterward; original RED/GREEN logs are retained. Final snapshots include 6 ready and 18 pixels messages per on process. The aggregate verifier explicitly reconciles ready/pixel snapshots with received replies, including three pixels snapshots per visit.

## Results per process (identical counts in all repetitions)

- 6 successful authenticated preview openings, including reopens; 6 prepare / 6 ready; 6 Workers created and terminated, peak 1, zero retained by the controller in catalog.
- 18 render requests and pixel replies: **3 per opening**, comprising initial rendering, EV draft rendering and rendering during confirmation/exit reconciliation. They are not 18 distinct user adjustments or 18 decode/prepares.
- Compressed transfers: 215,883 cumulative bytes, all 6 detached the renderer's sender buffer.
- Pixel transfers: 26,726,400 cumulative bytes. A transfer moves ownership; it does not mean the bytes disappeared.
- Worker explicit Uint8ClampedArray construction: 63 calls, 26,737,920 cumulative bytes (26,726,400 output bytes + 11,520 LUT bytes). Separate getImageData: 6 calls, 8,908,800 bytes for neutral bases. These totals are cumulative allocation traffic, **not simultaneous retention or peak memory**.
- Main originalStatus: 6 authenticated reads / allocations, 215,889 cumulative bytes. Main preview: 6 authenticated reads / allocations, 215,889 bytes, plus 6 exact payload copies totaling 215,883 bytes. Main adjustments: 12 authenticated reads / allocations, 431,778 bytes, covering draft-save and exit confirmation. Each read buffer includes N+1 growth-detection capacity.
- Originals' SHA-256 values remain intact. Corresponding displayed canvas dimensions and 32-bit pixel checksums match across all six processes (a regression sanity check, not cryptographic pixel identity).

The repeated originalStatus/preview/save authentications are observations of the existing identity contract. They are not declared redundant and this investigation does not authorize removing them. A cache cannot silently bypass SHA-256 or identity→commit arbitration.

## Latency, observer overhead and noise

There are 18 openings per mode. Allocation observation off: open median 24.96 ms (23.49–46.14); edit-to-Saved median 313.28 ms (309.18–323.00); complete open/edit/exit step median 381.72 ms (374.63–403.26). On: corresponding medians 24.94 ms (23.84–46.88), 313.31 ms (309.36–322.17), and 380.09 ms (372.96–408.22).

Paired six-step total differences, on minus off, were -8.57, -12.98, +47.13 ms. This is an empirical overhead/noise check of the whole extra observer, including debugger setup for workers and snapshot queries; it does not isolate observer CPU cost. The sample is small, UI polling quantizes observations by approximately 20 ms, scheduling/OS caches are uncontrolled, total step time includes the explicit canvas checksum in both modes and a Worker CDP snapshot query only in on, and edit timing contains the product's autosave/debounce behavior. Negative paired difference demonstrates why these figures must not be turned into a precise overhead percentage or optimization speedup. No microsecond-level decode claim is made.

RSS, heap, external, PSS and native surface memory were **not collected in this allocation-only run**. The earlier #44 small pilot verified collectors on an older SHA; its numbers are not combined with this baseline as current memory measurements. Native main decode and Worker full-frame bitmap remain O(W×H). IPC/contextBridge/native copies and GC retention are outside the explicit-constructor totals.

## Reuse trade-offs and why no prototype

- Existing persistent thumbnail cache is outside this proposal; the session's neutral base already avoids decode for repeated adjustments. Measured prepares stay one per opening, not one per render.
- Between-photo LRU could theoretically avoid some repeated preparation in this synthetic reopening sequence, but would retain at least neutral RGBA storage beyond session exit, require authenticated identity/dimensions/profile/version keys and invalidation, and still must preserve original authentication. We have no candidate comparison or native peak-memory evidence supporting that trade.
- A pixel pool would target the observed output allocation traffic. However, those buffers are transferred/detached from their sender and cannot be reused by merely keeping an array reference. Return ownership, exclusion while in flight, cancellation and bounded idle retention would all need a new tested protocol. Cumulative traffic alone is not evidence of a throughput bottleneck or benefit.
- #53 already removed the exporter's per-strip output/LUT repetition. Its 1025×513 construction probe is separate evidence, not a gain produced by a prospective preview pool. This run evaluates the post-#53/#54 baseline.

The appropriate next action is preserving this reproducible report, not implementing either structure. Revisit only with an observed workload-specific bottleneck and a safe, bounded comparison of at most one hotspot against this no-cache baseline.

## Verification and boundaries

Observer TDD: three tests pass, including actual allocation observation, detach semantics and non-mutating send snapshots; RED logs show the missing counts/snapshot failure before implementation. Bounded Node suite after including observer tests: 335 passed (332 existing product tests + 3 observer tests). Typecheck, local docs check and package passed. The two pre-existing 32 MiB boundary tests were explicitly excluded locally by the same named filter used for #54, not executed or counted as skips. Packaged final baseline: 6/6 exit 0. Expected unavailable D-Bus warnings occurred; npm emitted its existing http-proxy configuration warning.

Only laboratory evidence and its observer tests were added; no dependency, product setting, limit, cache, pool, product branch behavior or release was changed. Publication/CI gates are recorded separately in the PR. This investigation is local Linux evidence; it does not claim new Windows/macOS verification. The historical main CI is not evidence for this new laboratory.

Cgroup limit/current usage/ancestors remain unknown. No 20 MP, 40 MP or 32 MiB-boundary load ran, and no alternate machine was used to bypass that restriction. No budget, full-RSS bound, immediate GC reclamation, memory leak conclusion or suitability for 8 GB is established. #44's near-limit corpus and production budget remain open; #55 is analysis only.

## Reopening criteria

Reopen this decision when a representative, distinct JPEG corpus demonstrates a specific preparation/render latency or allocation-pressure bottleneck, the environment and memory budget are measured well enough for a safe experiment, and one bounded candidate can be compared against the same no-cache SHA baseline. A positive result would still require an explicit proposal and ownership/authentication/invalidation tests before product integration. Issues #44 and #55 remain separate and open.

Raw RED and command logs retain their original terminal whitespace; `git diff --check` therefore reports whitespace inside those historical outputs. No source whitespace finding is suppressed.
