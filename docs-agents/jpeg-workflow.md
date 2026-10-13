# Reproduce the JPEG workflow

This contributor check uses synthetic photographs and an isolated profile. It
packages the current checkout, imports two JPEGs, sets four stars and the selected
flag, applies +1.3 EV / temperature +40 / tint −20, closes the window, then checks
the same UUIDs, classification, recipe and unchanged SHA-256 hashes in a second
Electron process. It exercises the packaged main, preload, renderer and worker;
it never inserts product state directly into SQLite.

## Prerequisites

From a checkout with Node.js 24, npm and Git, run these once, stopping on failure:

```sh
npm ci
npm run install:electron
```

Both steps may need network access. Keep the installed dependencies and Electron
download cache. `package-lock.json` pins the official Electron npm archive and
its integrity. Packaging takes expected SHA-256 values from that package's
`electron/checksums.json`, checks its exact version against the project's pin,
and supplies them through the supported `@electron/get` `checksums` option. A
cached ZIP is still validated, and corrupt, absent or incompatible checksums
fail closed. Expected checksums are never derived from the ZIP being checked.
Without a cached ZIP, packaging still needs the official download.

A **working graphical session and Chromium sandbox** are also required, even
though the test window is hidden. Linux needs the usual Electron shared
libraries and a display/compositor. An environment variable alone is not proof
that either works. Xvfb supplies a virtual X server; it does not remove the
graphics, shared-library or sandbox requirements. Do not add `--no-sandbox`,
disable `webSecurity`, or change host security settings to make this check pass.
If you override `TMPDIR` on Linux, keep it short: Chromium's Unix socket paths
can exceed the operating system limit inside deeply nested temporary paths.

The current command recognizes Windows and Linux package layouts. macOS is
reported as blocked; this is not a claim of macOS verification. Native dialogs
are replaced at the file-chooser boundary and the language is pinned to PT-BR.
This does not certify native Windows UI, physical keyboard behavior, screen
readers, perceptual image quality or an 8 GB/no-dedicated-GPU memory target.

## One command

In the graphical session, at the repository root:

```sh
npm run test:jpeg-workflow
```

The command accepts no photograph, profile, catalog or arbitrary-command
arguments. Every invocation creates and prints a new `revelumo-jpeg-*` directory
under the operating system's temporary directory, rebuilds the package and
executes `first` then `reopen`. No state from another run is reused. Do not run
another packaging command against the same checkout concurrently.

On Linux, if an existing Xvfb installation and sandbox prerequisites are
available, the equivalent display wrapper is:

```sh
xvfb-run -a npm run test:jpeg-workflow
```

For a separate prerequisite diagnosis, without running the workflow:

```sh
xvfb-run -a node_modules/electron/dist/electron test/electron-graphics-probe.cjs
```

CI uses the same workflow command. Windows runs it directly. Ubuntu first runs
that real sandboxed-window probe. Only recognized missing graphics/library or
sandbox prerequisites produce a structured CI skip with the original diagnostic;
unexpected probe failures and any workflow failure fail CI. A skipped Ubuntu
workflow is missing coverage, not a pass. Check the current run's summary before
claiming Ubuntu execution.

## Results and failures

`summary.json` records the run ID, version, Git SHA (or null outside a Git
checkout), dirty-tree status, platform, architecture, Node version, times and
each stage's result. `first-result.json` and `reopen-result.json` include the
Electron/Chromium versions, process IDs, verified checks, synthetic photo UUIDs,
recipe, classification and hashes. `package.log`, `first.log`, `reopen.log` and
any `*-failure.txt` preserve diagnostics. The CLI prints the summary and the
tail of failed-stage logs, and CI copies the output into its job summary.

A failed build, failed launch, nonzero process exit, missing/malformed result,
assertion failure, timeout or unavailable display produces a nonzero command
exit. Later stages are skipped with the failed prerequisite named. Zero process
exit alone is insufficient: both stages must also produce a complete result
for this run and mode. A run interrupted before finalization retains an interim
summary marked `running`; it must never be treated as a pass.

Each stage has a three-minute outer deadline; the Electron scenario has its own
two-minute deadline. On timeout or Ctrl+C/SIGTERM, the runner stops only the
child process tree it launched (a dedicated process group on POSIX, its PID tree
on Windows). It never searches for Electron processes by name or stops a user's
other applications. POSIX also closes the owned process group after a failed
leader exit. On Windows, if the leader has already exited unexpectedly, its
remaining descendants cannot be safely identified without additional native
infrastructure: the failed stage reports `cleanup.status: unverified` and does
not target the exited/potentially recycled PID. This is incomplete cleanup, not
a successful recovery. The diagnostic and nonzero result are preserved.
Completed profiles, synthetic images and logs are retained
for diagnosis. After inspection, delete only the exact run directory printed by
this invocation; there is no broad automatic temporary-directory cleanup.

The original import, classification, EV/WB, history, export and other focused
tests remain in CI. This small reproducible journey complements them; it does
not replace their detailed regression coverage. Crop/export, RAW/HEIC, a public
editing CLI, network control port and performance benchmarks are outside this
scenario.
