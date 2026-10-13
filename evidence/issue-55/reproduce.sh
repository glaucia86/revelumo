#!/usr/bin/env bash
# Run after npm run package, on a graphical environment with the existing
# Chromium sandbox intact. Never calls the unrestricted local test suite.
set -euo pipefail
repo=$(cd "$(dirname "$0")/../.." && pwd)
cd "$repo"
root=$(mktemp -d "${TMPDIR:-/tmp}/revelumo55-small-XXXXXX")
electron="$repo/node_modules/electron/dist/electron"
printf 'Evidence directory: %s\n' "$root"
for suite in preview-reservation preview-admission preview-queue preview-memory smoke relocation availability; do
  run="$root/$suite"
  modes='first reopen'
  if [[ "$suite" == preview-reservation || "$suite" == availability ]]; then modes='first'; fi
  for mode in $modes; do
    "$electron" "test/electron-$suite.cjs" "$run" "$mode" > "$root/$suite-$mode.txt" 2>&1
    result="$run/$mode-result.json"
    if [[ "$suite" == preview-reservation || "$suite" == availability ]]; then result="$run/result.json"; fi
    node -e 'const r=require(process.argv[1]); if(r.ok===false || (r.ok!==true && !r.mode)) process.exit(1)' "$result"
    printf '%s %s verified\n' "$suite" "$mode"
  done
done
