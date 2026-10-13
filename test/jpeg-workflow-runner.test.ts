import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWorkflow } from '../scripts/run-jpeg-workflow.mjs';

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'revelumo-workflow-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

const verifiedChild = [process.execPath, '-e', `
  const fs = require('node:fs'), path = require('node:path');
  const run = process.env.REVELUMO_WORKFLOW_RUN, mode = process.env.REVELUMO_WORKFLOW_STAGE;
  const photos = [{ id: '11111111-1111-4111-8111-111111111111', name: 'synthetic-a.jpg' }, { id: '22222222-2222-4222-8222-222222222222', name: 'synthetic-b.jpg' }];
  fs.writeFileSync(path.join(run, mode + '-result.json'), JSON.stringify({
    status: 'passed', runId: path.basename(run), mode, pid: process.pid,
    version: '0.1.0-alpha.1', platform: process.platform, versions: { node: process.version, electron: '44.7.0', chrome: '148.0.0.0' },
    photos, classification: { photo: photos[0], rating: 4, flag: 'selected' },
    recipe: { photo: photos[0], exposureTenths: 13, temperature: 40, tint: -20, processingVersion: 2 },
    hashes: Object.fromEntries(photos.map(photo => [photo.name, '4ffd1c0054ebb741d6c70a666b5a6b30f2285162d9202dacb063f91946b63d9e'])),
    checks: ['import', 'classification', 'adjustments', 'identity', 'originals', 'isolation']
  }));
`];
const success = [process.execPath, '-e', 'process.exit(0)'];

test('a failed package preparation cannot become a successful JPEG workflow', async t => {
  const root = fixture(t);
  const result = await runWorkflow({
    tempRoot: root,
    commands: { package: [process.execPath, '-e', 'console.error("synthetic build failure"); process.exit(7)'] },
  });
  assert.equal(result.exitCode, 1);
  const summary = JSON.parse(readFileSync(join(result.runDirectory, 'summary.json'), 'utf8'));
  assert.equal(summary.status, 'failed');
  assert.deepEqual(summary.stages.map((stage: { status: string }) => stage.status), ['failed', 'skipped', 'skipped']);
  assert.match(summary.stages[1].reason, /package/);
  assert.match(readFileSync(join(result.runDirectory, 'package.log'), 'utf8'), /synthetic build failure/);
});

test('labels without verifiable photo, recipe and hash evidence cannot produce success', async t => {
  const root = fixture(t);
  for (const field of ['photos', 'classification', 'recipe', 'hashes', 'versions']) {
    const first = [...verifiedChild];
    first[2] += `const file = path.join(run, mode + '-result.json'); const report = JSON.parse(fs.readFileSync(file)); delete report[${JSON.stringify(field)}]; fs.writeFileSync(file, JSON.stringify(report));`;
    const result = await runWorkflow({ tempRoot: root, commands: { package: success, first, reopen: verifiedChild } });
    assert.equal(result.exitCode, 1, field);
  }
});

test('a process exiting zero without its verified result is a failure, not a pass', async t => {
  const root = fixture(t);
  const ok = [process.execPath, '-e', 'process.exit(0)'];
  const result = await runWorkflow({ tempRoot: root, commands: { package: ok, first: ok, reopen: ok } });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.summary.stages.map(stage => stage.status), ['passed', 'failed', 'skipped']);
  assert.match(result.summary.stages[1].reason, /result/);
});

test('timeout fails the workflow and preserves diagnostics without killing an unrelated process', async t => {
  const root = fixture(t);
  const { spawn } = await import('node:child_process');
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 1000)']);
  t.after(() => unrelated.kill());
  const result = await runWorkflow({ tempRoot: root, timeoutMs: 1500,
    commands: { package: [process.execPath, '-e', 'console.log("owned diagnostic"); setInterval(()=>{}, 1000)'] },
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.summary.stages[0].reason, /timeout/i);
  assert.equal(unrelated.exitCode, null);
  assert.equal(unrelated.signalCode, null);
  assert.match(readFileSync(join(result.runDirectory, 'package.log'), 'utf8'), /owned diagnostic/);
});

test('each successful run gets a fresh profile and two independent verified processes', async t => {
  const root = fixture(t);
  const options = { tempRoot: root, commands: { package: success, first: verifiedChild, reopen: verifiedChild } };
  const one = await runWorkflow(options), two = await runWorkflow(options);
  assert.equal(one.exitCode, 0); assert.equal(two.exitCode, 0);
  assert.notEqual(one.runDirectory, two.runDirectory);
  assert.notEqual(one.summary.runId, two.summary.runId);
  assert.notEqual(one.summary.stages[1].verification.pid, one.summary.stages[2].verification.pid);
  assert.equal(one.summary.version, '0.1.0-alpha.1');
  assert.match(one.summary.sha, /^[0-9a-f]{40}$/);
  assert.equal(one.summary.platform, process.platform);
});

