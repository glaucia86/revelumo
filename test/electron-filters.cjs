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
  await until(() => js('Boolean(document.getElementById("filter-rating"))'), 'accessible filter controls');
  const prefs = win.webContents.getLastWebPreferences();
  assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false); assert.equal(prefs.webSecurity, true);
  assert.equal(await js('typeof require'), 'undefined');
  assert.equal(await js('document.getElementById("filter-rating").value'), 'all');
  assert.equal(await js('document.getElementById("filter-flag").value'), 'all');
  if (mode === 'reopen') {
    await grid(48, 'Página 1 de 2');
    assert.equal((await api('queryPhotos', { rating: 4, flag: 'selected' })).value.photos.length, 49);
    checks.push('new process starts unfiltered while confirmed classification persists');
  } else {
    assert.deepEqual((await api('listPhotos')).value, []);
    const files = Array.from({ length: 50 }, (_, i) => path.join(run, `photo-${String(i).padStart(2, '0')}.jpg`));
    for (const file of files) fs.writeFileSync(file, sample);
    selection = { canceled: false, filePaths: files };
    await click('Importar JPEGs'); await grid(48, 'Página 1 de 2');
    const photos = (await api('listPhotos')).value;
    for (const photo of photos) assert.equal((await api('classifyPhoto', photo.id, 4, 'selected')).ok, true);
    await click('Próxima'); await grid(2, 'Página 2 de 2');
    await filter('filter-rating', '4'); await grid(48, 'Página 1 de 2');
    await filter('filter-flag', 'selected'); await grid(48, 'Página 1 de 2');
    assert.deepEqual((await api('queryPhotos', { rating: 4, flag: 'selected' })).value.photos, photos);
    checks.push('AND filters retain import order; 48 per page; explicit filter starts page one');
    await click('Próxima'); await grid(2, 'Página 2 de 2');
    await click('Abrir photo-48.jpg');
    await until(() => js('Boolean(document.querySelector(".viewer canvas")?.dataset.revision) && !' + button('1 estrela') + '.disabled'), 'UUID preview ready');
    await exposure(1.3);
    await click('1 estrela');
    await until(() => js(button('1 estrela') + '.getAttribute("aria-pressed")==="true" && !' + button('1 estrela') + '.disabled'), 'saved rating');
    assert.equal(await js('document.querySelector("figcaption").textContent.split(" · ")[0]'), 'photo-48.jpg');
    assert.equal(await js('Boolean(document.querySelector(".viewer canvas")?.dataset.revision)'), true);
    assert.equal(await js('document.querySelector(\'.exposure input[type="number"]\').value'), '1.3');
    const flushLock = new DatabaseSync(path.join(run, 'user-data', 'catalog.sqlite'));
    try {
      flushLock.exec('BEGIN IMMEDIATE');
      await exposure(1.4);
      await js('document.querySelector(".back").click()');
      await until(() => js('Boolean(document.querySelector(".exit-failure") && document.querySelector(".viewer canvas"))'), 'filtered navigation blocked by failed exposure flush');
      assert.equal(await js('document.getElementById("filter-rating").value'), '4');
      assert.equal(await js('document.querySelector(\'.exposure input[type="number"]\').value'), '1.4');
    } finally { flushLock.exec('ROLLBACK'); flushLock.close(); }
    await click('Tentar novamente e sair');
    await grid(1, 'Página 2 de 2');
    assert.equal((await api('recipePhoto', photos[48].id)).value.exposureTenths, 14);
    assert.equal(await js('document.querySelector(".tile").getAttribute("aria-label")'), 'Abrir photo-49.jpg');
    assert.equal(await js('document.getElementById("filter-rating").value'), '4');
    checks.push('classification preserves exposure draft/canvas; failed flush keeps filtered photo open; retry saves exposure before updating filtered page by UUID');
    // Failed classification remains saved/matching, never optimistic filtering.
    await click('Abrir photo-49.jpg');
    await until(() => js('Boolean(document.querySelector(".viewer canvas")?.dataset.revision) && !' + button('1 estrela') + '.disabled'), 'second preview');
    const lock = new DatabaseSync(path.join(run, 'user-data', 'catalog.sqlite'));
    try {
      lock.exec('BEGIN IMMEDIATE'); await click('1 estrela');
      await until(() => js('document.querySelector("footer").textContent.includes("Não foi possível salvar a classificação")'), 'classification failure');
    } finally { lock.exec('ROLLBACK'); lock.close(); }
    await js('document.querySelector(".back").click()'); await grid(1, 'Página 2 de 2');
    assert.equal((await api('classificationPhoto', photos[49].id)).value.rating, 4);
    // Removing the final second-page match clamps the existing page to one.
    assert.equal((await api('classifyPhoto', photos[49].id, 1, 'selected')).ok, true);
    await click('Todas as fotos'); await grid(48, 'Página 1 de 1');
    assert.equal((await api('classifyPhoto', photos[49].id, 4, 'selected')).ok, true);
    await click('Todas as fotos'); await grid(48, 'Página 1 de 2');
    checks.push('failed write preserves matching result; invalid page clamps after confirmed update');
    await filter('filter-rating', '5'); await grid(0);
    assert.match(await js('document.querySelector(".empty").textContent'), /Nenhuma foto corresponde/);
    assert.equal((await api('listPhotos')).value.length, 50);
    const extra = path.join(run, 'extra.jpg'); fs.writeFileSync(extra, sample);
    selection = { canceled: false, filePaths: [extra] };
    await click('Importar JPEGs');
    await until(() => js('document.querySelector("footer").textContent.includes("1 foto(s) importada(s) oculta(s)")'), 'hidden import feedback');
    await grid(0); assert.equal(await js('document.getElementById("filter-rating").value'), '5');
    await click('Limpar filtros'); await grid(48, 'Página 1 de 2');
    assert.equal((await api('listPhotos')).value.length, 51);
    checks.push('empty results differ from empty catalog; importing preserves filters and reports hidden imports; clear restores all');
    await filter('filter-rating', 'unrated'); await grid(1, 'Página 1 de 1');
    assert.equal(await js('document.querySelector(".tile").getAttribute("aria-label")'), 'Abrir extra.jpg');
    fs.renameSync(extra, extra + '.moved');
    assert.equal((await api('queryPhotos', { rating: 'unrated', flag: 'neutral' })).value.photos[0].name, 'extra.jpg');
    fs.renameSync(extra + '.moved', extra);
    await filter('filter-flag', 'rejected'); await grid(0);
    await click('Limpar filtros'); await grid(48);
    holdNext = true; await filter('filter-rating', '5');
    await until(() => Boolean(heldQuery), 'delayed query held');
    await filter('filter-rating', '4'); await grid(48);
    heldQuery(); heldQuery = undefined;
    await delay(150); await grid(48);
    assert.equal(await js('document.getElementById("filter-rating").value'), '4');
    failNext = true; await filter('filter-flag', 'neutral');
    await until(() => js('document.querySelector(".query-error")?.textContent.includes("Consulta temporariamente indisponível")'), 'query error');
    assert.equal(await js('Boolean(document.querySelector(".empty"))'), false);
    await click('Tentar novamente'); await grid(0);
    checks.push('unrated is null only; delayed response cannot overwrite current filter; failed query has distinct retry state');
    await click('Limpar filtros'); await grid(48);
    win.webContents.debugger.attach('1.3');
    const ax = await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
    for (const name of ['Estrelas mínimas', 'Marcação']) assert.ok(ax.nodes.some(n => !n.ignored && n.role?.value === 'combobox' && n.name?.value === name));
    await js('document.getElementById("filter-rating").focus()');
    for (const type of ['keyDown', 'keyUp']) await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type, key: 'End', code: 'End', windowsVirtualKeyCode: 35 });
    await grid(0); assert.equal(await js('document.getElementById("filter-rating").value'), '5');
    await js(button('Limpar filtros') + '.focus()');
    for (const type of ['keyDown', 'keyUp']) await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) });
    await grid(48); win.webContents.debugger.detach();
    checks.push('Chromium accessible combobox labels; keyboard changes filter and clears via Enter');
    for (const invalid of [{ rating: 0, flag: 'all' }, { rating: 6, flag: 'all' }, { rating: '4', flag: 'all' }, { rating: null, flag: 'all' }, { rating: 'all', flag: 'wrong' }, { rating: 'all', flag: 'all', path: extra }]) assert.equal((await api('queryPhotos', invalid)).code, 'invalid-request');
    assert.equal((await api('queryPhotos', { rating: 'all', flag: 'all' })).value.photos.some(p => 'path' in p || 'sha256' in p), false);
    for (const file of [...files, extra]) assert.equal(hash(fs.readFileSync(file)), hash(sample));
    await filter('filter-rating', '4'); await grid(48);
    await click('Abrir photo-00.jpg');
    await until(() => js('Boolean(document.querySelector(".viewer canvas")?.dataset.revision) && !' + button('1 estrela') + '.disabled'), 'preview before filtered import');
    await exposure(1.7);
    selection = { canceled: false, filePaths: [extra] };
    await click('Importar JPEGs');
    await until(() => js('document.querySelector("footer").textContent.includes("1 foto(s) importada(s) oculta(s)")'), 'hidden import feedback during preview');
    await grid(48, 'Página 1 de 2');
    assert.equal((await api('recipePhoto', photos[0].id)).value.exposureTenths, 17);
    assert.equal(await js('document.getElementById("filter-rating").value'), '4');
    checks.push('missing original still matches saved filters; import flushes exposure then reports hidden UUID and retains filter');
    for (const failed of [false, true]) {
      await click('Abrir photo-00.jpg');
      await until(() => js('Boolean(document.querySelector(".viewer canvas")?.dataset.revision) && !' + button('1 estrela') + '.disabled'), 'preview before canceled/failed import');
      selection = { canceled: true, filePaths: [] }; failImport = failed; holdNext = true;
      await click('Importar JPEGs');
      await until(() => Boolean(heldQuery), 'navigation query held during canceled/failed import');
      const feedback = failed ? 'Importação temporariamente indisponível.' : 'Seleção cancelada.';
      await until(() => js(`document.querySelector('footer').textContent.includes(${JSON.stringify(feedback)})`), 'import feedback before delayed query');
      heldQuery(); heldQuery = undefined; await grid(48);
      assert.equal(await js(`document.querySelector('footer').textContent.includes(${JSON.stringify(feedback)})`), true, 'delayed navigation query preserves import outcome feedback');
    }
    checks.push('delayed navigation queries preserve canceled and failed import feedback after exposure flush');
    checks.push('strict IPC rejects invalid/extra fields, exposes summaries only, all 51 originals unchanged');
  }
  const result = { ok: true, mode, platform: process.platform, versions: process.versions, checks };
  fs.writeFileSync(path.join(run, mode + '-result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  clearTimeout(timeout); app.quit();
})().catch(error => { fs.writeFileSync(path.join(run, mode + '-failure.txt'), error.stack || String(error)); clearTimeout(timeout); fatal(error); });
