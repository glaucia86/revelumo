# Alpha source preparation implementation plan

**Goal:** prepare `0.1.0-alpha.1` source-only candidate from integrated PR #47, without a tag or GitHub Release.
**Spec:** [versioning procedure](../versioning.md). Base: `aa77bb8af6f865167f2e62f66cb1c76d57e9cf23`.
**Architecture:** metadata and documentation only. Product behavior, catalog schema v7, processingVersion 2, dependency graph and CI permissions stay unchanged.

## One bounded delivery

- [x] Confirm integrated base and create a separate worktree; existing 290 Node tests pass.
- [x] Observe candidate-version assertion fail against all three `0.0.1` fields.
- [x] Change only the three version fields; move integrated changelog entries to a clearly unpublished candidate section, retaining Unreleased.
- [x] Reconcile versioning/CI docs and prepare source-only notes with actual scope, provenance and platform/resource limitations.
- [x] Verify version equality, unchanged lockfile dependency graph, docs, tests, types and package. Runtime export UI verification belongs to the existing Windows CI gate of the preparation PR; no new local graphical run or 40 MP benchmark claimed.
- [x] Obtain independent Standards and Spec review and fix findings; base CI is green.
- [ ] Publish draft preparation PR and observe its exact-head CI; record URL/results in the PR. Tag/Release remain outside this task.

## Review focus

No release date/URL or final integrated SHA may be fabricated. Existing historical reports keep their own revisions. New preparation needs its own PR/final-main checks. No crop, installer, signature, platform-support or lightweight-memory claims. Tag and release publication are separate later actions, not effects of this PR.
