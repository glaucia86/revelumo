// Packaged renderer + preload + main. Substitute only the native Worker failure
// boundary; held ready messages exercise retirement before consumer acknowledgement.
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const repo = path.resolve(__dirname, '..'), run = path.resolve(process.argv[2]);
for (const name of ['userData', 'sessionData', 'crashDumps']) {
  const dir = path.join(run, name); fs.mkdirSync(dir, { recursive: true }); app.setPath(name, dir);
}
app.getPreferredSystemLanguages = () => ['en-US'];
const source = path.join(run, 'source.jpg');
fs.copyFileSync(path.join(repo, 'test/fixtures/sample.jpg'), source, fs.constants.COPYFILE_EXCL);
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
const issued = [], releases = [];
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, async (event, request) => {
  const result = await listener(event, request);
  if (channel === 'revelumo:preview' && request?.op === 'preview' && result.ok) {
    assert.ok(result.value.reservation, 'every successful preview carries its reservation');
    issued.push(result.value.reservation);
  }
  if (channel === 'revelumo:preview' && request?.op === 'release') releases.push({ lease: request.lease, generation: request.generation, ok: result.ok });
  return result;
});
require('./hidden-electron.cjs')(path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources/app.asar/.vite/build/index.cjs'));
let win;
const js = code => win.webContents.executeJavaScript(code), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(work, label) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { const value = await work(); if (value) return value; await delay(20); }
  throw new Error('Timed out: ' + label);
}
async function click(selector) { await js(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function released(reservation, label) {
  await until(() => releases.some(entry => entry.lease === reservation.lease), label);
  assert.deepEqual(releases.filter(entry => entry.lease === reservation.lease), [{ ...reservation, ok: true }]);
}
const timeout = setTimeout(() => { console.error('Preview reservation lifecycle timeout'); app.exit(1); }, 90000);
(async () => {
  await app.whenReady();
  win = await until(() => BrowserWindow.getAllWindows().find(item => item.webContents.getURL() === 'app://revelumo/index.html'), 'window');
  await until(() => js('Boolean(document.querySelector(".catalog-import") && !document.querySelector(".catalog-import").disabled)'), 'catalog');
  await click('.catalog-import'); await until(() => js('Boolean(document.querySelector(".tile"))'), 'import');
  await js(`(() => {
    const Native = window.Worker;
    window.previewReservationProbe = { holdReady: true, pending: [], workers: [], live: 0, terminated: 0, transferred: [] };
    window.Worker = class extends Native {
      constructor(...args) {
        if (previewReservationProbe.failCreate) { previewReservationProbe.failCreate = false; throw new Error('Synthetic creation failure'); }
        super(...args); this.stopped = false; previewReservationProbe.live++; previewReservationProbe.workers.push(this);
      }
      set onmessage(handler) {
        this.handler = handler;
        super.onmessage = event => {
          if (event.data.op === 'ready' && previewReservationProbe.holdReady) {
            previewReservationProbe.pending.push(() => handler(event)); return;
          }
          handler(event);
        };
      }
      get onmessage() { return this.handler; }
      postMessage(message, ...args) {
        if (message.op === 'prepare' && previewReservationProbe.failTransfer) {
          previewReservationProbe.failTransfer = false; throw new Error('Synthetic transfer failure');
        }
        const bytes = message.op === 'prepare' ? message.bytes : null;
        super.postMessage(message, ...args);
        if (bytes) previewReservationProbe.transferred.push(bytes.byteLength === 0);
      }
      terminate() {
        super.terminate();
        if (!this.stopped) { this.stopped = true; previewReservationProbe.live--; previewReservationProbe.terminated++; }
      }
    };
  })()`);

  // Ready is held at the external event boundary. Native decoding may already
  // have finished, but the renderer cannot assume consumption before its receipt.
  await click('[aria-label="Open source.jpg"]');
  await until(() => js('previewReservationProbe.pending.length === 1'), 'held ready');
  const first = issued.at(-1);
  assert.equal(releases.length, 0, 'transfer alone must not return the reservation');
  await click('.back');
  await until(() => js('document.querySelector("main").dataset.view === "catalog"'), 'retire before ready');
  await released(first, 'terminated Worker releases its reservation');
  assert.equal(await js('previewReservationProbe.live'), 0);
  await js('previewReservationProbe.pending.shift()()'); await delay(50);
  assert.equal(releases.filter(entry => entry.lease === first.lease).length, 1, 'a late ready after terminate cannot double release');

  // A live Worker releases only on its matching ready, then ordinary cleanup is
  // idempotent. Session creation still proceeds through the real product API.
  await click('[aria-label="Open source.jpg"]');
  await until(() => js('previewReservationProbe.pending.length === 1'), 'second held ready');
  const second = issued.at(-1);
  assert.equal(releases.some(entry => entry.lease === second.lease), false);
  await js('previewReservationProbe.pending.shift()()');
  await released(second, 'ready acknowledges consumption');
  await until(() => js('Boolean(document.querySelector("canvas")?.dataset.renderRequestId)'), 'prepared canvas');
  assert.equal(await js('previewReservationProbe.live'), 1);
  await click('.back');
  await until(() => js('document.querySelector("main").dataset.view === "catalog"'), 'second exit');
  assert.equal(releases.filter(entry => entry.lease === second.lease).length, 1);

  // Native Worker allocation/transfer failures and asynchronous error all have
  // one explicit retry, retain no live owner, and return each delivered lease.
  for (const failure of ['failCreate', 'failTransfer', 'asyncError']) {
    await js(`previewReservationProbe.${failure} = true`);
    await click('[aria-label="Open source.jpg"]');
    if (failure === 'asyncError') {
      await until(() => js('previewReservationProbe.pending.length === 1'), 'error attempt received input');
      await js('previewReservationProbe.workers.at(-1).onerror(new Event("error"))');
    }
    await until(() => js('Boolean(document.querySelector(".preview-retry"))'), 'explicit retry after ' + failure);
    const failed = issued.at(-1);
    await released(failed, failure + ' releases its reservation');
    assert.equal(await js('previewReservationProbe.live'), 0, failure + ' leaves no Worker owner');
    if (failure === 'asyncError') {
      await js('previewReservationProbe.pending.shift()()'); await delay(50);
      assert.equal(releases.filter(entry => entry.lease === failed.lease).length, 1);
    }
    await click('.back');
    await until(() => js('document.querySelector("main").dataset.view === "catalog"'), 'exit failed preview');
  }
  assert.ok((await js('previewReservationProbe.transferred')).every(Boolean), 'real successful Worker transfers detach their renderer buffer');
  assert.equal(issued.length, 5);
  assert.equal(releases.length, 5);
  const result = { ok: true, issued, releases, workers: await js('({live:previewReservationProbe.live,terminated:previewReservationProbe.terminated})'), versions: process.versions };
  fs.writeFileSync(path.join(run, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result)); clearTimeout(timeout); app.exit(0);
})().catch(error => {
  console.error(error.stack); fs.writeFileSync(path.join(run, 'failure.txt'), error.stack); clearTimeout(timeout); app.exit(1);
});
