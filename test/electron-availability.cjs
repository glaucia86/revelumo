// Observe actual filesystem, hashing and native decoding at system boundaries.
// App code, IPC, renderer and SQLite remain real; only dialogs supply fixtures.
const { app, BrowserWindow, dialog, nativeImage } = require('electron');
// Pin the OS adapter for legacy Portuguese UI assertions; language tests cover detection.
app.getPreferredSystemLanguages = () => ['pt-BR'];
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { syncBuiltinESMExports } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
if (!process.argv[2]) throw new Error('Usage: electron test/electron-availability.cjs <fresh-isolated-directory>');
const runDir = path.resolve(process.argv[2]);
assert.equal(fs.existsSync(runDir), false, 'requires a fresh isolated directory');
for (const dir of ['user-data', 'session-data', 'crash-dumps', 'synthetic-photos']) fs.mkdirSync(path.join(runDir, dir), { recursive: true });
app.setPath('userData', path.join(runDir, 'user-data'));
app.setPath('sessionData', path.join(runDir, 'session-data'));
app.setPath('crashDumps', path.join(runDir, 'crash-dumps'));
const repo = path.resolve(__dirname, '..'), folder = path.join(runDir, 'synthetic-photos');
const sample = fs.readFileSync(path.join(repo, 'test', 'fixtures', 'sample.jpg'));
const photos = Array.from({ length: 49 }, (_, i) => ({ id: crypto.randomUUID(), name: `legacy-${i}.jpg` }));
const files = photos.map(photo => path.join(folder, photo.name));
const db = new DatabaseSync(path.join(runDir, 'user-data', 'catalog.sqlite'));
db.exec('CREATE TABLE photos (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL); CREATE TABLE thumbnails (photo_id TEXT PRIMARY KEY REFERENCES photos(id), data_url TEXT NOT NULL); PRAGMA user_version=2');
for (const [i, photo] of photos.entries()) {
  fs.writeFileSync(files[i], sample);
  db.prepare('INSERT INTO photos VALUES (?, ?, ?)').run(photo.id, files[i], photo.name);
  db.prepare('INSERT INTO thumbnails VALUES (?, ?)').run(photo.id, 'data:image/jpeg;base64,' + sample.toString('base64'));
}
db.close();
let io = { opens: 0, reads: 0, bytes: 0, hashes: 0, decodes: 0 };
const snapshots = [];
const realOpen = fsp.open;
fsp.open = async (...args) => {
  const handle = await realOpen(...args);
  if (typeof args[0] === 'string' && args[0].startsWith(folder + path.sep)) {
    io.opens++;
    const realRead = handle.read.bind(handle), realReadFile = handle.readFile.bind(handle);
    handle.read = async (...params) => { io.reads++; const result = await realRead(...params); io.bytes += result.bytesRead; return result; };
    handle.readFile = async (...params) => { io.reads++; const result = await realReadFile(...params); io.bytes += Buffer.byteLength(result); return result; };
  }
  return handle;
};
const realHash = crypto.createHash;
crypto.createHash = (...args) => {
  const hash = realHash(...args), realUpdate = hash.update.bind(hash);
  hash.update = (...params) => { if (Buffer.isBuffer(params[0])) io.hashes++; return realUpdate(...params); };
  return hash;
};
const realDecode = nativeImage.createFromBuffer;
nativeImage.createFromBuffer = (...args) => { io.decodes++; return realDecode(...args); };
syncBuiltinESMExports();
dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
dialog.showErrorBox = (title, message) => { throw new Error(`${title}: ${message}`); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(work, label) { const end = Date.now() + 15000; while (Date.now() < end) { if (await work()) return; await delay(25); } throw new Error('Timed out: ' + label); }
let win;
const js = expression => win.webContents.executeJavaScript(expression);
const api = (name, id) => js(`window.revelumo.${name}(${JSON.stringify(id)})`);
const reset = () => { io = { opens: 0, reads: 0, bytes: 0, hashes: 0, decodes: 0 }; };
async function grid(count, probes) {
  await until(() => js(`document.querySelectorAll('.thumbnail img').length === ${count} && Array.from(document.querySelectorAll('.thumbnail img')).every(img => img.complete && img.naturalWidth > 0)`), 'cached grid decoded');
  await until(() => io.opens >= probes, 'page probes completed');
}
function assertLight(label) {
  snapshots.push({ label, ...io });
  assert.equal(io.reads, 0, `${label}: grid must not read JPEG contents`);
  assert.equal(io.bytes, 0, `${label}: zero original bytes`);
  assert.equal(io.hashes, 0, `${label}: grid must not hash original contents`);
  assert.equal(io.decodes, 0, `${label}: cached grid must not decode originals in main`);
}
const timeout = setTimeout(() => app.exit(1), 60000);
require('./hidden-electron.cjs')(path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources', 'app.asar', '.vite', 'build', 'index.cjs'));
(async () => {
  await app.whenReady();
  await until(() => { win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'app://revelumo/index.html'); return Boolean(win); }, 'packaged origin');
  win.hide();
  await grid(48, 48); assertLight('initial 48 cached legacy tiles');
  reset(); await js("document.querySelector('.pagination button:last-child').click()");
  await grid(1, 1); assertLight('next page');
  reset(); await js("window.dispatchEvent(new Event('focus'))");
  await grid(1, 1); assertLight('focus refresh');
  reset(); await js("Array.from(document.querySelectorAll('aside button')).find(b=>b.textContent==='Verificar disponibilidade').click()");
  await grid(1, 1); assertLight('manual refresh');
  const probe = await api('originalAvailability', photos[0].id);
  assert.equal(probe.ok, true); assert.equal(probe.value.state, 'present');
  assert.equal(probe.value.contentVerified, false); assert.equal(probe.value.identityRecorded, false);
  assert.equal('path' in probe.value, false); assert.equal('sha256' in probe.value, false);
  // Merely navigating the grid must not enroll legacy records.
  fs.renameSync(files[0], files[0] + '.moved');
  const blocked = await api('relocatePhoto', photos[0].id);
  assert.equal(blocked.ok, false); assert.equal(blocked.code, 'identity-unverified');
  fs.renameSync(files[0] + '.moved', files[0]);
  // Selection establishes a legacy baseline; protection remains content-based.
  reset();
  const legacyPreview = await api('previewPhoto', photos[0].id); assert.equal(legacyPreview.ok, true);
  const receipt = legacyPreview.value.reservation; legacyPreview.value.bytes = null; await api('releasePreview', receipt);
  assert.ok(io.reads > 0 && io.bytes > 0 && io.hashes > 0 && io.decodes > 0, 'observers must detect protected operation');
  snapshots.push({ label: 'explicit preview enrolls one legacy original', ...io });
  const wrong = Buffer.from(sample), marker = wrong.indexOf(Buffer.from([0xff, 0xdb]));
  wrong[marker + 5] = wrong[marker + 5] === 8 ? 9 : 8;
  const times = fs.statSync(files[0]); fs.writeFileSync(files[0], wrong); fs.utimesSync(files[0], times.atime, times.mtime);
  const replacement = await api('originalAvailability', photos[0].id);
  assert.equal(replacement.value.state, 'present'); assert.equal(replacement.value.contentVerified, false); assert.equal(replacement.value.identityRecorded, true);
  const preview = await api('previewPhoto', photos[0].id); assert.equal(preview.ok, false); assert.equal(preview.code, 'identity-mismatch');
  const selected = await api('originalStatus', photos[0].id); assert.equal(selected.value.state, 'changed'); assert.equal(selected.value.canRelocate, true);
  fs.writeFileSync(files[0], sample);
  assert.deepEqual((await api('listPhotos')).value, photos);
  for (const file of files) assert.deepEqual(fs.readFileSync(file), sample);
  const result = { ok: true, versions: process.versions, snapshots, checks: ['grid page/focus/manual refresh do not read/hash/decode cached originals', 'probe reports presence without integrity or automatic legacy enrollment', 'same-name/size/mtime replacement is refused by preview and detected by selected status', 'all 49 synthetic JPEG files and catalog summaries preserved'] };
  fs.writeFileSync(path.join(runDir, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  clearTimeout(timeout); app.quit();
})().catch(error => { fs.writeFileSync(path.join(runDir, 'failure.txt'), error.stack || String(error)); console.error(error.stack || error); clearTimeout(timeout); app.exit(1); });
