# Third-party notices and asset rights

Revelumo's original source code and original written documentation are covered by the root [MIT license](LICENSE), copyright 2026 Glaucia Lemos. The license text follows the [Open Source Initiative MIT text](https://opensource.org/license/mit).

Third-party software, copied documentation, photographs, portraits, logos, fonts, and other assets retain their own rights and notices. The project's MIT license does not relicense those materials or grant trademark, publicity, or portrait rights. Do not assume that a public URL or a file's presence in this repository authorizes reuse.

## Included engineering skills

The files under `.agents/skills/implement/`, `.agents/skills/tdd/`, and `.agents/skills/code-review/` come from [Matt Pocock's skills repository](https://github.com/mattpocock/skills), revision `49dd158d1076134a641b33efb035946536778336`.

Their original **MIT license, copyright 2026 Matt Pocock**, remains in [mattpocock-skills-LICENSE.txt](docs-agents/mattpocock-skills-LICENSE.txt). The [provenance manifest](docs-agents/mattpocock-skills-provenance.json) records file origins and hashes. The root copyright notice does not replace that notice.

## npm dependencies and the Electron runtime

The [package manifest](package.json) and [lockfile](package-lock.json) identify the dependencies used by the project. Direct-package metadata in the checked-in lockfile records:

| Package | Declared license |
| --- | --- |
| React and React DOM | MIT |
| `@xmldom/xmldom` 0.9.12 | MIT; [original notice](public/licenses/xmldom-MIT.txt), included in the packaged app |
| Electron and Electron Forge packages | MIT |
| Vite | MIT |
| TypeScript | Apache-2.0 |
| `@types/node`, `@types/react`, `@types/react-dom` | MIT |

These entries describe the direct npm packages, not every component bundled with them. Electron includes Chromium, Node.js, and further third-party components with their own notices. Transitive dependencies also retain their own licenses. Preserve the license and notice files supplied with dependencies and generated application bundles, including Electron's license and Chromium notices; do not replace them with the project's LICENSE.

This document is a source-repository inventory, not a complete distribution license audit. Before publishing an installer or redistributing a new engine, review the actual final bundle and include all required notices and source offers. `private: true` in package.json prevents accidental npm publication and does not change the public repository's MIT license.

## Images, screenshots, and fonts

- `docs/assets/revelumo-cover.jpg` is an existing conceptual cover with generated demonstration images. It is not an application screenshot. Its presence does not constitute a separate grant to reuse it under MIT.
- Existing screenshots under `evidence/` document application test milestones, generally with synthetic fixtures. They are evidence of those specific builds, not a promise of the current UI or a separate asset license.
- The [current README application screenshots](docs/assets/screenshots/README.md) include eight credited Pexels demonstration photographs. Their sources and Pexels License are recorded with the capture/build details; those photographs are not relicensed under MIT, and no endorsement is implied. Original JPEGs are not added by this documentation update.
- The creator portrait in the READMEs is linked from Glaucia Lemos's existing GitHub avatar. It is not downloaded into this repository or relicensed by the code license. Profile links and badges do not grant rights to names, likenesses, or third-party logos.
- The Cobre catalog bundles the local Geist Latin variable font (`src/renderer/theme/fonts/geist-latin.woff2`), copyright 2024 The Geist Project Authors, from the [Geist font project](https://github.com/vercel/geist-font). Its **SIL Open Font License 1.1** and copyright notice are preserved in [Geist-OFL.txt](public/licenses/Geist-OFL.txt), copied into the packaged application by Vite. The font is not relicensed under MIT. Other font-family entries use system fallbacks; no CDN request is made. The catalog outline icons and optical mark are original local artwork.
- The synthetic exposure JPEGs and ICC profiles have their own [generation and provenance record](test/fixtures/exposure-provenance.md). That record distinguishes original test pixels from fixture-generation tools and documents the retained ICC copyright tag. The [relative white-balance fixtures](test/fixtures/jpeg-adjustments-provenance.md) additionally record their independent numerical reference and reuse of the exposure fixtures. No personal photograph is needed for these tests.

When adding an image or fixture, record its creator/source, permission or license, modifications, and any required attribution. Obtain permission before publishing personal photos or data such as GPS coordinates, faces, catalog contents, or file paths.

## RAW investigation

[RawTherapee was tested in an isolated experiment](evidence/rawtherapee-cli-windows/report.md). Its engine has not been integrated into Revelumo or added as a product dependency. The experiment does not approve redistribution or establish license compatibility for a future integration.

RawTherapee's own GPL terms and third-party notices remain applicable to that software. Adopting MIT for Revelumo does not relicense RawTherapee or remove the need to evaluate a future engine integration separately. The experimental RAW sample and generated profiles are described in the experiment's provenance; those external binaries and photographs are not included as product dependencies here.

## Corrections

If attribution or permission information is missing, use [SUPPORT.md](SUPPORT.md) to contact the project with a source reference. Do not publish private material in a public issue. [CONTRIBUTING.md](CONTRIBUTING.md) explains what to include when proposing new third-party material.
