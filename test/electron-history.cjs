// Exercise the real packaged renderer, main process and SQLite. Synthetic JPEGs only.
const electron = require('electron');
const { app, dialog, BrowserWindow: RealWindow, nativeImage } = electron;
// Pin the OS adapter for legacy Portuguese UI assertions; language tests cover detection.
app.getPreferredSystemLanguages = () => ['pt-BR'];
const Module = require('node:module'), load = Module._load;
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
let failureDirectory = null, failureMode = null;
const fatal = error => { console.error(error.stack || error); if (failureDirectory) fs.writeFileSync(path.join(failureDirectory, `history-${failureMode}-failure.txt`), String(error.stack || error)); app.exit(1); };
process.on('uncaughtException', fatal); process.on('unhandledRejection', fatal);
dialog.showErrorBox = (title, message) => fatal(new Error(`${title}: ${message}`));
let invokeHandler, heldHistory = null, failHistoryAck = false, failExposureAck = false;
const hidden = { ...electron, ipcMain: { handle(channel, handler) { invokeHandler = handler; electron.ipcMain.handle(channel, async (event, input) => {
  const result = await handler(event, input);
  if ((input?.op === 'exposure' || input?.op === 'adjustments') && failExposureAck) { failExposureAck = false; throw new Error('Test: response lost after committed exposure'); }
  if (input?.op === 'exposure-history') {
    if (heldHistory) { heldHistory.entered = true; await heldHistory.promise; }
    if (failHistoryAck) { failHistoryAck = false; throw new Error('Test: response lost after committed history'); }
  }
  return result;
}); } }, BrowserWindow: class extends RealWindow { constructor(options) { super({ ...options, show: false }); } } };
const run = path.resolve(process.argv[2]), mode = process.argv[3] || 'first', repo = path.resolve(__dirname, '..');
for (const name of ['user-data', 'session-data', 'crash-dumps']) fs.mkdirSync(path.join(run, name), { recursive: true });
app.setPath('userData', path.join(run, 'user-data')); app.setPath('sessionData', path.join(run, 'session-data')); app.setPath('crashDumps', path.join(run, 'crash-dumps'));
failureDirectory = run; failureMode = mode;
const dbPath = path.join(run, 'user-data', 'catalog.sqlite'), file = path.join(run, 'gray.jpg');
const id = '420ce72c-2bb7-4e40-89ec-e3945c5b5425', hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (mode === 'first') {
  assert.equal(fs.existsSync(dbPath), false);
  const bitmap = Buffer.alloc(64 * 32 * 4, 128); for (let i = 3; i < bitmap.length; i += 4) bitmap[i] = 255;
  fs.writeFileSync(file, nativeImage.createFromBitmap(bitmap, { width: 64, height: 32 }).toJPEG(100));
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE photos (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, sha256 TEXT, rating INTEGER, flag TEXT NOT NULL DEFAULT 'neutral'); CREATE TABLE thumbnails (photo_id TEXT PRIMARY KEY, data_url TEXT NOT NULL); CREATE TABLE recipes (photo_id TEXT PRIMARY KEY, exposure_tenths INTEGER, processing_version INTEGER); PRAGMA user_version=5");
  db.prepare('INSERT INTO photos VALUES (?, ?, ?, ?, 4, ?)').run(id, file, 'gray.jpg', hash(fs.readFileSync(file)), 'selected');
  db.prepare('INSERT INTO thumbnails VALUES (?, ?)').run(id, 'data:image/jpeg;base64,' + fs.readFileSync(file).toString('base64'));
  db.prepare('INSERT INTO recipes VALUES (?, 0, 1)').run(id); db.close();
  fs.writeFileSync(path.join(run, 'original.sha256'), hash(fs.readFileSync(file)));
}
let win;
const checks = [], delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.on('before-quit', event => { if (win?.isDestroyed()) event.preventDefault(); });
const js = code => win.webContents.executeJavaScript(code), api = (method, ...args) => js(`window.revelumo.${method}(${args.map(JSON.stringify).join(',')})`);
async function until(work, label) { const end = Date.now() + 20000; while (Date.now() < end) { const value = await work(); if (value) return value; await delay(25); } throw new Error('Timed out: ' + label); }
const button = text => `Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(text)})`;
const click = text => js(`${button(text)}.click()`);
const numeric = 'document.querySelector(".exposure input[type=number]")';
async function saved(value) { await until(() => js(`${numeric}?.value !== '' && Number(${numeric}?.value) === ${value} && document.querySelector('.save-status')?.textContent === 'Salvo'`), 'saved ' + value); }
async function pixels() { return js(`(()=>{const c=document.querySelector('canvas');return Array.from(c.getContext('2d').getImageData(10,10,1,1).data);})()`); }
async function typeNumber(text, finish = true) {
  await js(`${numeric}.focus()`);
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  for (const key of text) await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'char', text: key, key });
  if (finish) await js(`${numeric}.blur()`);
}
async function open() { await until(() => js('Boolean(document.querySelector(".tile"))'), 'grid'); await js('document.querySelector(\'[aria-label="Abrir gray.jpg"]\').click()'); await until(() => js('Boolean(document.querySelector("canvas")?.dataset.revision && document.querySelector(".exposure input") && !document.querySelector(".exposure input").disabled)'), 'editing ready'); }
const timer = setTimeout(() => fatal(new Error('History test exceeded timeout')), 120000);
Module._load = function(request, ...args) { return request === 'electron' ? hidden : load.call(this, request, ...args); };
try { require(path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources', 'app.asar', '.vite', 'build', 'index.cjs')); } finally { Module._load = load; }
(async () => {
  await app.whenReady(); win = await until(() => RealWindow.getAllWindows().find(w => w.webContents.getURL() === 'app://revelumo/index.html'), 'window');
  assert.equal(win.isVisible(), false); await open(); win.webContents.debugger.attach('1.3');
  assert.equal(await js(`Boolean(${button('Desfazer exposição')})`), true, 'Undo is available as an accessible named button');
  assert.equal(await js(`Boolean(${button('Refazer exposição')})`), true, 'Redo is available as an accessible named button');
  if (mode === 'first') {
    await saved(0); assert.equal(await js(`${button('Desfazer exposição')}.disabled`), true);
    await typeNumber('1'); await saved(1);
    await until(async () => Math.abs((await pixels())[0] - 176) <= 2, '+1 EV pixels');
    await click('Desfazer exposição'); await saved(0);
    await until(async () => Math.abs((await pixels())[0] - 128) <= 1, 'undo neutral pixels');
    await click('Refazer exposição'); await saved(1);
    await typeNumber('2'); await saved(2); await click('Desfazer exposição'); await saved(1);
    checks.push('named controls; real numeric keyboard → pixels → save → undo/redo; finish at undo cursor');
    win.close(); await until(() => win.isDestroyed(), 'normal close');
  } else if (mode === 'reopen') {
    await saved(1); assert.equal(await js(`${button('Refazer exposição')}.disabled`), false);
    await click('Refazer exposição'); await saved(2); await until(async () => Math.abs((await pixels())[0] - 239) <= 2, 'reopened redo pixels');
    checks.push('new Electron process recovers cursor and redo values/pixels');
  } else if (mode === 'gestures') {
    await saved(2);
    await typeNumber('1', false); await saved(1); await delay(350);
    for (const key of '.2') await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'char', text: key, key });
    await saved(1.2); await js(`${numeric}.blur()`); await saved(1.2);
    await click('Desfazer exposição'); await delay(100); await until(() => js("document.querySelector('.save-status').textContent === 'Salvo'"), 'undo settled');
    assert.equal(Number(await js(`${numeric}.value`)), 2, 'typing with pauses and intermediate autosaves is one undo step');
    checks.push('paused numeric typing is one undo step');
    await typeNumber('0.5'); await typeNumber('-0.7'); await saved(-0.7);
    await click('Desfazer exposição'); await saved(0.5); await click('Desfazer exposição'); await saved(2);
    checks.push('two completed numeric gestures survive one debounce window');
    const range = await js(`(()=>{const r=document.querySelector('.exposure input[type=range]').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`);
    const mouse = (type, x) => win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, x, y: range.y + range.height / 2, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
    await mouse('mousePressed', range.x + range.width / 2); await saved(0); await delay(350);
    await mouse('mouseMoved', range.x + range.width - 1); await mouse('mouseReleased', range.x + range.width - 1); await saved(3);
    await click('Desfazer exposição'); await saved(2);
    checks.push('real pointer drag with a persisted pause is one step');
    await js('document.querySelector(".exposure input[type=range]").focus()');
    for (let i = 0; i < 3; i++) {
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, autoRepeat: i > 0 });
      await delay(350);
    }
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
    await saved(1.7); await click('Desfazer exposição'); await saved(2);
    await click('Redefinir exposição'); await saved(0); await click('Desfazer exposição'); await saved(2);
    checks.push('held slider keys form one step; reset can be undone');
  } else if (mode === 'history-failure') {
    await typeNumber('0.4'); await saved(0.4); await typeNumber('0.8'); await saved(0.8);
    failHistoryAck = true; await click('Desfazer exposição');
    await until(() => js("document.querySelector('.save-status').textContent === 'Não salvo'"), 'lost history acknowledgement');
    assert.equal((await api('recipePhoto', id)).value.exposureTenths, 4, 'the real transaction committed before the response failed');
    assert.equal(await js(`Boolean(${button('Tentar alterar histórico')})`), true, 'history failures offer a dedicated retry');
    await click('Tentar alterar histórico'); await saved(0.4);
    assert.equal((await api('recipePhoto', id)).value.exposureTenths, 4, 'retry does not perform Undo twice');
    checks.push('lost response retries the same Undo exactly once');
    await click('Refazer exposição'); await saved(0.8);
    let release; heldHistory = { promise: new Promise(resolve => { release = resolve; }), entered: false };
    await click('Desfazer exposição'); await until(() => heldHistory.entered, 'held Undo acknowledgement');
    win.close(); await delay(100); assert.equal(win.isDestroyed(), false, 'normal close waits for the current history acknowledgement');
    release(); heldHistory = null; await until(() => win.isDestroyed(), 'close after confirmed Undo');
    checks.push('normal close waits for Undo and retires the confirmed session');
  } else if (mode === 'history-reopen') {
    await saved(0.4); await click('Refazer exposição'); await saved(0.8);
    checks.push('reopen after close during Undo recovers recipe and cursor');
  } else if (mode === 'interrupt') {
    await saved(0.8); await typeNumber('1', false); await saved(1);
    for (const key of '.2') await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'char', text: key, key });
    assert.equal(await js(`${numeric}.value`), '1.2');
    checks.push('forced exit with an unpersisted draft after an earlier gesture checkpoint');
  } else if (mode === 'interrupt-reopen') {
    await saved(1); await click('Desfazer exposição'); await saved(0.8);
    await click('Refazer exposição'); await saved(1);
    checks.push('forced exit recovers only the persisted checkpoint as one step');
  } else if (mode === 'save-failure') {
    await typeNumber('0.4'); await saved(0.4);
    failExposureAck = true; await typeNumber('0.8');
    await until(() => js("document.querySelector('.save-status').textContent === 'Não salvo'"), 'lost save acknowledgement');
    await typeNumber('1.2'); await saved(1.2);
    assert.equal((await api('recipePhoto', id)).value.exposureTenths, 12, 'a newer completed gesture can save after a lost acknowledgement');
    await saved(1.2); await click('Desfazer exposição'); await saved(0.8); await click('Desfazer exposição'); await saved(0.4);
    checks.push('lost save acknowledgement followed by a new gesture preserves both steps exactly once');
  } else if (mode === 'many-pending') {
    await typeNumber('0.4'); await saved(0.4);
    const lock = new DatabaseSync(dbPath); lock.exec('BEGIN IMMEDIATE');
    try {
      await typeNumber('0.8'); await until(() => js("document.querySelector('.save-status').textContent === 'Não salvo'"), 'locked initial save');
      await js(`(()=>{const e=${numeric}; const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(let i=0;i<1025;i++){e.focus();set.call(e,i%2?'1.1':'0.9');e.dispatchEvent(new Event('input',{bubbles:true}));e.blur();}})()`);
      await delay(350);
    } finally { lock.exec('ROLLBACK'); lock.close(); }
    await click('Tentar salvar novamente'); await saved(0.9);
    await click('Desfazer exposição'); await saved(1.1); await click('Desfazer exposição'); await saved(0.9);
    checks.push('more than one IPC batch of completed gestures recovers after a lock without losing the latest draft');
  } else if (mode === 'key-chord') {
    await typeNumber('2'); await saved(2);
    const r = await js(`(()=>{const r=document.querySelector('.exposure input[type=range]').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`);
    const mouse = (type, x) => win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, x, y: r.y + r.height / 2, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
    await mouse('mousePressed', r.x + r.width / 2); await saved(0);
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 8 });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
    await mouse('mouseMoved', r.x + r.width - 1); await mouse('mouseReleased', r.x + r.width - 1); await saved(3);
    await click('Desfazer exposição'); await delay(100); await until(() => js("document.querySelector('.save-status').textContent === 'Salvo'"), 'undo chord settled');
    assert.equal(Number(await js(`${numeric}.value`)), 2, 'releasing Shift does not split a pointer gesture');
    checks.push('unrelated key releases do not split an active pointer drag');
    await js('document.querySelector(".exposure input[type=range]").focus()');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 }); await saved(1.9);
    await js('window.dispatchEvent(new Event("blur"))');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 }); await saved(1.8);
    await click('Desfazer exposição'); await delay(100); await until(() => js("document.querySelector('.save-status').textContent === 'Salvo'"), 'undo after window blur');
    assert.equal(Number(await js(`${numeric}.value`)), 1.9, 'leaving the window ends the held-key gesture even when keyup is lost');
    checks.push('window blur closes a slider gesture before later input');
  } else if (mode === 'retention') {
    await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Voltar à grade")).click()');
    await until(() => js('Boolean(document.querySelector(".tile"))'), 'grid before retention');
    const editing = await api('beginEditingPhoto', id); assert.ok(editing.ok);
    let state;
    for (let revision = 1; revision <= 101; revision++) {
      const result = await api('saveExposure', id, editing.value.sessionId, revision, revision % 2 ? 5 : 10, 2);
      assert.ok(result.ok); state = result.value;
    }
    assert.equal(state.undoSteps, 100, 'the real bridge caps completed history at 100 steps');
    assert.ok((await api('endEditingPhoto', id, editing.value.sessionId)).ok);
    await open(); await saved(0.5);
    for (let step = 1; step <= 100; step++) { await click('Desfazer exposição'); await saved(step % 2 ? 1 : 0.5); }
    assert.equal(await js(`${button('Desfazer exposição')}.disabled`), true);
    assert.equal(await js(`${button('Refazer exposição')}.disabled`), false);
    await until(async () => Math.abs((await pixels())[0] - 152) <= 2, 'oldest retained 0.5 EV pixels');
    checks.push('101 completed edits retain exactly 100 UI undo steps and the oldest retained baseline pixels');
    win.close(); await until(() => win.isDestroyed(), 'normal close at oldest retained cursor');
  } else if (mode === 'retention-reopen') {
    await saved(0.5); assert.equal(await js(`${button('Desfazer exposição')}.disabled`), true);
    assert.equal(await js(`${button('Refazer exposição')}.disabled`), false);
    await click('Refazer exposição'); await saved(1);
    await until(async () => Math.abs((await pixels())[0] - 176) <= 2, 'retained redo pixels after new process');
    checks.push('new process restores the retained lower bound and redo cursor');
  } else throw new Error('Unknown mode: ' + mode);
  assert.equal(hash(fs.readFileSync(file)), fs.readFileSync(path.join(run, 'original.sha256'), 'utf8'));
  fs.writeFileSync(path.join(run, `history-${mode}.json`), JSON.stringify({ mode, platform: process.platform, electron: process.versions.electron, checks }, null, 2));
  console.log(JSON.stringify({ mode, checks })); clearTimeout(timer); app.exit(0);
})().catch(fatal);
