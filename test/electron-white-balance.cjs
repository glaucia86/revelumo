// Real packaged main/preload/renderer/worker. Only the file chooser and response
// delivery timing are replaceable test boundaries; synthetic JPEGs only.
const electron = require('electron');
const { app, dialog, BrowserWindow: RealWindow, nativeImage } = electron;
const Module = require('node:module'), load = Module._load;
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const run = path.resolve(process.argv[2]), mode = process.argv[3] || 'first', repo = path.resolve(__dirname, '..');
const fatal = error => { console.error(error.stack || error); fs.writeFileSync(path.join(run, `wb-${mode}-failure.txt`), String(error.stack || error)); app.exit(1); };
process.on('uncaughtException', fatal); process.on('unhandledRejection', fatal);
dialog.showErrorBox = (title, message) => fatal(new Error(`${title}: ${message}`));
for (const name of ['user-data', 'session-data', 'crash-dumps']) fs.mkdirSync(path.join(run, name), { recursive: true });
app.setPath('userData', path.join(run, 'user-data')); app.setPath('sessionData', path.join(run, 'session-data')); app.setPath('crashDumps', path.join(run, 'crash-dumps'));
const file = path.join(run, 'gray.jpg'), dbPath = path.join(run, 'user-data', 'catalog.sqlite');
const id = '420ce72c-2bb7-4e40-89ec-e3945c5b5425', hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (mode === 'first') {
  assert.equal(fs.existsSync(dbPath), false);
  const bitmap = Buffer.alloc(64 * 32 * 4, 128); for (let i = 3; i < bitmap.length; i += 4) bitmap[i] = 255;
  fs.writeFileSync(file, nativeImage.createFromBitmap(bitmap, { width: 64, height: 32 }).toJPEG(100));
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE photos (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, sha256 TEXT, rating INTEGER, flag TEXT NOT NULL DEFAULT 'neutral'); CREATE TABLE thumbnails (photo_id TEXT PRIMARY KEY, data_url TEXT NOT NULL); CREATE TABLE recipes (photo_id TEXT PRIMARY KEY, exposure_tenths INTEGER, processing_version INTEGER); CREATE TABLE exposure_history (photo_id TEXT PRIMARY KEY, states TEXT NOT NULL, cursor INTEGER NOT NULL, active TEXT); PRAGMA user_version=6");
  db.prepare('INSERT INTO photos VALUES (?, ?, ?, ?, 4, ?)').run(id, file, 'gray.jpg', hash(fs.readFileSync(file)), 'selected');
  db.prepare('INSERT INTO thumbnails VALUES (?, ?)').run(id, 'data:image/jpeg;base64,' + fs.readFileSync(file).toString('base64'));
  db.prepare('INSERT INTO recipes VALUES (?, 0, 1)').run(id);
  db.prepare('INSERT INTO exposure_history VALUES (?, ?, 0, NULL)').run(id, '[0]'); db.close();
  fs.writeFileSync(path.join(run, 'original.sha256'), hash(fs.readFileSync(file)));
}
const saveTrace = [];
let heldSave = null, failSaveAck = false, corruptSaveAck = false, saveCount = 0, activeSaves = 0, peakSaves = 0;
const hidden = { ...electron, ipcMain: { handle(channel, handler) { electron.ipcMain.handle(channel, async (event, input) => {
  if (input?.op !== 'adjustments') return handler(event, input);
  saveCount++; activeSaves++; peakSaves = Math.max(peakSaves, activeSaves);
  try {
    const result = await handler(event, input);
    saveTrace.push({ revision: input.revision, adjustments: input.adjustments, gestures: input.gestures?.length, first: input.gestures?.[0], last: input.gestures?.at(-1), result });
    if (heldSave) { heldSave.entered = true; await heldSave.promise; }
    if (failSaveAck) { failSaveAck = false; throw new Error('Test: response lost after committed full recipe'); }
    if (corruptSaveAck && result.ok) { corruptSaveAck = false; return { ...result, value: { ...result.value, tint: result.value.tint + 1 } }; }
    return result;
  } finally { activeSaves--; }
}); } }, BrowserWindow: class extends RealWindow { constructor(options) { super({ ...options, show: false }); } } };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms)), checks = []; let win;
app.on('before-quit', event => { if (win?.isDestroyed()) event.preventDefault(); });
const js = code => win.webContents.executeJavaScript(code), api = (method, ...args) => js(`window.revelumo.${method}(${args.map(JSON.stringify).join(',')})`);
async function until(work, label) { const end = Date.now() + 20000; while (Date.now() < end) { const value = await work(); if (value) return value; await delay(25); } throw new Error('Timed out: ' + label + '\n' + JSON.stringify({ trace: saveTrace.slice(-6), ui: await js("document.body.innerText") })); }
const control = label => `document.querySelector('[aria-label=${JSON.stringify(label)}]')`;
const button = text => `Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(text)})`;
const click = text => js(`${button(text)}.click()`);
async function input(label, value) { await js(`(()=>{const e=${control(label)}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`); }
async function saved(temperature, tint, exposureTenths = 0) {
  await until(() => js(`Number(${control('Temperatura relativa')}.value)===${temperature} && Number(${control('Matiz relativo')}.value)===${tint} && Number(${control('Exposição em EV')}.value)===${exposureTenths / 10} && document.querySelector('.save-status')?.textContent==='Salvo'`), 'saved recipe');
  const recipe = await api('recipePhoto', id); assert.ok(recipe.ok);
  assert.equal(recipe.value.temperature, temperature); assert.equal(recipe.value.tint, tint); assert.equal(recipe.value.exposureTenths, exposureTenths);
}
async function pixel() { return js(`(()=>{const c=document.querySelector('canvas');return Array.from(c.getContext('2d').getImageData(10,10,1,1).data);})()`); }
async function expectedPixel(expected) { await until(async () => (await pixel()).every((value, channel) => Math.abs(value - expected[channel]) <= 1), 'expected WB pixel ' + expected); }
async function open() { await until(() => js('Boolean(document.querySelector(".tile"))'), 'grid'); await js('document.querySelector(\'[aria-label="Abrir gray.jpg"]\').click()'); await until(() => js('Boolean(document.querySelector("canvas")?.dataset.revision && document.querySelector(".exposure input") && !document.querySelector(".exposure input").disabled)'), 'editing ready'); }
const timer = setTimeout(() => fatal(new Error('White-balance test exceeded timeout')), 120000);
Module._load = function(request, ...args) { return request === 'electron' ? hidden : load.call(this, request, ...args); };
try { require(path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources', 'app.asar', '.vite', 'build', 'index.cjs')); } finally { Module._load = load; }
(async () => {
  await app.whenReady(); win = await until(() => RealWindow.getAllWindows().find(w => w.webContents.getURL() === 'app://revelumo/index.html'), 'window');
  assert.equal(win.isVisible(), false);
  if (mode === 'preview-race') await js(`(()=>{const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{set onmessage(callback){window.__wbDeliver=callback;super.onmessage=event=>{if(event.data.op==='pixels')window.__wbLastReply=event;callback(event);};}};})()`);
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  await open();
  assert.equal(await js(`Boolean(${control('Temperatura relativa')})`), true, 'Temperature input is available');
  assert.equal(await js(`Boolean(${control('Matiz relativo')})`), true, 'Tint input is available');
  if (mode === 'first') {
    await saved(0, 0); await input('Temperatura relativa', 100); await saved(100, 0); await expectedPixel([146, 124, 106, 255]);
    checks.push('temperature-only UI → worker pixels → autosave via the real bridge');
    win.close(); await until(() => win.isDestroyed(), 'normal close flush');
  } else if (mode === 'reopen') {
    await saved(100, 0); await expectedPixel([146, 124, 106, 255]);
    checks.push('new process recovers full recipe and pixels');
  } else if (mode === 'controls') {
    await input('Matiz relativo', 100); await saved(100, 100);
    await expectedPixel([161, 117, 117, 255]);
    assert.equal(await js(`Boolean(${button('Redefinir balanço de branco')})`), true, 'White-balance reset is available');
    await input('Exposição em EV', 10 / 10); await js(`${control('Exposição em EV')}.blur()`); await saved(100, 100, 10);
    await click('Redefinir balanço de branco'); await saved(0, 0, 10); await expectedPixel([176, 176, 176, 255]);
    checks.push('tint and atomic WB reset preserve exposure');
  } else if (mode === 'preview-race') {
    await input('Temperatura relativa', 100); await saved(100, 0, 10);
    await js('window.__wbOldReply=window.__wbLastReply');
    await click('Comparar com 0 EV'); await expectedPixel([146, 124, 106, 255]);
    const compared = await pixel();
    await js('window.__wbDeliver(window.__wbOldReply)'); await delay(80);
    assert.deepEqual(await pixel(), compared, 'an obsolete display result cannot overwrite a newer comparison using the same persisted revision');
    checks.push('obsolete preview request rejected independently from persistence revision');
  } else if (mode === 'save-race') {
    await input('Temperatura relativa', 100); await input('Matiz relativo', 0); await saved(100, 0, 10);
    let release; heldSave = { promise: new Promise(resolve => { release = resolve; }), entered: false };
    await input('Temperatura relativa', 50); await until(() => heldSave.entered, 'held full-recipe commit response');
    await input('Matiz relativo', 40);
    await js(`${control('Exposição em EV')}.focus()`); await input('Exposição em EV', 1.7); await js(`${control('Exposição em EV')}.blur()`);
    await input('Temperatura relativa', 80); await delay(350);
    assert.notEqual(await js("document.querySelector('.save-status').textContent"), 'Salvo');
    assert.equal(activeSaves, 1); release(); heldSave = null;
    await saved(80, 40, 17); assert.equal(peakSaves, 1, 'EV/WB share one save queue');
    failSaveAck = true; await input('Matiz relativo', 70);
    await until(() => js("document.querySelector('.save-status').textContent === 'Não salvo'"), 'lost WB acknowledgement');
    await input('Temperatura relativa', 20); await saved(20, 70, 17);
    await click('Desfazer exposição'); await saved(20, 70, 10);
    await click('Refazer exposição'); await saved(20, 70, 17);
    corruptSaveAck = true; await input('Matiz relativo', 73);
    await until(() => js("document.querySelector('.save-status').textContent === 'Não salvo'"), 'wrong WB acknowledgement rejected');
    await click('Tentar salvar novamente'); await saved(20, 73, 17);
    await click('Desfazer exposição'); await saved(20, 73, 10);
    await input('Temperatura relativa', -40); await click('Refazer exposição'); await saved(-40, 73, 17);
    checks.push('one queue coalesces interleaved EV/WB; stale/lost/wrong ACK never confirms a different recipe; Undo/Redo preserves WB');
  } else if (mode === 'keyboard') {
    await input('Temperatura relativa', 0); await input('Matiz relativo', 0);
    await js(`${control('Exposição em EV')}.focus()`); await input('Exposição em EV', 0); await js(`${control('Exposição em EV')}.blur()`); await saved(0, 0, 0);
    const keys = async text => { for (const key of text) await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'char', text: key, key }); };
    const select = async label => {
      await js(`${control(label)}.focus()`);
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    };
    const before = saveCount, revision = await js('document.querySelector("canvas").dataset.revision');
    await select('Temperatura relativa'); await keys('-'); await delay(400);
    assert.equal(saveCount, before); assert.equal(await js('document.querySelector("canvas").dataset.revision'), revision);
    await keys('5'); await saved(-5, 0, 0); await keys('0'); await saved(-50, 0, 0);
    assert.equal(await js(`${control('Temperatura relativa')}.value`), '-50', 'autosave preserves the numeric keyboard draft');
    await select('Matiz relativo'); await keys('30'); await saved(-50, 30, 0);
    for (const invalid of ['101', '-101', '1.5', '']) {
      const beforeInvalid = saveCount;
      await js(`${control('Matiz relativo')}.focus()`); await input('Matiz relativo', invalid); await delay(350); assert.equal(saveCount, beforeInvalid, 'invalid WB never saves');
      await js(`${control('Matiz relativo')}.blur()`); await saved(-50, 30, 0);
    }
    const ax = await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
    for (const name of ['Temperatura', 'Matiz']) assert.ok(ax.nodes.some(node => !node.ignored && node.role?.value === 'slider' && node.name?.value === name));
    for (const name of ['Temperatura relativa', 'Matiz relativo']) assert.ok(ax.nodes.some(node => !node.ignored && node.role?.value === 'spinbutton' && node.name?.value === name));
    await js(`${control('Temperatura')}.focus()`);
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await saved(-49, 30, 0);
    await click('Redefinir balanço de branco'); await saved(0, 0, 0);
    checks.push('real keyboard sign/pauses, canonical integers, blur/reset and accessible named controls');
  } else if (mode === 'many-pending') {
    await input('Temperatura relativa', 0); await input('Matiz relativo', 0);
    await js(`${control('Exposição em EV')}.focus()`); await input('Exposição em EV', 0); await js(`${control('Exposição em EV')}.blur()`); await saved(0, 0, 0);
    const lock = new DatabaseSync(dbPath); lock.exec('BEGIN IMMEDIATE');
    try {
      await input('Temperatura relativa', 10);
      await until(() => js("document.querySelector('.save-status').textContent === 'Não salvo'"), 'locked WB-only first save');
      await js(`(()=>{const ev=${control('Exposição em EV')},t=${control('Temperatura relativa')},m=${control('Matiz relativo')};const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;const change=(e,v)=>{set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));};for(let i=0;i<1025;i++){ev.focus();change(ev,i%2?'1.1':'0.9');ev.blur();if(i===1000){change(t,'50');change(m,'-20');}}change(t,'88');change(m,'-33');})()`);
      await delay(350);
    } finally { lock.exec('ROLLBACK'); lock.close(); }
    await click('Tentar salvar novamente'); await saved(88, -33, 9);
    await click('Desfazer exposição'); await saved(88, -33, 11);
    assert.ok(saveTrace.some(entry => entry.gestures === 1024), 'stress exercise crosses the bounded gesture batch');
    checks.push('WB and more than 1024 EV gestures retain revision-matched snapshots while draining one queue after a lock');
  } else if (mode === 'close-race') {
    const recipe = await api('recipePhoto', id);
    await js(`${control('Exposição em EV')}.focus()`); await input('Exposição em EV', 0); await js(`${control('Exposição em EV')}.blur()`); await saved(recipe.value.temperature, recipe.value.tint, 0);
    await input('Temperatura relativa', 82); await input('Matiz relativo', -47);
    win.close(); await until(() => win.isDestroyed(), 'normal close flushes unsaved WB');
    checks.push('normal close before debounce flushes the latest full WB snapshot');
  } else if (mode === 'close-reopen') {
    await saved(82, -47, 0); checks.push('next process recovers WB flushed by close');
  } else throw new Error('Unknown mode ' + mode);
  assert.equal(hash(fs.readFileSync(file)), fs.readFileSync(path.join(run, 'original.sha256'), 'utf8'));
  const result = { mode, platform: process.platform, versions: process.versions, checks };
  fs.writeFileSync(path.join(run, `wb-${mode}-result.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result)); clearTimeout(timer); app.exit(0);
})().catch(fatal);
