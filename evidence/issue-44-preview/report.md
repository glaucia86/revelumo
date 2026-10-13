# Issue 44 — explicit preview recovery and payload retirement

Partial slice based on `84e8362ca5baf00c9b7a13287b2b1e36cc105023`. Issue #44 stays open. Approved [design and test seams](../../docs-agents/plans/issue-44-preview-lifecycle.md).

## Delivered boundary

The renderer wraps the existing JPEG preview response in a disposable source. Photo identity stays stable while the compressed string becomes unavailable after current-worker readiness, failure, replacement or exit. Worker callbacks capture that owner rather than a permanent raw data URL. This avoids restarting the neutral prepared base merely because its compressed input was released.

Failure terminates the attempt and clears the visible surface/queued render parameters. Explicit retry reuses `previewPhoto` and its original SHA-256 verification; it does not begin another editing session or replace draft/history. Both worker errors and construction/postMessage exceptions are recoverable. Stale instance responses do not affect the next attempt. Existing limits, source IPC, adjustment algorithm, export engine and dependencies are unchanged.

Recovery is translated in PT-BR/EN/ES and visible at 760×540. Focus lost by an explicitly focused retry action returns to editing; spontaneous errors do not steal Save focus. A retry rejected during committed-export exit reconciliation preserves the error/action.

## Verification

- Node suite: 291 passed, zero failed/skipped; typecheck, documentation links and Linux package passed.
- REDs: [source retirement](source-red.txt), [missing recovery action](retry-red.txt), [minimum viewport](visibility-red.txt), [worker construction failure](constructor-red.txt), [retry focus](focus-red.txt), [post-export refused retry](export-exit-red.txt). The latter was found by independent Spec review and reproduced through a real successful export before fixing it.
- Packaged Linux first/reopen: synthetic public import, explicit retry without session recreation, no automatic retry, worker construction failure, stale ACK/error, failed save/blocked exit, original changed at retry, restored-original recovery, real export plus Undo/Redo, exit with held ready ACK and held preview IPC, another distinct photo, and second-process UUID/EV/WB recovery. Original hashes match after controlled fixture mutation/restoration.
- The first process created and terminated 10 preview workers across explicit attempts and navigation; observed maximum one live worker, zero on returning to catalog. Reopen created/terminated one. These are lifecycle observations, not memory measurements.
- Existing packaged Linux regressions passed: exposure first/reopen/discard-race/reopen/race/race-reopen; history first/reopen/gestures/history-failure/history-reopen; all twelve WB modes in their required order; editor-language, export UI and Cobre catalog. An initial manually shortened WB sequence omitted the prerequisite controls phase and failed preview-race expecting EV10; rerunning the documented sequence passed. Export UI deliberately crashes its renderer in its last scenario and still returns PASS. [Mode results](regressions.txt). Windows/Ubuntu CI remains a publication gate; no macOS or 8 GB support claim.

[English screenshot](preview-error-en.png), [Português screenshot](preview-error-pt-BR.png), [Español screenshot](preview-error-es.png). Layout and Portuguese copy passed visual review before publication.

## Integration after PR #50

Rebased onto `de9fba5346e746e65064631f0880a78c2ade9102`; shared package scripts and CI summary preserve both features. Forge, official checksums and the #43 runner remain identical to that main. Independent Standards follow-up found no integration issues. On local rebased commit `50a477e601b68ed9c2f550f52718119a9f30e7a3` (clean tree), 308 Node tests passed, zero failed/skipped; typecheck/docs/package passed. The preview first/reopen gate passed again, and the complete public `npm run test:jpeg-workflow` command passed package + first + independent reopen: [combined workflow record](combined-workflow.json). Product `src/` is unchanged from the originally reviewed/tested feature tree. Windows/Ubuntu CI on the published combined commit is still required before integration.

## Reproduce and observation limits

`npm ci`, `npm run install:electron`, `npm test`, `npm run typecheck`, `npm run check:docs`, `npm run package`. In a graphical session run `npm run test:preview-memory -- <new-directory> first`, then `npm run test:preview-memory -- <same-directory> reopen` in another process. Windows CI runs the same public commands.

Linux cloud runtime uses real packaged Electron 44.7.0, Chromium 152.0.7977.130, Node 24.21.0, sandbox/contextIsolation/webSecurity enabled and Node integration disabled. Native dialogs, worker error/ACK timing and IPC response timing are controlled at external boundaries; production algorithms, canvas, catalog and limited bridge execute normally. The test deliberately retains old worker callbacks to deliver stale events. This is not a heap-retention benchmark. DBus warnings did not fail successful runs.

The disposable-source unit test proves the public owner no longer returns the retired payload. Integration tests and independent review verify lifecycle wiring and observed worker termination; neither promises immediate GC, native allocator reclamation, a quantified RSS drop or a process-wide memory cap. The inventory in the design includes native full-resolution validation/decode, compressed transport copies, temporary surfaces, neutral base, transferred result, visible canvas and thumbnails. Broader #44 acceptance still requires admission under a documented reduced test budget, distinct near-limit JPEGs and repeated per-process RSS/heap measurement. Historical aggregate working sets are not private or unique RAM.
