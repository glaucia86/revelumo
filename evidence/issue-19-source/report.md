# Authenticated export-source preparation report

Scope: issue #19 preparation only, main-only source snapshot on `ab4c6965c63d68da512b32b144d487bc2735ea7c`. No application integration, UI, IPC, recipe/crop change, dependency addition, codec, export writer or release. The existing export safety preparation remains separate. Source fixture is the synthetic ASCII string `verified original bytes`; its SHA-256 was recorded with `sha256sum`. No external code or user photographs are included.

## TDD and checks

The public seam was agreed before tests. Twelve vertical failing-behavior → passing cycles are recorded in red-NN/green-NN logs: returned bytes/read-only preservation; mismatch; missing/malformed identity; input budget; regular file; pre-open cancellation; mid-read cancellation and closure; request snapshot; unavailable original; changing length; bounded reads; cancellation after stat before allocation. Red-01 is an actual empty-result assertion failure, not a missing-import failure. Each red log has one failing test; each corresponding green log has none. Additional compatibility/data-preservation tests cover both source alias types, mutable caller buffer isolation, late pathname change, and read failure cleanup.

Final local checks (Node 24.19.0, Linux x64, 2026-10-12):

- `node --test test/export-source.test.ts`: 16 passed, no skips.
- `npm test`: 160 passed, no skips.
- `npm run typecheck`: passed.
- `npm run check:docs`: passed (local links only).
- `electron_config_cache=… npm run package`: passed after final code changes. Used a private copy of existing dependencies and official cached Electron 44.7.0. No crop WIP used and no denied action retried through another route.
- `git diff --check`: verified after trimming incidental trailing whitespace from evidence logs.

No packaged Electron runtime scenario, native Windows/macOS execution, end-to-end export, decoder/color fidelity or 8 GB resource benchmark was run. Windows symlink EPERM skips only that alias case, matching the existing repository convention; hardlink coverage remains separate. CI on the published SHA is a separate gate and has not yet run in this local report.

## Independent Standards review

One required finding: symlink creation needed the existing Windows capability-aware EPERM handling. Fixed by splitting hardlink/symlink tests and skipping only the unavailable Windows symlink case. Optional typed error-code union implemented. Independent final focused rerun: 16/16; no remaining implementation blocker. A stale packaging disclaimer was corrected to reflect successful Linux packaging and preserve unverified runtime/platform limits.

## Independent Spec review

Initial result: PASS for the approved preparatory seam, with no blocking mismatch or scope creep. Independently ran 14 focused tests and typecheck; additional temporary probes exercised cancellation around open/stat/close, stat/close failures and repeated short reads. The overstated growth-test title and Windows symlink caveat were corrected. Final-delta recheck: PASS, no remaining findings; independently reran 16/16 focused tests and typecheck.

## Remaining integration boundary

The caller must serialize jobs before allocation, obtain the recorded hash/path and confirmed recipe revision from the main-owned catalog/session, then process the same returned bytes. The transport overlaps private `Library.readJpeg`; extraction waits for the editor localization change so no shared file is modified concurrently. No repeated grid hashing is introduced. This module checks bytes against a hash; it does not decode JPEG or prove future path stability. The full contract, memory ownership/cancellation limits and next integration gates are in `docs-agents/jpeg-export-source.md`.
