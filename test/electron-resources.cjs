// Bounded measurement harness, not a performance gate or installer estimate.
const { app, BrowserWindow, dialog, nativeImage } = require('electron');
const fs = require('node:fs');
const disk = require('original-fs'); // Bypass Electron's virtual .asar directory stats.
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
if (!process.argv[2]) throw new Error('Usage: electron test/electron-resources.cjs <isolated-directory> prepare|measure');
const dir = path.resolve(process.argv[2]), mode = process.argv[3];
assert.ok(['prepare', 'measure'].includes(mode));
const repo = path.resolve(__dirname, '..'), folder = path.join(dir, 'synthetic-photos');
const packageDir = path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`);
const files = Array.from({ length: 48 }, (_, i) => path.join(folder, `large-${i}.jpg`));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
if (mode === 'prepare') {
  assert.equal(fs.existsSync(dir), false, 'prepare requires a fresh directory');
  fs.mkdirSync(folder, { recursive: true });
  app.whenReady().then(() => {
    const width = 4000, height = 3000, bitmap = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      bitmap[i] = x % 256; bitmap[i + 1] = y % 256; bitmap[i + 2] = (x + y) % 256; bitmap[i + 3] = 255;
    }
    const jpeg = nativeImage.createFromBitmap(bitmap, { width, height }).toJPEG(85);
    for (const file of files) fs.writeFileSync(file, jpeg);
    fs.writeFileSync(path.join(dir, 'fixture.json'), JSON.stringify({ width, height, copies: files.length, jpegBytes: jpeg.length, sha256: crypto.createHash('sha256').update(jpeg).digest('hex') }));
    console.log('Prepared 48 synthetic 12 MP JPEG copies in a separate process'); app.quit();
  }).catch(error => { console.error(error); app.exit(1); });
} else {
  assert.equal(fs.existsSync(path.join(dir, 'user-data', 'catalog.sqlite')), false, 'measure requires no existing catalog');
  for (const name of ['user-data', 'session-data', 'crash-dumps']) fs.mkdirSync(path.join(dir, name), { recursive: true });
  app.setPath('userData', path.join(dir, 'user-data'));
  app.setPath('sessionData', path.join(dir, 'session-data'));
  app.setPath('crashDumps', path.join(dir, 'crash-dumps'));
  let selection = { canceled: true, filePaths: [] }, win;
  dialog.showOpenDialog = async () => selection;
  dialog.showErrorBox = (title, message) => { throw new Error(`${title}: ${message}`); };
  const js = code => win.webContents.executeJavaScript(code);
  async function until(work, label) { const end = Date.now() + 30000; while (Date.now() < end) { if (await work()) return; await delay(50); } throw new Error('Timed out: ' + label); }
  const samples = [];
  function sample(stage) {
    samples.push({ stage, elapsedMs: Math.round(performance.now()), processes: app.getAppMetrics().map(({ pid, type, memory }) => ({ pid, type, ...memory })) });
  }
  async function stable(stage) { for (let i = 0; i < 3; i++) { sample(stage); await delay(250); } }
  function treeSize(root) {
    let bytes = 0, count = 0;
    for (const item of disk.readdirSync(root, { withFileTypes: true })) {
      const file = path.join(root, item.name);
      if (item.isDirectory()) { const nested = treeSize(file); bytes += nested.bytes; count += nested.files; }
      else { bytes += disk.statSync(file).size; count++; }
    }
    return { bytes, files: count };
  }
  const timeout = setTimeout(() => app.exit(1), 120000);
  require(path.join(packageDir, 'resources', 'app.asar', '.vite', 'build', 'index.cjs'));
  (async () => {
    await app.whenReady();
    await until(() => { win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'app://revelumo/index.html'); return Boolean(win); }, 'packaged window');
    win.hide();
    await until(() => js('Boolean(document.querySelector("header button") && !document.querySelector("header button").disabled)'), 'empty renderer');
    await stable('empty');
    selection = { canceled: false, filePaths: files };
    await js('document.querySelector("header button").click()');
    await until(() => js('document.querySelector("header button").disabled'), 'batch start');
    while (await js('document.querySelector("header button").disabled')) { sample('batch-48'); await delay(100); }
    await until(() => js('document.querySelectorAll(".thumbnail img").length===48 && Array.from(document.querySelectorAll(".thumbnail img")).every(i=>i.complete && i.naturalWidth>0)'), '48 cached thumbnails');
    await stable('grid-48');
    await js('document.querySelector(".tile").click()');
    await until(() => js('Boolean(document.querySelector(".viewer img")?.complete && document.querySelector(".viewer img").naturalWidth===4000)'), '12 MP preview');
    await stable('preview-12mp');
    await js('document.querySelector(".back").click()');
    await until(() => js('Boolean(document.querySelector(".grid") && !document.querySelector(".viewer img"))'), 'preview closed');
    await stable('after-preview-close');
    await delay(5000); await stable('after-preview-close-5s');
    const fixture = JSON.parse(fs.readFileSync(path.join(dir, 'fixture.json'), 'utf8'));
    for (const file of files) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), fixture.sha256);
    const preferences = win.webContents.getLastWebPreferences();
    assert.equal(preferences.sandbox, true); assert.equal(preferences.contextIsolation, true); assert.equal(preferences.webSecurity, true);
    const result = { ok: true, measuredAtUtc: new Date().toISOString(), versions: process.versions,
      hardware: { platform: os.platform(), release: os.release(), arch: os.arch(), cpuModel: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem() },
      package: { ...treeSize(packageDir), appAsarBytes: disk.statSync(path.join(packageDir, 'resources', 'app.asar')).size, executableBytes: disk.statSync(path.join(packageDir, 'Revelumo.exe')).size },
      fixture, method: 'app.getAppMetrics MemoryInfo in KB per process; 3 steady samples/250ms, batch samples/100ms; hidden packaged renderer; preparation in separate process; no forced GC; no sum of working sets as unique memory', samples };
    fs.writeFileSync(path.join(dir, 'resources-result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ ok: true, package: result.package, samples: samples.length, stages: [...new Set(samples.map(s => s.stage))] }));
    clearTimeout(timeout); app.quit();
  })().catch(error => { fs.writeFileSync(path.join(dir, 'resources-failure.txt'), error.stack || String(error)); console.error(error); clearTimeout(timeout); app.exit(1); });
}
