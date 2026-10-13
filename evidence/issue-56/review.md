# Independent reviews — issue 56

Base: `5ca817fee87e15c35d172bd61bb56be3f9c2b1de`. Reviewers inspected the nonempty staged WIP against that base, not an empty three-dot diff. Scope: evidence and observer tests only; src, dependencies and CI unchanged.

## Method and count review

An independent reviewer reconciled main allocations/authentication, worker constructions/readbacks and transferred replies against the real code and all six raw runs. The initial pre-exit snapshot omitted the final render; snapshots at every actual send corrected it. The aggregate now explicitly checks ready/pixel snapshots against received replies and three pixel snapshots per visit. No remaining undercount was found in the exercised paths; counters are not universal allocation accounting.

## Standards

One P2 provenance finding: an earlier reproduction harness wrote the baseline SHA as a constant regardless of the package supplied. Fixed: it records checkoutSha and packageSourceVerified:false, and the report distinguishes checkout identity/package hash from independently verified source-to-package provenance. The historical baseline followed an observed fresh package build. Review also requested unique run directories; launcher now uses mktemp and harness rejects nonempty profiles.

Final staged re-review: no blockers. python3 launcher and explicit aggregation failure/retry are disclosed; scope remains evidence/tests with no product edits. Raw terminal log whitespace is retained intentionally.

## Spec

Independent review accepted the bounded investigation and conservative decision, with no product cache/pool and no inference from cumulative traffic to peak/RSS. Corrections requested: portable paths, verification of distributed runs without a local absolute pointer, declaration of forced language/hidden-window adapters, and alignment of included logs with the report. All were addressed. The observer tests enter the existing Node suite; #44/#55 remain separate and open, with explicit criteria to revisit this negative decision.

CI on the final published SHA and post-merge CI remain separate gates; these reviews are not a substitute for either gate.
