# Real application screenshots

These images document the working Revelumo application on Linux, not a design mockup or a public installer. They accompany the [English](../../../README.md), [Brazilian Portuguese](../../../README.pt-BR.md), and [Spanish](../../../README.es.md) READMEs.

## Build and capture

- Application source: [Cobre catalog PR #33](https://github.com/glaucia86/revelumo/pull/33), head `906c2a54f9b81272667e518c3c449d14e78b0efe`, integrated as `fbc46631502c9b00f8d667abf4f98491e6ad289a`.
- The head and merge have the same application/runtime source. The screenshots use the existing packaged Linux x64 application, Electron 44.7.0; no separate mock UI is involved.
- Packaged `app.asar` SHA-256: `7e4268567064926256e17f4165ccbd4b87a1eeda3bc39fcaa9def053da0f68fb`.
- Eight licensed JPEGs were imported into an isolated local catalog. The file-selection boundary is automated; this does not validate the native file dialog. Thumbnails, preview, controls, IPC, and catalog belong to the actual application.
- The catalog uses the integrated Cobre design. The editor shows its existing exposure/relative-white-balance controls; its full Cobre redesign is still planned. This does not claim RAW, cropping, export, an app-language selector, or installer availability.
- No personal photo, private catalog, credential, or personal filesystem path is shown. The files are application captures without image compositing or post-processing.

Captured and visually inspected on 2026-10-12. Both files come from the same run, with the original JPEG hashes unchanged. The editor shows `02_lagoa_e_horizonte.jpg` by Vivi Pascar at 0 EV and neutral temperature/tint. The window was hidden; content was captured directly through Electron `capturePage` after fonts, thumbnails, canvas, and controls were ready. No DOM/CSS substitutions or image retouching were used.

| File | Dimensions | SHA-256 |
| --- | --- | --- |
| [Cobre catalog](revelumo-cobre-catalog.png) | 1180 × 900 | `2f010da9a0a22bd22e3c4e431c95dab68b197bbc717aa301cadc5ce3180dbf97` |
| [Current editor](revelumo-editor.png) | 1380 × 900 | `0f01b6e9bcc21b9b4f7edfdc5344ecb1ef7699d8b6d964ff51cde4acf5540b79` |

## Photograph credits

The demonstration photographs are covered by the [Pexels License](https://www.pexels.com/license/), checked on 2026-10-12. The license permits their use in applications; these contextual screenshots do not imply endorsement by Pexels or the photographers. The photographs retain their own rights and are not relicensed under Revelumo's MIT code license. This documentation change does not add the original JPEG files to the repository.

| Demonstration file | Photographer and source |
| --- | --- |
| `01_dunas_azuis.jpg` | [Leo Castro — 19151778](https://www.pexels.com/photo/white-sand-desert-and-a-lake-19151778/) |
| `02_lagoa_e_horizonte.jpg` | [Vivi Pascar — 28384491](https://www.pexels.com/photo/a-sandy-beach-and-a-small-lake-in-the-desert-28384491/) |
| `03_texturas_da_areia.jpg` | [Henrik Le-Botos — 23522919](https://www.pexels.com/photo/sand-dunes-in-desert-23522919/) |
| `04_luz_sobre_as_dunas.jpg` | [Murad Murat — 13720189](https://www.pexels.com/photo/sand-dunes-in-the-desert-13720189/) |
| `05_dunas_ao_amanhecer.jpg` | [Mostafa Ft.shots — 14425523](https://www.pexels.com/photo/dunes-at-sunrise-14425523/) |
| `06_encontro_do_mar.jpg` | [Jess Loiterton — 4321815](https://www.pexels.com/photo/aerial-view-of-ocean-waves-4321815/) |
| `07_verde_em_camadas.jpg` | [Juan Gomez — 12597242](https://www.pexels.com/photo/aerial-view-of-a-green-forest-12597242/) |
| `08_caminho_na_floresta.jpg` | [Dante Muñoz — 17488413](https://www.pexels.com/photo/deep-green-forest-17488413/) |

The [catalog evidence report](../../../evidence/cobre-catalog/report.md) records the underlying implementation checks and platform limits. Other software and assets retain the terms described in [THIRD_PARTY_NOTICES.md](../../../THIRD_PARTY_NOTICES.md).
