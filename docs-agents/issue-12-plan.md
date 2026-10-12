# Issue 12 — execution plan

Contract: https://github.com/glaucia86/revelumo/issues/12. Base: 5aa6693d05bbfea1c538a9360c84ee69ce195a68. Local branch only; no publication. The approved design uses the existing Chromium sRGB canvas and a packaged worker, not a new image engine.

Public test seams already authorized by the issue: Library with filesystem/SQLite, restricted preload/IPC in packaged Electron, and renderer DOM/canvas with controlled external async boundaries. Fixtures create historical databases; assertions read through the public API.

1. Library recipe tracer: neutral read, version-5 transactional migration, save/reopen, strict tenths/version/session/revision payload, protected serialized SHA-256 revalidation. A per-photo current session fences obsolete sessions and revisions; accepted revisions advance only after a successful transaction. No original decoding in save. Verify failures, relocation, reimport, future schemas and old metadata.
2. Renderer tracer: prepare one neutral sRGB base using the Chromium decoder (EXIF once), reduce to 2048 without upscale, worker applies linear RGB gain from that base. One running preview and one latest waiting; correlate UUID/session/revision and dispose worker/buffers on session exit. Canvas 0 EV comparison uses the same base.
3. Autosave tracer: 300 ms debounce, one commit in flight and latest draft retained; confirmation only for current revision. Navigation and a main/preload normal-close handshake await flush; retain session on error and expose retry/stay/explicit discard. Refresh/focus do not recreate active editing sessions.
4. Hidden packaged integration: numeric pixels, profile/orientation/size, invalid input, keyboard/AX, burst and delayed responses, save/flush failures and retry/discard, normal-close first/reopen and interruption, unchanged hashes. Run existing regressions, types and package; bounded resource measurements.
5. Independent Standards and Spec review of effective WIP against pinned base, fixes and reverification, then local commit and evidence handoff. Native/visual Windows QA #4 remains pending.

Checkpoints will record red/green commands, integration results and separate review outcomes in evidence/issue-12/.
