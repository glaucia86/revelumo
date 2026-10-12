// Real packaged IPC/renderer. Only OS discovery, dialogs and response faults are adapted.
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const run = path.resolve(process.argv[2]);
const mode = process.argv[3] || 'first';
const repo = path.resolve(__dirname, '..');
for (const name of ['userData', 'sessionData', 'crashDumps']) { const directory = path.join(run, name); fs.mkdirSync(directory, { recursive: true }); app.setPath(name, directory); }
const preferencesFile = path.join(run, 'userData', 'preferences.json');
if (mode === 'corrupt') fs.writeFileSync(preferencesFile, '{broken');
if (mode === 'future') fs.writeFileSync(preferencesFile, '{"schemaVersion":2,"language":"pt-BR","future":true}');
if (mode === 'oversized') fs.writeFileSync(preferencesFile, JSON.stringify({ schemaVersion: 2, future: 'x'.repeat(4096) }));
app.getPreferredSystemLanguages = () => { if (mode === 'os-error') throw new Error('OS language unavailable'); return mode === 'fallback' ? ['ja-JP'] : mode === 'system-reopen' ? ['en-GB'] : ['fr-CA', 'es-419', 'en-US']; };
if (mode === 'boot-error') { fs.writeFileSync(preferencesFile, '{"schemaVersion":1,"language":"es"}'); fs.writeFileSync(path.join(run, 'userData', 'catalog.sqlite'), 'not a database'); }
let selection = { canceled: true, filePaths: [] }, heldDialog = null;
dialog.showOpenDialog = async () => heldDialog ? await heldDialog : selection;
let loseAcknowledgement = false, failQuery = false, beginCount = 0, saveCount = 0, heldSave = null;
let preferenceHandler, trustedPreferenceEvent, heldImport = null, importCalls = 0;
const register = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => {
  if (channel === 'revelumo:preferences') preferenceHandler = listener;
  register(channel, async (event, request) => {
    if (channel === 'revelumo:preferences') trustedPreferenceEvent = event;
    if (request?.op === 'begin-edit') beginCount++;
    if (request?.op === 'import') importCalls++;
    if (request?.op === 'adjustments' || request?.op === 'exposure') saveCount++;
    if (request?.op === 'query' && failQuery) return { ok: false, code: 'catalog-error', message: 'Never display this raw failure', descriptor: { key: 'errors.query' } };
    const result = await listener(event, request);
    if (request?.op === 'import' && heldImport) { heldImport.entered = true; await heldImport.promise; }
    if (request?.op === 'set-language' && loseAcknowledgement) { loseAcknowledgement = false; throw new Error('Simulated lost acknowledgement'); }
    if ((request?.op === 'adjustments' || request?.op === 'exposure') && heldSave) { heldSave.entered = true; await heldSave.promise; }
    return result;
  });
};
require('./hidden-electron.cjs')(path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources', 'app.asar', '.vite', 'build', 'index.cjs'));
if (mode === 'boot-error') dialog.showErrorBox = (title, message) => { assert.equal(title, 'No se pudo abrir Revelumo'); assert.match(message, /catálogo/); console.log('Language boot error passed: es'); app.exit(0); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let win;
const js = expression => win.webContents.executeJavaScript(expression);
const api = (method, ...args) => js(`window.revelumo.${method}(${args.map(arg => JSON.stringify(arg)).join(',')})`);
async function until(work, label) { const end = Date.now() + 15000; while (Date.now() < end) { const result = await work(); if (result) return result; await delay(30); } throw new Error('Timed out: ' + label); }
async function select(id, value) { await js(`(()=>{const s=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`); }
async function choose(value) { await select('language-choice', value); await until(() => js(`document.documentElement.lang===${JSON.stringify(value)} && !document.getElementById('language-choice').disabled`), 'confirmed language ' + value); }
async function grid(count) { await until(() => js(`document.querySelector('.gallery')?.getAttribute('aria-busy')==='false' && document.querySelectorAll('.tile').length===${count}`), 'grid ' + count); }
async function click(selector) { await js(`document.querySelector(${JSON.stringify(selector)}).click()`); }
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const timeout = setTimeout(() => { console.error('Language smoke timed out'); app.exit(1); }, 120000);
(async () => {
  await app.whenReady();
  win = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'app://revelumo/index.html'), 'window');
  await until(() => js('Boolean(window.revelumoPreferences && document.getElementById("language-choice"))'), 'language selector');
  await grid(mode === 'reopen' ? 48 : 0);
  await until(() => js('document.documentElement.lang !== "en" || !document.getElementById("language-choice").disabled'), 'language initialized');
  const expected = mode === 'reopen' ? 'pt-BR' : ['fallback', 'os-error', 'system-reopen'].includes(mode) ? 'en' : 'es';
  await until(() => js(`document.documentElement.lang === ${JSON.stringify(expected)}`), 'initial resolved language');
  const security = win.webContents.getLastWebPreferences();
  assert.equal(security.sandbox, true); assert.equal(security.contextIsolation, true); assert.equal(security.nodeIntegration, false); assert.equal(security.webSecurity, true);
  assert.equal(await js('typeof require'), 'undefined');
  assert.deepEqual(await js('Object.keys(window.revelumoPreferences).sort()'), ['getLanguage', 'setLanguage']);
  assert.deepEqual((await js('window.revelumoPreferences.setLanguage("../../es")')).code, 'invalid-request');
  const event = trustedPreferenceEvent;
  for (const badEvent of [{ ...event, sender: {} }, { ...event, senderFrame: { url: event.senderFrame.url } }, { ...event, senderFrame: null }]) {
    assert.equal((await preferenceHandler(badEvent, { op: 'set-language', choice: 'en' })).code, 'invalid-request');
  }
  assert.equal((await preferenceHandler(event, { op: 'set-language', choice: 'en', path: '/tmp/evil' })).code, 'invalid-request');
  if (['future', 'oversized'].includes(mode)) {
    const before = fs.readFileSync(preferencesFile);
    assert.equal(await js('document.getElementById("language-choice").disabled'), true);
    assert.equal((await js('window.revelumoPreferences.setLanguage("en")')).ok, false);
    assert.equal(hash(fs.readFileSync(preferencesFile)), hash(before));
    fs.writeFileSync(preferencesFile, '{"schemaVersion":1,"language":"en"}');
    await click('.language-notice button');
    await until(() => js('document.documentElement.lang === "en" && !document.getElementById("language-choice").disabled'), 'repaired preferences retry');
  } else if (mode === 'corrupt') {
    assert.equal(fs.readFileSync(preferencesFile, 'utf8'), '{broken');
    assert.match(await js('document.querySelector(".language-notice").textContent'), /no es válida/);
    await choose('en'); assert.equal(JSON.parse(fs.readFileSync(preferencesFile)).language, 'en');
  } else if (mode === 'system-first') {
    assert.equal((await js('window.revelumoPreferences.setLanguage("system")')).ok, true);
    assert.equal(JSON.parse(fs.readFileSync(preferencesFile)).language, 'system');
  } else if (mode === 'first') {
    assert.equal(await js('document.querySelector(".empty h2").textContent'), 'Tu catálogo está vacío');
    await choose('en');
    assert.equal(await js('document.querySelector(".empty h2").textContent'), 'Your catalog is empty');
    await choose('pt-BR');
    assert.equal(await js('document.querySelector(".empty h2").textContent'), 'Seu catálogo está vazio');
    const sample = fs.readFileSync(path.join(repo, 'test/fixtures/sample.jpg'));
    const files = Array.from({ length: 49 }, (_, index) => path.join(run, `photo-${String(index).padStart(2, '0')}.jpg`));
    for (const file of files) fs.writeFileSync(file, sample);
    const invalid = path.join(run, 'invalid.jpg'); fs.writeFileSync(invalid, 'not JPEG');
    let releaseDialog; heldDialog = new Promise(resolve => { releaseDialog = resolve; });
    await click('.catalog-import');
    await until(() => js('Boolean(document.querySelector(".import-progress"))'), 'import waiting');
    await choose('en');
    assert.match(await js('document.querySelector(".import-progress").textContent'), /Waiting/);
    let releaseImport;
    heldImport = { promise: new Promise(resolve => { releaseImport = resolve; }), entered: false };
    releaseDialog({ canceled: false, filePaths: [...files, invalid] }); heldDialog = null;
    await until(() => heldImport.entered, 'import result in flight');
    await until(() => js('document.querySelector(".import-progress progress")?.value === 50'), 'real completed import progress');
    await choose('es');
    assert.equal(await js('document.querySelector(".import-progress progress").value'), 50);
    assert.match(await js('document.querySelector(".import-progress").textContent'), /50 de 50 archivos/);
    assert.equal(importCalls, 1);
    releaseImport(); heldImport = null;
    await grid(48);
    await choose('en');
    await until(() => js('Boolean(document.querySelector(".failures"))'), 'partial import failures');
    assert.match(await js('document.querySelector(".failures").textContent'), /not a valid JPEG/);
    const photos = (await api('listPhotos')).value;
    assert.equal(photos.length, 49);
    const id = photos[0].id;
    const recipes = await api('recipePhoto', id);
    for (const locale of ['es', 'pt-BR', 'en']) {
      await choose(locale);
      assert.equal(await js('document.querySelectorAll(".tile").length'), 48);
      assert.equal((await api('recipePhoto', id)).value.exposureTenths, recipes.value.exposureTenths);
      win.setSize(760, 540);
      await delay(60);
      assert.equal(await js('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), true, 'no horizontal document overflow');
      const image = await win.webContents.capturePage(); fs.writeFileSync(path.join(run, `catalog-${locale}.png`), image.toPNG());
    }
    await click('.pagination button:last-child'); await grid(1);
    await choose('es');
    assert.equal(await js('document.querySelector(".pagination span").textContent'), 'Página 2 de 2');
    await select('filter-rating', '5'); await grid(0);
    await choose('en'); assert.equal(await js('document.getElementById("filter-rating").value'), '5');
    failQuery = true; await select('filter-flag', 'selected');
    await until(() => js('Boolean(document.querySelector(".query-error"))'), 'query error');
    await choose('es');
    assert.doesNotMatch(await js('document.body.textContent'), /Never display this raw failure/);
    assert.match(await js('document.querySelector(".query-error p").textContent'), /biblioteca/);
    failQuery = false; await click('.query-error button'); await grid(0);
    await click('.library-filters button'); await grid(48);
    // A lost confirmation must retain the previous UI choice and allow idempotent retry.
    loseAcknowledgement = true;
    await select('language-choice', 'en');
    await until(() => js('Boolean(document.querySelector(".language-notice button"))'), 'lost acknowledgement retry');
    assert.equal(await js('document.documentElement.lang'), 'es');
    await click('.language-notice button');
    await until(() => js('document.documentElement.lang === "en"'), 'confirmation recovered');
    // Real filesystem failure at rename, without replacing the store or main process.
    const confirmed = fs.readFileSync(preferencesFile);
    fs.unlinkSync(preferencesFile); fs.mkdirSync(preferencesFile);
    await select('language-choice', 'pt-BR');
    await until(() => js('Boolean(document.querySelector(".language-notice button"))'), 'disk failure retry');
    assert.equal(await js('document.documentElement.lang'), 'en');
    fs.rmdirSync(preferencesFile); fs.writeFileSync(preferencesFile, confirmed);
    await click('.language-notice button');
    await until(() => js('document.documentElement.lang === "pt-BR"'), 'disk retry confirmed');
    // Locale context updates must not remount or flush a numeric draft.
    await click('.tile');
    await until(() => js('Boolean(document.querySelector(".exposure input[type=number]") && !document.querySelector(".exposure input[type=number]").disabled && document.querySelector("canvas")?.dataset.revision)'), 'editor ready');
    win.webContents.debugger.attach('1.3');
    const selectNumeric = async () => {
      await js('document.querySelector(".exposure input[type=number]").focus()');
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    };
    const type = async text => { for (const character of text) await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'char', text: character, key: character }); };
    await selectNumeric(); await type('-');
    const beforeBegin = beginCount, beforeSave = saveCount;
    await choose('es');
    assert.equal(await js('document.querySelector(".exposure input[type=number]").value'), '');
    assert.equal(beginCount, beforeBegin); assert.equal(saveCount, beforeSave);
    await type('1');
    await until(() => js('document.querySelector(".save-status")?.textContent === "Salvo"'), 'draft saved');
    assert.equal((await api('recipePhoto', id)).value.exposureTenths, -10);
    let releaseSave; heldSave = { promise: new Promise(resolve => { releaseSave = resolve; }), entered: false };
    await selectNumeric(); await type('1.');
    await choose('en'); await type('2');
    await until(() => heldSave.entered, 'save held');
    const activeBegin = beginCount;
    await choose('pt-BR');
    assert.equal(beginCount, activeBegin);
    assert.equal(await js('document.querySelector(".exposure input[type=number]").value'), '1.2');
    releaseSave(); heldSave = null;
    await until(() => js('document.querySelector(".save-status")?.textContent === "Salvo"'), 'save acknowledged');
    assert.equal((await api('recipePhoto', id)).value.exposureTenths, 12);
    for (const file of files) assert.equal(hash(fs.readFileSync(file)), hash(sample));
    assert.equal(JSON.parse(fs.readFileSync(preferencesFile)).language, 'pt-BR');
    assert.equal(await js('Boolean(document.querySelector(".viewer canvas"))'), true);
  }
  console.log('Language catalog smoke passed: ' + mode); clearTimeout(timeout); app.exit(0);
})().catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