test('a failed first or reopen step cannot be hidden by a success-shaped result file', async t => {
  const root = fixture(t);
  for (const stage of ['first', 'reopen']) {
    const failure = [...verifiedChild]; failure[2] += '\nprocess.exit(9)';
    const result = await runWorkflow({ tempRoot: root,
      commands: { package: success, first: verifiedChild, reopen: verifiedChild, [stage]: failure },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.summary.stages.find(value => value.name === stage).status, 'failed');
    assert.equal(result.summary.stages[2].status, stage === 'first' ? 'skipped' : 'failed');
  }
});

test('failure to spawn the package command is recorded and stops the workflow', async t => {
  const root = fixture(t);
  const result = await runWorkflow({ tempRoot: root, commands: { package: [join(root, 'missing-executable')] } });
  assert.equal(result.exitCode, 1);
  assert.match(result.summary.stages[0].reason, /ENOENT/);
});

test('malformed or incomplete result files are failed verification', async t => {
  const root = fixture(t);
  for (const contents of ['not JSON', '{}', JSON.stringify({ status: 'passed', checks: [] })]) {
    const first = [process.execPath, '-e', `require('node:fs').writeFileSync(require('node:path').join(process.env.REVELUMO_WORKFLOW_RUN, 'first-result.json'), ${JSON.stringify(contents)})`];
    const result = await runWorkflow({ tempRoot: root, commands: { package: success, first } });
    assert.equal(result.exitCode, 1);
    assert.equal(result.summary.stages[1].status, 'failed');
    assert.match(result.summary.stages[1].reason, /result/);
  }
});

test('Linux without a display reports blocked and returns nonzero', { skip: process.platform !== 'linux' }, async t => {
  const root = fixture(t);
  const display = process.env.DISPLAY, wayland = process.env.WAYLAND_DISPLAY;
  delete process.env.DISPLAY; delete process.env.WAYLAND_DISPLAY;
  try {
    const result = await runWorkflow({ tempRoot: root, commands: { package: success } });
    assert.equal(result.exitCode, 1);
    assert.equal(result.summary.status, 'blocked');
    assert.equal(result.summary.stages[1].status, 'blocked');
    assert.match(result.summary.stages[1].reason, /display/i);
    assert.equal(result.summary.stages[2].status, 'skipped');
  } finally {
    if (display !== undefined) process.env.DISPLAY = display;
    if (wayland !== undefined) process.env.WAYLAND_DISPLAY = wayland;
  }
});

test('a failed leader cleans its owned process group or reports unverified Windows cleanup', async t => {
  const root = fixture(t);
  const childSource = `const fs=require('node:fs'); const file=process.argv[1]; fs.writeFileSync(file, '.'); const timer=setInterval(()=>fs.appendFileSync(file,'.'),50); setTimeout(()=>{clearInterval(timer)},1500);`;
  const leader = [process.execPath, '-e', `
    const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
    const file=path.join(process.env.REVELUMO_WORKFLOW_RUN,'heartbeat');
    spawn(process.execPath,['-e',${JSON.stringify(childSource)},file],{stdio:'ignore'}).unref();
    setInterval(()=>{if(fs.existsSync(file))process.exit(7)},10);
  `];
  const result = await runWorkflow({ tempRoot: root, commands: { package: leader } });
  assert.equal(result.exitCode, 1);
  const file = join(result.runDirectory, 'heartbeat');
  const before = readFileSync(file, 'utf8');
  await new Promise(resolve => setTimeout(resolve, 250));
  if (process.platform === 'win32') {
    // The child terminates itself; the runner must not target an exited/recycled PID.
    await new Promise(resolve => setTimeout(resolve, 1600));
    assert.equal(result.summary.stages[0].cleanup.status, 'unverified');
  } else {
    assert.equal(readFileSync(file, 'utf8'), before, 'owned descendant no longer writes');
    assert.equal(result.summary.stages[0].cleanup.status, 'terminated');
  }
});

test('a self-consistent but different UUID on reopen cannot confirm persistence', async t => {
  const root = fixture(t), reopen = [...verifiedChild];
  reopen[2] = reopen[2].replaceAll('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333');
  const result = await runWorkflow({ tempRoot: root, commands: { package: success, first: verifiedChild, reopen } });
  assert.equal(result.exitCode, 1);
  assert.match(result.summary.stages[2].reason, /Reopen changed photos/);
});

test('SIGINT and SIGTERM handlers stop owned descendants and preserve an unrelated process', async t => {
  const root = fixture(t);
  const { spawn } = await import('node:child_process');
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
  t.after(() => unrelated.kill());
  for (const signal of ['SIGINT', 'SIGTERM']) {
    let directory = '';
    const grandchild = `const fs=require('node:fs');const file=process.argv[1];fs.writeFileSync(file,'.');setInterval(()=>fs.appendFileSync(file,'.'),50);`;
    const command = [process.execPath, '-e', `
      const path=require('node:path'),{spawn}=require('node:child_process');
      spawn(process.execPath,['-e',${JSON.stringify(grandchild)},path.join(process.env.REVELUMO_WORKFLOW_RUN,'heartbeat')],{stdio:'ignore'});
      setInterval(()=>{},1000);
    `];
    const pending = runWorkflow({ tempRoot: root, commands: { package: command },
      onStart: value => { directory = value.runDirectory; }, timeoutMs: 5000 });
    const deadline = Date.now() + 4000;
    while ((!directory || !existsSync(join(directory, 'heartbeat'))) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(existsSync(join(directory, 'heartbeat')), 'owned grandchild started');
    // Exercise the same Node signal handlers on Windows, where child.kill does
    // not deliver Unix-style catchable signals, and on POSIX.
    process.emit(signal);
    const result = await pending;
    assert.equal(result.exitCode, 1);
    assert.match(result.summary.stages[0].reason, new RegExp(signal));
    const before = readFileSync(join(directory, 'heartbeat'), 'utf8');
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(readFileSync(join(directory, 'heartbeat'), 'utf8'), before);
    assert.equal(unrelated.exitCode, null); assert.equal(unrelated.signalCode, null);
    assert.equal(result.summary.stages[0].cleanup.status, 'terminated');
  }
});
