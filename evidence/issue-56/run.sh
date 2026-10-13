#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p "$PWD/.test-temp"
root=$(mktemp -d "$PWD/.test-temp/preview-reuse-XXXXXX"); printf "Results: %s\n" "$root"
n=0
for mode in off on off on off on; do
 n=$((n+1)); mkdir -p "$root/$n-$mode"
 set +e
 node_modules/electron/dist/electron evidence/issue-56/baseline.cjs "$root/$n-$mode" "$mode" > "$root/$n-$mode.log" 2>&1
 rc=$?; set -e; echo "BASELINE56 $n-$mode EXIT=$rc" | tee -a "$root/status.txt"
 [ "$rc" = 0 ] || exit "$rc"
done
python3 evidence/issue-56/analyze.py "$root"
