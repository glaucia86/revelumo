// Real packaged renderer and SQLite, hidden at construction. Synthetic files only.
const electron = require('electron');
const { app, dialog, BrowserWindow: RealWindow, nativeImage } = electron;
// Pin the OS adapter for legacy Portuguese UI assertions; language tests cover detection.
app.getPreferredSystemLanguages = () => ['pt-BR'];
const Module = require('node:module'), load = Module._load;
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const fatal = error => { console.error(error.stack || error); app.exit(1); };
process.on('uncaughtException', fatal); process.on('unhandledRejection', fatal);
dialog.showErrorBox = (title, message) => fatal(new Error(`${title}: ${message}`));
let invokeHandler, held = null, heldEnd = null, saveCount = 0, activeSaves = 0, peakSaves = 0;
// Controlled IPC response boundary: the real handler/catalog still execute.
const hidden = { ...electron, ipcMain: { handle(channel, handler) {
  invokeHandler = handler;
  electron.ipcMain.handle(channel, async (event, input) => {
    if (input?.op === 'end-edit' && heldEnd) { const result = await handler(event, input); heldEnd.entered = true; await heldEnd.promise; return result; }
    if (input?.op !== 'exposure' && input?.op !== 'adjustments') return handler(event, input);
    saveCount++; activeSaves++; peakSaves = Math.max(peakSaves, activeSaves);
    try { const result = await handler(event, input); if (held) { held.entered = true; await held.promise; } return result; }
    finally { activeSaves--; }
  });
} }, BrowserWindow: class extends RealWindow { constructor(options) { super({ ...options, show: false }); } } };
const run = path.resolve(process.argv[2]), mode = process.argv[3] || 'first', repo = path.resolve(__dirname, '..');
for (const name of ['user-data', 'session-data', 'crash-dumps']) fs.mkdirSync(path.join(run, name), { recursive: true });
app.setPath('userData', path.join(run, 'user-data')); app.setPath('sessionData', path.join(run, 'session-data')); app.setPath('crashDumps', path.join(run, 'crash-dumps'));
const dbPath = path.join(run, 'user-data', 'catalog.sqlite'), file = path.join(run, 'gray.jpg');
const id = '420ce72c-2bb7-4e40-89ec-e3945c5b5425', hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (mode === 'first') {
  assert.equal(fs.existsSync(dbPath), false);
  // Equal channels avoid BGRA/RGBA ambiguity at nativeImage's fixture boundary.
  const bitmap = Buffer.alloc(64 * 32 * 4, 128); for (let i = 3; i < bitmap.length; i += 4) bitmap[i] = 255;
  fs.writeFileSync(file, nativeImage.createFromBitmap(bitmap, { width: 64, height: 32 }).toJPEG(100));
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE photos (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, sha256 TEXT, rating INTEGER, flag TEXT NOT NULL DEFAULT \'neutral\'); CREATE TABLE thumbnails (photo_id TEXT PRIMARY KEY REFERENCES photos(id), data_url TEXT NOT NULL); PRAGMA user_version=4');
  db.prepare('INSERT INTO photos VALUES (?, ?, ?, ?, ?, ?)').run(id, file, 'gray.jpg', hash(fs.readFileSync(file)), 4, 'selected');
  db.prepare('INSERT INTO thumbnails VALUES (?, ?)').run(id, 'data:image/jpeg;base64,' + fs.readFileSync(file).toString('base64')); db.close();
  fs.writeFileSync(path.join(run, 'original.sha256'), hash(fs.readFileSync(file)));
}
const checks = [], delay = ms => new Promise(resolve => setTimeout(resolve, ms)); let win;
// Keep the harness alive to record assertions after the product window closed.
app.on('before-quit', event => { if (win?.isDestroyed()) event.preventDefault(); });
const js = code => win.webContents.executeJavaScript(code), api = (method, ...args) => js(`window.revelumo.${method}(${args.map(JSON.stringify).join(',')})`);
async function until(work, label) { const end = Date.now() + 20000; while (Date.now() < end) { const value = await work(); if (value) return value; await delay(25); } throw new Error('Timed out: ' + label); }
async function input(value) { await js(`(()=>{const e=document.querySelector('[aria-label="Exposição em EV"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`); }
async function selectNumeric() {
  await js('document.querySelector(".exposure input[type=number]").focus()');
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
}
async function typeCharacters(text) {
  for (const key of text) await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'char', text: key, key });
}
const numericValue = () => js('document.querySelector(".exposure input[type=number]").value');
const blurNumeric = () => js('document.querySelector(".exposure input[type=number]").blur()');
async function saved(value) { await until(() => js(`document.querySelector('.exposure input[type="number"]')?.value !== '' && Number(document.querySelector('.exposure input[type="number"]')?.value) === ${value} && document.querySelector('.save-status')?.textContent === 'Salvo'`), 'saved ' + value); }
async function pixels() { return js(`(()=>{const c=document.querySelector('canvas');return {width:c.width,height:c.height,pixel:Array.from(c.getContext('2d').getImageData(10,10,1,1).data),revision:c.dataset.revision};})()`); }
const textButton = label => `Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(label)})`;
const clickText = label => js(`${textButton(label)}.click()`);
async function open(name = 'gray.jpg') { await until(() => js(`Boolean(document.querySelector('[aria-label="Abrir ${name}"]'))`), 'grid tile'); await js(`document.querySelector('[aria-label="Abrir ${name}"]').click()`); await until(() => js('Boolean(document.querySelector("canvas")?.dataset.revision && document.querySelector(".exposure input") && !document.querySelector(".exposure input").disabled)'), 'ready editing ' + name); }
async function grid() { await js('document.querySelector(".back").click()'); await until(() => js('Boolean(document.querySelector(".tile")) && !document.querySelector(".viewer")'), 'flushed grid'); }
async function importFixture(name) {
  const source = path.join(repo, 'test', 'fixtures', name), target = path.join(run, name); fs.copyFileSync(source, target);
  selection = { canceled: false, filePaths: [target] };
  const result = await api('importJpeg'); assert.ok(result.ok && result.value.items[0].result.ok);
  const reloaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve)); win.webContents.reload(); await reloaded;
  await until(() => js('Boolean(document.querySelector(".tile"))'), 'refreshed fixture catalog');
  return { id: result.value.items[0].result.value.id, source, target };
}
let selection = { canceled: true, filePaths: [] }; dialog.showOpenDialog = async () => selection;
const fsp = require('node:fs/promises'), openFile = fsp.open, createHash = crypto.createHash, decode = nativeImage.createFromBuffer;
let io = { reads: 0, hashes: 0, decodes: 0 };
fsp.open = async (...args) => { const handle = await openFile(...args); if (args[0] === file) { const read = handle.read.bind(handle); handle.read = async (...readArgs) => { io.reads++; return read(...readArgs); }; } return handle; };
crypto.createHash = (...args) => { io.hashes++; return createHash(...args); };
nativeImage.createFromBuffer = (...args) => { io.decodes++; return decode(...args); };
require('node:module').syncBuiltinESMExports();
const timer = setTimeout(() => fatal(new Error('Exposure test exceeded timeout')), 120000);
Module._load = function(request, ...args) { return request === 'electron' ? hidden : load.call(this, request, ...args); };
try { require(path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources', 'app.asar', '.vite', 'build', 'index.cjs')); } finally { Module._load = load; }
(async () => {
  await app.whenReady(); win = await until(() => RealWindow.getAllWindows().find(w => w.webContents.getURL() === 'app://revelumo/index.html'), 'window'); assert.equal(win.isVisible(), false);
  await until(() => js('Boolean(document.querySelector(".tile"))'), 'grid');
  await open();
  if (mode === 'first') {
    await saved(0); const neutral = await pixels(); assert.equal(neutral.width, 64); assert.equal(neutral.height, 32); assert.ok(Math.abs(neutral.pixel[0] - 128) <= 1);
    await input(1); await saved(1); await until(async () => (await pixels()).revision === '1', 'positive pixels'); assert.ok(Math.abs((await pixels()).pixel[0] - 176) <= 2);
    await input(-1); await saved(-1); await until(async () => (await pixels()).revision === '2', 'negative pixels'); assert.ok(Math.abs((await pixels()).pixel[0] - 92) <= 2);
    await input(0); await saved(0); await until(async () => (await pixels()).revision === '3', 'neutral pixels'); assert.deepEqual((await pixels()).pixel, neutral.pixel);
    checks.push('sRGB 128: +1 EV approximately 176, -1 approximately 92, neutral exact; no upscale');
    win.webContents.debugger.attach('1.3');
    const ax = await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
    assert.ok(ax.nodes.some(n => !n.ignored && n.role?.value === 'slider' && n.name?.value === 'Exposição'));
    assert.ok(ax.nodes.some(n => !n.ignored && n.role?.value === 'spinbutton' && n.name?.value === 'Exposição em EV'));
    await js('document.querySelector(".exposure input[type=range]").focus()');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await saved(0.1); win.webContents.debugger.detach();
    checks.push('Chromium accessibility slider/spinbutton names and keyboard increments');
    // Native Chromium editing events, one key at a time. Assigning .value to a
    // complete number cannot catch a controlled input erasing '-' or '.'.
    win.webContents.debugger.attach('1.3');
    await selectNumeric(); await typeCharacters('-1');
    assert.equal(await numericValue(), '-1', 'typing a minus then a digit retains the negative sign');
    await blurNumeric(); await saved(-1); assert.equal((await api('recipePhoto', id)).value.exposureTenths, -10);
    assert.equal(await numericValue(), '-1.0', 'blur formats the latest valid value');
    await selectNumeric(); await typeCharacters('1.2');
    assert.equal(await numericValue(), '1.2', 'typing a decimal separator permits the next digit');
    await saved(1.2); assert.equal((await api('recipePhoto', id)).value.exposureTenths, 12);
    const beforeIncomplete = (await api('recipePhoto', id)).value;
    await selectNumeric(); await typeCharacters('-'); await delay(350);
    assert.equal(await numericValue(), '', 'native number input reports an incomplete sign as empty');
    assert.deepEqual((await api('recipePhoto', id)).value, beforeIncomplete, 'incomplete sign never changes the confirmed recipe');
    await typeCharacters('0.7'); await saved(-0.7);
    assert.equal(await numericValue(), '-0.7', 'delayed typing retains the sign and decimal');
    await selectNumeric(); await typeCharacters('1.');
    await js('window.dispatchEvent(new Event("focus"))'); await clickText('Verificar disponibilidade');
    await delay(350); await typeCharacters('2'); await saved(1.2);
    assert.equal(await numericValue(), '1.2', 'focus, refresh and autosave renders preserve the decimal prefix');
    for (const invalid of ['3.1', '-3.1', '0.15', '']) {
      const before = (await api('recipePhoto', id)).value, revision = (await pixels()).revision;
      await js('document.querySelector(".exposure input[type=number]").focus()');
      await input(invalid); await delay(350);
      assert.deepEqual((await api('recipePhoto', id)).value, before, `invalid ${invalid} does not save or advance revision`);
      assert.equal((await pixels()).revision, revision, `invalid ${invalid} does not replace preview`);
      assert.equal(await js('document.querySelector(".exposure input[type=range]").value'), '1.2');
      await blurNumeric(); assert.equal(await numericValue(), '1.2', 'invalid text restores the latest valid EV on blur');
    }
    for (const boundary of ['-3', '3']) {
      await selectNumeric(); await typeCharacters(boundary); await saved(Number(boundary));
      assert.equal((await api('recipePhoto', id)).value.exposureTenths, Number(boundary) * 10);
    }
    await selectNumeric(); await typeCharacters('-'); await clickText('Redefinir exposição'); await saved(0);
    assert.equal(await numericValue(), '0.0', 'reset replaces incomplete text');
    await selectNumeric(); await typeCharacters('-');
    await js('document.querySelector(".exposure input[type=range]").focus()');
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await saved(0.1); assert.equal(await numericValue(), '0.1', 'slider replaces incomplete text');
    win.webContents.debugger.detach();
    checks.push('real numeric keyboard typing preserves negative/decimal prefixes across delay and refresh; invalid text never alters recipe/revision/preview and blur restores valid EV; limits, reset and slider stay synchronized');
    await input(3); await saved(3); await until(async () => (await pixels()).pixel[0] === 255, 'explicit clipping');
    await clickText('Redefinir exposição'); await saved(0); await until(async () => (await pixels()).pixel[0] === neutral.pixel[0], 'reset pixels');
    await js('document.querySelector(".exposure input[type=number]").focus()');
    await input(3.1); await input(0.15); await input('not a number');
    await js('document.querySelector(".exposure input[type=number]").blur()'); await saved(0);
    assert.equal((await api('recipePhoto', id)).value.exposureTenths, 0);
    const beforeBurst = saveCount;
    io = { reads: 0, hashes: 0, decodes: 0 };
    await js(`(()=>{const e=document.querySelector('[aria-label="Exposição em EV"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(let i=1;i<=20;i++){setter.call(e,(i/10).toFixed(1));e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    assert.deepEqual(io, { reads: 0, hashes: 0, decodes: 0 }, 'slider ticks do not read/hash/decode original');
    await saved(2); assert.equal(saveCount - beforeBurst, 1, 'burst coalesces commits'); assert.equal(io.hashes, 1); assert.equal(io.decodes, 0); assert.ok(io.reads > 0);
    await until(async () => Math.abs((await pixels()).pixel[0] - 239) <= 2, 'burst displays latest linear +2 EV pixels');
    let release; held = { promise: new Promise(resolve => { release = resolve; }), entered: false };
    await input(0.7); await until(() => held.entered, 'held committed response');
    win.webContents.debugger.attach('1.3'); await selectNumeric(); await typeCharacters('-0.8'); win.webContents.debugger.detach(); await delay(350);
    assert.notEqual(await js('document.querySelector(".save-status").textContent'), 'Salvo');
    assert.equal(activeSaves, 1); release(); held = null; await saved(-0.8); assert.equal(peakSaves, 1);
    checks.push('invalid EV unchanged, clipping, reset autosave, burst one commit, old confirmation never marks newer draft saved');
    await input(0.4); await js('window.dispatchEvent(new Event("focus"))'); await clickText('Verificar disponibilidade'); await saved(0.4);
    await input(0.6); await grid(); assert.equal((await api('recipePhoto', id)).value.exposureTenths, 6); await open(); await saved(0.6);
    const locked = new DatabaseSync(dbPath);
    locked.exec('BEGIN IMMEDIATE');
    await input(1.2); await until(() => js('document.querySelector(".save-status").textContent === "Não salvo"'), 'SQLite lock failure');
    await js('document.querySelector(".back").click()'); await until(() => js('Boolean(document.querySelector(".exit-failure"))'), 'failed flush retains session');
    assert.equal(await js('document.querySelector(".exposure input[type=number]").value'), '1.2');
    assert.equal((await api('recipePhoto', id)).value.exposureTenths, 6);
    await clickText('Permanecer'); locked.exec('ROLLBACK'); locked.close();
    await clickText('Tentar salvar novamente'); await saved(1.2);
    // Missing identity during flush has an explicit discard path.
    const moved = file + '.moved'; fs.renameSync(file, moved);
    await input(1.4); await clickText('Verificar disponibilidade');
    await until(() => js('Boolean(document.querySelector(".original-notice") && Array.from(document.querySelectorAll("button")).some(b=>b.textContent==="Localizar original"))'), 'viewer availability refresh');
    assert.equal(await js('document.querySelector(".exposure input[type=number]").value'), '1.4');
    assert.equal(await js('Boolean(document.querySelector("canvas")?.dataset.revision)'), true, 'neutral base remains available in existing session');
    win.close(); await until(() => js('Boolean(document.querySelector(".exit-failure"))'), 'close failure retains window');
    assert.equal(win.isDestroyed(), false); assert.equal((await api('recipePhoto', id)).value.exposureTenths, 12);
    await clickText('Permanecer');
    await js('document.querySelector(".back").click()'); await until(() => js('Boolean(document.querySelector(".exit-failure"))'), 'explicit discard offer');
    await clickText('Descartar ajuste não salvo e sair'); await until(() => js('Boolean(document.querySelector(".tile"))'), 'discard grid');
    fs.renameSync(moved, file); await open(); await saved(1.2);
    checks.push('focus/refresh retain draft, debounce navigation flush, SQLite lock retry, close failure stays, discard explicitly restores confirmed state');
    // Payload checks use the captured real IPC handler, including real owner.
    const event = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
    assert.equal((await invokeHandler({ ...event, sender: null }, { op: 'recipe', id })).code, 'invalid-request');
    assert.equal((await invokeHandler(event, { op: 'recipe', id, path: file })).code, 'invalid-request');
    assert.equal((await api('saveExposure', id, 'bad', 1, 10, 2)).code, 'invalid-request');
    assert.equal((await api('recipePhoto', '16e6d303-bb64-4a09-85a5-915e883db827')).code, 'not-found');
    checks.push('limited real bridge and owner/frame handler reject invalid origin, extra fields, invalid session and unknown UUID');
    await grid();
    for (const name of ['srgb', 'p3']) {
      const fixture = await importFixture(`exposure-${name}.jpg`); await open(`exposure-${name}.jpg`);
      const actual = (await pixels()).pixel.slice(0, 3), expected = JSON.parse(fs.readFileSync(path.join(repo, 'test', 'fixtures', 'exposure-color-reference.json'))).profiles[name];
      for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(actual[channel] - expected.srgb[channel]) <= expected.tolerance, `${name} channel ${channel}: ${actual} vs ${expected.srgb}`);
      assert.equal(hash(fs.readFileSync(fixture.target)), hash(fs.readFileSync(fixture.source))); await grid();
    }
    checks.push('real decoder/OffscreenCanvas converts embedded sRGB and P3 fixtures to sRGB within 3 encoded channel units of independent LittleCMS reference');
    // Quadrant orders after EXIF, including mirrored variants. Literal oracle.
    const orders = ['RGBY', 'GRYB', 'YBGR', 'BYRG', 'RBGY', 'BRYG', 'YGBR', 'GYRB'];
    for (let orientation = 1; orientation <= 8; orientation++) {
      const fixture = await importFixture(`exposure-orientation-${orientation}.jpg`); await open(`exposure-orientation-${orientation}.jpg`);
      const image = await js(`(()=>{const c=document.querySelector('canvas'),ctx=c.getContext('2d');return {width:c.width,height:c.height,pixels:[[.25,.25],[.75,.25],[.25,.75],[.75,.75]].map(([x,y])=>Array.from(ctx.getImageData(Math.floor(c.width*x),Math.floor(c.height*y),1,1).data).slice(0,3))};})()`);
      assert.equal(image.width, orientation >= 5 ? 40 : 80); assert.equal(image.height, orientation >= 5 ? 80 : 40);
      const colors = { R: [255,0,0], G: [0,255,0], B: [0,0,255], Y: [255,255,0] };
      for (let i = 0; i < 4; i++) for (let c = 0; c < 3; c++) assert.ok(Math.abs(image.pixels[i][c] - colors[orders[orientation - 1][i]][c]) <= 4, 'EXIF ' + orientation);
      assert.equal(hash(fs.readFileSync(fixture.target)), hash(fs.readFileSync(fixture.source))); await grid();
    }
    checks.push('all eight EXIF orientations applied once with quadrant pixels and dimensions');
    await open();
    win.webContents.debugger.attach('1.3'); await selectNumeric(); await typeCharacters('2.3'); win.webContents.debugger.detach(); app.quit();
    checks.push('application quit requests last draft flush before close');
  } else if (mode === 'interrupt') {
    await saved(2.3); await input(-2.5);
    assert.equal(await js('document.querySelector(".exposure input[type=number]").value'), '-2.5');
    assert.equal((await api('recipePhoto', id)).value.exposureTenths, 23);
    checks.push('forced exit during debounce: -2.5 EV draft intentionally not persisted; recovery promises only confirmed 2.3 EV');
    fs.writeFileSync(path.join(run, mode + '-result.json'), JSON.stringify({ ok: true, mode, checks }, null, 2)); clearTimeout(timer); app.exit(0); return;
  } else if (mode === 'race') {
    await saved(2.3); let release; held = { promise: new Promise(resolve => { release = resolve; }), entered: false };
    await input(1.7); await until(() => held.entered, 'race commit response held');
    await js('document.querySelector(".back").click()'); win.close(); release(); held = null;
    checks.push('close during navigation flush is retained and replayed after latest confirmation');
  } else if (mode === 'race-reopen') {
    await saved(1.7); assert.equal((await api('recipePhoto', id)).value.exposureTenths, 17); checks.push('navigation-close race restores latest confirmed revision in new process'); win.close();
  } else if (mode === 'discard-race') {
    await saved(2.3); const moved = file + '.moved'; fs.renameSync(file, moved);
    await input(1.6); await js('document.querySelector(".back").click()'); await until(() => js('Boolean(document.querySelector(".exit-failure"))'), 'discard-race flush failure');
    let release; heldEnd = { promise: new Promise(resolve => { release = resolve; }), entered: false };
    await clickText('Descartar ajuste não salvo e sair'); await until(() => heldEnd.entered, 'retirement response held');
    win.close(); release(); heldEnd = null;
    await until(() => win.isDestroyed(), 'close after explicit discard'); fs.renameSync(moved, file);
    checks.push('close during explicit discard waits for retirement and closes idempotently; prior confirmed recipe preserved');
  } else {
    await saved(2.3); assert.equal((await api('recipePhoto', id)).value.exposureTenths, 23); checks.push('second process restores normal-close flush'); win.close();
  }
  await until(() => win.isDestroyed(), 'normal close flush');
  assert.equal(hash(fs.readFileSync(file)), fs.readFileSync(path.join(run, 'original.sha256'), 'utf8'));
  const result = { ok: true, mode, platform: process.platform, versions: process.versions, checks };
  fs.writeFileSync(path.join(run, mode + '-result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); clearTimeout(timer); app.exit(0);
})().catch(async error => { fs.writeFileSync(path.join(run, mode + '-failure.txt'), error.stack || String(error)); if (win && !win.isDestroyed()) fs.writeFileSync(path.join(run, mode + '-failure-dom.txt'), await js('document.body.innerText')); fatal(error); });
