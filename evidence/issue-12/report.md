# Issue 12 — JPEG exposure/autosave evidence

Isolated checkout `task-4/revelumo`, branch `feat/issue-12-exposure-autosave`, base `5aa6693d05bbfea1c538a9360c84ee69ce195a68`. Contract is [captured here](contract.md); delivered behavior and limitations are in [ADR 0004](../../docs-agents/adr/0004-jpeg-exposure-autosave.md). No push, PR, merge, tag, release or native Windows QA closure is part of this change.

## Checkpoints

- Independent design review approved the plan without a new engine/dependency decision. Test seams were explicitly authorized in the issue.
- TDD first red: `node --test test/exposure.test.ts` failed with `library.recipe is not a function`. Minimal recipe/session/catalog implementation made it green. Follow-up Library cases cover serialized revision/session fencing, real SQLite lock, changed/missing identity, reset/retry, v4 migration, reimport, relocation and original bytes. Migration effects are checked through Library; historical tables are fixture preparation only.
- Packaged UI red: `electron test/electron-exposure.cjs <fresh-dir> first` timed out waiting for exposure controls. Green uses the actual packaged renderer, main, preload, SQLite, worker and Chromium canvas.
- Independent review found dropped native-close intent during another navigation flush. Controlled real IPC response latency reproduced red (`normal close flush` timeout); pending-close replay made `race` green and `race-reopen` recovered 1.7 EV. Review then identified the explicit-discard variant; a retired-session guard and held end-edit response verify `discard-race` without losing the close request.
- Selected-original status refresh now preserves draft/base while updating the unavailable notice and relocation action. Its packaged check retains 1.4 EV while the file is missing. Availability/relocation regressions remain intact.

## Verification before local commit

Windows x64 `10.0.26200`; Node shell `24.19.0`; Electron `44.7.0`, bundled Node `24.21.0`, Chromium `152.0.7977.130`, SQLite `3.53.4`.

`npm run typecheck`, `npm run package` and `git diff --check` passed. Full `npm test`: 68 tests, 65 pass, 0 fail, 3 skips (Windows symlink permission case and two Unix named-pipe cases). Tests use a canonical isolated TEMP/TMP to avoid Windows short-path alias differences. An old relocation fixture needed to drop the newly introduced recipes table before reconstructing v1/v2; all 15 relocation cases passed after that fixture correction.

Packaged hidden `first/reopen` passed for exposure, import/grade, relocation and classification; the separate availability harness passed with zero cached-grid content reads/hashes/decodes for page, focus and manual refresh. No test window was shown on the desktop. The reusable external module adapter sets `show:false` at construction and captures bootstrap failures; it never redefines Electron's non-configurable BrowserWindow export.

Exposure first covers accessible slider/spinbutton and Chromium ArrowRight input; invalid EV and strict payloads; clipping/reset; sRGB 128→176 (+1 EV) and 128→92 (−1 EV), ±2 encoded-unit tolerance; exact neutral recovery; burst coalescence to one transaction and one in-flight save; delayed old acknowledgment with a newer draft; focus/manual refresh; debounce navigation; real SQLite failure/retry; unavailable-original close failure and explicit discard; wrong owner and extra fields; and unchanged originals. System-boundary observers verify slider ticks do not read/hash/decode originals, while the one coalesced commit revalidates identity without decoding.

Both embedded sRGB and synthetic Display-P3 matrix profiles are decoded by the real Chromium worker and normalized to canvas sRGB. Independent Pillow 12.3.0/LittleCMS 2.17 reference expects source `(128,63,31)` to remain `(128,63,31)` for sRGB and become `(138,58,20)` for P3; tolerance is 3 encoded units per channel. Eight EXIF orientation fixtures verify literal quadrant order and oriented dimensions, including mirrors, with tolerance 4. Fixture generator is test tooling only, not a product dependency. This does not validate every ICC profile, camera JPEG, gamut or professional color workflow.

Normal application quit immediately after 2.3 EV flushes and the second process recovers 2.3 EV. `interrupt` forces exit during the −2.5 EV debounce while 2.3 EV remains persisted; subsequent `reopen` recovers 2.3 EV. This demonstrates no recovery promise for unpersisted drafts.

## Resources

Bounded measurement was prepared in a separate process, then run with the actual hidden package: `electron test/electron-resources.cjs <fresh-dir> prepare`, then `measure`. Host: i7-12700H, 20 logical CPUs, about 31.6 GiB reported system memory. Forty-eight synthetic 6000×6000 JPEG copies, each 2,320,218 bytes/36 MP, remain below the 32 MiB/40 MP limits. Selected canvas is 2048×2048. Workload: batch import, 60 drag changes, and ten selected-photo open/close cycles. No forced GC. Measurements are per-process working sets in KiB from `app.getAppMetrics`, not exclusive physical RAM.

Initial measured process peak working sets: Browser/main 1,544,804 KiB (~1.47 GiB, during the 48-file import), renderer 326,816 KiB (~319 MiB), GPU 241,508 KiB (~236 MiB). Five seconds after ten cycles: main 111,056 KiB, renderer 138,292 KiB, GPU 208,476 KiB. Closed-cycle renderer working set was 137,668 KiB at cycle 1 and 138,292 KiB at cycle 10; allocator/Chromium retention remains observable after worker disposal. Sixty renderer input roundtrips measured min 1.02 ms / mean 2.49 ms / max 7.83 ms; this is an automated executeJavaScript roundtrip, not INP or human-perceived latency. Raw samples are preserved in [resources-result.json](resources-result.json).

The high main import peak and retained process memory explicitly prevent a claim of low RAM or suitability for an 8 GB machine. The 2048 bound limits adjustment work; initial decoder memory remains full-resolution. No RSS/working-set sums are used as exclusive RAM. Final-SHA reverification is recorded separately in the task workspace after committing, so its SHA does not require amending the artifact it verifies.

## Independent review

[Standards](standards-review.md): zero mandatory violations; duplication resolved, lifecycle concern fixed, optional Data Clumps suggestion deferred to avoid unnecessary shared-interface churn during parallel #13 work. [Spec](spec-review.md): all three original findings addressed, explicit-discard close edge addressed, no scope creep or scoped blockers. Reports remain separate. No claim is made that reviewers independently executed every test.

Linux/macOS behavior and native file dialogue, physical keyboard, screen reader and human visual QA were not verified here. Windows native/visual #4 remains pending. No remaining implementation blocker was found in this environment.

## Reproduce

After `npm ci`, `npm run install:electron`, typecheck/tests/package, use fresh isolated run directories:

```powershell
npm run test:exposure -- <run> first
npm run test:exposure -- <run> reopen
npm run test:exposure -- <run> interrupt
npm run test:exposure -- <run> reopen
npm run test:exposure -- <run> discard-race
npm run test:exposure -- <run> reopen
npm run test:exposure -- <run> race
npm run test:exposure -- <run> race-reopen
```

The race intentionally changes the last persisted value to 1.7 EV; use `race-reopen` afterwards. Existing packaged regressions retain their original commands, with construction-time hidden windows and flush-aware navigation waits.
