// Packaged production renderer; synthetic JPEG/isolated catalog only.
// Dialog is an external adapter replacement. Every window is hidden at creation.
const electron = require('electron');
const { app, dialog, BrowserWindow: RealWindow } = electron;
// Pin the OS adapter for legacy Portuguese UI assertions; language tests cover detection.
app.getPreferredSystemLanguages = () => ['pt-BR'];
function fatal(error) { console.error(error?.stack || String(error)); app.exit(1); }
process.on('uncaughtException', fatal);
process.on('unhandledRejection', fatal);
dialog.showErrorBox = (title, message) => fatal(new Error(`${title}: ${message}`));
if (process.argv.includes('--fail-bootstrap')) throw new Error('Intentional hidden harness bootstrap failure');
// Replace only the module boundary used by the packaged entrypoint: Electron's
// own BrowserWindow export is non-configurable. Restore loading immediately.
const Module = require('node:module');
const load = Module._load;
const hiddenElectron = { ...electron, BrowserWindow: class extends RealWindow {
  constructor(options) { super({ ...options, show: false }); }
} };
const { DatabaseSync } = require('node:sqlite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const run = path.resolve(process.argv[2]);
const mode = process.argv[3] || 'first';
assert.ok(['first', 'reopen'].includes(mode));
const repo = path.resolve(__dirname, '..');
for (const dir of ['user-data', 'session-data', 'crash-dumps']) fs.mkdirSync(path.join(run, dir), { recursive: true });
app.setPath('userData', path.join(run, 'user-data'));
app.setPath('sessionData', path.join(run, 'session-data'));
app.setPath('crashDumps', path.join(run, 'crash-dumps'));
const dbPath = path.join(run, 'user-data', 'catalog.sqlite');
const file = path.join(run, 'synthetic.jpg');
const id = '420ce72c-2bb7-4e40-89ec-e3945c5b5425';
const photo = { id, name: 'synthetic.jpg' };
const other = { id: 'e354a57b-41a0-4fd2-9510-2a0db64db026', name: 'other.jpg' };
const otherFile = path.join(run, 'other.jpg');
const sample = fs.readFileSync(path.join(repo, 'test', 'fixtures', 'sample.jpg'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (mode === 'first') {
  assert.equal(fs.existsSync(dbPath), false, 'first requires a fresh isolated catalog');
  fs.writeFileSync(file, sample);
  fs.writeFileSync(otherFile, sample);
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE photos (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, sha256 TEXT); CREATE TABLE thumbnails (photo_id TEXT PRIMARY KEY REFERENCES photos(id), data_url TEXT NOT NULL); PRAGMA user_version=3');
  db.prepare('INSERT INTO photos VALUES (?, ?, ?, ?)').run(id, file, photo.name, hash(sample));
  db.prepare('INSERT INTO thumbnails VALUES (?, ?)').run(id, 'data:image/jpeg;base64,' + sample.toString('base64'));
  db.prepare('INSERT INTO photos VALUES (?, ?, ?, ?)').run(other.id, otherFile, other.name, hash(sample));
  db.close();
}
let selection = { canceled: true, filePaths: [] };
dialog.showOpenDialog = async () => selection;
const checks = [];
let win;
const js = expression => win.webContents.executeJavaScript(expression);
const api = (method, ...args) => js(`window.revelumo.${method}(${args.map(arg => JSON.stringify(arg)).join(',')})`);
const button = name => `Array.from(document.querySelectorAll('button')).find(b=>b.getAttribute('aria-label')===${JSON.stringify(name)})`;
const click = async name => { await until(() => js(`Boolean(${button(name)} && !${button(name)}.disabled)`), 'button ready: ' + name); return js(`${button(name)}.click()`); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(work, label) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { const value = await work(); if (value) return value; await delay(30); }
  throw new Error('Timed out: ' + label);
}
async function open() {
  await until(() => js(`Boolean(${button('Abrir synthetic.jpg')}) && document.querySelector('.gallery')?.getAttribute('aria-busy')==='false'`), 'grid refreshed before preview');
  await click('Abrir synthetic.jpg');
  await until(() => js('Boolean(document.querySelector(".viewer canvas")?.dataset.revision)'), 'preview');
  assert.equal(await js(`Boolean(${button('5 estrelas')} && !${button('5 estrelas')}.disabled)`), true, 'classification controls ready');
}
async function state(rating, flag) {
  await until(() => js(`${button(rating === null ? 'Limpar estrelas' : rating + (rating === 1 ? ' estrela' : ' estrelas'))}?.getAttribute('aria-pressed')==='true' && ${button(flag)}?.getAttribute('aria-pressed')==='true' && !${button('5 estrelas')}.disabled`), 'confirmed classification DOM');
}
async function back() {
  await js('document.querySelector(".back").click()');
  await until(() => js('document.querySelector(".gallery")?.getAttribute("aria-busy")==="false"'), 'grid refreshed after preview');
}
const timeout = setTimeout(() => { console.error('classification integration exceeded 90 seconds'); app.exit(1); }, 90000);
Module._load = function(request, ...args) { return request === 'electron' ? hiddenElectron : load.call(this, request, ...args); };
try { require(path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources', 'app.asar', '.vite', 'build', 'index.cjs')); }
finally { Module._load = load; }
(async () => {
  await app.whenReady();
  win = await until(() => RealWindow.getAllWindows().find(w => w.webContents.getURL() === 'app://revelumo/index.html'), 'packaged origin');
  assert.equal(win.isVisible(), false);
  await until(() => js('Boolean(window.revelumo && document.querySelector(".tile"))'), 'renderer');
  assert.equal(await js('typeof require'), 'undefined');
  const prefs = win.webContents.getLastWebPreferences();
  assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false); assert.equal(prefs.webSecurity, true);
  assert.deepEqual((await api('listPhotos')).value, [photo, other]);
  assert.equal((await api('thumbnailPhoto', id)).value.dataUrl, mode === 'first' ? 'data:image/jpeg;base64,' + sample.toString('base64') : JSON.parse(fs.readFileSync(path.join(run, 'expected.json'))).thumbnail);
  checks.push('hidden packaged origin, sandbox, limited bridge, migrated identity and thumbnail');
  await open();
  if (mode === 'first') {
    await state(null, 'Sem flag');
    for (const rating of [1, 2, 3, 4, 5]) { await click(rating + (rating === 1 ? ' estrela' : ' estrelas')); await state(rating, 'Sem flag'); }
    await click('Selecionada'); await state(5, 'Selecionada');
    await click('Rejeitada'); await state(5, 'Rejeitada');
    await click('Rejeitada'); await state(5, 'Rejeitada');
    const previous = await api('classificationPhoto', id);
    const invalid = await api('classifyPhoto', id, 0, 'neutral'); assert.equal(invalid.code, 'invalid-request');
    assert.equal((await api('classifyPhoto', file, 3, 'selected')).code, 'invalid-request');
    assert.equal((await api('classifyPhoto', id, 3, 'wrong')).code, 'invalid-request');
    assert.equal((await api('classifyPhoto', '16e6d303-bb64-4a09-85a5-915e883db827', 3, 'selected')).code, 'not-found');
    assert.deepEqual(await api('classificationPhoto', id), previous);
    checks.push('all five ratings, flag replacement, repetition and invalid IPC leave confirmed states correct');
    const lock = new DatabaseSync(dbPath);
    try {
      lock.exec('BEGIN IMMEDIATE');
      await click('1 estrela');
      await until(() => js('document.querySelector("footer").textContent.includes("Não foi possível salvar a classificação")'), 'write error feedback');
      await state(5, 'Rejeitada');
    } finally { lock.exec('ROLLBACK'); lock.close(); }
    assert.deepEqual(await api('classificationPhoto', id), previous);
    checks.push('real SQLite lock reports error without changing displayed or persisted classification');
    await click('Limpar estrelas'); await state(null, 'Rejeitada');
    await click('Sem flag'); await state(null, 'Sem flag');
    win.webContents.debugger.attach('1.3');
    const ax = await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
    for (const name of ['1 estrela', '5 estrelas', 'Limpar estrelas', 'Selecionada', 'Rejeitada', 'Sem flag']) assert.ok(ax.nodes.some(n => !n.ignored && n.role?.value === 'button' && n.name?.value === name));
    assert.ok(ax.nodes.some(n => n.name?.value === 'Sem flag' && n.properties?.some(p => p.name === 'pressed' && p.value?.value === 'true')));
    // Chromium keyboard input via DevTools, without touching desktop focus/mouse.
    await js(`${button('4 estrelas')}.focus()`);
    // Enter needs its character payload for Chromium's default button action.
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await state(4, 'Sem flag');
    await js(`${button('Selecionada')}.focus()`);
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await state(4, 'Selecionada');
    win.webContents.debugger.detach();
    checks.push('clear independently, accessible button names/pressed states, Chromium Enter and Space');
    await back(); await open(); await state(4, 'Selecionada');
    await back();
    await js('Array.from(document.querySelectorAll("header button")).find(b=>b.textContent==="Importar JPEGs").click()');
    await until(() => js('document.querySelector("footer").textContent.includes("Seleção cancelada")'), 'cancel import');
    assert.deepEqual((await api('classificationPhoto', id)).value, { photo, rating: 4, flag: 'selected' });
    selection = { canceled: false, filePaths: [file] };
    const imported = await api('importJpeg'); assert.equal(imported.value.items[0].result.value.id, id);
    assert.deepEqual((await api('classificationPhoto', id)).value, { photo, rating: 4, flag: 'selected' });
    await win.webContents.reload();
    await until(() => js('Boolean(document.querySelector(".tile"))'), 'reload');
    await open(); await state(4, 'Selecionada');
    fs.writeFileSync(path.join(run, 'expected.json'), JSON.stringify({ thumbnail: (await api('thumbnailPhoto', id)).value.dataUrl }));
    await back();
    await click('Abrir other.jpg');
    await state(null, 'Sem flag');
    await click('1 estrela'); await state(1, 'Sem flag');
    await click('Rejeitada'); await state(1, 'Rejeitada');
    await back(); await open(); await state(4, 'Selecionada');
    assert.deepEqual((await api('classificationPhoto', other.id)).value, { photo: other, rating: 1, flag: 'rejected' });
    checks.push('grid/viewer navigation, import cancel, canonical reimport and renderer reload preserve classification');
    checks.push('navigating and classifying another UUID never overwrites the previous photo');
  } else { await state(4, 'Selecionada'); assert.deepEqual((await api('classificationPhoto', id)).value, { photo, rating: 4, flag: 'selected' }); assert.deepEqual((await api('classificationPhoto', other.id)).value, { photo: other, rating: 1, flag: 'rejected' }); checks.push('new Electron process restores separate classifications on the same two migrated UUIDs'); }
  assert.equal(hash(fs.readFileSync(file)), hash(sample));
  assert.equal(hash(fs.readFileSync(otherFile)), hash(sample));
  checks.push('synthetic original bytes preserved');
  const result = { ok: true, mode, platform: process.platform, versions: process.versions, checks };
  fs.writeFileSync(path.join(run, mode + '-result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  clearTimeout(timeout); app.quit();
})().catch(error => { fs.writeFileSync(path.join(run, mode + '-failure.txt'), error.stack || String(error)); console.error(error); clearTimeout(timeout); app.exit(1); });
