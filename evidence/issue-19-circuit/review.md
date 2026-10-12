# Review and TDD record

Base214a4d6; selected legacy modules came from e40ff70, independently re-evaluated before integration. Original contracts/limitations were preserved; old project manifests/docs were not cherry-picked.

## RED→GREEN vertical slices

| Behavior | Observed RED | GREEN |
| --- | --- | --- |
| Writer reuse at public seam | Missing export-file module | New-file success, then30 retained regressions |
| Metadata reuse | Missing export-metadata module |39 original metadata tests |
| Authenticated circuit success | Missing circuit module | Credits published; original unchanged |
| Pre-I/O validation | Codec ran for unsupported crop | Paths/recipe/quota rejected before open |
| Single-flight before source allocation | Second call stalled instead of BUSY | BUSY with one original read; retry succeeds |
| Caller mutation | Changed quota caused OUTPUT_TOO_LARGE | Request/recipe/path arrays captured |
| Codec geometry validation | Incorrect reported dimensions published | INVALID_OUTPUT; actual SOF checked |
| Abort after codec | Metadata quota error masked cancellation | CANCELED before assembly/publication |
| Missing XMP copyright language | Public metadata function accepted missing/empty xml:lang | Fail closed for absent, empty or whitespace-only qualifiers; 87 focused tests |
| Real packaged circuit | Service module absent from app.asar | Actual native pipeline published40×80/2000B |

Further regression checks exercise unchanged existing behavior: authenticated mismatch/retry, source-path substitution with snapshot provenance, metadata expansion, gate through commit, late-abort success, cleanupPending, original/hardlink identity, competing publishers, write/sync/link failures and Unicode NFC protection. Public native-codec and filesystem boundaries are substituted only for deterministic failure/race tests; real packaged tests use the actual engine/FS/metadata/writer.

Independent Standards review found a P2 ambiguity: missing XMP copyright language was synthesized as x-default. A behavioral RED reproduced acceptance; the fix rejects absent/empty/whitespace-only language instead of inventing it. Standards also requested correction of a stale fixture-evidence reference; corrected. Spec found no functional/scope defect and requested final evidence consolidation. Standards focused recheck approved the fix, provenance and 87 re-executed tests. Final packaged circuit and independent reopen passed after the correction. Spec focused recheck approved the final evidence and independently recalculated the memory samples; its 87 focused tests also passed. Final local suite: 273 passed; focused writer/metadata/circuit: 87 passed. CI status is reported by the PR's actual runs, not predicted here.

Initial PR CI run38309549700 passed Ubuntu but exposed a Windows-only test setup error: moving a staging directory while its file handle was still open raised EPERM. The adversarial directory-substitution test now performs the same substitution after handle close and immediately before cleanup identity verification. Assertions remain intact; no platform skip or product change was added. Windows GREEN must be established by the subsequent PR run.
