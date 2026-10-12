# Revelumo website: Copper / photography-first

Design proposal for approval, not a published website or a new product feature.

## Purpose
Introduce the independent local desktop JPEG editor to photography hobbyists and enthusiasts, explain what works today, and help developers try the source. English is the primary website language, with complete Brazilian Portuguese and Spanish pages. The desktop app currently speaks Portuguese; website translations do not imply app localization.

## Visual direction
A neutral charcoal canvas, restrained copper accents (#efb28a), generous whitespace, large sans-serif headlines and a real product capture. Typography is a self-hosted or system sans, with no remote font requests. The approved Copper color direction is retained; the Revelumo wordmark is plain text while logo proposals remain unapproved. No gradients, stock-photo wallpaper, invented testimonials, download counts or fake app interactions.

Home: compact navigation, language selector, left-aligned photographic manifesto, source and guide calls to action, broad real application screenshot, editorial rows explaining import/rate/edit, explicit development/download status, roadmap and MIT/footer links. Screenshot is dated and tied to its source commit. A current PR screenshot must remain marked development branch until merged.

Guide: consistent navigation, chapter list, large numbered steps, source setup, Portuguese app labels with translated explanations, screenshot details where helpful, and a prominent limitations section. On phones, navigation wraps, language links remain available, chapters become a disclosure, and the content is one column without horizontal overflow.

## Content contract
Present JPEG import by reference, local SQLite catalog, thumbnails, stars/flags/filters, EV editing, relative white balance, saved recipes, exposure-only undo/redo and reopening. Explain 32 MiB / 40 MP JPEG input limits, 2048-pixel editing derivatives, preserved originals, catalog-not-backup and no RAW/HEIC or public installers yet. Crop/export remain future work until separately merged and verified. No Rust implementation claim. No browser editor or installer download CTA. Link the actual repository source instructions, Wiki, issue-backed Roadmap and Releases page labeled release status.

## Architecture and publication
Static generated HTML/CSS, minimal JavaScript only if needed; separate website/ source/build/tests. EN at /revelumo/, PT-BR and ES beneath language paths, each with home and guide; native language links preserve page type. Every page works without JavaScript. Relative assets or base-aware URLs. No backend, account, tracking, third-party form or external model. The app and existing product CI stay unchanged. A dedicated path-filtered GitHub Pages workflow validates and builds before deploying main; PRs only build. Pages setup is checked separately through an authorized route, with no new credentials.

## Verification and acceptance
TDD at public output boundaries: all locale/page routes exist; correct html lang/hreflang/canonical; no broken internal links or missing local assets; complete translated required content and truthful release status; deterministic build at /revelumo/. Browser checks at phone and desktop widths, keyboard navigation, visible focus, reading order, contrast, reduced motion, zoom and no horizontal overflow. Two independent reviews cover content/spec and engineering/accessibility; findings are fixed before publication. CI must be green on exact head. Verify the deployed URL and language/guide navigation after publication.

## Decision requested
Approve this website direction and structure, or request changes. After approval, produce the implementation plan for review and choose execution before production implementation. This proposal does not publish or alter the product.

## Revision: platform-aware distribution and clearer roadmap
The owner referenced the official LightCraft and PhotoCraft sites. Confirmed the links through their GitHub READMEs on 2026-10-12: https://getartcraft.com/apps/lightcraft and https://getartcraft.com/apps/photocraft . Both separate the product introduction, real screenshots, distribution options and source instructions. The useful reference is that information hierarchy, not their identity, artwork, feature claims, Rust architecture or launcher ecosystem.

Revelumo will include a visible Downloads entry and a Get Revelumo section with separate Windows, macOS and Linux information rows. Each currently says the installer is not published, links to source instructions and discloses platform-validation status. Do not render disabled or clickable fake installer buttons. Future assets can appear only after an actual public release with verified platform/architecture, filename, version, checksum and release notes; no filenames or support promises are invented now. Source setup remains Git and Node.js 24. The visible roadmap groups verified current behavior, work in development and unavailable capabilities, linking to the existing Wiki/issue tracker rather than showing guessed percentages or delivery dates. All sections and navigation labels are fully localized in EN/PT-BR/ES. Homepage and guide shown side by side in the design board are examples of two languages, not mixed-language production pages.

The revised proposal is a generated design board, not a browser screenshot or functional website. Its only application image is the real Cobre catalog screenshot captured from the packaged application, integrated by main fbc46631502c9b00f8d667abf4f98491e6ad289a; third-party demo photograph provenance is maintained in the project evidence. No reference-site images or logos were reused.

## Approved refinement: 12 October 2026
The owner approved the proposal and requested a more modern, distinct result with special effects rather than similarity to LightCraft. Preserve the approved page structure and Cobre direction, but use an original asymmetric editorial hero, geometric light motif, hover/focus cards and short entrance transitions. Honor reduced motion. The before/after module is an explicitly labeled original vector light study rendered with CSS brightness; it is not the product image engine or an application screenshot. No autoplay, flashing, heavy animation framework or network request. Actual application screenshots remain unmodified and separately captioned.
