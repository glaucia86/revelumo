# First visible JPEG export — design

Approved parent design 2026-10-12; base cb691b1 (PR46), Related to #19. Architectural glue of the tested circuit to the existing editor; no crop branch or new dependency.

## User contract

Export one original-resolution JPEG, quality90, sRGB, oriented pixels with current exposure/WB v2. Selected Unicode authorship/copyright retained; GPS removed, without claiming anonymization. Input32 MiB/40MP remains the existing engine limit. Output32 MiB is an explicit operational limit of this version, not a guarantee for every40MP image; exceeding it fails without degrading quality/resolution. Translate this limit and all outcomes in PT-BR/EN/ES.

The editor finishes its gesture, freezes adjustment controls, waits for history, flushes autosave and verifies the exact visible revision. Failed save blocks export and keeps the editable draft/retry. No implicit fallback to older edits. Native destination selection is main-owned, suggests a new `-edited.jpg` name, and cannot authorize replacement: exclusive writer remains final authority.

## Main-owned job and access

Dedicated export request parser/channel/preload API accepts only start(photoId,sessionId,revision,attemptId), recover(photoId,sessionId,revision,attemptId), status(jobId), cancel(jobId). Exact keys/types/UUIDs, trusted top-level frame and exact owning webContents are required. The renderer supplies a UUID correlation token per explicit attempt, never a jobId or file authority. Recovery only queries that exact owner/generation/session/revision/attempt; it cannot start publication. Active duplicate start remains BUSY; replay of the retained completed attempt returns its receipt, and a fresh attempt may export the same revision. Only the latest job is retained. No renderer paths/recipe/hash/quota. One job owner is acquired before dialog or allocation; repeated starts are BUSY. Library captures immutable main-only source path/hash/recipe and catalog original paths under its existing serial queue, checking exact active session/revision. This enumerates references only once per export, never reads/hashes all originals or does work for the grid. Original authentication uses the existing circuit after selection. Reject unknown/crop recipes.

Controller retains bounded latest job state/result, scoped to owner/photo/session and main-generated jobId. States choosing/exporting/canceling/succeeded/canceled/failed use descriptors, not pretranslated text. Terminal success includes filename/path, dimensions, bytes and cleanupPending; no pixel buffers retained. Status polling retrieves the same terminal outcome across language updates and races. Old/foreign job IDs cannot cancel the new job. Main restart creates no permanent UI freeze; stale IDs report an interrupted/unknown outcome, never false cancellation or deletion of a possibly published output.

Destination protects all known original paths and the entire userData directory (SQLite, WAL/SHM, thumbnails/cache/preferences), plus any explicit external catalog/cache locations. Native dialog is shared with existing selection exclusion. No replace flag/fallback. Suffix restricted to JPEG; existing destination results in actionable choose-another-name failure.

## Cancellation and lifetime

Cancel during dialog is recorded; eventual selection is ignored. No codec input is allocated until selection and all preconditions succeed. Abort before commit leaves no output; after link submission actual committed result wins. Terminal/failure paths always unlock controls, including thrown dialog/IPC errors. Main owner destruction cancels active job; cleanup is awaited by normal close flow. Navigation/close first requests cancellation and waits for terminal state before retiring the edit session. If success wins this race, preserve and surface the committed result rather than report canceled. No source/output deletion on restart or uncertain outcome.

The retained terminal record must survive editor unmount/navigation in the main owner. A successful outcome is not discarded merely because language changes or the close handshake races. Abnormal process termination is not a transactional filesystem/SQLite journal guarantee; on uncertain IPC termination tell the user to check the chosen destination, with original unchanged.

## Visible layout

Add a compact export section to the existing editor: action, fixed settings/limits hint, status and cancel while active, terminal result/error. Keep keyboard focus visible, status live and failure alert accessible at760×540. Language and cancel remain operable while adjustments are frozen. No progress percentage unsupported by the engine. Preserve existing Cobre styling and all editor save/history messages.

## Verification / gates

Behavioral RED→GREEN: confirmed visible revision, autosave/history failure/retry, stale session, pre-I/O input and quota boundaries, malicious sender/frame/payload, double start, dialog canceled/throws, original changed after dialog, aliases/collisions, late cancel and cleanupPending, renderer destruction, stale job/restart and close/navigation settlement. Native-codec/FS/dialog are external seams; no internal-module mocks.

Packaged Electron exercises actual editor button→main native-dialog seam→real circuit→disk. Independently reopen output for oriented EV/WB pixels, ICC/Unicode credits/noGPS, and verify original identity/hash plus catalog integrity. At760×540 capture the three languages and keyboard/focus, active/cancel/error/success states; submit final screenshot to parent before merge. Native dialog is substituted in automation and disclosed. Preserve current Windows/Ubuntu gates, independent Standards/Spec reviews, draft PR, head-pinned CI/merge/postmerge. No macOS/native-dialog/installer claim.
