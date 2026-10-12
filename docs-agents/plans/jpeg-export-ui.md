# Visible JPEG export implementation plan

> For agentic workers: use superpowers:executing-plans task-by-task, with independent Standards/Spec reviews before publication.

**Goal:** Export the currently confirmed editor revision to a safe new JPEG through the existing full-resolution circuit.
**Architecture:** Main-owned serial job and native destination, strict ID-only IPC with a UUID attempt correlation token, editor autosave barrier and bounded retained terminal state.
**Tech stack:** Existing Electron/React/TypeScript/SQLite only.
**Spec:** ../jpeg-export-ui-design.md

## Constraints and review focus

32 MiB input/output operational limits,40MP input; quality90/sRGB/full resolution. No new dependency/crop change. Never claim cancellation after actual publication. Main-only paths/hash/recipe; exact process/frame/session. Review stale async completion, swallowed cleanup errors, user edits during save, unmount/close and misleading success/language text.

### 1. Authorized main job and recipe snapshot

Files: shared/jpeg-export-request.ts and contract; main/jpeg-export-job.ts; Library.captureExport; test/jpeg-export-job.test.ts and library-export.test.ts.
- [x] Write public parser+snapshot success RED, implement exact session/revision capture from real catalog, GREEN.
- [x] Pin stale revisions/sessions, unsupported recipes and known-original references without source reads; GREEN.
- [x] Write controller start/status/cancel RED using external destination/codec seams; implement immutable input, main jobId, serial ownership and output quota constant; GREEN.
- [x] One cycle each: canceled/throwing dialog, BUSY, codec/output errors, late commit success, cleanupPending, owner loss, stale job IDs and terminal result retention; lost start/status acknowledgement recovery is query-only and cannot reuse another attempt receipt. Full focused/typecheck; commit.

### 2. IPC bridge and visible editor barrier

Files: main/jpeg-export-ipc.ts,index.ts; preload.ts; shared/contracts.ts; renderer/ExposureEditor.tsx, export hook/component; i18n messages/dictionaries; renderer styling.
- [x] RED trusted owner/frame/session checks and IDs-only payload; wire main dialog/userData protection and actual circuit; GREEN.
- [x] Packaged UI RED missing export action; implement finish-gesture/history/save barrier, synchronous freeze guard and exact confirmed revision start; GREEN.
- [x] Cycle through save failure/retry, duplicate click, navigation/close cancel+join, status polling and terminal unlock. Keep descriptor-based states across language changes; no internal mocks.
- [x] Add PT-BR/EN/ES action/status/error/32 MiB limit strings and placeholders; dictionary contracts pass. Commit coherent visible flow.

### 3. Packaged evidence and independent review

Files: test/electron-jpeg-export-ui.cjs, fixture/oracle reuse, docs/evidence, CI and npm script.
- [x] Real UI export with EV/WB/orientation and independent reopen; original aliases and catalog intact. Validate collisions, cancellation/failure, stale/restarted owner and close commit race.
- [x] At760×540 verify keyboard focus and observable active/error/success in three languages; capture final screens and send parent before merge.
- [x] Full tests/typecheck/docs/package, local native harness and independent Standards/Spec review. Fix findings RED→GREEN, recheck focused.
- [ ] Publish draft using small tree batches, await actual CI, parent visual review, head-pinned merge and postmerge. Related to #19 only; completion status decided from delivered acceptance, never automatic closing phrase.
