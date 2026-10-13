import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// CI prerequisite policy only. Never used to suppress workflow assertions or
// change the public command's nonzero exit when it cannot execute.
export function graphicsPrerequisiteFailure(diagnostic) {
  const suidAbort = /^\[\d+:\d+\/\d+\.\d+:FATAL:sandbox\/linux\/suid\/client\/setuid_sandbox_host\.cc:\d+\] The SUID sandbox helper binary was found, but is not configured correctly\. Rather than run without sandboxing I'm aborting now\./m;
  return suidAbort.test(diagnostic)
    ? 'SUID sandbox helper is not configured for the existing Ubuntu runner. No permissions were changed; Ubuntu JPEG runtime first/reopen was not exercised.'
    : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const reason = graphicsPrerequisiteFailure(readFileSync(process.argv[2], 'utf8'));
    if (!reason) process.exitCode = 1;
    else console.log(JSON.stringify({ stage: 'jpeg-workflow', status: 'skipped', reason,
      command: 'xvfb-run -a node_modules/electron/dist/electron test/electron-graphics-probe.cjs' }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
