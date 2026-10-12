// Real packaged editor/main/circuit. Native dialogs and external IPC/FS fault timing are adapted.
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const run = path.resolve(process.argv[2]), repo = path.resolve(__dirname, '..');
for (const name of ['userData', 'sessionData', 'crashDumps']) { const dir = path.join(run, name); fs.mkdirSync(dir, { recursive: true }); app.setPath(name, dir); }
app.getPreferredSystemLanguages = () => ['en-US'];
const source = path.join(run, 'source.jpg'), output = path.join(run, 'published.jpg');
fs.copyFileSync(path.join(repo, 'test/fixtures/export/circuit-source.jpg'), source, fs.constants.COPYFILE_EXCL);
const originalIdentity = fs.statSync(source, { bigint: true });
const originalHash = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
let nextDestination = output, heldDialog = null, heldLink = null;
const fsPromises = require('node:fs/promises'), nativeLink = fsPromises.link;
fsPromises.link = async (...args) => { await nativeLink(...args); if (heldLink) { heldLink.entered = true; await heldLink.promise; } };
let failStatusOnce = false, failStartOnce = false, failBeforeStartOnce = false, failSave = false, failCancelOnce = false;
let dialogCount = 0, saveEntered = false, releaseSave;
const saveBarrier = new Promise(resolve => { releaseSave = resolve; });
const register = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => register(channel, async (event, request) => {
  if (channel === 'revelumo:export' && request?.op === 'start' && failBeforeStartOnce) { failBeforeStartOnce = false; throw new Error('Synthetic unaccepted start'); }
  if (channel === 'revelumo:export' && request?.op === 'status' && failStatusOnce) { failStatusOnce = false; throw new Error('Synthetic status transport failure'); }
  if (request?.op === 'adjustments' && failSave) return { ok: false, code: 'catalog-error', message: 'Synthetic private save fault', descriptor: { key: 'errors.saveAdjustment' } };
  if (channel === 'revelumo:export' && request?.op === 'cancel' && failCancelOnce) { failCancelOnce = false; throw new Error('Synthetic cancel transport failure'); }
  const result = await listener(event, request);
  if (channel === 'revelumo:export' && request?.op === 'start' && failStartOnce) { failStartOnce = false; throw new Error('Synthetic lost start acknowledgement'); }
  if (request?.op === 'adjustments') { saveEntered = true; await saveBarrier; }
  return result;
});
dialog.showSaveDialog = async () => { dialogCount++; if (heldDialog) await heldDialog.promise; return { canceled: false, filePath: nextDestination }; };
require('./hidden-electron.cjs')(path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources', 'app.asar', '.vite', 'build', 'index.cjs'));
let win;
app.on('before-quit', event => { if (win?.isDestroyed()) event.preventDefault(); });
const js = code => win.webContents.executeJavaScript(code), delay = ms => new Promise(r => setTimeout(r, ms));
async function until(work, label) { const end = Date.now() + 15000; while (Date.now() < end) { const value = await work(); if (value) return value; await delay(25); } throw new Error('Timed out: ' + label); }
async function key(key, code, windowsVirtualKeyCode) { for (const type of ['rawKeyDown','keyUp']) await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: type === 'rawKeyDown' && key === 'Enter' ? 'keyDown' : type, key, code, windowsVirtualKeyCode, ...(type === 'rawKeyDown' && key === 'Enter' ? { text: '\r' } : {}) }); }
async function choose(locale) {
  await js(`(()=>{const e=document.getElementById('language-choice');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(locale)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(() => js(`document.documentElement.lang===${JSON.stringify(locale)} && !document.getElementById('language-choice').disabled`), 'language '+locale);
}
async function capture(name) {
  assert.deepEqual(await js('[innerWidth,innerHeight]'), [760,540]);
  assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'), true, 'no horizontal document overflow');
  await delay(80); fs.writeFileSync(path.join(run, name+'.png'), (await win.webContents.capturePage()).toPNG());
}
async function click(selector) { await js(`document.querySelector(${JSON.stringify(selector)}).click()`); }
function catalogHash() {
  const { DatabaseSync } = require('node:sqlite'), db = new DatabaseSync(path.join(run, 'userData', 'catalog.sqlite'));
  try { return crypto.createHash('sha256').update(JSON.stringify(['photos','recipes','exposure_history','thumbnails'].map(table => db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()))).digest('hex'); }
  finally { db.close(); }
}
const timer = setTimeout(() => { console.error('UI export timeout'); app.exit(1); }, 120000);
(async () => {
  await app.whenReady(); win = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'app://revelumo/index.html'), 'window');
  await until(() => js('document.querySelector(".catalog-import")?.disabled===false'), 'catalog ready');
  win.webContents.debugger.attach('1.3'); await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  await click('.catalog-import'); await until(() => js('Boolean(document.querySelector(".tile"))'), 'import'); await click('.tile');
  await until(() => js('document.querySelector(".exposure input[type=number]")?.disabled===false'), 'editor');
  assert.equal(await js('Boolean(document.querySelector(".export-jpeg"))'), true, 'visible editor export action');
  await js(`(()=>{for(const [selector,value] of [['.exposure input[type=number]','-1'],['.balance-control:first-of-type input[type=number]','100'],['.balance-control:nth-of-type(2) input[type=number]','100']]){const e=document.querySelector(selector);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  failSave = true; await click('.export-jpeg');
  await until(() => js('document.querySelector(".export-controls [role=alert]")?.textContent.includes("Confirm or retry")'), 'save failure blocks export');
  assert.equal(dialogCount, 0); assert.equal(fs.existsSync(output), false);
  await until(() => js('document.querySelector(".export-jpeg")?.disabled===false'), 'save failure unlock'); failSave = false;
  await click('.exposure button[aria-pressed]');
  await click('.export-jpeg');
  assert.equal(await js('document.querySelector(".exposure button[aria-pressed]").getAttribute("aria-pressed")'), 'false', 'export exits temporary comparison');
  await until(() => saveEntered, 'save barrier entered');
  assert.equal(dialogCount, 0, 'destination must wait for the visible revision acknowledgement');
  releaseSave();
  await until(() => fs.existsSync(output), 'published JPEG');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'), originalHash);
  await until(() => js('document.querySelector(".export-jpeg")?.disabled===false'), 'export unlocked');
  assert.equal(await js('document.querySelector(".export-receipt")?.textContent.includes("published.jpg")'), true, 'committed result is visible above the editor');
  let confirmedCatalogHash = catalogHash();
  win.showInactive(); await delay(100); win.unmaximize(); win.setContentSize(760, 540);
  await until(() => js('innerWidth===760 && innerHeight===540'), '760x540 viewport');
  assert.deepEqual(await js('[innerWidth,innerHeight]'), [760,540]);
  for (const locale of ['en','pt-BR','es']) { await choose(locale); await capture('export-'+locale+'-760'); }
  await choose('en');
  let releaseDialog; heldDialog = { promise: new Promise(resolve => { releaseDialog = resolve; }) };
  nextDestination = path.join(run, 'canceled.jpg');
  await click('.export-jpeg'); await until(() => dialogCount === 2, 'held destination');
  assert.equal(await js('Boolean(document.querySelector(".export-cancel"))'), true, 'cancel is available during destination choice');
  for (const locale of ['en','pt-BR','es']) { await choose(locale); await capture('choosing-'+locale+'-760'); }
  await choose('en');
  await js('document.getElementById("language-choice").focus()');
  for (let i=0; i<35 && !await js('document.activeElement?.classList.contains("export-cancel")'); i++) await key('Tab','Tab',9);
  assert.equal(await js('document.activeElement?.classList.contains("export-cancel") && document.activeElement.matches(":focus-visible")'), true, 'cancel reachable with visible keyboard focus');
  assert.equal(await js('(()=>{const r=document.activeElement.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})()'), true);
  await capture('cancel-keyboard-en-760'); await key('Enter','Enter',13); releaseDialog(); heldDialog = null;
  await until(() => js('document.querySelector(".export-controls [role=status]")?.textContent.includes("canceled")'), 'canceled outcome');
  assert.equal(fs.existsSync(nextDestination), false);
  await until(() => js('document.querySelector(".export-jpeg")?.disabled===false'), 'cancel unlocked');
  nextDestination = path.join(run, 'ack-recovered.jpg'); failStartOnce = true;
  await click('.export-jpeg'); await until(() => fs.existsSync(nextDestination), 'publication after lost acknowledgement');
  await until(() => js('document.querySelector(".export-jpeg")?.disabled===false'), 'ack recovery settled');
  assert.equal(await js('document.querySelector(".export-receipt")?.textContent.includes("ack-recovered.jpg")'), true, 'lost start acknowledgement recovers the main-owned job');
  nextDestination = path.join(run, 'unaccepted.jpg'); failBeforeStartOnce = true;
  await click('.export-jpeg');
  await until(() => js('document.querySelector(".export-controls [role=alert]")?.textContent.includes("could not be confirmed")'), 'unaccepted attempt stays uncertain');
  assert.equal(fs.existsSync(nextDestination), false);
  assert.equal(await js('document.querySelector(".export-receipt")?.textContent.includes("ack-recovered.jpg")'), false, 'new attempt never reuses an older success');
  const outputHash = crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');
  nextDestination = output; await click('.export-jpeg');
  await until(() => js('document.querySelector(".export-controls [role=alert]")?.textContent.includes("already exists")'), 'existing destination error');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'), outputHash);
  for (const locale of ['en','pt-BR','es']) { await choose(locale); await capture('collision-'+locale+'-760'); }
  await choose('en');
  heldDialog = { promise: new Promise(resolve => { releaseDialog = resolve; }) };
  nextDestination = path.join(run, 'navigation-canceled.jpg');
  await click('.export-jpeg'); await until(() => dialogCount === 5, 'navigation destination');
  await click('.back'); await delay(100);
  assert.equal(await js('Boolean(document.querySelector(".editing"))'), true, 'navigation must join active export');
  releaseDialog(); heldDialog = null;
  await until(() => js('Boolean(document.querySelector(".tile")) && !document.querySelector(".editing")'), 'navigation after cancellation');
  assert.equal(fs.existsSync(nextDestination), false);
  await click('.tile'); await until(() => js('document.querySelector(".export-jpeg")?.disabled===false'), 'reopened editor');
  let releaseLink; heldLink = { entered: false, promise: new Promise(resolve => { releaseLink = resolve; }) };
  nextDestination = path.join(run, 'close-committed.jpg');
  await click('.export-jpeg'); await until(() => heldLink.entered, 'publication submitted');
  failStatusOnce = true;
  await until(() => js('document.querySelector(".export-controls [role=alert]")?.textContent.includes("could not be confirmed")'), 'uncertain status outcome');
  assert.equal(catalogHash(), confirmedCatalogHash, 'exports before the next deliberate edit leave catalog unchanged');
  await js(`(()=>{const e=document.querySelector('.balance-control:first-of-type input[type=number]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'99');e.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.export-jpeg').click();})()`);
  await until(() => { const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(path.join(run,'userData','catalog.sqlite')); try { return db.prepare('SELECT temperature FROM recipes').all().some(row => row.temperature === 99); } finally { db.close(); } }, 'new adjustment autosaves while checking existing export');
  confirmedCatalogHash = catalogHash();
  await click('.back'); await delay(75);
  assert.equal(await js('Boolean(document.querySelector(".editing"))'), true, 'known job must be reconciled before navigation after IPC rejection');
  releaseLink(); heldLink = null; await delay(250);
  assert.equal(win.isDestroyed(), false, 'committed close-race success must be presented before exit');
  await until(() => js('Boolean(document.querySelector(".export-close-confirm"))'), 'close success confirmation');
  assert.equal(fs.existsSync(nextDestination), true);
  await click('.export-stay');
  await until(() => js('document.querySelector(".export-jpeg")?.disabled===false'), 'stay after committed export');
  heldLink = { entered: false, promise: new Promise(resolve => { releaseLink = resolve; }) };
  nextDestination = path.join(run, 'native-close-committed.jpg');
  await click('.export-jpeg'); await until(() => heldLink.entered, 'native close publication submitted');
  failCancelOnce = true; win.close(); await delay(75); assert.equal(win.isDestroyed(), false);
  releaseLink(); heldLink = null;
  await until(() => js('Boolean(document.querySelector(".export-close-confirm"))'), 'native close actual success retained');
  assert.equal(await js('document.querySelector(".export-receipt")?.textContent.includes("native-close-committed.jpg")'), true);
  assert.equal(await js('document.activeElement?.classList.contains("export-continue")'), true, 'close receipt focuses confirmation');
  await click('.export-stay');
  heldDialog = { promise: new Promise(resolve => { releaseDialog = resolve; }) };
  nextDestination = path.join(run, 'crash-canceled.jpg');
  await click('.export-jpeg'); await until(() => dialogCount === 8, 'crash destination');
  const gone = new Promise(resolve => win.webContents.once('render-process-gone', resolve));
  win.webContents.forcefullyCrashRenderer(); await gone;
  releaseDialog(); heldDialog = null; await delay(200);
  assert.equal(fs.existsSync(nextDestination), false, 'renderer loss cancels pending destination');
  win.close(); await until(() => win.isDestroyed(), 'dead renderer window closes after cleanup');
  const finalIdentity = fs.statSync(source, { bigint: true });
  assert.equal(finalIdentity.dev, originalIdentity.dev); assert.equal(finalIdentity.ino, originalIdentity.ino);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'), originalHash);
  assert.equal(catalogHash(), confirmedCatalogHash, 'export never changes the confirmed catalog or history');
  fs.writeFileSync(path.join(run, 'result.json'), JSON.stringify({ passed: true, viewport: [760,540], sourceSha256: originalHash, originalIdentityPreserved: true,
    catalogContentSha256: confirmedCatalogHash, catalogUnchangedAfterConfirmedSave: true, publishedSha256: crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),
    publishedBytes: fs.statSync(output).size, scenarios: ['save failure and retry','exact revision acknowledgement','exit comparison','dialog cancellation via keyboard','languages during active job','destination collision','accepted start acknowledgement loss','unaccepted attempt does not reuse old receipt','navigation cancellation','checking existing export preserves new adjustment autosave','status rejection then navigation joins committed result','cancel rejection then native close presents success','renderer crash cancellation and dead-renderer close'],
    screenshotFiles: fs.readdirSync(run).filter(file => file.endsWith('.png')) }, null, 2));
  console.log('PASS editor export, cancel/navigation and renderer loss'); clearTimeout(timer); app.exit(0);
})().catch(error => { console.error(error); clearTimeout(timer); app.exit(1); });
