# Reproducible JPEG workflow — issue #43

## Scope and trust boundaries

The implementation is based on main `84e8362ca5baf00c9b7a13287b2b1e36cc105023`.
It adds a contributor runner and a packaged synthetic scenario; it does not
change photo processing, expose a product control API, write SQLite directly,
or include crop/export in this journey.

The external subprocess adapter is tested with synthetic child processes. Those
unit tests validate orchestration, reports and cleanup, not photographic or
Electron behavior. The packaged scenario uses the real renderer/preload/main
contracts and worker. Only the native file chooser and OS-language adapter are
substituted. Each run generates two files from the committed synthetic
`test/fixtures/sample.jpg`; original hashes are checked against that source.

## Local verification

On 2026-10-13, the full documented `npm run test:jpeg-workflow` command ran in a
Linux cloud graphical session with Node 24.19.0. Run `revelumo-jpeg-D3hbbL`
completed package/first/reopen with exit 0. The two actual Electron PIDs were
315197 and 315310. Both reports preserved UUIDs and confirmed four stars,
selected, exposure 13 tenths, temperature 40, tint -20, processing version 2.
Both originals retained SHA-256
`4ffd1c0054ebb741d6c70a666b5a6b30f2285162d9202dacb063f91946b63d9e`.
The summary marked the working tree dirty and recorded its base SHA; this is
local pre-commit evidence, not a final-SHA CI claim.

The shell-only executor is Debian 13 without a display. That environment is not
an Ubuntu graphical test. A real no-display command is expected to return a
blocked/nonzero result. Hidden Electron windows still used the cloud graphical
session; no sandbox flags or host security settings were weakened.

An initial launcher had no npm on PATH. After selecting the existing Node 24
installation, packaging exposed a fresh checksum-download requirement in
`@electron/get`. Forge now uses the official npm-pinned checksum map instead,
keeping SHA-256 validation. A later run using an overly long custom TMPDIR
failed with Chromium's `Socket path too long`; using a short, isolated
writable temporary parent resolved it. Both failed attempts remained failures
in the command result; neither was counted as a pass.

## TDD and review corrections

Red/green observations included failed package preparation, zero exit with no
verification report, timeout, no display, missing photo/recipe/hash evidence,
and a failed leader leaving a live descendant. Regression coverage now includes
fresh run IDs, failed first/reopen, absent executable, invalid JSON, changed UUID
on reopen, SIGINT/SIGTERM handlers, owned descendants and an unrelated process.
Signals are emitted through Node's registered signal handlers in the portable
unit test; this is not physical Ctrl+C input certification.

The checksum tests check absent/version-mismatched/incompatible maps and pass
a corrupted synthetic ZIP through the real installed `@electron/get` validator
with official expected digests. The validator rejects it. No expected digest is
computed from the candidate ZIP.

Independent Standards and Spec reviews requested descendant/interruption tests
and full evidence validation instead of check labels alone. The corrections
validate versions, UUIDs, classification, recipe and hashes, including agreement
between first and reopen. POSIX closes the owned process group. Windows cleanup
when a leader has already exited cannot be established safely in this slice:
that failed stage reports cleanup as unverified, keeps its nonzero result and
does not target an exited or potentially recycled PID. No native process/job
infrastructure was added.

## CI and remaining limits

The Windows gate runs the same public command. Ubuntu runs the sandboxed-window
prerequisite probe and, when it succeeds, the same command under Xvfb. Recognized
missing prerequisites produce a structured skip with the original diagnostic;
assertion failures and unexpected probe errors remain failures. Consult the
linked PR/Actions run for the exact final SHA and actual Windows/Ubuntu outcomes.
No CI result is asserted by this historical local report.

Native dialogs, physical keyboard and screen-reader interaction, macOS package
layout, perceptual QA and the 8 GB/no-dedicated-GPU target remain unverified by
this scenario. Existing focused regressions are retained.
