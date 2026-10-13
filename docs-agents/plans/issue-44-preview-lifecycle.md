# Issue 44: disposable preview payload and explicit recovery

Approved partial design, based on 84e8362. This does not close #44.

## Goal and boundaries

Keep the current JPEG IPC, 32 MiB/40 MP limits, 2048-pixel preview, v2 pixel transform and autosave/export contracts. Separate the compressed preview payload from stable photo/preview identity. A small renderer-owned source releases its string on current worker readiness, failure, replacement and exit. React must not interpret payload release as a new preview or terminate the prepared base. Worker failure is recoverable only through an explicit translated, accessible retry action; retry authenticates the original with the existing previewPhoto path and preserves the editing session, draft, confirmed recipe and history. No automatic retry loop or forced garbage collection.

## Agreed test seams

- Disposable preview source public read/release interface: ownership and idempotent retirement; not native memory reclamation.
- Packaged renderer/worker + limited preload API: current ACK, worker failure/retry, stale callbacks, exit, session/draft/autosave/history and identity mismatch. Fault/delay injection only at browser Worker or IPC boundaries; not mocked product algorithms.
- Existing Library public preview/recipe methods: changed-original authentication and persistence. Original hashes and second-process reopen remain observable checks.

## Implementation plan

1. RED: source retirement makes compressed data unavailable while identity remains stable. GREEN: minimal disposable source and source test.
2. RED packaged worker fault exposes retry, terminating old worker; explicit retry recovers same draft/session. GREEN: App owns stable source, editor releases payload on current ACK/error/cleanup, error/ready handlers guard current instance, retry reuses previewPhoto without begin-edit.
3. Extend one RED/GREEN at a time for delayed stale ACK/error, exit during decode/read, original changed at retry, blocked save/exit, repeated recovery and original identity/persistence. Verify one worker and existing last-request rendering behavior.
4. Run core, typecheck, docs, package and affected Electron regressions; capture retry/error region at minimum viewport in supported languages.
5. Independent Standards/Spec reviews, fixes and reruns; draft PR and exact-SHA Windows/Ubuntu CI. Merge waits for parent visual review and green gates.

## Resource inventory and limits

Main retains one serial JPEG Buffer per Library operation; original status/autosave can reread it. nativeImage validation has a native full-resolution allocation whose reclamation is not controlled by a JS reference counter. App/IPC carry a compressed base64 payload; worker decoding temporarily uses base64/binary strings, Uint8Array/Blob and full-resolution ImageBitmap. Preparation reduces to a longest edge of 2048, closes the bitmap and resets the temporary surface; neutral RGBA base remains in worker. Each adjustment creates one result and transfers its ArrayBuffer; renderer owns visible canvas. One request executes and only the newest waiting parameters remain. Gallery has one page of thumbnails.

This slice releases explicit owners and proves worker termination/late-result rejection. It does not claim immediate GC, a quantified RSS reduction, total-process budget or 8 GB compatibility. Broader #44 acceptance still requires documented admission under reduced test budget, distinct near-limit corpus and separate repeated per-process RSS/heap measurements with environment/SHA/method. Historical aggregate working sets are not private RAM. No crop, engine, release/tag, dependency or general cache redesign.
