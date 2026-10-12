// Real packaged renderer/IPC; only system language, dialogs and injected faults are adapted.
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const run = path.resolve(process.argv[2]), repo = path.resolve(__dirname, '..');
for (const name of ['userData', 'sessionData', 'crashDumps']) { const directory = path.join(run, name); fs.mkdirSync(directory, { recursive: true }); app.setPath(name, directory); }
app.getPreferredSystemLanguages = () => ['en-US'];
const original = path.join(run, 'photo-unchanged.jpg');
fs.copyFileSync(path.join(repo, 'test/fixtures/exposure-srgb.jpg'), original);
const originalHash = crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex');
let selection = { canceled: false, filePaths: [original] };
dialog.showOpenDialog = async () => selection;
let win, beginCount = 0, saveCount = 0, historyCount = 0, heldSave = null, heldHistory = null;
let failSave = false, failHistory = false, failClassification = false;
let dialogTitle;
dialog.showOpenDialog = async (_owner, options) => { dialogTitle = options.title; return selection; };
const register = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => register(channel, async (event, request) => {
  if (request?.op === 'begin-edit') beginCount++;
  if (request?.op === 'adjustments') saveCount++;
  if (request?.op === 'exposure-history') historyCount++;
  if (request?.op === 'adjustments' && failSave || request?.op === 'exposure-history' && failHistory) return { ok: false, code: 'catalog-error', message: 'Never show raw internal failure', descriptor: { key: 'errors.saveAdjustment' } };
  if (request?.op === 'classify' && failClassification) return { ok: false, code: 'catalog-error', message: 'Never show raw internal failure', descriptor: { key: 'errors.saveClassification' } };
  const result = await listener(event, request);
  const held = request?.op === 'adjustments' ? heldSave : request?.op === 'exposure-history' ? heldHistory : null;
  if (held) { held.entered = true; await held.promise; }
  return result;
});
require('./hidden-electron.cjs')(path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources', 'app.asar', '.vite', 'build', 'index.cjs'));
app.on('before-quit', event => { if (win?.isDestroyed()) event.preventDefault(); });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const js = expression => win.webContents.executeJavaScript(expression);
async function until(work, label) { const end = Date.now() + 15000; while (Date.now() < end) { const value = await work(); if (value) return value; await delay(30); } throw new Error('Timed out: ' + label); }
async function click(selector) { await js(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function choose(value) { await js(`(()=>{const s=document.getElementById('language-choice');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await until(() => js(`document.documentElement.lang===${JSON.stringify(value)} && !document.getElementById('language-choice').disabled`), 'language '+value); }
const api = (method, ...args) => js(`window.revelumo.${method}(${args.map(value => JSON.stringify(value)).join(',')})`);
async function input(selector, value) { await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`); }
async function numericSelect(selector) {
  await js(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  for (const type of ['rawKeyDown', 'keyUp']) await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
}
async function type(text) { for (const character of text) await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'char', text: character, key: character }); }
async function enter() { for (const type of ['rawKeyDown', 'keyUp']) await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); }
function held() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release, entered: false }; }
const exposure = '.exposure input[type=number]', temperature = '.balance-control:first-of-type input[type=number]', tint = '.balance-control:nth-of-type(2) input[type=number]';
const savedLabels = { en: 'Saved', es: 'Guardado', 'pt-BR': 'Salvo' };
async function saved() { await until(() => js(`document.querySelector('.save-status')?.textContent === (${JSON.stringify(savedLabels)})[document.documentElement.lang]`), 'saved'); }
const timeout = setTimeout(() => { console.error('Editor language timed out'); app.exit(1); }, 120000);
(async () => {
  await app.whenReady();
  win = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'app://revelumo/index.html'), 'window');
  await until(() => js('document.querySelector(".catalog-import")?.disabled === false'), 'ready');
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  await js(`(()=>{const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{set onmessage(callback){window.__deliver=callback;super.onmessage=event=>{if(event.data.op==='pixels'){window.__previousReply=window.__latestReply;window.__latestReply=event;}callback(event);};}};})()`);
  await click('.catalog-import'); await until(() => js('Boolean(document.querySelector(".tile"))'), 'imported'); await click('.tile');
  await until(() => js('document.querySelector(".exposure input[type=number]")?.disabled === false'), 'editor');
  assert.equal(await js('document.querySelector(".exposure input[type=number]").getAttribute("aria-label")'), 'Exposure in EV');
  assert.equal(await js('document.querySelector(".classification [role=group]").getAttribute("aria-label")'), 'Stars');
  assert.equal(await js('document.querySelector(".back").textContent'), '← Back to grid');
  const id = (await api('listPhotos')).value[0].id;
  const security = win.webContents.getLastWebPreferences();
  assert.equal(security.sandbox, true); assert.equal(security.contextIsolation, true); assert.equal(security.webSecurity, true); assert.equal(security.nodeIntegration, false);
  await js('window.__editorNode=document.querySelector(".editing");window.__canvasNode=document.querySelector("canvas")');
  const locales = [
    ['en', 'Exposure in EV', 'Relative temperature', 'Relative tint', 'Compare with 0 EV', '1 star'],
    ['pt-BR', 'Exposição em EV', 'Temperatura relativa', 'Matiz relativo', 'Comparar com 0 EV', '1 estrela'],
    ['es', 'Exposición en EV', 'Temperatura relativa', 'Matiz relativo', 'Comparar con 0 EV', '1 estrella'],
  ];
  for (const [locale, ev, temp, tintLabel, compare, star] of locales) {
    await choose(locale); await saved();
    assert.equal(await js(`document.querySelector('${exposure}').getAttribute('aria-label')`), ev);
    assert.equal(await js(`document.querySelector('${temperature}').getAttribute('aria-label')`), temp);
    assert.equal(await js(`document.querySelector('${tint}').getAttribute('aria-label')`), tintLabel);
    assert.equal(await js('document.querySelectorAll(".exposure button")[3].textContent'), compare);
    assert.equal(await js('document.querySelector(".classification button").getAttribute("aria-label")'), star);
    assert.equal(await js('document.querySelector(".editing")===window.__editorNode && document.querySelector("canvas")===window.__canvasNode'), true);
    assert.doesNotMatch(await js('document.body.textContent'), /Kelvin|Never show raw/);
    const beforeBegin = beginCount, beforeSave = saveCount;
    await numericSelect(exposure); await type('-'); await choose(locale === 'en' ? 'es' : 'en');
    assert.equal(await js(`document.querySelector('${exposure}').value`), '');
    assert.equal(beginCount, beforeBegin); assert.equal(saveCount, beforeSave);
    await type('1'); await enter(); await saved();
    assert.equal((await api('recipePhoto', id)).value.exposureTenths, -10);
    await numericSelect(exposure); await type('1.'); await choose(locale); await type('2'); await enter(); await saved();
    assert.equal((await api('recipePhoto', id)).value.exposureTenths, 12);
  }
  // The delayed response belongs to the same operation and renders in the active language.
  await choose('en'); heldSave = held();
  await numericSelect(exposure); await type('0.7'); await enter();
  await until(() => heldSave.entered, 'save in flight'); const savesInFlight = saveCount, sessionsInFlight = beginCount;
  await choose('es');
  assert.equal(await js('document.querySelector(".save-status").textContent'), 'Guardando…');
  assert.equal(await js(`document.querySelector('${exposure}').value`), '0.7');
  assert.equal(saveCount, savesInFlight); assert.equal(beginCount, sessionsInFlight);
  heldSave.release(); heldSave = null; await saved();
  await input(temperature, 25); await input(tint, -10); await saved();
  const snapshot = (await api('recipePhoto', id)).value;
  await numericSelect(temperature); await type('-'); const beforeWb = saveCount;
  await choose('pt-BR'); assert.equal(saveCount, beforeWb); assert.equal(await js(`document.querySelector('${temperature}').value`), '');
  await type('5'); await enter(); await saved(); assert.equal((await api('recipePhoto', id)).value.temperature, -5);
  // A stale worker frame cannot overwrite a newer preview after a locale update.
  const pixelsBefore = await js('document.querySelector("canvas").toDataURL()');
  await js('window.__deliver(window.__previousReply)');
  await choose('en'); assert.equal(await js('document.querySelector("canvas").toDataURL()'), pixelsBefore);
  heldHistory = held(); await js('document.querySelectorAll(".exposure button")[1].click()');
  await until(() => heldHistory.entered, 'undo in flight'); const undoCalls = historyCount;
  await choose('es'); assert.equal(historyCount, undoCalls); assert.equal(await js('document.querySelector(".save-status").textContent'), 'Guardando…');
  heldHistory.release(); heldHistory = null; await saved();
  const undone = (await api('recipePhoto', id)).value; assert.equal(undone.temperature, -5); assert.equal(undone.tint, -10);
  assert.equal(await js('document.querySelectorAll(".exposure button")[2].disabled'), false);
  await choose('pt-BR'); await js('document.querySelectorAll(".exposure button")[2].click()'); await saved();
  assert.equal((await api('recipePhoto', id)).value.exposureTenths, snapshot.exposureTenths);
  failHistory = true; await js('document.querySelectorAll(".exposure button")[1].click()');
  await until(() => js('Boolean(document.querySelector(".exposure [role=alert]"))'), 'history error');
  await choose('en'); assert.match(await js('document.querySelector(".exposure [role=alert]").textContent'), /Could not save the adjustment.*Retry history change/);
  failHistory = false; await click('.exposure [role=alert] button'); await saved();
  await input(exposure, 0.4); await js(`document.querySelector('${exposure}').focus();document.querySelector('${exposure}').blur()`); await saved();
  assert.equal(await js('document.querySelectorAll(".exposure button")[2].disabled'), true, 'new branch removes redo');
  const adjustedPixels = await js('document.querySelector("canvas").toDataURL()'), beforeCompareSaves = saveCount;
  await js('document.querySelectorAll(".exposure button")[3].click()');
  await until(async () => (await js('document.querySelector("canvas").toDataURL()')) !== adjustedPixels, 'neutral exposure comparison');
  const comparedPixels = await js('document.querySelector("canvas").toDataURL()');
  await choose('es');
  assert.equal(await js('document.querySelectorAll(".exposure button")[3].getAttribute("aria-pressed")'), 'true');
  assert.equal(await js('document.querySelector("canvas").toDataURL()'), comparedPixels);
  assert.equal(saveCount, beforeCompareSaves); assert.equal((await api('recipePhoto', id)).value.exposureTenths, 4);
  await js('document.querySelectorAll(".exposure button")[3].click()');
  await until(async () => (await js('document.querySelector("canvas").toDataURL()')) === adjustedPixels, 'comparison restores adjusted preview');
  // Existing error and async classification status also use descriptors, never raw strings.
  await choose('en'); failClassification = true; await click('.classification button');
  await until(() => js('Boolean(document.querySelector(".classification > button"))'), 'classification error');
  await choose('es'); assert.match(await js('document.querySelector(".classification [role=status]").textContent'), /No se pudieron guardar/);
  failClassification = false; await click('.classification > button');
  await until(() => js('document.querySelector(".classification button")?.disabled===false'), 'classification reloaded');
  await click('.classification button'); await until(() => js('document.querySelector(".classification button").getAttribute("aria-pressed")==="true"'), 'star saved');
  assert.equal((await api('classificationPhoto', id)).value.rating, 1);
  // Missing original keeps selected UUID, canvas and saved recipe; chooser cancellation and repair preserve identity.
  const moved = original + '.moved.jpg'; fs.renameSync(original, moved);
  await click('.catalog-sidebar > button:nth-of-type(2)');
  await until(() => js('Boolean(document.querySelector(".original-notice"))'), 'missing original');
  await choose('en'); assert.match(await js('document.querySelector(".original-notice").textContent'), /Original missing.*preview and draft were kept/);
  assert.equal(await js('document.querySelector("canvas")===window.__canvasNode'), true);
  selection = { canceled: true, filePaths: [] }; await click('.original-notice button');
  await until(() => js('document.querySelector(".catalog-footer [role=status]").textContent === "Locate canceled."'), 'canceled chooser');
  assert.equal(dialogTitle, 'Locate original');
  await choose('es'); assert.equal(await js('document.querySelector(".catalog-footer [role=status]").textContent'), 'Localización cancelada.');
  selection = { canceled: false, filePaths: [moved] }; await click('.original-notice button');
  await until(() => js('!document.querySelector(".original-notice")'), 'relocated');
  assert.equal((await api('listPhotos')).value[0].id, id); assert.equal((await api('classificationPhoto', id)).value.rating, 1);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(moved)).digest('hex'), originalHash);
  // Actual screenshots and reachability at the supported minimum size.
  win.showInactive(); win.setSize(760, 540); await delay(100);
  for (const [locale] of locales) {
    await choose(locale);
    await js('document.querySelector(".editing").scrollTop=0'); await delay(150);
    assert.equal(await js('document.documentElement.scrollWidth<=window.innerWidth'), true);
    fs.writeFileSync(path.join(run, 'editor-min-'+locale+'.png'), (await win.webContents.capturePage()).toPNG());
    await js('document.querySelector(".white-balance button").scrollIntoView({block:"center"})');
    assert.equal(await js('(()=>{const r=document.querySelector(".white-balance button").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;})()'), true, 'WB reset reachable '+locale);
  }
  win.setSize(1180, 812); await delay(100);
  for (const [locale] of locales) { await choose(locale); await js('document.querySelector(".editing").scrollTop=0'); await delay(150); fs.writeFileSync(path.join(run, 'editor-'+locale+'.png'), (await win.webContents.capturePage()).toPNG()); }
  win.hide();
  // A visible save failure and exit choices retranslate without closing or retrying automatically.
  failSave = true; await input(exposure, 0.9);
  await until(() => js('Boolean(document.querySelector(".exposure [role=alert]"))'), 'save error');
  const failedSaveCalls = saveCount; await choose('en');
  assert.equal(saveCount, failedSaveCalls); assert.match(await js('document.querySelector(".exposure [role=alert]").textContent'), /Could not save the adjustment.*Retry saving/);
  await click('.back'); await until(() => js('Boolean(document.querySelector(".exit-failure"))'), 'exit failure');
  await choose('es'); assert.match(await js('document.querySelector(".exit-failure").textContent'), /La foto permanece abierta.*Reintentar y salir.*Permanecer.*Descartar/);
  assert.equal(await js('document.querySelector(".editing")===window.__editorNode'), true);
  await click('.exit-failure button:nth-of-type(2)');
  assert.equal(await js('Boolean(document.querySelector(".exit-failure"))'), false);
  failSave = false; await click('.exposure [role=alert] button'); await saved();
  assert.equal((await api('recipePhoto', id)).value.exposureTenths, 9);
  await click('.back'); await until(() => js('Boolean(document.querySelector(".tile")) && !document.querySelector(".viewer")'), 'clean exit');
  await click('.tile'); await until(() => js('document.querySelector(".exposure input[type=number]")?.disabled===false'), 'reopen editor');
  assert.equal(await js(`document.querySelector('${exposure}').value`), '0.9');
  failSave = true; await input(exposure, 1.8); await click('.back');
  await until(() => js('Boolean(document.querySelector(".exit-failure"))'), 'discard dialog');
  await choose('pt-BR'); await click('.exit-failure button:nth-of-type(3)');
  await until(() => js('Boolean(document.querySelector(".tile")) && !document.querySelector(".viewer")'), 'discard exit');
  assert.equal((await api('recipePhoto', id)).value.exposureTenths, 9);
  assert.doesNotMatch(await js('document.body.textContent'), /Never show raw/);
  failSave = false; await click('.tile'); await until(() => js('document.querySelector(".exposure input[type=number]")?.disabled===false'), 'final reopen');
  heldSave = held(); await input(exposure, 1.3); await until(() => heldSave.entered, 'save before native close');
  win.close(); await choose('en'); assert.equal(win.isDestroyed(), false);
  heldSave.release(); heldSave = null; await until(() => win.isDestroyed(), 'native close after flush');
  console.log('Editor language smoke passed: labels, native drafts, save/history flights, stale preview, branch, faults, relocation, exit, screenshots'); clearTimeout(timeout); app.exit(0);
})().catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
