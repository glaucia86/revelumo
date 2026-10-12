# Issue 12 CI strengthening: SPEC review

Scope: working-tree CI/provenance/documentation delta against `affd452e5030ab7067813741a052dfbe476a3bae`. Independent read-only review; no broad feature review or runner execution.

**No blocking SPEC findings identified.**

- Windows runs the existing real packaged Electron exposure harness after install, types, core tests and package. `first` retains numeric pixels, ICC/EXIF, accessibility, IPC, autosave, failure/retry/discard and application-quit assertions. No assertions were weakened or skipped in this delta.
- Persistence order matches the harness state contract: first leaves 2.3 EV; reopen confirms it; interrupt leaves the persisted 2.3 value while discarding the -2.5 draft; reopen confirms; discard-race preserves 2.3; reopen confirms; race writes 1.7; race-reopen confirms 1.7. Every mode is a separate Electron process using the same isolated catalog. Native process errors propagate immediately from the loop.
- Standard `windows-latest`/`ubuntu-latest` runners, read-only token permission, no artifact upload/cache action, and existing 25-minute job timeout remain. Exposure steps add explicit 3/5-minute bounds. The 36 MP benchmark is not invoked. Always-summary includes exposure outcomes and per-mode failure/results.
- Installation uses the existing lockfile/npm ci plus explicit install-electron. Electron is pinned 44.7.0. Runtime exposure needs only installed Electron and committed small JPEG/JSON fixtures, not Python/Pillow/LittleCMS. Fixture generator/reference versions agree at Pillow 12.3.0/LittleCMS 2.19. All ten committed exposure JPEGs contain generated profile copyright text “No copyright, use freely”; provenance accurately explains generated sRGB/synthetic P3 and original geometric pixels. Maximum committed fixture is 1,832 bytes.

**Remaining gate:** actual fresh GitHub Windows runner on the new committed SHA must pass before claiming portability/CI green; this review does not substitute local tests for that gate. Commit/push/CI and no-merge handling remain with controller.

Non-blocking evidence limitation: three `reopen` invocations share `reopen-result.json`, so the summary retains the last successful reopen report. Separate step logs and immediate exit-on-error preserve failures and sequence visibility; no acceptance check is omitted.
