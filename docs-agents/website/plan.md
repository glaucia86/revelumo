# Revelumo website implementation plan

Goal: ship the approved Copper presentation and guide in EN/PT-BR/ES, with original restrained interactions.
Architecture: dependency-free Node static generator produces six HTML pages and local assets; native language navigation works without JavaScript. Website build and checks are independent of the desktop application. GitHub Pages /revelumo/ is the requested destination.
Spec: design.md; approved visual refined with subtle hover/focus, entrance transitions and an explicitly illustrative before/after comparison. No product engine claim.

## Global constraints
- Node 24. No new production dependencies, telemetry, accounts, external model, fonts or APIs.
- Existing app/product workflow unchanged. Root tests still run.
- Public installers unavailable; show source instructions and truthful platform status.
- English primary, complete PT-BR/ES; app labels remain in Portuguese with explanations.
- Reduced motion, keyboard operation, contrast and mobile layouts required.
- Publication permissions require separate review; draft PR first.

## Review focus
1. Deep language links preserve home/guide context and /revelumo/ base.
2. JavaScript disabled or storage unavailable leaves content/links usable.
3. Long translated text at 320px/zoom does not overflow.
4. Slider works from keyboard and is explicitly illustrative in all locales.
5. Release claims do not outpace actual main implementation.

## Task 1: Static localized routes
Files: website/build.mjs, website/content.mjs, website/render.mjs, website/test/site.test.mjs.
Interface: build({outDir,basePath}) produces index.html, guide/index.html, pt-BR equivalents and es equivalents; render uses locale content objects.
- [x] Test generated six routes and lang; watch failure before generator exists.
- [x] Implement minimal generator and localized content; green.
- [x] Test internal links/assets, hreflang and base paths; RED → GREEN.

## Task 2: Original Copper visual and interactions
Files: website/public/style.css, website/public/site.js; renderer markup.
Interface: native labeled range changes --split inside a comparison; content visible without script. Initial comparison is a labeled photographic illustration using CSS brightness, not a claim about the app engine.
- [x] Test semantic markup and comparison labeling; RED → GREEN.
- [x] Add responsive styling, local font, focus/hover and reduced motion.
- [ ] Browser tests for locales/links, slider keyboard, no-JS, reduced motion, 320px and desktop; save results and inspect screenshots.

## Task 3: Independent verification and draft PR
Files: .github/workflows/website.yml, website/README.md, website/evidence/report.md.
- [x] Site validation build on PR/push paths, contents:read only. Deployment stays separate until reviewed permission scope.
- [x] Run site suite/build, repository npm test/check:docs and git diff --check.
- [x] Independent spec/content and engineering/accessibility reviews; fix findings with regression tests.
- [x] Publish exact text sources to feature branch via connector and open draft PR; observe CI.
- [ ] After deployment authorization/gates, verify public URLs and localization.
