import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graphicsPrerequisiteFailure } from '../scripts/classify-graphics-failure.mjs';

test('the actual Ubuntu SUID-helper abort is an unmet sandbox prerequisite', () => {
  const diagnostic = '[3644:1013/001655.605968:FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:166] The SUID sandbox helper binary was found, but is not configured correctly. Rather than run without sandboxing I\'m aborting now. You need to make sure that /isolated/node_modules/electron/dist/chrome-sandbox is owned by root and has mode 4755.';
  assert.match(graphicsPrerequisiteFailure(diagnostic), /SUID sandbox helper/);
});

test('assertions, crashes and generic permission failures never become prerequisite skips', () => {
  for (const text of ['AssertionError: expected 4, got 0', 'Segmentation fault', 'Error: EACCES writing result', 'Graphics prerequisite probe timed out', '']) {
    assert.equal(graphicsPrerequisiteFailure(text), null);
  }
});
