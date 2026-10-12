# First visible JPEG export — issue #19

2026-10-12. Base cb691b1 (PR46); product review checkpoint92c0099. The editor now exports one confirmed full-frame v2 exposure/WB revision through the previously verified original-resolution JPEG circuit. No crop support, batch export, new dependency, version bump, tag, installer or release.

## Behavior

“Export JPEG” finishes the gesture, leaves temporary comparison, confirms pending history/autosave, and waits for the exact current preview request. The main process validates session/revision, selects a destination and authenticates the original again. Renderer requests never supply paths, hashes, recipes or byte quotas. The native save dialog suggests a new name; it cannot authorize replacement. The writer protects originals and userData (catalog, SQLite auxiliaries, cache/preferences), and exclusively publishes the new JPEG.

Fixed settings: original resolution, quality90, sRGB, applied orientation, selected Unicode EXIF/XMP/IPTC authorship/copyright and removal of GPS metadata. This is not anonymization of credits/pixels. Input limit32 MiB/40 MP is inherited from the engine. Output32 MiB is an explicit operational limit of this version: larger results fail without quality/resolution reduction. It is not a guarantee for every40 MP JPEG.

One job is bound to the exact webContents/main frame, renderer generation, edit session/revision and UUID attempt. Job IDs remain main-generated. The attempt UUID only correlates a request; it grants no filesystem authority. Read-only recovery finds that same attempt after a lost acknowledgement, never restarts publication or substitutes an older success. Active duplicate starts are BUSY; the retained completed attempt returns its same receipt. Retention is bounded to the latest main job.

Cancel/navigation/close wait for actual completion. Once publication is submitted, success may win cancellation and is shown before leaving. Transient IPC rejection releases adjustment controls but retains the known job and offers “Check export result”; leaving reconciles it. Renderer crash/reload cancels its generation, and a dead renderer cannot indefinitely block the normal window-close cleanup path. Abrupt main-process termination is not journaled transactionally: an explicitly unknown outcome tells the user to check the chosen destination and never deletes a possibly published file.

## Executed verification

- **290 Node tests passed**, zero failures/skips locally; typecheck, documentation checks and Linux package passed.
- Actual packaged editor→main→engine→credits→exclusive writer produced the expected40×80/2,000-byte JPEG. [Independent reopen](independent-reopen.json) validates EV−1, temperature/tint100, oriented pixels (1,536 checks, max RGB error4/8), sRGB ICC, exact Unicode credits and no old GPS. Original identity/hash and catalog/history content remain unchanged after the confirmed edit save.
- [Packaged scenario result](result.json): save failure/retry; delayed acknowledgement; comparison exit; held native destination; keyboard cancel; language change while active; collision; accepted/unaccepted start acknowledgement loss; status rejection with navigation and held committed link; cancel rejection with native close; renderer crash and cleanup.
- [Review and TDD summary](review.md). Independent Standards and Spec reviews approved after the IPC lifecycle findings were fixed and rechecked.
- Viewport explicitly asserted760×540. No horizontal document overflow; Tab reaches Cancel inside the scroll region, focus is visible and Enter cancels. PT-BR/EN/ES success/active/error screens remain readable. Parent reviewed and approved the final three-language layout before publication.

## Screenshots

[English success](export-en-760.png) · [Português success](export-pt-BR-760.png) · [Español success](export-es-760.png) · [Português active/cancel](choosing-pt-BR-760.png) · [Español collision](collision-es-760.png) · [Keyboard focus](cancel-keyboard-en-760.png).

## Reproduce and limits

`npm ci && npm run install:electron`, `npm test`, `npm run typecheck`, `npm run check:docs`, `npm run package`; in a graphical session, `npm run test:jpeg-export-ui -- <fresh directory>`. Independently inspect output with `python3 test/verify-jpeg-export-circuit.py <run>/source.jpg <run>/published.jpg test/fixtures/export/circuit-expected.json` (Pillow/LittleCMS laboratory tooling, not product dependencies).

Automation replaces native dialogs and adapts external IPC/FS fault timing. Deliberately injected errors and the intentional renderer crash print diagnostics even when assertions pass. Local cloud Linux ran the real packaged renderer; Windows packaged runtime is gated by the existing CI job. Native Windows dialogs, physical keyboard/screen reader, macOS and installers were not validated. CI outcomes belong to the PR's actual immutable runs.

The complete-circuit resource measurement remains the [PR46 measurement](../issue-19-circuit/report.md), not a new UI-concurrent benchmark: one40 MP case took1.30 s with aggregate sampled working sets about1,017 MiB. That is not private RAM, and main memory had not returned to baseline100 ms later. UI integration does not establish8 GB support or make this workload lightweight. Same-UID/TOCTOU and power-loss durability limitations of the reviewed writer remain unchanged.
