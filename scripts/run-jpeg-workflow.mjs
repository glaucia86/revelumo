import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function execute(command, cwd, log, runDirectory, stage, timeoutMs) {
  return new Promise(resolveResult => {
    const fd = openSync(log, 'w');
    const child = spawn(command[0], command.slice(1), { cwd, stdio: ['ignore', fd, fd], detached: process.platform !== 'win32',
      env: { ...process.env, REVELUMO_WORKFLOW_RUN: runDirectory, REVELUMO_WORKFLOW_STAGE: stage } });
    let stoppedReason, spawnError, cleanup;
    const stopGroup = () => {
      try { process.kill(-child.pid, 'SIGKILL'); return { status: 'terminated', scope: 'owned-process-group' }; }
      catch (error) {
        return error.code === 'ESRCH' ? { status: 'no-owned-group' }
          : { status: 'unverified', reason: error.message };
      }
    };
    const stop = reason => {
      if (stoppedReason) return;
      stoppedReason = reason;
      // Only the PID/tree created here. Never search for Electron by name.
      if (child.pid) {
        if (process.platform === 'win32') {
          if (child.exitCode !== null || child.signalCode !== null) {
            cleanup = { status: 'unverified', reason: 'Windows leader already exited; no potentially recycled PID was targeted.' };
            return;
          }
          const killed = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10000 });
          cleanup = killed.status === 0 ? { status: 'terminated', scope: 'owned-live-pid-tree' }
            : { status: 'unverified', reason: `taskkill could not confirm cleanup: ${killed.stderr?.toString() || killed.error?.message || killed.status}` };
          if (killed.status !== 0) child.kill();
        }
        else cleanup = stopGroup();
      }
    };
    const timer = setTimeout(() => stop(`Stage timeout after ${timeoutMs} ms`), timeoutMs);
    const interrupt = () => stop('Interrupted by SIGINT');
    const terminate = () => stop('Interrupted by SIGTERM');
    process.once('SIGINT', interrupt); process.once('SIGTERM', terminate);
    child.on('error', error => { spawnError = error; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate);
      closeSync(fd);
      if (!cleanup) {
        if (!child.pid) cleanup = { status: 'not-started' };
        else if (process.platform !== 'win32') cleanup = stopGroup();
        else cleanup = code === 0 ? { status: 'stage-exited' }
          : { status: 'unverified', reason: 'The Windows stage leader has exited. Remaining descendants cannot be safely identified; no exited or potentially recycled PID was targeted.' };
      }
      resolveResult({ ...(spawnError ? { status: 'failed', reason: spawnError.message }
        : stoppedReason ? { status: 'failed', reason: stoppedReason }
        : code === 0 ? { status: 'passed' } : { status: 'failed', reason: `Exit ${code}; signal ${signal}` }), cleanup });
    });
  });
}

