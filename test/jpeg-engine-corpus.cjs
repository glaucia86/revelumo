// Manual packaged-Electron corpus gate. This module does not launch Electron.
// Inject the already loaded real engine and responsive editor sentinel.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const SAMPLE_INTERVAL_MS = 25;
const MAXIMUM_OUTPUT_BYTES = 32 * 1024 * 1024;
const RECIPES = [
  { name: 'neutral', processingVersion: 2, exposureTenths: 0, temperature: 0, tint: 0 },
  { name: 'wb-ev', processingVersion: 2, exposureTenths: -10, temperature: 100, tint: 100 },
];

module.exports = async function runJpegEngineCorpus({ engine, app, BrowserWindow, sentinel, run, root }) {
  root = path.resolve(root);
  const base = path.join(root, '.test-temp', 'jpeg-engine-corpus');
  fs.mkdirSync(base, { recursive: true });
  // Fixture generation happens before memory sampling and is test tooling only.
  execFileSync(process.env.REVELUMO_ORACLE_PYTHON || 'python3', [
    path.join(root, 'test', 'verify-jpeg-engine-corpus.py'), '--generate-fixtures', base,
  ], { stdio: 'inherit' });
  const label = path.basename(path.resolve(run)).replace(/[^a-zA-Z0-9._-]/g, '_');
  const directory = fs.mkdtempSync(path.join(base, `${label}-${process.pid}-`));
  const manifestPath = path.join(directory, 'manifest.json');
  const sentinelPid = sentinel.webContents.getOSProcessId();
  assert.ok(sentinelPid > 0, 'Editor sentinel must already have an OS renderer PID');
  const fixtures = [
    ['srgb', 'test/fixtures/exposure-srgb.jpg'], ['p3', 'test/fixtures/exposure-p3.jpg'],
    ...Array.from({ length: 8 }, (_, index) => [`orientation-${index + 1}`, `test/fixtures/exposure-orientation-${index + 1}.jpg`]),
    ['40mp', '.test-temp/jpeg-engine-corpus/40mp.jpg'],
    ['noise40mp', '.test-temp/jpeg-engine-corpus/noise40mp.jpg'],
    ['elongated', '.test-temp/jpeg-engine-corpus/elongated.jpg'],
  ];
  const manifest = {
    schemaVersion: 1, corpusVersion: 2, status: 'running', startedAt: new Date().toISOString(),
    root, run: path.resolve(run), directory, platform: process.platform, arch: process.arch,
    versions: process.versions, sentinelPid, maximumOutputBytes: MAXIMUM_OUTPUT_BYTES,
    sampleIntervalMs: SAMPLE_INTERVAL_MS,
    measurementNotes: [
      'Electron app.getAppMetrics memory values are KiB; samples are requested every 25 ms, not guaranteed peak measurements.',
      'Working-set sums can double-count shared pages. GPU/global Chromium cache reclamation and 8 GB device support are not established.',
      'The corpus includes four-quadrant 40 MP, deterministic repeated-noise-tile 40 MP, and uniform elongated 10000x4 JPEGs. It does not establish 8 GB machine support.',
      'High-frequency noise has no pixel-color assertion because chroma subsampling and JPEG generations require a separate error model; dimensions, ICC, hashes, memory and lifecycle are checked.',
      'Python generation precedes Electron measurements; independent oracle verification is run separately after capture.',
    ],
    oracle: { script: 'test/verify-jpeg-engine-corpus.py', neutralChannelTolerance: 6, combinedChannelTolerance: 8, patchSide: 5 },
    cases: [],
  };
  const persist = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  persist();
  console.log(`JPEG CORPUS manifest: ${manifestPath}`);

  try {
    for (const [fixture, relativeSource] of fixtures) {
      for (const { name, ...recipe } of RECIPES) {
        const sourcePath = path.join(root, relativeSource);
        const source = fs.readFileSync(sourcePath);
        const sourceSha256Before = sha256(source);
        const id = `${fixture}-${name}`;
        const outputPath = path.join(directory, `${id}.jpg`);
        const record = {
          id, fixture, sourcePath, outputPath, recipe, sourceBytes: source.byteLength,
          sourceSha256Before, startedAt: new Date().toISOString(), status: 'running',
          samples: [], ownedRenderers: [],
        };
        manifest.cases.push(record);
        const started = performance.now();
        const owned = [];
        const snapshot = phase => {
          const processes = app.getAppMetrics().map(metric => ({
            pid: metric.pid, type: metric.type, name: metric.name, creationTime: metric.creationTime,
            memory: { ...metric.memory },
          }));
          const sample = { elapsedMs: performance.now() - started, phase, processes };
          record.samples.push(sample);
          return sample;
        };
        const onWindow = (_event, window) => {
          if (window === sentinel) return;
          const item = { window, id: window.id, pid: 0 };
          owned.push(item);
          window.webContents.once('did-finish-load', () => {
            item.pid = window.webContents.getOSProcessId();
            snapshot('renderer-loaded');
          });
        };
        app.on('browser-window-created', onWindow);
        snapshot('before');
        const sampler = setInterval(() => snapshot('interval'), SAMPLE_INTERVAL_MS);
        try {
          const output = await engine.encodeJpegSnapshot({ source, recipe, maximumOutputBytes: MAXIMUM_OUTPUT_BYTES });
          record.encodeDurationMs = performance.now() - started;
          const settled = snapshot('settled');
          assert.ok(output.bytes instanceof Uint8Array, `${id}: output is a byte view`);
          assert.ok(output.bytes.byteLength > 0 && output.bytes.byteLength <= MAXIMUM_OUTPUT_BYTES, `${id}: bounded nonempty output`);
          record.width = output.width; record.height = output.height;
          record.outputBytes = output.bytes.byteLength; record.outputSha256 = sha256(output.bytes);
          fs.writeFileSync(outputPath, output.bytes, { flag: 'wx' });
          record.sourceSha256After = sha256(fs.readFileSync(sourcePath));
          record.sourceBufferSha256After = sha256(source);
          assert.equal(record.sourceSha256After, sourceSha256Before, `${id}: original file changed`);
          assert.equal(record.sourceBufferSha256After, sourceSha256Before, `${id}: caller-owned input changed`);
          assert.equal(owned.length, 1, `${id}: exactly one disposable renderer window`);
          for (const item of owned) {
            const observation = { id: item.id, pid: item.pid, destroyed: item.window.isDestroyed(), absentAtSettlement: !settled.processes.some(metric => metric.pid === item.pid) };
            record.ownedRenderers.push(observation);
            assert.ok(item.pid > 0, `${id}: auxiliary OS PID was observed`);
            assert.notEqual(item.pid, sentinelPid, `${id}: auxiliary cannot share editor PID`);
            assert.ok(observation.destroyed && observation.absentAtSettlement, `${id}: renderer must be destroyed and PID absent before settlement`);
            assert.ok(record.samples.some(sample => sample.processes.some(metric => metric.pid === item.pid)), `${id}: metrics observed auxiliary PID while alive`);
          }
          assert.ok(!sentinel.isDestroyed() && BrowserWindow.getAllWindows().includes(sentinel), `${id}: editor sentinel survives`);
          assert.equal(sentinel.webContents.getOSProcessId(), sentinelPid, `${id}: editor PID stays unchanged`);
          const responseStarted = performance.now();
          let responseTimeout;
          try {
            record.sentinelValue = await Promise.race([
              sentinel.webContents.executeJavaScript('6 * 7'),
              new Promise((_resolve, reject) => { responseTimeout = setTimeout(() => reject(new Error(`${id}: editor sentinel did not respond within 3 seconds`)), 3000); }),
            ]);
          } finally { clearTimeout(responseTimeout); }
          record.sentinelResponseMs = performance.now() - responseStarted;
          assert.equal(record.sentinelValue, 42, `${id}: editor sentinel responds after encoding`);
          await sleep(100);
          snapshot('post-job-baseline');
          record.status = 'passed';
        } catch (error) {
          record.status = 'failed';
          record.error = { name: error.name, message: error.message, code: error.code, stack: error.stack };
          throw error;
        } finally {
          clearInterval(sampler); app.removeListener('browser-window-created', onWindow);
          record.totalDurationMs = performance.now() - started;
          const intervals = record.samples.filter(sample => sample.phase === 'interval').map(sample => sample.elapsedMs);
          record.maximumIntervalGapMs = intervals.length > 1 ? Math.max(...intervals.slice(1).map((value, index) => value - intervals[index])) : null;
          const peakByPid = new Map();
          for (const sample of record.samples) {
            for (const metric of sample.processes) {
              const previous = peakByPid.get(metric.pid);
              if (!previous || metric.memory.workingSetSize > previous.workingSetSizeKiB) {
                peakByPid.set(metric.pid, { pid: metric.pid, type: metric.type, workingSetSizeKiB: metric.memory.workingSetSize, atElapsedMs: sample.elapsedMs });
              }
            }
          }
          record.sampledPeakWorkingSets = [...peakByPid.values()];
          record.sampledPeakAggregateWorkingSetKiB = Math.max(...record.samples.map(sample => sample.processes.reduce((sum, metric) => sum + metric.memory.workingSetSize, 0)));
          persist();
        }
        console.log(`PASS JPEG CORPUS ${id}: ${record.width}x${record.height}, ${record.outputBytes} bytes, ${record.encodeDurationMs.toFixed(1)} ms`);
      }
    }
    // A real 40 MP encode is canceled from the main process after renderer load.
    // This proves a post-load cancellation, not an exact decoder phase boundary.
    const sourcePath = path.join(base, '40mp.jpg');
    const source = fs.readFileSync(sourcePath);
    const controller = new AbortController();
    const started = performance.now();
    const cancellation = {
      id: '40mp-cancel-after-load', status: 'running', sourcePath,
      sourceBytes: source.byteLength, sourceSha256Before: sha256(source),
      recipe: { processingVersion: 2, exposureTenths: -10, temperature: 100, tint: 100 },
      abortDelayAfterLoadMs: 50, samples: [],
      limitation: 'Abort is scheduled 50 ms after did-finish-load. This is post-load/dispatch timing, not direct evidence that decoding already completed.',
    };
    manifest.cancellation = cancellation;
    let abortTimer, cancelWindow, cancelPid = 0;
    const sampleCancellation = phase => {
      const sample = { elapsedMs: performance.now() - started, phase, processes: app.getAppMetrics().map(metric => ({ pid: metric.pid, type: metric.type, memory: { ...metric.memory } })) };
      cancellation.samples.push(sample);
      return sample;
    };
    const onCancelWindow = (_event, window) => {
      assert.equal(cancelWindow, undefined, 'Cancel job owns exactly one renderer');
      cancelWindow = window;
      window.webContents.once('did-finish-load', () => {
        cancelPid = window.webContents.getOSProcessId();
        cancellation.rendererPid = cancelPid;
        cancellation.didFinishLoadElapsedMs = performance.now() - started;
        sampleCancellation('renderer-loaded');
        abortTimer = setTimeout(() => {
          cancellation.abortRequestedElapsedMs = performance.now() - started;
          sampleCancellation('abort-requested');
          controller.abort();
        }, cancellation.abortDelayAfterLoadMs);
      });
    };
    app.on('browser-window-created', onCancelWindow);
    sampleCancellation('before');
    const cancelSampler = setInterval(() => sampleCancellation('interval'), SAMPLE_INTERVAL_MS);
    try {
      await assert.rejects(engine.encodeJpegSnapshot({ source, recipe: cancellation.recipe, maximumOutputBytes: MAXIMUM_OUTPUT_BYTES }, controller.signal), { code: 'CANCELED' });
      cancellation.observedCode = 'CANCELED';
      cancellation.durationMs = performance.now() - started;
      const settled = sampleCancellation('settled');
      assert.ok(cancellation.abortRequestedElapsedMs > cancellation.didFinishLoadElapsedMs, 'Cancellation must be requested after renderer load');
      assert.ok(cancelPid > 0 && cancelPid !== sentinelPid, 'Canceled renderer has its own observed OS PID');
      cancellation.rendererDestroyed = cancelWindow.isDestroyed();
      cancellation.rendererAbsentAtSettlement = !settled.processes.some(metric => metric.pid === cancelPid);
      assert.ok(cancellation.rendererDestroyed && cancellation.rendererAbsentAtSettlement, 'Canceled renderer is gone before rejection settles');
      cancellation.sourceSha256After = sha256(fs.readFileSync(sourcePath));
      cancellation.sourceBufferSha256After = sha256(source);
      assert.equal(cancellation.sourceSha256After, cancellation.sourceSha256Before, 'Canceled job cannot alter the source file');
      assert.equal(cancellation.sourceBufferSha256After, cancellation.sourceSha256Before, 'Canceled job cannot alter caller bytes');
      assert.ok(!sentinel.isDestroyed(), 'Editor survives in-flight cancellation');
      assert.equal(sentinel.webContents.getOSProcessId(), sentinelPid, 'Editor retains its OS PID after cancellation');
      cancellation.sentinelValue = await sentinel.webContents.executeJavaScript('6 * 7');
      assert.equal(cancellation.sentinelValue, 42, 'Editor responds after in-flight cancellation');
      await sleep(100);
      sampleCancellation('post-job-baseline');
      cancellation.status = 'passed';
      console.log(`PASS JPEG CORPUS 40mp-cancel-after-load: CANCELED at ${cancellation.abortRequestedElapsedMs.toFixed(1)} ms, owned PID ${cancelPid} gone`);
    } catch (error) {
      cancellation.status = 'failed'; cancellation.error = { message: error.message, code: error.code, stack: error.stack };
      throw error;
    } finally {
      clearTimeout(abortTimer); clearInterval(cancelSampler); app.removeListener('browser-window-created', onCancelWindow); persist();
    }
    manifest.status = 'capture-passed';
    manifest.finishedAt = new Date().toISOString();
    persist();
    console.log(`JPEG CORPUS capture complete; run independent oracle: python3 test/verify-jpeg-engine-corpus.py ${manifestPath}`);
    return { manifestPath, directory, cases: manifest.cases.length };
  } catch (error) {
    manifest.status = 'failed'; manifest.finishedAt = new Date().toISOString(); persist();
    console.error(`JPEG CORPUS failure evidence: ${manifestPath}`);
    throw error;
  }
};
