# Issue #19 — preparatory full-resolution JPEG engine

Date: 2026-10-12. Base: `d7694cc43d145cefa9c730bbcffc7c4ec3c01e67` (PR #42 documentation reconciled; editor PR #41 preserved). This is a tested main-only engine stage, not an available export command. Issue #19 remains open. No UI, crop, metadata writer, destination dialog, dependency, installer, tag or release is added.

## Verified scope

- Exact v2 exposure/relative-WB recipe; crop, unknown keys/version and noncanonical values fail explicitly before launch.
- Owned compressed-byte snapshot, no pathname/URL input or source reopening. Input bounds reuse the current 32 MiB/40 MP limits; caller supplies a positive output-byte budget. No new 64 MiB product policy.
- Full-size oriented sRGB Canvas, existing adjustment operator in ~1 MiB strips, JPEG `quality: 0.90`. Quality is an observed Canvas argument, not a universal encoder-quality/subsampling promise.
- Hidden disposable sandboxed/context-isolated renderer with no Node, separate observed OS PID, local assets only and restricted IPC. Main-frame/sender/job matching and response validation precede application copying/return. Electron necessarily deserializes IPC first; this is not a hard allocation ceiling against a compromised renderer.
- Single-flight BUSY; cancel/failure/timeout/invalid output closes only the owned window, waits for PID/creationTime disappearance and leaves the editor sentinel responsive. Unconfirmed cleanup quarantines subsequent work. No kill-by-PID.

## Verification

- `npm test`: **186 passed, 0 failed, 0 skipped** on Linux/Node 24. See [tests](tests.txt).
- [Typecheck](typecheck.txt), [documentation](docs.txt) and [Linux package](package.txt) passed.
- Actual packaged `.asar` lifecycle/IPC/Canvas harness: [final boundary run](engine22-boundaries.txt), followed by the [full final corpus run](engine23-final-corpus.txt). No sandbox-disabling flags. A cloud Linux desktop session supplied the normal display; shell-only headless attempts were not treated as evidence.
- Intentional renderer-crash scenarios can print Chromium FATAL/DBus diagnostics. The asserted outcome is `RENDERER_FAILED`, observed cleanup, responsive sentinel and successful next job.
- Boundary substitutions are limited to external Electron fault/capability injection (constructor/setup/load failure, timeout scheduling, session callbacks and a retained metrics entry). Native BrowserWindow/process/Canvas/IPC remain real. Sender/frame and prior-job injection exercise the registered host listener; schema failure uses the actual renderer/preload IPC.
- [Independent corpus capture](corpus-manifest.json), [Pillow/LittleCMS oracle](corpus-oracle.json), [oracle log](corpus-oracle.txt): **26 encoded outputs + cancellation**. All source file and in-memory hashes were preserved. Outputs were reopened independently, with full decode, ICC sRGB, dimensions and EXIF1–8 quadrant checks. Neutral/combined color maxima were **3 RGB levels**, below predeclared 6/8 tolerances. P3 max1. Noise cases assert decodability, ICC/dimensions/hash/lifecycle/resources, not exact high-frequency pixel fidelity.
- Odd/multiple/wide strips, fixed scalar WB oracle, exact varied full-buffer equivalence and unchanged alpha: [strip comparison](strips-comparison.txt). Canvas unavailable/codec failure release surfaces: [context test](canvas-context.txt).

## Measured resources

Requested sampling interval25 ms; raw timestamps and actual maximum gaps are in the manifest. All numbers below are observed, not guaranteed upper bounds. Working-set sums double-count shared pages and include main/sentinel/GPU/network processes.

| Synthetic input / recipe | Source bytes | Output bytes | Encode incl. cleanup ms | Renderer sampled peak MiB | Aggregate sampled peak MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| 8000×5000 quadrant / neutral | 1,134,981 | 247,605 | 553.5 | 525.3 | 958.2 |
| 8000×5000 quadrant / WB+EV | 1,134,981 | 247,362 | 681.0 | 537.1 | 976.0 |
| 8000×5000 deterministic noise / neutral | 18,895,394 | 21,455,051 | 1045.1 | 587.9 | 1066.2 |
| 8000×5000 deterministic noise / WB+EV | 18,895,394 | 20,495,358 | 1223.4 | 574.4 | 1074.9 |
| 10000×4 / neutral | 3,423 | 1,698 | 79.7 | 89.6 | 536.3 |
| 10000×4 / WB+EV | 3,423 | 1,699 | 79.1 | 93.7 | 542.1 |

These are sequential jobs, not a concurrent benchmark. The40 MP noise case is expensive; it is not described as lightweight. Aggregate baselines are diagnostic working-set sums, not private or unique RAM:

| Case | Before aggregate MiB | Post-job aggregate MiB | Largest observed sampling gap ms |
| --- | ---: | ---: | ---: |
| 40 MP neutral | 428.5 | 432.4 | 27.2 |
| 40 MP WB+EV | 434.9 | 438.6 | 27.6 |
| Noise40 MP neutral | 458.0 | 478.8 | 97.4 |
| Noise40 MP WB+EV | 498.7 | 535.4 | 74.1 |
| Elongated neutral | 519.5 | 444.2 | 25.8 |
| Elongated WB+EV | 446.3 | 445.9 | 25.9 |

Baselines do not return identically after each job: main/Chromium storage and garbage collection remain visible, including after the owned renderer is gone. The final corpus baseline is445.9 MiB, versus428.5 MiB before the first40 MP case; neither is a total application RAM guarantee. Peak aggregate1074.9 MiB is approximately1.05 GiB.

Every owned renderer was absent at settlement. The post-load cancellation occurred at94.2 ms and the owned PID disappeared; the 50 ms delay after load does not establish precisely which native decode stage was active. Sentinel returned42 after every operation. Per-job post-exit baselines are recorded, but PID exit does not prove all GPU/global Chromium storage is reclaimed. Unique Session objects can remain Electron-managed; callbacks are detached after observed exit and do not capture job buffers. A separate [GC diagnostic](session-gc.txt) observed the source collectible. This is neither a total heap proof nor a promise of support on8 GB machines.

The32 MiB output budget belongs to this corpus invocation. Noise input/output sizes show why an arbitrary64 MiB product rule was not introduced; a product budget still needs broader real-camera/metadata/platform evidence. No silent quality or resolution fallback exists.

## TDD and review corrections

Contract/result/strip/engine RED→GREEN logs are retained in this directory. Particularly relevant actual Electron regressions:

- [Load created PID then failed: RED](engine16-red.txt) → [GREEN](engine16-green.txt).
- [Session callback retention: RED](engine18-red.txt) → [GREEN](engine18-green.txt). Session restrictions now live outside the job closure and callbacks detach only after observed process exit.
- [Security setup failure: RED](engine19-red.txt) → [GREEN](engine19-green.txt).
- [Window closed before load promise settled: RED](engine20-red.txt) → [GREEN](engine20-green.txt). Early loading events record process identity.

Independent Standards review rechecked those fixes and found no remaining concrete blocker. Independent Spec review required varied-strip equivalence, unavailable-context/schema/late-output cases and noise/elongated corpus coverage; those checks were added without expanding product scope. Final disposition is in [review](review.md).

## Reproduce

1. `npm ci`, `npm run install:electron`, `npm test`, `npm run typecheck`, `npm run check:docs`, `npm run package`.
2. In a normal graphical desktop session: `npm run test:jpeg-engine -- <new writable directory> full`.
3. Optional manual corpus (Python3 with Pillow/LittleCMS already available): `npm run test:jpeg-engine -- <new writable directory> corpus`.
4. Run the printed `python3 test/verify-jpeg-engine-corpus.py <manifest.json>` command. Fixtures/outputs are generated under `.test-temp/jpeg-engine-corpus/`; large JPEGs are not committed. Fixture generation and scalar oracle are original repository test code, with no copied external implementation.

CI adds the packaged lifecycle scenario to the existing Windows job, with the same permissions/cost boundaries; Linux CI retains core/typecheck/package. The heavier independent Python corpus is manual. No macOS or real-camera corpus, perceptual QA or complete export E2E is claimed.

## Required next circuit

Re-review the separate legacy metadata/no-clobber writer contracts before joining authenticated readonly snapshot → engine → selected author/copyright (GPS removed) → exclusive publication of a new JPEG → independent reopen. The caller must serialize this whole chain before source allocation and retain the verified source only as long as credits need it. Revalidate identity at the time of each new export; do not reuse a thumbnail/availability check as authentication. This is not absolute protection against a same-UID attacker/TOCTOU.

Do not silently import the old branch or close issue #19. Crop support is an explicit gate before the UI can export a recipe that contains crop. The present strict rejection prevents exporting only part of an unknown recipe.
