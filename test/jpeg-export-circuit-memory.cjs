// Optional manual measurement: one existing deterministic 40 MP noise fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
async function digestFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
module.exports = async ({ exportJpeg, app, sentinel, root, run }) => {
  const sourcePath = path.join(root, '.test-temp/jpeg-engine-corpus/noise40mp.jpg');
  const sourceSha256 = await digestFile(sourcePath), before = fs.statSync(sourcePath, { bigint: true });
  const destination = path.join(run, 'noise-published.jpg');
  const samples = [], peaks = new Map(); let largestGapMs = 0, previous = 0;
  const started = performance.now();
  const sample = phase => {
    const elapsedMs = performance.now() - started;
    if (previous) largestGapMs = Math.max(largestGapMs, elapsedMs - previous); previous = elapsedMs;
    const processes = app.getAppMetrics().map(p => ({ pid: p.pid, creationTime: p.creationTime, type: p.type, workingSetKiB: p.memory.workingSetSize }));
    for (const p of processes) { const current = peaks.get(p.pid); if (!current || current.workingSetKiB < p.workingSetKiB) peaks.set(p.pid, p); }
    const { rss, heapUsed, external, arrayBuffers } = process.memoryUsage();
    samples.push({ phase, elapsedMs, aggregateWorkingSetKiB: processes.reduce((n, p) => n + p.workingSetKiB, 0), main: { rss, heapUsed, external, arrayBuffers }, processes });
  };
  sample('before'); const interval = setInterval(() => sample('interval'), 25);
  let result, durationMs;
  try {
    result = await exportJpeg({ sourcePath, sourceSha256, destination,
      recipe: { processingVersion: 2, exposureTenths: -10, temperature: 100, tint: 100 },
      originalPaths: [], protectedDirectories: [path.join(run, 'catalog')], maximumOutputBytes: 32 * 1024 * 1024,
    });
    durationMs = performance.now() - started; sample('settled');
    await new Promise(resolve => setTimeout(resolve, 100)); sample('post-cleanup');
  } finally { clearInterval(interval); }
  assert.deepEqual([result.width, result.height], [8000, 5000]); assert.equal(result.cleanupPending, false);
  assert.equal(await digestFile(sourcePath), sourceSha256);
  const after = fs.statSync(sourcePath, { bigint: true }); assert.equal(after.ino, before.ino); assert.equal(after.dev, before.dev);
  const sentinelValue = await sentinel.webContents.executeJavaScript('6 * 7'); assert.equal(sentinelValue, 42);
  const report = {
    schemaVersion: 1, platform: process.platform, versions: process.versions,
    sourceBytes: Number(before.size), sourceSha256, output: result, outputSha256: await digestFile(destination),
    durationMs, sampleIntervalMs: 25, largestGapMs, sentinelPid: sentinel.webContents.getOSProcessId(), sentinelValue,
    observedPeakProcesses: [...peaks.values()], peakAggregateWorkingSetKiB: Math.max(...samples.map(s => s.aggregateWorkingSetKiB)),
    before: samples[0], after: samples.at(-1), samples,
    limitations: ['Sequential complete circuit including metadata/writer copies, not concurrent jobs.', 'Sampled working sets can double-count shared pages; GPU/global allocations and an 8 GB target are not established.', 'Main external/arrayBuffers are diagnostics, not independent private RAM totals. Sampling can miss native peaks.'],
  };
  fs.writeFileSync(path.join(run, 'memory.json'), JSON.stringify(report, null, 2));
  console.log('CIRCUIT MEMORY PASS', JSON.stringify({ durationMs, sourceBytes: report.sourceBytes, outputBytes: result.bytesWritten, peakAggregateMiB: report.peakAggregateWorkingSetKiB / 1024, largestGapMs }));
};