// The command adapter is the external-process test boundary. The CLI accepts
// no commands, catalog paths or photograph inputs.
export async function runWorkflow({ repo = repository, tempRoot = tmpdir(), commands = {}, timeoutMs = 180000, onStart = () => {} } = {}) {
  const runDirectory = mkdtempSync(join(tempRoot, 'revelumo-jpeg-'));
  const runId = runDirectory.split(/[\\/]/).at(-1);
  writeFileSync(join(runDirectory, 'run.json'), JSON.stringify({ runId, scenario: 'synthetic-jpeg-workflow-v1' }));
  const version = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version;
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' });
  const changes = spawnSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' });
  const summary = {
    runId, runDirectory,
    version, sha: revision.status === 0 ? revision.stdout.trim() : null,
    workingTreeDirty: changes.status === 0 ? Boolean(changes.stdout.trim()) : null,
    platform: process.platform, arch: process.arch, node: process.version,
    startedAt: new Date().toISOString(), status: 'running', stages: [],
  };
  const saveSummary = () => writeFileSync(join(runDirectory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  saveSummary();
  onStart({ runId, runDirectory });
  const defaults = {
    package: [process.execPath, join(repo, 'node_modules/@electron-forge/cli/dist/electron-forge.js'), 'package'],
    first: [process.execPath, join(repo, 'node_modules/electron/cli.js'), join(repo, 'test/electron-jpeg-workflow.cjs'), runDirectory, 'first'],
    reopen: [process.execPath, join(repo, 'node_modules/electron/cli.js'), join(repo, 'test/electron-jpeg-workflow.cjs'), runDirectory, 'reopen'],
  };
  let failedStage;
  for (const name of ['package', 'first', 'reopen']) {
    const unavailable = !commands[name] && name !== 'package' &&
      ((process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) || !['linux', 'win32'].includes(process.platform));
    const result = failedStage ? { status: 'skipped', reason: `Prerequisite ${failedStage} did not pass` }
      : unavailable ? { status: 'blocked', reason: 'A working graphical display/compositor and sandbox are required; this command currently supports Windows and Linux package layouts only.' }
      : await execute(commands[name] ?? defaults[name], repo, join(runDirectory, `${name}.log`), runDirectory, name, timeoutMs);
    if (result.status === 'passed' && name !== 'package') {
      try {
        const report = JSON.parse(readFileSync(join(runDirectory, `${name}-result.json`), 'utf8'));
        if (report.status !== 'passed' || report.mode !== name || report.runId !== summary.runId ||
            !Number.isInteger(report.pid) || !Array.isArray(report.checks) ||
            !['import', 'classification', 'adjustments', 'identity', 'originals', 'isolation'].every(check => report.checks.includes(check))) {
          throw new Error('Incomplete or mismatched verification result');
        }
        assert.ok(report.pid > 0);
        assert.equal(report.version, version); assert.equal(report.platform, process.platform);
        for (const key of ['node', 'electron', 'chrome']) assert.ok(typeof report.versions?.[key] === 'string' && report.versions[key].length > 0, `Missing ${key} version`);
        assert.equal(report.photos?.length, 2);
        assert.deepEqual(report.photos.map(photo => photo.name).sort(), ['synthetic-a.jpg', 'synthetic-b.jpg']);
        assert.equal(new Set(report.photos.map(photo => photo.id)).size, 2);
        for (const photo of report.photos) assert.match(photo.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        const edited = report.photos.find(photo => photo.name === 'synthetic-a.jpg');
        assert.deepEqual(report.classification, { photo: edited, rating: 4, flag: 'selected' });
        assert.deepEqual(report.recipe, { photo: edited, ...{ exposureTenths: 13, temperature: 40, tint: -20, processingVersion: 2 } });
        const sourceHash = createHash('sha256').update(readFileSync(join(repo, 'test/fixtures/sample.jpg'))).digest('hex');
        assert.deepEqual(report.hashes, { 'synthetic-a.jpg': sourceHash, 'synthetic-b.jpg': sourceHash });
        if (name === 'reopen') {
          const first = summary.stages.find(stage => stage.name === 'first').verification;
          assert.notEqual(report.pid, first.pid, 'Reopen must report a distinct process');
          for (const key of ['photos', 'classification', 'recipe', 'hashes', 'version', 'versions']) assert.deepEqual(report[key], first[key], `Reopen changed ${key}`);
        }
        result.verification = report;
      } catch (error) {
        result.status = 'failed'; result.reason = `Invalid ${name} result: ${error.message}`;
        if (process.platform === 'win32' && result.cleanup?.status === 'stage-exited') result.cleanup = {
          status: 'unverified', reason: 'Verification failed after the Windows leader exited; no potentially recycled PID was targeted.',
        };
      }
    }
    summary.stages.push({ name, ...result });
    if (result.status === 'failed' || result.status === 'blocked') failedStage = name;
    saveSummary();
  }
  summary.status = failedStage ? summary.stages.find(stage => stage.name === failedStage).status : 'passed';
  summary.finishedAt = new Date().toISOString();
  saveSummary();
  return { exitCode: failedStage ? 1 : 0, runDirectory, summary };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) { console.error('Usage: npm run test:jpeg-workflow (no arguments)'); process.exitCode = 1; }
  else {
    try {
      const result = await runWorkflow({ onStart: ({ runId, runDirectory }) => console.log(`JPEG workflow ${runId}\nDiagnostics: ${runDirectory}`) });
      console.log(JSON.stringify(result.summary, null, 2));
      for (const stage of result.summary.stages.filter(stage => stage.status === 'failed')) {
        const log = join(result.runDirectory, `${stage.name}.log`);
        if (existsSync(log)) console.error(`${stage.name} diagnostic (last 16000 characters):\n${readFileSync(log, 'utf8').slice(-16000)}`);
      }
      process.exitCode = result.exitCode;
    } catch (error) { console.error(error); process.exitCode = 1; }
  }
}
