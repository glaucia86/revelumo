# Pending-preview lifecycle — issue #52

## Scope and contract

A private coordinator retains one dispatched preview and one replaceable pending
selection. The dispatched request includes any wait for `Library.serial`; it
checks its document lifetime and generation *inside* that protected queue before
lookup/read/hash/decode. Replacing the pending request settles it with
`{ ok: false, canceled: true }`. Cancellation is not a JPEG/catalog error.
Once the original pipeline starts, it completes authentication, decoding, legacy
identity registration and its genuine errors normally. No decoder preemption is
claimed. New selections join the tail after the dispatched request settles;
saves already admitted retain their order.

Only preview work is coalesced. Mutations, saves, exposure history, import,
relocation, original identity, and export keep their existing contracts. The
`originalStatus` call before opening still reads/authenticates originals; this
change does not eliminate all obsolete navigation I/O.

The preload keeps a main-issued document token private and reserves monotonic
numeric intentions. `invalidatePreview()` returns the reserved generation;
`previewPhoto(id, generation?)` consumes that reservation or creates a fresh one
for an ordinary direct call. The separate preview channel checks exact payloads,
owner, main frame, trusted document URL, token and generation. Navigation start
retires enrollment; only a committed `did-navigate` activates the new document.
This follows Electron's [document navigation event ordering](https://www.electronjs.org/docs/latest/api/web-contents#document-navigations).

A specific editor retirement hook runs after successful save/history/export
reconciliation and before `end-edit` joins the same queue. There is one retirement
per exit attempt, with a fallback for an uninitialized editor. Failed save/export
never reaches the hook; hook/end-edit failure retains session/draft and makes an
unprepared preview retryable. A stale exit cannot apply its action to a newer
selection.

## Agreed test seams and TDD

- Real Library + filesystem + SQLite, with only the external decoder and selected
  filesystem/hash boundaries observed or held. Detects pre-I/O cancellation,
  persisted data, order and genuine failures; does not emulate native decoding.
- Coordinator and private IPC handler public methods, with structural Electron
  owner/frame objects. Detects bounded settlement, cross-document generations and
  authorization; packaged tests also exercise real Electron routing.
- Actual preload transpiled in a VM, replacing only Electron contextBridge/IPC.
  Detects private handshake, reservation/direct-call races and fail-closed errors.
- Real packaged Electron/API/UI with tiny committed synthetic JPEGs. Dialogs and
  external filesystem/lifecycle fault timing are adapted explicitly.

Numbered RED/GREEN logs capture service/coordinator/protocol steps. New-module
first REDs include the expected missing-module/method failure; subsequent tests
exercise behavior. The first packaged exit test failed because retirement after
`end-edit` was too late; moving the specific hook before it passed. Independent
review then found duplicate post-end-edit retirement and handshake enrollment at
navigation start. Packaged regressions reproduced both failures (logs 20/21),
then passed after their fixes. A final review found a delayed catalog-exit response
overwriting a newer photo; packaged RED22 and the succeeding ACK/rejection cases
verify the added post-await sequence guard.

## Verified locally

- Focused preview/preload/request checks: 18 passed.
- Typecheck and local documentation checks passed; Linux x64 package built.
- Rebased on main `ba57ceeadc0244ce68a5c4bfb787328ad9e50589` after #53;
  typecheck, docs, package and all four packaged runs were repeated successfully.
- Safe Node regression suite: 328 passed. The command is recorded in `core-safe-suite.txt`. The two
  existing 32 MiB boundary tests were explicitly excluded locally, not executed:
  `bounds original input bytes independently from the configured output budget`
  and `oversized JPEG is rejected before preview decoding`.
- New packaged preview queue `first` and separate-process `reopen` passed:
  A→B→C settles B once with zero original reads/hashes/native decodes; retirement
  inside the protected queue prevents I/O; an admitted save precedes C; real UI
  return to the catalog retires a queued opening; navigation-start handshake
  fails closed and a real reload obtains a fresh token while rejecting the old; delayed catalog-exit success and rejection cannot
  navigate away from a newer selected photo or overwrite its error state.
- Existing preview recovery `first`/`reopen` passed, extended with hook/end-edit
  failures, duplicate exit, one retirement per successful exit, and no retirement
  for failed autosave. Session/draft/history, explicit retry, export-exit handling,
  stale worker/IPC results, minimum layout and original hashes remain covered.
- Core tests also preserve errors from already-started read/decode and legacy
  identity registration despite later retirement. Repeated reloads keep one
  pending selection behind an old active decode.

See `queue-first.json`, `queue-reopen.json`, `lifecycle-first.json` and
`lifecycle-reopen.json`. Linux graphical runs used the existing cloud desktop,
with sandbox/context isolation/web security intact. Expected host D-Bus warnings
were printed. No personal originals, security-setting changes or renderer mocks.

## Limits and remaining gates

No new encoder, dependency, cache/pool, binary transport, release or installer.
No 20/40 MP or 32 MiB workloads ran locally. Native full-frame decode cost, GC
behavior, peak RSS and suitability for an 8 GB computer were not measured here.
Windows/Ubuntu final-SHA CI remains a publication/merge gate; a local Linux pass
is not a Windows or macOS claim. Native dialogs, physical input and screen-reader
validation are not established by these automated harnesses.
