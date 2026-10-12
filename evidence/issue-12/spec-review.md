# Issue 12 SPEC review

Reviewed the effective staged WIP against pinned base `5aa6693d05bbfea1c538a9360c84ee69ce195a68`, then scoped working-tree fixes. Scope: contract compliance, not Standards. No scope creep identified.

## Original findings

1. Partial documentation. Contract: “documentar que a prévia de edição é uma derivação sRGB de resolução limitada, com limites de gamut, clipping e quantização.” Caption supplied sRGB/2048 only; README still described the full original preview, and no implementation document explained these limitations.
2. P2 lost close intent. Contract: “Antes de sair da foto, navegar à grade ou fechar normalmente… aguardar a confirmação da revisão mais recente.” App.leave returned while transitioning, dropping a close requested during a navigation flush.
3. P2 availability regression. Contract: “Regressões de … disponibilidade e relocalização continuam passando.” Verificar disponibilidade called openPhoto, whose same-photo/preview early return prevented selected-original status and relocation affordance refresh.

## Scoped re-review

1. **ADDRESSED.** ADR 0004 describes derived reduced sRGB, eight-bit quantization, gamut loss, clipping, compatibility boundaries, and preservation of original bytes. README links it and distinguishes previewPhoto from the editing canvas.
2. **NOT ADDRESSED completely.** pendingClose replay fixes normal flush; inspected `.test-temp/exposure-quit/race-result.json` confirms the packaged navigation/close race passes. However repeated leave after explicit discard is not idempotent: ExposureEditor retires session without reconciling draft/confirmed. If queued close replay runs before the old editor unmounts, leave(false) sees unequal revisions, save() returns false because session=null, and emits an exit failure. A retired-session guard covers this edge; verify close queued during held explicit discard. This is a code-path finding, not an executed reproduction.
3. **ADDRESSED in code.** Focus/manual checks call refreshSelectedStatus without replacing preview/session; unavailable notices and relocation remain visible alongside existing canvas. The new explicit unavailable-viewer packaged test remains pending, not a permanent omission.

No other breakage identified within the scoped fixes. Original revision fencing, linear processing and worker disposal remain consistent with the inspected contract. Pending final verification/resource reporting were not classified as omissions.

## Final scoped disposition

- **Documentation: ADDRESSED.** Prior scoped disposition stands.
- **Close intent, including explicit discard: ADDRESSED.** The current leave implementation returns successfully when initialization has completed and the session is already retired. This prevents the discarded draft/confirmed revision mismatch from attempting a save against a null session before unmount. Inspected `.test-temp/exposure-final-wip/discard-race-result.json`: `ok: true`, Windows packaged Electron; close during held explicit-discard retirement completes, with prior confirmed recipe preserved. The earlier normal navigation-close race evidence remains applicable.
- **Availability refresh: ADDRESSED and verified.** Inspected the current packaged harness assertions for missing-original refresh: original notice and relocation action appear while numeric draft remains 1.4 EV and the existing canvas remains. `.test-temp/exposure-final-wip/first-result.json` reports `ok: true` for the run containing those assertions.

All three original SPEC findings are now addressed. No additional breakage identified in these final scoped fixes. This disposition supersedes the earlier partial close disposition; broader final verification remains the controller's responsibility.
