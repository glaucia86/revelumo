# Review and RED→GREEN record

Base cb691b1. No external application source was copied. Existing main/engine/circuit and editor autosave/history were reused.

| Boundary | Observed RED | Verified GREEN |
| --- | --- | --- |
| Main revision snapshot | captureExport absent; stale revision accepted | exact confirmed revision and metadata-only source/reference capture |
| Serial job | job module absent; duplicate not BUSY; cancel absent | bounded owner job, cancel/join, committed outcome and cleanup warning |
| IPC | parser/handler absent; replacement generation could access old job | strict keys/UUIDs, sender/frame/generation binding |
| Editor action | packaged button absent | actual UI publishes JPEG |
| Autosave barrier | destination opened before save acknowledgement | destination waits for exact visible revision |
| Cancel/navigation | cancel button absent; navigation unmounted active job | keyboard cancel and navigation join |
| Renderer loss | pending dialog exported after actual renderer crash | generation canceled; dead-renderer window closes after cleanup |
| Comparison | temporary compare remained pressed during export | comparison exits; current preview request is awaited |
| Receipt/close | result absent; window closed over committed late success | retained receipt and explicit leave confirmation |
| Rejected status IPC (P1) | Back unmounted a known publishing job | job survives transport uncertainty and is reconciled before leaving |
| Lost start acknowledgement | accepted main job lost its receipt | query-only recovery of exact attempt |
| Ambiguous recovery | new unaccepted attempt recovered old successful revision | UUID attempt binding and retained replay/fresh-attempt tests |

The first recovery run named `ui-start-ack-green` still failed because its package had not rebuilt after a TypeScript error; its name was not treated as proof. The later `ui-recovery-final` run passed the complete packaged scenario. Raw intermediate logs remain local; this report preserves outcomes without uploading repeated logs.

Standards and Spec independently reran290 Node tests and checked types/docs. Both original lifecycle findings were corrected with real failing/passing packaged tests plus focused rechecks. Final PT-BR/EN/ES760×540 screenshots and keyboard-cancel focus were inspected; parent approved the layout. Actual CI remains a separate gate.

The first PR47 CI run (38314873149) passed Ubuntu and failed the legacy Windows smoke exact preload-key assertion because its expected list omitted the four approved export methods. The expectation was extended with those exact names; the assertion remains exhaustive and does not accept arbitrary bridge capabilities. The corrected smoke passed both first and reopen modes in the cloud Linux graphical session (exit 0); the subsequent full Windows CI run remains the platform gate.

## External PR47 follow-up

The P2 autosave finding was reproduced in `ui-review-autosave-red`: after a status transport error, changing WB to 99 and immediately checking the existing export canceled the save timer; SQLite never received the adjustment and the assertion timed out. Recovery now runs before the new-export gesture/save/compare preparation. `ui-review-autosave-green` passed the full packaged flow, asserting the new WB value in real SQLite while result observation was still active and before navigation or any other action. Node290/typecheck/docs/package passed.

The final raw harness manifest and all ten locale PNGs replace the unexplained six-image curated manifest. The three READMEs now distinguish parser shape/UUID checks, IPC owner/frame/origin checks, main generation binding and Library session/revision validation.
