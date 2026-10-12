## CI — Windows / 2026-10-12T03:46:17.8828163Z
Checked SHA: local rehearsal on b350629 + CI WIP (not a GitHub run)
PR runs check the GitHub merge ref; push/manual runs check their selected ref.
| Step | Outcome |
| --- | --- |
| versions | success |
| install | success |
| electron | success |
| typecheck | success |
| tests | success |
| package | success |
| smoke_dirs | success |
| electron_first | success |
| electron_reopen | success |
| relocation_first | success |
| relocation_reopen | success |
Core FIFO import/preview tests skip on Windows because they require POSIX mkfifo. Symlink alias tests may skip when Windows denies symlink creation; the test log records whether that happened.
Other skipped steps did not run because a prerequisite failed or the job was cancelled; consult the step logs.
### node-versions.txt (includes actual test totals and skip reasons)
```text
{"platform":"win32","arch":"x64","versions":{"node":"24.19.0","acorn":"8.17.0","ada":"3.4.4","amaro":"1.1.10","ares":"1.34.6","brotli":"1.2.0","cldr":"48.0","icu":"78.3","llhttp":"9.4.3","merve":"1.2.2","modules":"137","napi":"10","nbytes":"0.1.4","ncrypto":"0.0.1","nghttp2":"1.69.0","nghttp3":"","ngtcp2":"","openssl":"3.5.7","simdjson":"4.6.4","simdutf":"6.4.0","sqlite":"3.53.3","tz":"2026b","undici":"7.29.0","unicode":"17.0","uv":"1.52.1","uvwasi":"0.0.23","v8":"13.6.233.17-node.51","zlib":"1.3.2.1-motley-3246f1b","zstd":"1.5.7"}}
```
### core-tests.txt (includes actual test totals and skip reasons)
```text
npm notice run revelumo@0.0.1 test
npm notice run node --test test/*.test.ts
Ô£ö serves only packaged assets under the app origin (0.783ms)
Ô£ö rejects foreign origins, escapes and non-asset extensions (0.2246ms)
Ô£ö probing an accessible cached legacy original reports unverified presence without enrolling identity (49.6387ms)
Ô£ö mixed batch commits valid references, reports each failure and emits monotonic progress (58.5797ms)
´╣ú canonical path deduplication includes symlink aliases and preserves identifier (22.735ms) # Windows requires symlink permission for this alias case
Ô£ö decoding stays serial even with overlapping service requests (145.1296ms)
Ô£ö stopping a batch preserves committed photos and cached thumbnails after reopening (29.9113ms)
Ô£ö canceling multiple selection creates nothing; a missing legacy cache is generated once (25.6903ms)
Ô£ö closing while an import waits behind a preview does not start or commit the queued item (25.2053ms)
Ô£ö closing during derivative generation prevents a later commit of that unfinished item (19.3698ms)
Ô£ö photo reference survives closing and reopening the SQLite catalog (27.5706ms)
Ô£ö reimporting the same path reuses its reference (22.2781ms)
Ô£ö unknown identifiers never return another photo (19.9013ms)
Ô£ö a newer schema is refused without overwriting its version or data (21.3631ms)
Ô£ö thumbnail is derived data persisted with the reference and survives reopening (21.9327ms)
Ô£ö migrates a version-one catalog without changing photo identity (28.0172ms)
Ô£ö gallery bounds each page and retains photo identity for preview selection (1.2736ms)
Ô£ö gallery clamps pages when the library shrinks and handles an empty library (0.1896ms)
Ô£ö reads dimensions from an actual JPEG before invoking a decoder (1.6407ms)
Ô£ö refuses malformed JPEG and excessive pixel dimensions before decoding (0.7092ms)
´╣ú import rejects a named pipe without waiting for a writer (1.1967ms) # SKIP
´╣ú preview rejects a named pipe without waiting for a writer (0.2171ms) # SKIP
Ô£ö imports by reference, returns no private path and leaves original bytes/location unchanged (40.0914ms)
Ô£ö canceling selection leaves the catalog empty (20.2625ms)
Ô£ö non-JPEG content cannot enter the catalog even with a .jpg suffix (18.6851ms)
Ô£ö decoder rejection prevents storing malformed JPEG-shaped content (17.4028ms)
Ô£ö missing files and directories return readable errors without a record (17.8246ms)
Ô£ö oversized JPEG is rejected before preview decoding (20.9234ms)
Ô£ö a missing original stays cataloged and reports an unavailable preview (22.7027ms)
Ô£ö preview lookup cannot use an arbitrary filesystem path (13.8318ms)
Ô£ö preview carries the original JPEG bytes including EXIF orientation to the renderer (2.136ms)
Ô£ö decoder failures cannot create a preview (0.6807ms)
Ô£ö reimporting distinct content at the same name and size cannot replace the cataloged original or cache (41.0623ms)
Ô£ö a second catalog connection never previews a replacement at the original path as the cataloged photo (29.1085ms)
Ô£ö an externally moved original is marked missing while its photo and cached thumbnail remain available (26.0611ms)
Ô£ö relocating identical bytes with a new filename preserves the photo and cache after reopening (37.8918ms)
Ô£ö a readable version-two original acquires identity before a later external move without changing legacy data (51.0909ms)
Ô£ö previewing an accessible version-one original establishes identity before it is moved (41.6246ms)
Ô£ö a legacy original missing before identification cannot be relinked using the candidate as retroactive proof (41.483ms)
Ô£ö canceling relocation leaves the missing reference, identity and cached data unchanged (20.8291ms)
Ô£ö a different JPEG with the original name and byte length cannot be relinked (24.5476ms)
Ô£ö a destination already owned by another record is refused even when its bytes are identical (27.6453ms)
Ô£ö a real SQLite write lock cannot partially commit a new reference (24.999ms)
Ô£ö an invalid candidate and an unknown record never change the catalog (18.549ms)
Ô£ö closing while relocation waits behind a preview prevents a later reference update (18.4555ms)
Ô£ö a missing thumbnail is never regenerated from a replacement original (22.5023ms)
Ô£ö generating a legacy thumbnail from the accessible original establishes its identity for relocation (40.5968ms)
Ô£ö accepts the initial three typed operations (2.3112ms)
Ô£ö rejects malformed, unknown and overprivileged IPC payloads (0.5912ms)
Ô£ö accepts progress and UUID-scoped thumbnails but rejects paths and excess fields (0.2708ms)
Ô£ö availability, status and relocation accept only a UUID-scoped operation without file paths or identity supplied by the renderer (0.3368ms)
Ô£ö a second Node process reopens the persisted photo reference and original (272.5195ms)
Ô£ö thumbnail is bounded and carries orientation rather than replacing the original (1.8916ms)
Ô£ö all eight EXIF orientation values survive derivative encoding (0.6303ms)
Ô£ö missing or malformed orientation falls back safely without out-of-range reads (0.1754ms)
Ô£ö thumbnail rejects over-budget originals before decoding and oversized derivatives (0.6728ms)
Ô£ö orientation survives legal JPEG fill bytes and standalone markers (1.2723ms)
Ô£ö normalizes the development URL trailing slash without weakening document identity (1.088ms)
Ô£ö rejects foreign ports, hosts, documents, credentials and malformed URLs (0.4115ms)
Ôä╣ tests 59
Ôä╣ suites 0
Ôä╣ pass 56
Ôä╣ fail 0
Ôä╣ cancelled 0
Ôä╣ skipped 3
Ôä╣ todo 0
Ôä╣ duration_ms 810.9437
```
### electron / first-result.json
```text
{
  "ok": true,
  "mode": "first",
  "versions": {
    "node": "24.21.0",
    "acorn": "8.18.0",
    "ada": "4.0.0",
    "amaro": "1.1.11",
    "ares": "1.34.8",
    "brotli": "1.2.0",
    "cldr": "48.0",
    "icu": "78.2",
    "llhttp": "9.4.3",
    "merve": "1.2.2",
    "modules": "149",
    "napi": "10",
    "nbytes": "0.1.4",
    "ncrypto": "0.0.1",
    "nghttp2": "1.70.0",
    "nghttp3": "",
    "ngtcp2": "",
    "openssl": "0.0.0",
    "simdjson": "4.6.7",
    "simdutf": "7.7.0",
    "sqlite": "3.53.4",
    "tz": "2026d",
    "undici": "7.29.1",
    "unicode": "17.0",
    "uv": "1.52.1",
    "uvwasi": "0.0.23",
    "v8": "15.2.124.28-electron.0",
    "zlib": "1.3.2.1-motley",
    "zstd": "1.6.0",
    "electron": "44.7.0",
    "chrome": "152.0.7977.130"
  },
  "checks": [
    "renderer isolation and sandbox remain enabled",
    "packaged origin and limited bridge",
    "renderer exposes only approved bridge operations",
    "mixed batch has 51 photos and one per-file failure",
    "all photo tiles have native button role and accessible names",
    "each keyboard-focusable button is wrapped in a list item",
    "Enter activates a focused tile and opens the actual JPEG preview",
    "pagination displays remaining three photos and thumbnails",
    "cancel and reimport preserve catalog identity without duplicates",
    "all 52 synthetic originals retain SHA-256 and location"
  ]
}
```
### electron / reopen-result.json
```text
{
  "ok": true,
  "mode": "reopen",
  "versions": {
    "node": "24.21.0",
    "acorn": "8.18.0",
    "ada": "4.0.0",
    "amaro": "1.1.11",
    "ares": "1.34.8",
    "brotli": "1.2.0",
    "cldr": "48.0",
    "icu": "78.2",
    "llhttp": "9.4.3",
    "merve": "1.2.2",
    "modules": "149",
    "napi": "10",
    "nbytes": "0.1.4",
    "ncrypto": "0.0.1",
    "nghttp2": "1.70.0",
    "nghttp3": "",
    "ngtcp2": "",
    "openssl": "0.0.0",
    "simdjson": "4.6.7",
    "simdutf": "7.7.0",
    "sqlite": "3.53.4",
    "tz": "2026d",
    "undici": "7.29.1",
    "unicode": "17.0",
    "uv": "1.52.1",
    "uvwasi": "0.0.23",
    "v8": "15.2.124.28-electron.0",
    "zlib": "1.3.2.1-motley",
    "zstd": "1.6.0",
    "electron": "44.7.0",
    "chrome": "152.0.7977.130"
  },
  "checks": [
    "renderer isolation and sandbox remain enabled",
    "packaged origin and limited bridge",
    "renderer exposes only approved bridge operations",
    "new Electron process reopens all 51 IDs, cached thumbnail and JPEG preview",
    "cached thumbnail survives an unavailable synthetic original; preview reports unreadable and catalog is unchanged",
    "native decoder accepts EXIF6 fixture and preview retains all original JPEG bytes"
  ]
}
```
### relocation / first-result.json
```text
{
  "ok": true,
  "mode": "first",
  "versions": {
    "node": "24.21.0",
    "acorn": "8.18.0",
    "ada": "4.0.0",
    "amaro": "1.1.11",
    "ares": "1.34.8",
    "brotli": "1.2.0",
    "cldr": "48.0",
    "icu": "78.2",
    "llhttp": "9.4.3",
    "merve": "1.2.2",
    "modules": "149",
    "napi": "10",
    "nbytes": "0.1.4",
    "ncrypto": "0.0.1",
    "nghttp2": "1.70.0",
    "nghttp3": "",
    "ngtcp2": "",
    "openssl": "0.0.0",
    "simdjson": "4.6.7",
    "simdutf": "7.7.0",
    "sqlite": "3.53.4",
    "tz": "2026d",
    "undici": "7.29.1",
    "unicode": "17.0",
    "uv": "1.52.1",
    "uvwasi": "0.0.23",
    "v8": "15.2.124.28-electron.0",
    "zlib": "1.3.2.1-motley",
    "zstd": "1.6.0",
    "electron": "44.7.0",
    "chrome": "152.0.7977.130"
  },
  "checks": [
    "packaged renderer retains sandbox, context isolation and UUID-scoped bridge",
    "paths and malformed renderer identity are refused before opening a dialog",
    "legacy missing before migration remains cataloged with cache, explanation and no unsafe locate action",
    "cancel, different native-decodable JPEG of equal name/length, and occupied path leave all records unchanged",
    "single-file dialogue adapter relinks equal SHA-256 and restores actual preview without changing ID, name or cache",
    "accessible legacy identity enables a later move; all five synthetic JPEG files retain their bytes"
  ]
}
```
### relocation / reopen-result.json
```text
{
  "ok": true,
  "mode": "reopen",
  "versions": {
    "node": "24.21.0",
    "acorn": "8.18.0",
    "ada": "4.0.0",
    "amaro": "1.1.11",
    "ares": "1.34.8",
    "brotli": "1.2.0",
    "cldr": "48.0",
    "icu": "78.2",
    "llhttp": "9.4.3",
    "merve": "1.2.2",
    "modules": "149",
    "napi": "10",
    "nbytes": "0.1.4",
    "ncrypto": "0.0.1",
    "nghttp2": "1.70.0",
    "nghttp3": "",
    "ngtcp2": "",
    "openssl": "0.0.0",
    "simdjson": "4.6.7",
    "simdutf": "7.7.0",
    "sqlite": "3.53.4",
    "tz": "2026d",
    "undici": "7.29.1",
    "unicode": "17.0",
    "uv": "1.52.1",
    "uvwasi": "0.0.23",
    "v8": "15.2.124.28-electron.0",
    "zlib": "1.3.2.1-motley",
    "zstd": "1.6.0",
    "electron": "44.7.0",
    "chrome": "152.0.7977.130"
  },
  "checks": [
    "packaged renderer retains sandbox, context isolation and UUID-scoped bridge",
    "paths and malformed renderer identity are refused before opening a dialog",
    "second Electron process preserves relocated references, all four IDs/names, cached thumbnail, blocked legacy and five file hashes"
  ]
}
```
Synthetic fixtures only. Native dialog replaced; no visual, physical keyboard, screen reader or executable double-click validation. makers: [] means no installers. No macOS check or end-user platform support claim. Package and local download caches disappear with the runner; no cache action or artifact upload.
