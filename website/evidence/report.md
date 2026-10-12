# Website verification — draft

Base: d2fba23 (current captures integrated). Product source and product CI unchanged.

## Verified locally
- Repository baseline and final core suite: 118/118, zero skipped.
- Website output suite: 7/7. TDD recorded for six routes, missing linked assets/styles, no-JS comparison fallback and distinct navigation landmarks.
- Static build: six localized home/guide pages; local screenshots and font; links and fragments resolve under /revelumo/.
- Existing documentation checker and git diff --check pass.
- OpenDesign local importer (source snapshot 0bd8251c9b5c0bed4b3aef87f53f9c1eadc493c7): manifest valid, 56/56 tokens source-backed, zero fallback tokens. Imported offline; no external model/API/key. Copied normalized tokens are used by website CSS.
- Engineering/accessibility review independently identified no-JS order/instructions and duplicate guide navigation landmark names. Both fixed with failing-then-passing regression tests.

## Pending gates
- Full automated browser matrix remains unexecuted: the local command-sandbox launcher could not create its socket; an authorized escalation failed before execution. This did not block supported cloud-browser inspection (below). No browser-sandbox bypass was used.
- Exact PR-head CI.
- Pages deployment permissions and repository source setting. The new website workflow is read-only validation; it does not publish or change settings.

## Limits and attribution
No public installer or release is fabricated. Source-only trial, platform limits and absent RAW/HEIC/crop/export are stated. The illustrative vector comparison uses CSS brightness and never claims to exercise the Revelumo engine. Product screenshots and their photo credits are reused from docs/assets/screenshots/README.md; Geist SIL OFL is copied into output. No new photograph or private material is uploaded.

## Supported cloud-browser checks
The existing cloud Chromium opened a loopback-only server exposing website/dist under /revelumo/. Desktop at 1180×757: actual assets loaded, no horizontal overflow, home and download sections inspected. The native range responded to ArrowRight (50→51 and --split 51%). EN guide → ES retained the guide route; landmarks were distinctly localized.

A temporary QA-only page rendered real 320px EN/ES and 390px PT-BR guide iframes: all had scrollWidth equal to clientWidth (305px / 375px after scrollbars). EN/ES guide links also preserved fit. A script-disabled frame showed two stacked comparison images and localized order text. This is narrow-viewport browser verification, not physical-mobile hardware testing.

Short hover/focus and entrance effects remain. Native anchor scrolling is immediate after the observed smooth-scroll behavior made automated section positioning nondeterministic. Reduced motion is enforced by CSS and covered by the source contract; runtime OS preference emulation was not available through the supported browser API. Measured key color pairs are in contrast.json; this is not full WCAG certification or a screen-reader audit.

Independent content review corrected the overbroad redo statement: only a new exposure change discards redo; white-balance edits preserve it. Added the specified SQLite mention and locale-specific links to complete source setup. Regression passed RED→GREEN.
