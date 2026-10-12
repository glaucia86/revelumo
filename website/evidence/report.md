# Website verification — draft

Base: d2fba23 (current captures integrated). Product source and product CI unchanged.

## Verified locally
- Repository baseline and final core suite: 118/118, zero skipped.
- Website output suite: 6/6. TDD recorded for six routes, missing linked assets/styles, no-JS comparison fallback and distinct navigation landmarks.
- Static build: six localized home/guide pages; local screenshots and font; links and fragments resolve under /revelumo/.
- Existing documentation checker and git diff --check pass.
- OpenDesign local importer (source snapshot 0bd8251c9b5c0bed4b3aef87f53f9c1eadc493c7): manifest valid, 56/56 tokens source-backed, zero fallback tokens. Imported offline; no external model/API/key. Copied normalized tokens are used by website CSS.
- Engineering/accessibility review independently identified no-JS order/instructions and duplicate guide navigation landmark names. Both fixed with failing-then-passing regression tests.

## Pending gates
- Browser layout/keyboard/visual checks. Initial local Chromium launch could not create its socket in the command sandbox. The authorized escalation failed in the runtime before running the test. No browser-sandbox bypass is used. A supported cloud-browser route is being checked.
- Independent content review and exact PR-head CI.
- Pages deployment permissions and repository source setting. The new website workflow is read-only validation; it does not publish or change settings.

## Limits and attribution
No public installer or release is fabricated. Source-only trial, platform limits and absent RAW/HEIC/crop/export are stated. The illustrative vector comparison uses CSS brightness and never claims to exercise the Revelumo engine. Product screenshots and their photo credits are reused from docs/assets/screenshots/README.md; Geist SIL OFL is copied into output. No new photograph or private material is uploaded.
