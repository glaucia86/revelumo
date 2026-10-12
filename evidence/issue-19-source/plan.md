# Authenticated export-source preparation

Base: main `ab4c6965c63d68da512b32b144d487bc2735ea7c`. Issue #19 remains open. Coordinator approved the public seam before tests: main-only bounded readonly authenticated source snapshot; exact verified buffer passed to consumer; safe cancellation; no UI/crop integration.

Public seam: `readVerifiedExportSource({ path, sha256, maximumBytes, signal? })` returns caller-owned Buffer, or a typed error. It proves content identity of the returned bytes against an already recorded SHA-256, not current path identity forever. No catalog enrollment, filesystem write, renderer path, output publication or codec is included.

TDD: one behavior red/green at a time. Real temporary files and fixture hashes; filesystem injection only for deterministic OS read failures/races. Cover readonly bytes, mismatch, missing identity, missing/special files, budget, cancellation, source aliases, changing input and cleanup. Independent Standards/Spec review before final commit.

Existing `Library.readJpeg` is a bounded readonly helper used by selected-photo operations. Grade availability only stats and must remain unchanged. Review whether reuse can be extracted without a conflicting editor-localization change; do not silently add repeated hashing to grid. Integration must consume the returned bytes, not reopen the path, and must serialize jobs before allocation.
