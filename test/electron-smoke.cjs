// Integration test runner, invoked with the official Electron executable.
// Exercises the packaged app, not a test renderer. The native file dialog is
// stubbed at its adapter boundary; no user catalog or photographs are read.
const { app, BrowserWindow, dialog } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

if (!process.argv[2]) throw new Error('Usage: npm run test:electron -- <isolated-run-directory> [first|reopen]');
const runDir = path.resolve(process.argv[2]);
const mode = process.argv[3] || 'first';
if (!['first', 'reopen'].includes(mode)) throw new Error('Mode must be first or reopen');
const repo = path.resolve(__dirname, '..');
const archive = path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources', 'app.asar');
fs.mkdirSync(runDir, { recursive: true });
app.setPath('userData', path.join(runDir, 'user-data'));
app.setPath('sessionData', path.join(runDir, 'session-data'));
app.setPath('crashDumps', path.join(runDir, 'crash-dumps'));
for (const dir of ['user-data', 'session-data', 'crash-dumps']) fs.mkdirSync(path.join(runDir, dir), { recursive: true });
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const log = [];
const check = (name, work) => { work(); log.push(name); };
let selection = { canceled: true, filePaths: [] };
dialog.showOpenDialog = async () => selection;
dialog.showErrorBox = (title, message) => { throw new Error(`${title}: ${message}`); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(work, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { const value = await work(); if (value) return value; await delay(30); }
  throw new Error(`Timed out waiting for ${label}`);
}
let win;
async function js(expression) { return win.webContents.executeJavaScript(expression); }

const timeout = setTimeout(() => { console.error('Electron smoke exceeded 60 seconds'); app.exit(1); }, 60000);
app.on('browser-window-created', (_, window) => { window.on('ready-to-show', () => window.hide()); });
require('./hidden-electron.cjs')(path.join(archive, '.vite', 'build', 'index.cjs'));
(async () => {
  await app.whenReady();
  win = await until(() => BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === 'app://revelumo/index.html'), 'packaged window');
  await until(() => js('Boolean(window.revelumo && document.querySelector("header button") && !document.querySelector("header button").disabled)'), 'renderer ready');
  win.hide();
  const preferences = win.webContents.getLastWebPreferences();
  check('renderer isolation and sandbox remain enabled', () => {
    assert.equal(preferences.contextIsolation, true); assert.equal(preferences.nodeIntegration, false);
    assert.equal(preferences.sandbox, true); assert.equal(preferences.webSecurity, true);
  });
  check('packaged origin and limited bridge', () => assert.equal(win.webContents.getURL(), 'app://revelumo/index.html'));
  const exposed = await js('({keys:Object.keys(window.revelumo).sort(),node:typeof require})');
  check('renderer exposes only approved bridge operations', () => {
    assert.deepEqual(exposed.keys, ['importJpeg','importProgress','listPhotos','queryPhotos','previewPhoto','thumbnailPhoto','originalAvailability','originalStatus','relocatePhoto','classificationPhoto','classifyPhoto','recipePhoto','beginEditingPhoto','saveExposure','saveAdjustments','moveExposureHistory','endEditingPhoto','onCloseRequested','confirmClose'].sort());
    assert.equal(exposed.node, 'undefined');
  });
  const listed = await js('window.revelumo.listPhotos()'); assert.equal(listed.ok, true);
  if (mode === 'first') {
    assert.deepEqual(listed.value, [], 'first mode must use a fresh isolated run directory');
    const photosDir = path.join(runDir, 'synthetic-photos'); fs.mkdirSync(photosDir);
    const files = Array.from({ length: 50 }, (_, i) => path.join(photosDir, `synthetic-${String(i).padStart(2, '0')}.jpg`));
    for (const file of files) fs.copyFileSync(path.join(repo, 'test','fixtures','sample.jpg'), file);
    const bad = path.join(photosDir, 'invalid.jpg'); fs.writeFileSync(bad, 'synthetic invalid JPEG');
    const oriented = path.join(photosDir, 'orientation-6.jpg'); fs.copyFileSync(path.join(repo,'test','fixtures','qa-orientation-6.jpg'), oriented);
    const before = Object.fromEntries([...files, bad, oriented].map(file => [file, hash(file)]));
    selection = { canceled: false, filePaths: [...files, bad, oriented] };
    await js('document.querySelector("header button").click()');
    await until(() => js('!document.querySelector("header button").disabled && document.querySelectorAll(".tile").length === 48'), 'batch and first page');
    assert.equal((await js('window.revelumo.listPhotos()')).value.length, 51);
    assert.match(await js('document.querySelector(".failures").textContent'), /invalid.jpg/);
    log.push('mixed batch has 51 photos and one per-file failure');
    await until(() => js('document.querySelectorAll(".thumbnail img").length === 48 && Array.from(document.querySelectorAll(".thumbnail img")).every(img => img.complete && img.naturalWidth > 0)'), 'native thumbnails decoded');
    win.webContents.debugger.attach('1.3');
    const ax = await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
    fs.writeFileSync(path.join(runDir, 'accessibility.json'), JSON.stringify(ax, null, 2));
    check('all photo tiles have native button role and accessible names', () => {
      for (let i = 0; i < 48; i++) {
        const name = `Abrir ${path.basename(files[i])}`;
        const matching = ax.nodes.filter(node => !node.ignored && node.name?.value === name);
        assert.ok(matching.some(node => node.role?.value === 'button'), `${name} must be exposed as a button; observed ${matching.map(node => node.role?.value)}`);
      }
    });
    const dom = await js('Array.from(document.querySelectorAll(".tile"),button=>({tag:button.tagName,role:button.getAttribute("role"),tab:button.tabIndex,parent:button.parentElement.getAttribute("role")}))');
    check('each keyboard-focusable button is wrapped in a list item', () => {
      assert.equal(dom.length,48); for (const tile of dom) { assert.equal(tile.tag,'BUTTON'); assert.equal(tile.role,null); assert.equal(tile.tab,0); assert.equal(tile.parent,'listitem'); }
    });
    await js('document.querySelector(".tile").focus()');
    // Dispatch through Chromium so this hidden integration runner does not
    // depend on taking OS foreground focus from the user.
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13, text:'\r'});
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13});
    await until(() => js('Boolean(document.querySelector(".viewer canvas")?.dataset.revision)'), 'keyboard preview');
    log.push('Enter activates a focused tile and opens the actual JPEG preview');
    await until(() => js('Boolean(document.querySelector(".viewer canvas")?.dataset.revision)'), 'preview image decoded');
    const image = await js('({loaded:Boolean(document.querySelector(".viewer canvas").dataset.revision),width:document.querySelector(".viewer canvas").width})');
    assert.equal(image.loaded,true); assert.ok(image.width > 0);
    await js('document.querySelector(".back").click()');
    await until(() => js('Boolean(document.querySelector(".pagination"))'), 'grid return');
    await js('document.querySelector(".pagination button:last-child").click()');
    await until(() => js('document.querySelectorAll(".tile").length === 3 && document.querySelectorAll(".thumbnail img").length === 3 && Array.from(document.querySelectorAll(".thumbnail img")).every(img => img.complete && img.naturalWidth > 0)'), 'page two decoded');
    log.push('pagination displays remaining three photos and thumbnails');
    selection = { canceled:true, filePaths:[] };
    const canceled = await js('window.revelumo.importJpeg()'); assert.deepEqual(canceled, {ok:true,value:{canceled:true}});
    selection = { canceled:false, filePaths:[files[0]] };
    const duplicate = await js('window.revelumo.importJpeg()'); assert.equal(duplicate.ok,true);
    const saved = (await js('window.revelumo.listPhotos()')).value;
    assert.equal(saved.length,51); assert.equal(duplicate.value.items[0].result.value.id,saved[0].id);
    log.push('cancel and reimport preserve catalog identity without duplicates');
    for (const [file, digest] of Object.entries(before)) assert.equal(hash(file),digest);
    fs.writeFileSync(path.join(runDir,'expected.json'),JSON.stringify({photos:saved,before},null,2));
    log.push('all 52 synthetic originals retain SHA-256 and location');
  } else {
    const expected = JSON.parse(fs.readFileSync(path.join(runDir,'expected.json'),'utf8'));
    assert.deepEqual(listed.value,expected.photos);
    const first = listed.value[0];
    const preview = await js(`window.revelumo.previewPhoto(${JSON.stringify(first.id)})`); assert.equal(preview.ok,true);
    const firstFile = path.join(runDir,'synthetic-photos',first.name);
    const displacedFile = firstFile + '.temporarily-moved';
    assert.equal(fs.existsSync(displacedFile),false);
    // The runner moves only its own synthetic fixture. App code never moves
    // any original. Restore it even when an assertion fails.
    fs.renameSync(firstFile,displacedFile);
    try {
      const thumb = await js(`window.revelumo.thumbnailPhoto(${JSON.stringify(first.id)})`); assert.equal(thumb.ok,true);
      const unavailable = await js(`window.revelumo.previewPhoto(${JSON.stringify(first.id)})`);
      assert.equal(unavailable.ok,false); assert.equal(unavailable.code,'unreadable');
      assert.deepEqual((await js('window.revelumo.listPhotos()')).value,expected.photos);
    } finally { fs.renameSync(displacedFile,firstFile); }
    const oriented = listed.value.find(photo => photo.name === 'orientation-6.jpg');
    const orientedPreview = await js(`window.revelumo.previewPhoto(${JSON.stringify(oriented.id)})`); assert.equal(orientedPreview.ok,true);
    const original = fs.readFileSync(path.join(runDir,'synthetic-photos','orientation-6.jpg'));
    assert.equal(orientedPreview.value.dataUrl, 'data:image/jpeg;base64,' + original.toString('base64'));
    for (const [file,digest] of Object.entries(expected.before)) assert.equal(hash(file),digest);
    log.push('new Electron process reopens all 51 IDs, cached thumbnail and JPEG preview');
    log.push('cached thumbnail survives an unavailable synthetic original; preview reports unreadable and catalog is unchanged');
    log.push('native decoder accepts EXIF6 fixture and preview retains all original JPEG bytes');
  }
  const result = {ok:true,mode,versions:process.versions,checks:log};
  fs.writeFileSync(path.join(runDir,`${mode}-result.json`),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result)); clearTimeout(timeout); win.webContents.debugger.isAttached() && win.webContents.debugger.detach(); app.quit();
})().catch(error => {
  fs.writeFileSync(path.join(runDir,`${mode}-failure.txt`),error.stack || String(error));
  console.error(error.stack || error); clearTimeout(timeout); app.exit(1);
});
