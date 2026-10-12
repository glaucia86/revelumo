# JPEG export circuit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Demonstrate authenticated source-to-new-JPEG publication with preserved selected credits and removed GPS, without UI/crop.
**Architecture:** Serial main-only coordinator over existing snapshot/native-codec/metadata/writer seams. Reuse reviewed legacy modules; verify final output independently.
**Tech Stack:** Node24/Electron44.7.0/TypeScript; exact MIT @xmldom/xmldom0.9.12 promoted from existing lockfile.
**Spec:** `docs-agents/jpeg-export-circuit-design.md`, approved2026-10-12. Native TDD, independent Standards/Spec review.

## Global constraints

Base214a4d6; no UI/crop/recipe/schema or unsafe publication fallback. Source≤32MiB/40MP; exact full-frame v2 recipe; explicit positive output quota. Preserve after-link success despite late abort. No source reopening for metadata. Publication evidence uses small tree batches/SHA refs and exact final-tree comparison.

## Review focus

- Caller mutation and overlap cannot allocate/read a second source or change recipe/destination after submission.
- Aliases/concurrent final-name creation preserve originals and existing destinations by identity/hash.
- Metadata expansion/unknown encoding/XML abuse fail before staging; no silent loss or GPS copying.
- Cancel/failure distinguishes precommit no-output from committed success+cleanupPending.
- Engine result dimensions agree with JPEG SOF; final independent reopen verifies ICC, pixels, Unicode and GPS; full-circuit RAM includes compressed copies.

### Task1: Reuse validated metadata/publication seams

Files: `src/main/{export-file,export-metadata,xmp-credits,iptc-credits}.ts`; original focused tests and synthetic fixtures under `test/fixtures/export`; package manifest/lock; `public/licenses/xmldom-MIT.txt`; THIRD_PARTY_NOTICES.
- [x] Port one public writer success test, observe missing-module RED; selectively port reviewed writer, run GREEN. Retain remaining original writer regressions, reconcile Windows symlink privilege skips explicitly.
- [x] Port original metadata tests/fixtures, observe missing-module RED; selectively port the three reviewed metadata modules. Promote exact runtime dependency/notice with unchanged integrity; GREEN focused tests/typecheck.
- [x] Verify npm lock/audit and actual packaged MIT notice later with Task3. Do not copy obsolete license/project documentation.

### Task2: Serial authenticated coordinator

Files: `src/main/jpeg-export-circuit.ts`, `src/main/jpeg-export-service.ts`, `test/jpeg-export-circuit.test.ts`; service independent Forge entry.
Interfaces: `createJpegExporter(encode, filesystem?)` returns `exportJpeg(request, signal?)`; request/result exactly as spec. Production service wires existing `encodeJpegSnapshot`; no application call site.
- [x] Write one authenticated-success integration test using real FS/metadata/writer and controlled native-codec boundary; run RED, implement minimal pipeline, GREEN.
- [x] One test/cycle each: invalid absolute paths/budget/recipe before I/O; mismatch/no output; private request mutation; BUSY before read; source path changed after snapshot without metadata reopen; encoded geometry mismatch; credits-over-quota; cancellation at boundaries.
- [x] Add normal alias/collision publication tests and FS-boundary faults for write/sync/link/cleanup. Pin late-abort success and cleanupPending propagation. Retain same-UID/durability limitations.
- [x] Typecheck/focused suite; commit coherent coordinator.

### Task3: Packaged end-to-end evidence and review

Files: `test/electron-jpeg-export-circuit.cjs`, independent Python verifier, focused synthetic-credit fixture helper/provenance, evidence summary, npm script and existing Windows CI gate, implementation status/changelog.
- [x] Real packaged source→engine→credits→writer output with Unicode EXIF/XMP/IPTC, GPS, orientation and WB/EV; require result/disk header agreement, original/aliases identity+hash unchanged, exclusive collision and failed-auth no output.
- [x] Independently reopen final files using Pillow/LittleCMS/XML/IPTC parsing; confirm selected credits, no GPS, fresh sRGB ICC and expected oriented pixels/dimensions. Verify notice included in app.asar.
- [x] Measure one existing40MP noise full circuit, sampling/process baseline/final/duration/input/output/byte-copy costs; no repeated broad engine corpus. Save compact sufficient evidence.
- [x] Full suite/typecheck/docs/package/real harness; independent Standards/Spec reviews and focused RED/GREEN findings.
- [ ] Publish draft, CI/merge/postmerge; issue19 stays open. Remote completion is recorded by the PR and workflow runs.
