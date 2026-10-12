// Hidden packaged renderer; only native dialogs and bridge transport faults are substituted.
const electron = require('electron');
const { app, dialog, BrowserWindow: RealWindow, ipcMain } = electron;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const Module = require('node:module');
function fatal(error) { console.error(error?.stack || String(error)); app.exit(1); }
process.on('uncaughtException', fatal); process.on('unhandledRejection', fatal);
dialog.showErrorBox = (title, message) => fatal(new Error(`${title}: ${message}`));
const run = path.resolve(process.argv[2]);
const mode = process.argv[3] || 'first';
assert.ok(['first', 'reopen'].includes(mode));
const repo = path.resolve(__dirname, '..');
for (const dir of ['user-data', 'session-data', 'crash-dumps']) fs.mkdirSync(path.join(run, dir), { recursive: true });
app.setPath('userData', path.join(run, 'user-data')); app.setPath('sessionData', path.join(run, 'session-data')); app.setPath('crashDumps', path.join(run, 'crash-dumps'));
let selection = { canceled: true, filePaths: [] };
dialog.showOpenDialog = async () => selection;
const load = Module._load;
const hiddenElectron = { ...electron, BrowserWindow: class extends RealWindow {
  constructor(options) { super({ ...options, show: false }); }
} };
// Delay/fail only public IPC responses, preserving production preload and renderer.
let heldQuery, holdNext = false, failNext = false, failImport = false;
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, async (event, request) => {
  if (request?.op === 'import' && failImport) { failImport = false; return { ok: false, code: 'catalog-error', message: 'Importação temporariamente indisponível.' }; }
  if (request?.op === 'query' && failNext) { failNext = false; return { ok: false, code: 'catalog-error', message: 'Consulta temporariamente indisponível.' }; }
  const result = await listener(event, request);
  if (request?.op === 'query' && holdNext) { holdNext = false; return new Promise(resolve => { heldQuery = () => resolve(result); }); }
  return result;
});
Module._load = function(request, ...args) { return request === 'electron' ? hiddenElectron : load.call(this, request, ...args); };
try { require(path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources', 'app.asar', '.vite', 'build', 'index.cjs')); }
finally { Module._load = load; }
let win;
const js = expression => win.webContents.executeJavaScript(expression).catch(error => { throw new Error(`Renderer expression failed: ${expression}`, { cause: error }); });
const api = (method, ...args) => js(`window.revelumo.${method}(${args.map(arg => JSON.stringify(arg)).join(',')})`);
const button = name => `Array.from(document.querySelectorAll('button')).find(b=>b.getAttribute('aria-label')===${JSON.stringify(name)} || b.textContent.trim()===${JSON.stringify(name)})`;
const click = name => js(`${button(name)}.click()`);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(work, label) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { const value = await work(); if (value) return value; await delay(30); }
  throw new Error('Timed out: ' + label);
}
async function filter(id, value) {
  await js(`(()=>{const s=document.getElementById(${JSON.stringify(id)});const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
async function exposure(value) {
  await js(`(()=>{const s=document.querySelector('.exposure input[type="number"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(s,${JSON.stringify(String(value))});s.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
async function grid(count, pageText) {
  await until(() => js(`document.querySelector('.gallery')?.getAttribute('aria-busy')==='false' && document.querySelectorAll('.tile').length===${count}`), 'grid count ' + count);
  if (pageText) assert.equal(await js('document.querySelector(".pagination span").textContent'), pageText);
}
const checks = [];
const sample = fs.readFileSync(path.join(repo, 'test', 'fixtures', 'sample.jpg'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const timeout = setTimeout(() => fatal(new Error('filter integration exceeded 120 seconds')), 120000);
(async () => {
  await app.whenReady();
  win = await until(() => RealWindow.getAllWindows().find(w => w.webContents.getURL() === 'app://revelumo/index.html'), 'packaged origin');
  ipcMain.handle = handle;
  assert.equal(win.isVisible(), false);
  win.webContents.debugger.attach('1.3');
  await until(() => js('Boolean(document.getElementById("filter-rating"))'), 'accessible filter controls');
  const prefs = win.webContents.getLastWebPreferences();
  assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false); assert.equal(prefs.webSecurity, true);
  assert.equal(await js('typeof require'), 'undefined');
  assert.equal(await js('document.getElementById("filter-rating").value'), 'all');
  assert.equal(await js('document.getElementById("filter-flag").value'), 'all');
  await grid(0);
  assert.equal(await js('document.querySelector(".gallery h1")?.textContent'), 'Todas as fotos', 'catalog has a meaningful page heading');
  assert.equal(await js('getComputedStyle(document.querySelector(".gallery")).backgroundColor'), 'rgb(21, 21, 21)');
  assert.equal(await js('getComputedStyle(document.querySelector("header button:last-child")).backgroundColor'), 'rgb(239, 178, 138)');
  assert.equal(await js('document.querySelector("header").getBoundingClientRect().height'), 70);
  assert.doesNotMatch(await js('document.body.textContent'), /SEU OLHAR|Toda foto começa|simulação/);
  assert.equal(await js('document.querySelector(".empty h2").textContent'), 'Seu catálogo está vazio');
  checks.push('empty catalog is presented as a working catalog, without marketing copy');
  const firstFile = path.join(run, 'photo-00.jpg'); fs.writeFileSync(firstFile, sample);
  selection = { canceled: false, filePaths: [firstFile] };
  await click('Importar JPEGs'); await grid(1, 'Página 1 de 1');
  await until(() => js('Boolean(document.querySelector(".thumbnail img")?.complete)'), 'thumbnail rendered');
  await js('document.querySelector(".tile").focus()');
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13});
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type: 'char', text: '\r', key: 'Enter'});
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13});
  await until(() => js('Boolean(document.querySelector(".viewer canvas")?.dataset.revision)'), 'keyboard opens real editor');
  await js(button('Catálogo') + '.focus()');
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13});
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type: 'char', text: '\r', key: 'Enter'});
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13});
  await grid(1);
  await until(() => js('document.activeElement?.getAttribute("aria-label") === "Abrir photo-00.jpg"'), 'return restores focus to the same photo');
  assert.equal(await js('getComputedStyle(document.querySelector(".tile")).backgroundColor'), 'rgb(32, 32, 32)');
  assert.equal(await js('getComputedStyle(document.querySelector(".thumbnail")).backgroundColor'), 'rgb(24, 24, 24)');
  assert.equal(await js('getComputedStyle(document.querySelector(".filename")).fontSize'), '12px');
  assert.equal(await js('getComputedStyle(document.querySelector(".tile:focus-visible")).outlineStyle'), 'solid');
  assert.equal(await js('getComputedStyle(document.querySelector(".thumbnail img")).objectFit'), 'contain');
  assert.equal(hash(fs.readFileSync(firstFile)), hash(sample));
  checks.push('keyboard opens the real photo; returning restores its focus; neutral stage and readable catalog tile preserve the original');
  const files = Array.from({length: 48}, (_, i) => path.join(run, `photo-${String(i + 1).padStart(2, '0')}.jpg`));
  for (const file of files) fs.writeFileSync(file, sample);
  const invalid = path.join(run, 'invalid.jpg'); fs.writeFileSync(invalid, 'not a JPEG');
  selection = {canceled: false, filePaths: [...files, invalid]};
  await click('Importar JPEGs'); await grid(48, 'Página 1 de 2');
  assert.match(await js('document.querySelector(".failures").textContent'), /1 arquivo.*invalid.jpg/);
  assert.equal((await api('listPhotos')).value.length, 49);
  await click('Próxima'); await grid(1, 'Página 2 de 2');
  assert.equal(await js('document.querySelector(".tile").getAttribute("aria-label")'), 'Abrir photo-48.jpg');
  fs.renameSync(files[47], files[47] + '.moved');
  await click('Verificar disponibilidade');
  await until(() => js('document.querySelector(".original-status")?.textContent === "Original ausente"'), 'cached missing original has a text indicator');
  assert.equal(await js('getComputedStyle(document.querySelector(".original-status")).fontSize'), '12px');
  await click('Abrir photo-48.jpg');
  await until(() => js('Boolean(document.querySelector(".original-notice button"))'), 'missing original offers relocation');
  await click('Catálogo'); await grid(1);
  await filter('filter-rating', '5'); await grid(0);
  assert.match(await js('document.querySelector(".empty").textContent'), /As 49 fotos continuam/);
  failNext = true; await filter('filter-flag', 'selected');
  await until(() => js('Boolean(document.querySelector(".query-error"))'), 'query failure');
  assert.equal(await js('Boolean(document.querySelector(".empty"))'), false);
  await click('Tentar novamente'); await grid(0);
  holdNext = true; await filter('filter-flag', 'all');
  await until(() => Boolean(heldQuery), 'query held');
  assert.equal(await js('document.querySelector(".gallery").getAttribute("aria-busy")'), 'true');
  assert.match(await js('document.querySelector(".gallery").textContent'), /Consultando biblioteca/);
  heldQuery(); heldQuery = undefined; await grid(0);
  await click('Limpar filtros'); await grid(48);
  checks.push('49 real imported photos keep 48-item pagination; partial import, missing originals, loading, filter-empty and query retry remain distinct');
  for (const [width, height] of [[760,540], [1180,757], [1440,900]]) {
    win.setContentSize(width, height);
    await delay(80);
    const layout = await js(`(()=>{
      const section = document.querySelector('.gallery');
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        footer: document.querySelector('footer').getBoundingClientRect().bottom <= innerHeight,
        sidebarScrollable: ['auto','scroll'].includes(getComputedStyle(document.querySelector('aside')).overflowY),
        galleryScrollable: ['auto','scroll'].includes(getComputedStyle(section).overflowY),
        textSizes: [...document.querySelectorAll('header button, aside label, aside select, .filename, .tile-meta, .gallery .quiet, footer span')].map(e => parseFloat(getComputedStyle(e).fontSize)),
        cols: getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length
      };
    })()`);
    assert.equal(layout.overflow, false, `${width}: no horizontal page overflow`);
    assert.equal(layout.footer, true, `${width}: footer remains reachable`);
    assert.equal(layout.sidebarScrollable && layout.galleryScrollable, true);
    assert.ok(layout.textSizes.every(size => size >= 12), `${width}: readable labels`);
    assert.ok(layout.cols >= 2);
    const screenshot = await win.webContents.capturePage();
    fs.writeFileSync(path.join(run, `catalog-${width}x${height}.png`), screenshot.toPNG());
  }
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {features: [{name:'prefers-reduced-motion', value:'reduce'}]});
  assert.equal(await js('matchMedia("(prefers-reduced-motion: reduce)").matches'), true);
  assert.equal(await js('getComputedStyle(document.querySelector(".tile")).transitionDuration'), '0s');
  for (const file of [firstFile, ...files.slice(0, -1), files[47] + '.moved']) assert.equal(hash(fs.readFileSync(file)), hash(sample));
  checks.push('760×540, 1180×757 and 1440×900 retain reachable scroll regions, 12px labels, reduced motion and unchanged original bytes');
  fs.writeFileSync(path.join(run, 'result.json'), JSON.stringify({checks}, null, 2));
  clearTimeout(timeout); app.exit(0);
})().catch(error => { fs.writeFileSync(path.join(run, 'failure.txt'), error.stack); fatal(error); });
