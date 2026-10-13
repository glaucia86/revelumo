# Independent review — partial #44

Base: `84e8362ca5baf00c9b7a13287b2b1e36cc105023`. Review inspected the actual staged/unstaged source and new files, rather than an empty HEAD comparison. Scope is the approved partial lifecycle/recovery design, not full completion of #44.

## Standards

No documented architecture/testing-boundary violation found. Initial observations: missing user-visible changelog entry and duplicated disposal sequence. The changelog now links the partial issue and disclaims a full memory budget; `disposeAttempt` centralizes payload/worker/queue/canvas retirement. A follow-up requested documentation of the new CI command; `docs-agents/ci.md` now records first/reopen, Windows CI scope, boundary fault injection and memory-measurement limits. No outstanding code finding.

## Spec

One P2 found: clicking retry during committed-export exit confirmation cleared the worker error before the parent accepted recovery; the parent refused that action, leaving no worker or recovery action after Stay. A real packaged export reproduced the failure in `export-exit-red.txt`. The error now clears only when an accepted request sets `previewLoading`. The same public sequence passes with the corrected code, followed by successful retry and Undo/Redo. Static follow-up approved the fix with no new product finding. Two English test selectors were corrected to the actual labels before the final GREEN.

## Validation boundary

Review was static and independent; runtime claims come from the recorded local gates and CI, not from review alone. The full resource budget, reduced-budget admission and near-limit repeated corpus remain outside this partial PR; #44 remains open.
