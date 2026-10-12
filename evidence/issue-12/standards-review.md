# Standards review — issue 12

Base: `5aa6693d05bbfea1c538a9360c84ee69ce195a68`. Initial review inspected the staged WIP; scoped re-review inspected the subsequent working-tree fixes. Read-only review except this report.

## Original findings

**Documented standards:** no hard breach found. SQLite remains main-only; IPC validates origin and strict payloads; originals remain read-only; identity revalidation, commit and session retirement share the serialized queue. Tests observe public APIs and renderer/canvas behavior. External instrumentation supports the explicitly approved resource checks. No CONTRIBUTING or CODING_STANDARDS file was found.

**Possible Data Clumps — judgement call:** `src/shared/contracts.ts:15`, `src/preload.ts:6`, and `src/main/library.ts:112` repeatedly transport `id, sessionId, revision, exposureTenths, processingVersion`. Hunk: `saveExposure(id: string, sessionId: string, revision: number, exposureTenths: number, processingVersion: number)`. Consider one typed exposure-save command. Optional; the strict request already bounds the values.

**Possible Duplicated Code — judgement call:** original `src/renderer/App.tsx:165,169` repeated `++openSequence.current; setViewing(false); setSelectedPhoto(null); … setPreview(null)`, with different status/message resets. Extract a common exit-state transition.

**Concrete lifecycle concern:** original `App.tsx:34`, `if (transitioning.current) return;`, dropped a native close/quit request during navigation flush. Main had prevented closure, and completion never replayed `confirmClose()`. Static finding, not a documented-standard breach.

## Scoped re-review

The lifecycle concern is resolved: `pendingClose` retains the request and `finally` replays it after the current transition. `ExposureEditor` clears the retired session, making the second exit safe. Preload retains requests received before subscription. Inspected `.test-temp/exposure-quit/race-result.json`: `ok: true`, with the check “close during navigation flush is retained and replayed after latest confirmation.” This review did not rerun that test.

`resetViewer` resolves the duplicated reset shape. Selected-status refresh preserves the editor draft/base and fences responses against navigation. ADR 0004/README document the derivative preview and durability/resource limits. No new blocking issue or documented-standard breach found in these fixes.

The Data Clumps suggestion remains optional and deferred to avoid cross-interface churn alongside issue 13.

**Outcome:** 0 hard breaches; 0 unresolved blocking findings; 1 deferred optional smell. No independent full-suite run or full-suite success claim.
