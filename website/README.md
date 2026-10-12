# Revelumo website

Static presentation and practical guide, English / Brazilian Portuguese / Spanish.

Requires Node.js 24; no website npm install or runtime service.

- `node --test website/test/site.test.mjs`: build and output-contract checks.
- `node website/build.mjs`: generate `website/dist/` at the `/revelumo/` project base.
- `node website/test/browser.mjs`: optional browser verification with an existing Chromium and Playwright installation. Set `PLAYWRIGHT_MODULE` to the local Playwright module; the default reflects the authoring environment. No packages are fetched by this script.

Serve the output under `/revelumo/`, not under an unconfigured root. Browser checks launch a temporary local server and close it afterwards.

All public copy is in `content.mjs`; the template in `render.mjs`; independently scoped site styles and enhancement live in `public/`. `build.mjs` copies the already-reviewed application screenshots and licensed local Geist font from the repository. Screenshot provenance is in `docs/assets/screenshots/README.md`; font license is copied into the output. No remote fonts, tracking, external model or network-dependent build.

The homepage before/after is an explicitly labeled original vector illustration with CSS brightness. It is not a photograph, application screenshot, exposure benchmark or demonstration of the application's processing engine. Real app captures are shown separately without modification. Public installers do not exist at this milestone; links lead to source instructions and actual release status.

Design tokens were imported and normalized by the real local OpenDesign importer and validated against its manifest schema offline. The implementation uses those color tokens while composing a distinct editorial layout with manual CSS. Original product assets remain under their existing licenses.

The website build job is read-only and separate from product CI. After explicit owner approval, a separate deploy job publishes only on main, after a successful build, using pages:write and id-token:write scoped to that job and the github-pages environment. Pull requests never upload a Pages artifact or deploy. Official actions are pinned to verified commit SHAs. No personal token, new secret or product-CI permission is used.
