const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const electron = require('electron');
const { app, BrowserWindow } = electron;
const Module = require('node:module');
const root = path.resolve(__dirname, '..'), run = path.resolve(process.argv[2]);
const mode = process.argv[3] || 'full';
const appRoot = mode === 'basic' ? root : path.join(root, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources', 'app.asar');
fs.mkdirSync(run, { recursive: true }); app.setPath('userData', path.join(run, 'user-data'));
let sentinel;
const fatal = error => { console.error(error.stack || error); app.exit(1); };
process.on('uncaughtException', fatal); process.on('unhandledRejection', fatal);
app.on('window-all-closed', () => {});
const timer = setTimeout(() => fatal(new Error('Engine test exceeded its deadline')), 120000);
app.whenReady().then(async () => {
  sentinel = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await sentinel.loadURL('about:blank');
  const sentinelPid = sentinel.webContents.getOSProcessId(), owned = [];
  app.on('browser-window-created', (_event, window) => {
    const record = { window, pid: 0 }; owned.push(record);
    window.webContents.on('did-finish-load', () => { record.pid = window.webContents.getOSProcessId(); });
  });
  let fault = null, securityProbe, ghostProcess, requestGuard, permissionGuard, permissionCheck, releaseSession, releasedGuards, previousJob;
  class EngineWindow extends BrowserWindow {
    constructor(options) {
      if (fault === 'constructor') throw new Error('Injected window construction failure');
      super(options);
      if (fault === 'setup') this.webContents.setWindowOpenHandler = () => { throw new Error('Injected setup failure'); };
      if (fault === 'session-release') {
        releaseSession = this.webContents.session; releasedGuards = {};
        for (const [owner, method] of [[releaseSession.webRequest, 'onBeforeRequest'], [releaseSession, 'setPermissionRequestHandler'], [releaseSession, 'setPermissionCheckHandler']]) {
          const original = owner[method].bind(owner);
          owner[method] = handler => { releasedGuards[method] = handler; original(handler); };
        }
      }
      if (fault === 'security') {
        assert.equal(options.webPreferences.sandbox, true);
        assert.equal(options.webPreferences.contextIsolation, true);
        assert.equal(options.webPreferences.nodeIntegration, false);
        assert.equal(options.webPreferences.webSecurity, true);
        const session = this.webContents.session;
        const before = session.webRequest.onBeforeRequest.bind(session.webRequest);
        session.webRequest.onBeforeRequest = callback => { if (callback) requestGuard = callback; before(callback); };
        const permission = session.setPermissionRequestHandler.bind(session);
        session.setPermissionRequestHandler = callback => { if (callback) permissionGuard = callback; permission(callback); };
        const check = session.setPermissionCheckHandler.bind(session);
        session.setPermissionCheckHandler = callback => { if (callback) permissionCheck = callback; check(callback); };
      }
      if (fault === 'cleanup-blocked') {
        const destroy = this.destroy.bind(this);
        this.destroy = () => { ghostProcess = app.getAppMetrics().find(metric => metric.pid === this.webContents.getOSProcessId()); destroy(); };
      }
      if (['remember-output', 'late-output', 'invalid-output'].includes(fault)) {
        const mode = fault, send = this.webContents.send.bind(this.webContents);
        this.webContents.send = (channel, job) => {
          if (channel !== 'revelumo:jpeg-engine-input') return send(channel, job);
          if (mode === 'remember-output') previousJob = { sender: this.webContents, senderFrame: this.webContents.mainFrame, jobId: job.jobId };
          if (mode === 'late-output') electron.ipcMain.emit('revelumo:jpeg-engine-result', previousJob, { jobId: previousJob.jobId, bytes: new Uint8Array(0) });
          if (mode === 'invalid-output') { this.webContents.executeJavaScript(`window.jpegEngine.result({jobId: ${JSON.stringify(job.jobId)}, bytes: new Uint8Array(0), width:80,height:40})`); return; }
          send(channel, job);
        };
      }
      if (fault === 'stale') {
        const send = this.webContents.send.bind(this.webContents);
        this.webContents.send = (channel, job) => {
          if (channel !== 'revelumo:jpeg-engine-input') return send(channel, job);
          electron.ipcMain.emit('revelumo:jpeg-engine-result', { sender: sentinel.webContents, senderFrame: sentinel.webContents.mainFrame }, { jobId: job.jobId, bytes: new Uint8Array(0) });
          electron.ipcMain.emit('revelumo:jpeg-engine-result', { sender: this.webContents, senderFrame: sentinel.webContents.mainFrame }, { jobId: job.jobId, bytes: new Uint8Array(0) });
          this.webContents.executeJavaScript(`window.jpegEngine.result({ jobId: 'another-job', bytes: new Uint8Array([255,216,255,217]), width:80,height:40 })`).then(() => send(channel, job));
        };
      }
      if (fault === 'security') {
        const send = this.webContents.send.bind(this.webContents);
        this.webContents.send = (channel, job) => {
          if (channel !== 'revelumo:jpeg-engine-input') return send(channel, job);
          for (const name of ['will-navigate', 'will-redirect', 'will-attach-webview']) {
            let denied = false; this.webContents.emit(name, { preventDefault() { denied = true; } }); assert.equal(denied, true);
          }
          let downloadDenied = false; this.webContents.session.emit('will-download', { preventDefault() { downloadDenied = true; } }); assert.equal(downloadDenied, true);
          securityProbe = this.webContents.executeJavaScript(`({ popupOpened: window.open('about:blank') !== null, requireType: typeof require, processType: typeof process })`);
          securityProbe.then(() => send(channel, job));
        };
      }
      if (fault === 'timeout') this.webContents.send = () => {};
      if (fault === 'crash') this.webContents.once('did-finish-load', () => {
        assert.notEqual(this.webContents.getOSProcessId(), sentinelPid); this.webContents.forcefullyCrashRenderer();
      });
      if (fault === 'closed-load') { const load = this.loadFile.bind(this); this.loadFile = async (...args) => { await load(...args); this.destroy(); throw new Error('Closed before load settled'); }; }
      if (fault === 'loaded-failure') { const load = this.loadFile.bind(this); this.loadFile = async (...args) => { await load(...args); throw new Error('Failure after renderer creation'); }; }
      if (fault === 'load') this.loadFile = async () => { throw new Error('Injected local asset load failure'); };
    }
  }
  const originalLoad = Module._load;
  const enginePath = path.join(appRoot, '.vite/build/jpeg-export-engine.cjs');
  Module._load = function(name, parent, ...args) {
    if (name === 'node:timers' && parent?.filename === enginePath) return { ...require('node:timers'), setTimeout: (callback, ms, ...args) => setTimeout(callback, fault === 'timeout' && ms === 60000 ? 50 : ms, ...args) };
    if (name === 'electron' && parent?.filename === enginePath) return { ...electron, BrowserWindow: EngineWindow, app: { getAppMetrics: () => { const metrics = app.getAppMetrics(); return fault === 'cleanup-blocked' && ghostProcess && !metrics.some(metric => metric.pid === ghostProcess.pid) ? [...metrics, ghostProcess] : metrics; } } };
    return originalLoad.call(this, name, parent, ...args);
  };
  const engine = require(enginePath); Module._load = originalLoad;
  const source = fs.readFileSync(path.join(root, 'test/fixtures/exposure-srgb.jpg'));
  const output = await engine.encodeJpegSnapshot({ source, recipe: { processingVersion: 2, exposureTenths: 10, temperature: 0, tint: 0 }, maximumOutputBytes: 1024 * 1024 });
  assert.ok(output.bytes instanceof Uint8Array); assert.ok(output.bytes.length > 0);
  assert.equal(output.width, 80); assert.equal(output.height, 40);
  fs.writeFileSync(path.join(run, 'encoded.jpg'), output.bytes, { flag: 'wx' });
  assert.equal(await sentinel.webContents.executeJavaScript('6 * 7'), 42);
  console.log('PASS basic full-resolution encoding');
  const first = engine.encodeJpegSnapshot({ source, recipe: { processingVersion: 2, exposureTenths: 0, temperature: 0, tint: 0 }, maximumOutputBytes: 1024 * 1024 });
  await assert.rejects(engine.encodeJpegSnapshot({ source, recipe: { processingVersion: 2, exposureTenths: 0, temperature: 0, tint: 0 }, maximumOutputBytes: 1024 * 1024 }), { code: 'BUSY' });
  await first;
  console.log('PASS single-flight rejects overlap');
  const beforeCancel = BrowserWindow.getAllWindows().length;
  await assert.rejects(engine.encodeJpegSnapshot({ source, recipe: { processingVersion: 2, exposureTenths: 0, temperature: 0, tint: 0 }, maximumOutputBytes: 1024 * 1024 }, AbortSignal.abort()), { code: 'CANCELED' });
  assert.equal(BrowserWindow.getAllWindows().length, beforeCancel);
  console.log('PASS cancel before launch creates no window');
  const controller = new AbortController();
  const canceling = engine.encodeJpegSnapshot({ source, recipe: { processingVersion: 2, exposureTenths: 0, temperature: 0, tint: 0 }, maximumOutputBytes: 1024 * 1024 }, controller.signal);
  controller.abort();
  await assert.rejects(canceling, { code: 'CANCELED' });
  assert.equal(await sentinel.webContents.executeJavaScript('6 * 7'), 42);
  await engine.encodeJpegSnapshot({ source, recipe: { processingVersion: 2, exposureTenths: 0, temperature: 0, tint: 0 }, maximumOutputBytes: 1024 * 1024 });
  console.log('PASS active cancellation preserves editor and permits next job');
  assert.ok(owned.some(record => record.pid > 0));
  for (const record of owned.filter(record => record.pid > 0)) {
    assert.notEqual(record.pid, sentinelPid, 'Auxiliary process must differ from editor');
    assert.ok(record.window.isDestroyed());
    assert.ok(!app.getAppMetrics().some(metric => metric.pid === record.pid), `Owned renderer ${record.pid} still exists after job settlement`);
  }
  console.log('PASS distinct auxiliary PIDs disappear before settlement');
  const goodRecipe = { processingVersion: 2, exposureTenths: 0, temperature: 0, tint: 0 };
  const beforeInvalid = owned.length;
  for (const recipe of [{ ...goodRecipe, crop: null }, { ...goodRecipe, processingVersion: 3 }, { ...goodRecipe, tint: 101 }]) {
    await assert.rejects(engine.encodeJpegSnapshot({ source, recipe, maximumOutputBytes: 1024 }), { code: 'UNSUPPORTED_RECIPE' });
  }
  for (const maximumOutputBytes of [0, -1, 0.5, NaN, Infinity]) await assert.rejects(engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes }), { code: 'INVALID_BUDGET' });
  await assert.rejects(engine.encodeJpegSnapshot({ source: Buffer.alloc(32 * 1024 * 1024 + 1), recipe: goodRecipe, maximumOutputBytes: 1024 }), { code: 'SOURCE_TOO_LARGE' });
  await assert.rejects(engine.encodeJpegSnapshot({ source: new Uint8Array(new SharedArrayBuffer(32)), recipe: goodRecipe, maximumOutputBytes: 1024 }), { code: 'INVALID_SOURCE' });
  await assert.rejects(engine.encodeJpegSnapshot({ source: Buffer.from('not a JPEG'), recipe: goodRecipe, maximumOutputBytes: 1024 }), { code: 'INVALID_SOURCE' });
  assert.equal(owned.length, beforeInvalid, 'Invalid input must not launch a renderer');
  console.log('PASS invalid recipes/crop, sources and budgets rejected before launch');
  const mutable = { source: Buffer.from(source), recipe: { ...goodRecipe }, maximumOutputBytes: 1024 * 1024 };
  const snapshotted = engine.encodeJpegSnapshot(mutable);
  mutable.source.fill(0); mutable.recipe.tint = 100; mutable.maximumOutputBytes = 1;
  const immutableResult = await snapshotted;
  assert.ok(immutableResult.bytes.length > 1);
  console.log('PASS async job owns its bytes, recipe and output budget snapshot');
  fault = 'constructor';
  await assert.rejects(engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 }), { code: 'WINDOW_FAILED' });
  fault = null;
  await engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 });
  console.log('PASS constructor failure with no PID cannot latch the engine busy');
  fault = 'setup';
  await assert.rejects(engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 }), { code: 'WINDOW_FAILED' });
  assert.ok(owned.at(-1).window.isDestroyed());
  fault = null;
  await engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 });
  console.log('PASS security setup failure destroys owned window and releases gate');
  fault = 'load';
  await assert.rejects(engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 }), { code: 'LOAD_FAILED' });
  fault = null;
  await engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 });
  console.log('PASS load failure before PID cleans up and permits retry');
  fault = 'loaded-failure';
  await assert.rejects(engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 }), { code: 'LOAD_FAILED' });
  const failedLoaded = owned.at(-1);
  assert.ok(failedLoaded.pid > 0);
  assert.ok(!app.getAppMetrics().some(metric => metric.pid === failedLoaded.pid), 'Failed load renderer must disappear before rejection');
  fault = null;
  console.log('PASS failure after renderer creation observes cleanup before rejection');
  fault = 'closed-load';
  await assert.rejects(engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 }), { code: 'RENDERER_FAILED' });
  const closedLoad = owned.at(-1);
  assert.ok(closedLoad.pid > 0);
  assert.ok(!app.getAppMetrics().some(metric => metric.pid === closedLoad.pid), 'Closed loading renderer must disappear before rejection');
  fault = null;
  console.log('PASS closed loading window cannot bypass observed renderer cleanup');
  fault = 'crash';
  await assert.rejects(Promise.race([
    engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 }),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Crash failed to settle the engine')), 1500)),
  ]), { code: 'RENDERER_FAILED' });
  fault = null;
  assert.equal(await sentinel.webContents.executeJavaScript('6 * 7'), 42);
  await engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 });
  console.log('PASS renderer crash settles without touching the editor');
  fault = 'timeout';
  await assert.rejects(Promise.race([
    engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 }),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Missing bounded engine timeout')), 1500)),
  ]), { code: 'TIMEOUT' });
  fault = null;
  await engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 });
  console.log('PASS timeout destroys the stalled renderer and releases the gate');
  fault = 'security';
  await engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 });
  assert.deepEqual(await securityProbe, { popupOpened: false, requireType: 'undefined', processType: 'undefined' });
  for (const url of ['https://example.invalid/image.jpg', 'file:///etc/passwd', 'data:text/html,test']) {
    let response; requestGuard({ url }, value => { response = value; }); assert.deepEqual(response, { cancel: true });
  }
  let permission; permissionGuard(null, 'camera', value => { permission = value; }); assert.equal(permission, false);
  assert.equal(permissionCheck(), false);
  fault = null;
  console.log('PASS sandboxed engine cannot open popup or access Node');
  fault = 'stale';
  const afterStale = await engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 });
  assert.equal(afterStale.width, 80); fault = null;
  console.log('PASS wrong sender/frame/job cannot settle the current job');
  await assert.rejects(engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1 }), { code: 'OUTPUT_TOO_LARGE' });
  const truncated = source.subarray(0, source.indexOf(Buffer.from([255, 218])) + 10);
  await assert.rejects(engine.encodeJpegSnapshot({ source: truncated, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 }), { code: 'ENCODE_FAILED' });
  console.log('PASS codec failure and explicit output quota are distinguishable');
  fault = 'remember-output';
  await engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 });
  fault = 'late-output';
  const afterLate = await engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 });
  assert.equal(afterLate.width, 80);
  fault = 'invalid-output';
  await assert.rejects(engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 }), { code: 'INVALID_OUTPUT' });
  assert.ok(owned.at(-1).window.isDestroyed());
  assert.ok(!app.getAppMetrics().some(metric => metric.pid === owned.at(-1).pid));
  fault = null;
  await engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 });
  console.log('PASS prior-job late response ignored and malformed current output cleans up');
  fault = 'session-release';
  await engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 });
  assert.deepEqual(releasedGuards, { onBeforeRequest: null, setPermissionRequestHandler: null, setPermissionCheckHandler: null });
  assert.equal(releaseSession.listenerCount('will-download'), 0);
  fault = null;
  console.log('PASS completed session releases callbacks and compressed source references');
  fault = 'cleanup-blocked';
  await assert.rejects(engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 }), { code: 'CLEANUP_UNCONFIRMED' });
  await assert.rejects(engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 }), { code: 'CLEANUP_UNCONFIRMED' });
  fault = null; ghostProcess = undefined;
  await engine.encodeJpegSnapshot({ source, recipe: goodRecipe, maximumOutputBytes: 1024 * 1024 });
  console.log('PASS unconfirmed cleanup quarantines work and recovers only after observed exit');
  if (mode === 'corpus') await require('./jpeg-engine-corpus.cjs')({ engine, app, BrowserWindow, sentinel, run, root });
  console.log('ENGINE PASS', JSON.stringify({ width: output.width, height: output.height, bytes: output.bytes.length }));
  clearTimeout(timer); sentinel.destroy(); app.exit(0);
}).catch(fatal);
