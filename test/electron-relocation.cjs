// Public-interface integration of issue #4 in the real packaged Electron app.
// Only the external native-dialog adapter is replaced. Fixtures and catalogs
// are synthetic and isolated; renderer, IPC, nativeImage and SQLite are real.
const { app, BrowserWindow, dialog, nativeImage } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
if (!process.argv[2]) throw new Error('Usage: electron test/electron-relocation.cjs <isolated-run-directory> [first|reopen]');
const runDir = path.resolve(process.argv[2]), mode = process.argv[3] || 'first';
assert.ok(['first', 'reopen'].includes(mode));
const repo = path.resolve(__dirname, '..');
const archive = path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources', 'app.asar');
for (const dir of ['', 'user-data', 'session-data', 'crash-dumps', 'synthetic-photos']) fs.mkdirSync(path.join(runDir, dir), { recursive: true });
app.setPath('userData', path.join(runDir, 'user-data'));
app.setPath('sessionData', path.join(runDir, 'session-data'));
app.setPath('crashDumps', path.join(runDir, 'crash-dumps'));
const folder = path.join(runDir, 'synthetic-photos');
const files = Object.fromEntries(['original', 'occupied', 'legacy-readable', 'legacy-missing', 'legacy-moved', 'relocated'].map(name => [name, path.join(folder, name + '.jpg')]));
const sample = fs.readFileSync(path.join(repo, 'test', 'fixtures', 'sample.jpg'));
const fingerprint = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const checks = [], dialogs = [];
let selection = { canceled: true, filePaths: [] };
dialog.showOpenDialog = async (_owner, options) => { dialogs.push(options); return selection; };
dialog.showErrorBox = (title, message) => { throw new Error(`${title}: ${message}`); };
const legacyPhotos = [{ id:'420ce72c-2bb7-4e40-89ec-e3945c5b5425', name:'legacy-readable.jpg' }, { id:'16e6d303-bb64-4a09-85a5-915e883db827', name:'legacy-missing.jpg' }];
if (mode === 'first') {
  assert.equal(fs.existsSync(path.join(runDir, 'user-data', 'catalog.sqlite')), false, 'first mode requires a fresh run directory');
  for (const key of ['original','occupied','legacy-readable','legacy-missing']) fs.writeFileSync(files[key], sample);
  fs.renameSync(files['legacy-missing'], files['legacy-moved']);
  const db = new DatabaseSync(path.join(runDir, 'user-data', 'catalog.sqlite'));
  db.exec('CREATE TABLE photos (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL); CREATE TABLE thumbnails (photo_id TEXT PRIMARY KEY REFERENCES photos(id), data_url TEXT NOT NULL); PRAGMA user_version=2');
  for (const [index, key] of ['legacy-readable','legacy-missing'].entries()) {
    db.prepare('INSERT INTO photos VALUES (?, ?, ?)').run(legacyPhotos[index].id, files[key], legacyPhotos[index].name);
    db.prepare('INSERT INTO thumbnails VALUES (?, ?)').run(legacyPhotos[index].id, 'data:image/jpeg;base64,' + sample.toString('base64'));
  }
  db.close();
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(work, name) { const deadline = Date.now() + 15000; while (Date.now() < deadline) { const value = await work(); if (value) return value; await delay(30); } throw new Error('Timed out: ' + name); }
let win;
const js = expression => win.webContents.executeJavaScript(expression);
const api = (method, ...args) => js(`window.revelumo.${method}(${args.map(arg=>JSON.stringify(arg)).join(',')})`);
const tile = name => `document.querySelector(${JSON.stringify(`button[aria-label="Abrir ${name}"]`)})`;
const locate = name => `document.querySelector(${JSON.stringify(`button[aria-label="Localizar original de ${name}"]`)})`;
async function click(expression) { await until(() => js(`Boolean(${expression} && !${expression}.disabled)`), 'button ready'); await js(`${expression}.click()`); }
async function importFiles(filenames, count) {
  selection = { canceled:false, filePaths:filenames };
  await click('document.querySelector("header button")');
  await until(() => js(`!document.querySelector('header button').disabled && document.querySelectorAll('.tile').length === ${count}`), 'import rendered');
}
const timeout = setTimeout(() => { console.error('Relocation integration exceeded 60 seconds'); app.exit(1); }, 60000);
require('./hidden-electron.cjs')(path.join(archive, '.vite', 'build', 'index.cjs'));
(async () => {
  await app.whenReady();
  win = await until(() => BrowserWindow.getAllWindows().find(window=>window.webContents.getURL()==='app://revelumo/index.html'), 'packaged origin');
  await until(() => js('Boolean(window.revelumo && document.querySelector("header button") && !document.querySelector("header button").disabled)'), 'renderer ready');
  win.hide();
  assert.equal(await js('typeof window.revelumo.originalStatus'), 'function', 'restricted original status must be exposed');
  assert.equal(await js('typeof window.revelumo.relocatePhoto'), 'function', 'restricted relocation must be exposed');
  const preferences = win.webContents.getLastWebPreferences();
  assert.equal(preferences.sandbox,true); assert.equal(preferences.contextIsolation,true); assert.equal(preferences.webSecurity,true); assert.equal(preferences.nodeIntegration,false);
  assert.equal(await js('typeof require'),'undefined');
  checks.push('packaged renderer retains sandbox, context isolation and UUID-scoped bridge');
  const invalid = await api('relocatePhoto',{id:legacyPhotos[0].id,path:files.original});
  assert.equal(invalid.ok,false); assert.equal(invalid.code,'invalid-request'); assert.equal(dialogs.length,0);
  const pathStatus = await api('originalStatus',files.original); assert.equal(pathStatus.ok,false); assert.equal(pathStatus.code,'invalid-request');
  checks.push('paths and malformed renderer identity are refused before opening a dialog');
  if (mode === 'first') {
    await until(() => js(`${tile('legacy-missing.jpg')}?.textContent.includes('Original ausente')`), 'missing legacy badge with cached thumbnail');
    await click(tile('legacy-missing.jpg'));
    await until(() => js('document.querySelector(".original-notice")?.textContent.includes("nova foto")'), 'unidentified legacy explanation');
    assert.equal(await js(`Boolean(${locate('legacy-missing.jpg')})`),false);
    const blocked = await api('relocatePhoto',legacyPhotos[1].id); assert.equal(blocked.ok,false); assert.equal(blocked.code,'identity-unverified');
    assert.equal(dialogs.length,0);
    checks.push('legacy missing before migration remains cataloged with cache, explanation and no unsafe locate action');
    await click('document.querySelector(".back")');
    await importFiles([files.original,files.occupied],4);
    const photos = (await api('listPhotos')).value;
    const original = photos.find(photo=>photo.name==='original.jpg');
    const cache = await api('thumbnailPhoto',original.id);
    fs.renameSync(files.original,files.relocated);
    await js('window.dispatchEvent(new Event("focus"))');
    await until(() => js(`${tile('original.jpg')}?.textContent.includes('Original ausente')`), 'external move refreshed on focus');
    await click(tile('original.jpg'));
    await until(() => js(`Boolean(${locate('original.jpg')} && !${locate('original.jpg')}.disabled)`), 'locate action for selected original');
    win.webContents.debugger.attach('1.3');
    const ax = await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
    assert.ok(ax.nodes.some(node=>!node.ignored && node.role?.value==='button' && node.name?.value==='Localizar original de original.jpg'));
    fs.writeFileSync(path.join(runDir,'locate-accessibility.json'),JSON.stringify(ax,null,2));
    selection = { canceled:true, filePaths:[] }; await click(locate('original.jpg'));
    await until(() => js('document.querySelector("footer").textContent.includes("Localização cancelada")'), 'cancel feedback');
    assert.deepEqual((await api('listPhotos')).value,photos);
    assert.equal((await api('originalStatus',original.id)).value.state,'missing');
    const wrong = Buffer.from(sample), marker = wrong.indexOf(Buffer.from([0xff,0xdb]));
    wrong[marker+5] = wrong[marker+5] === 8 ? 9 : 8;
    const wrongDir = path.join(folder,'different'); fs.mkdirSync(wrongDir); const wrongFile = path.join(wrongDir,'original.jpg'); fs.writeFileSync(wrongFile,wrong);
    assert.equal(wrong.length,sample.length); assert.equal(nativeImage.createFromBuffer(wrong).isEmpty(),false);
    selection = { canceled:false,filePaths:[wrongFile] }; await click(locate('original.jpg'));
    await until(() => js('document.querySelector("footer").textContent.includes("diferente do original")'), 'wrong candidate feedback');
    assert.deepEqual((await api('listPhotos')).value,photos);
    assert.equal((await api('originalStatus',original.id)).value.state,'missing');
    selection = { canceled:false,filePaths:[files.occupied] }; await click(locate('original.jpg'));
    await until(() => js('document.querySelector("footer").textContent.includes("outra foto")'), 'occupied path feedback');
    assert.deepEqual((await api('listPhotos')).value,photos);
    checks.push('cancel, different native-decodable JPEG of equal name/length, and occupied path leave all records unchanged');
    selection = { canceled:false,filePaths:[files.relocated] }; await click(locate('original.jpg'));
    await until(() => js('Boolean(document.querySelector(".viewer canvas")?.dataset.revision)'), 'relocated preview decoded');
    assert.deepEqual((await api('listPhotos')).value,photos);
    assert.equal((await api('originalStatus',original.id)).value.state,'available');
    assert.deepEqual(await api('thumbnailPhoto',original.id),cache);
    assert.match(await js('document.querySelector("figcaption").textContent'),/^original\.jpg/);
    for (const options of dialogs.filter(options=>options.title==='Localizar original')) assert.deepEqual(options.properties,['openFile']);
    checks.push('single-file dialogue adapter relinks equal SHA-256 and restores actual preview without changing ID, name or cache');
    // A grid probe no longer enrolls legacy rows. Explicitly preview this one
    // accessible original before moving it to establish its content identity.
    const readable = legacyPhotos[0];
    assert.equal((await api('originalAvailability', readable.id)).value.identityRecorded, false);
    assert.equal((await api('previewPhoto', readable.id)).ok, true);
    const legacyMoved = path.join(folder,'legacy-readable-relocated.jpg'); fs.renameSync(files['legacy-readable'],legacyMoved);
    assert.equal((await api('originalStatus',readable.id)).value.canRelocate,true);
    selection = {canceled:false,filePaths:[legacyMoved]};
    const legacyResult = await api('relocatePhoto',readable.id); assert.equal(legacyResult.ok,true); assert.equal(legacyResult.value.photo.id,readable.id);
    const expected = {photos,original,cache,legacyMoved,wrongFile,integrity:Object.fromEntries([files.relocated,files.occupied,files['legacy-moved'],legacyMoved,wrongFile].map(file=>[file,fingerprint(fs.readFileSync(file))]))};
    for (const file of [files.relocated,files.occupied,files['legacy-moved'],legacyMoved]) assert.equal(fingerprint(fs.readFileSync(file)),fingerprint(sample));
    assert.equal(fingerprint(fs.readFileSync(wrongFile)),fingerprint(wrong));
    fs.writeFileSync(path.join(runDir,'expected.json'),JSON.stringify(expected,null,2));
    checks.push('accessible legacy identity enables a later move; all five synthetic JPEG files retain their bytes');
  } else {
    const expected = JSON.parse(fs.readFileSync(path.join(runDir,'expected.json'),'utf8'));
    assert.deepEqual((await api('listPhotos')).value,expected.photos);
    assert.equal((await api('originalStatus',expected.original.id)).value.state,'available');
    assert.deepEqual(await api('thumbnailPhoto',expected.original.id),expected.cache);
    const preview = await api('previewPhoto',expected.original.id); assert.equal(preview.ok,true); assert.equal(preview.value.dataUrl,'data:image/jpeg;base64,'+sample.toString('base64'));
    assert.equal((await api('previewPhoto',legacyPhotos[0].id)).ok,true);
    assert.equal((await api('originalStatus',legacyPhotos[1].id)).value.canRelocate,false);
    for (const [file,digest] of Object.entries(expected.integrity)) assert.equal(fingerprint(fs.readFileSync(file)),digest);
    checks.push('second Electron process preserves relocated references, all four IDs/names, cached thumbnail, blocked legacy and five file hashes');
  }
  const result={ok:true,mode,versions:process.versions,checks};
  fs.writeFileSync(path.join(runDir,mode+'-result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result)); clearTimeout(timeout); if(win.webContents.debugger.isAttached()) win.webContents.debugger.detach(); app.quit();
})().catch(error=>{fs.writeFileSync(path.join(runDir,mode+'-failure.txt'),error.stack||String(error));console.error(error.stack||error);clearTimeout(timeout);app.exit(1);});
