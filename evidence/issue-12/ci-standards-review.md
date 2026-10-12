# CI Standards review — issue 12

Scope: effective working-tree change against `affd452` in `.github/workflows/ci.yml`, `docs-agents/ci.md`, `evidence/issue-12/report.md`, and new `test/fixtures/exposure-provenance.md`. Existing harness entry point and process exit behavior were inspected only to verify the new CI calls. No product re-review; no edits except this report.

**Documented standards:** no breach found. The addition preserves the `docs-agents/ci.md` rules: standard Windows/Ubuntu runners, pinned official actions, `contents: read`, checkout without persisted credentials, no persistent cache or artifact upload, and a 25-minute job timeout. Exposure remains Windows-only and the 36 MP benchmark remains manual.

**Failure propagation and lifecycle:** the fresh GUID-named smoke root gives exposure a separate catalog. `first` creates that catalog; subsequent separate Electron processes intentionally reuse it to check recovery. The seven-mode sequence matches the harness's persisted-value expectations. Each loop invocation immediately checks `$LASTEXITCODE` and exits on failure; the single-command first step propagates npm's exit code. Harness fatal paths exit 1 and normal/interruption completion exits 0. Step timeouts bound first to 3 minutes and the persistence sequence to 5 minutes. `if: always()` reports both new step outcomes and available result/failure files. As already documented, job cancellation/timeout can prevent summary completion; logs retain the diagnosis.

**Fixture/documentation review:** provenance records synthetic pixels, generated profiles, tool versions and fixture-only tooling. CI consumes checked-in bytes through installed Electron; no Python/Pillow dependency or fixture download is introduced. The LittleCMS evidence correction is consistent with the new provenance. Platform, physical-input and visual QA limits remain explicit.

**Smell baseline:** no actionable new heuristic finding in this bounded change. Reusing one sequential mode list is appropriate because the tests deliberately share persisted state.

**Outcome:** 0 documented-standard breaches, 0 blocking findings, 0 optional smell findings. Static independent review only; no claim that a GitHub-hosted run has passed and no independent harness rerun performed.
