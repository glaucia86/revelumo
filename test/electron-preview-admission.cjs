// Small, real packaged UI scenario. Hold only a completed IPC response; no
// manual preview requests, runtime quota changes, large images, or OOM probes.
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const repo = path.resolve(__dirname, '..'), run = path.resolve(process.argv[2]), mode = process.argv[3] || 'first';
assert.ok(['first', 'reopen'].includes(mode));
for (const name of ['userData', 'sessionData', 'crashDumps']) {
  const dir = path.join(run, name); fs.mkdirSync(dir, { recursive: true }); app.setPath(name, dir);
}
app.getPreferredSystemLanguages = () => ['en-US'];
const sources = ['a.jpg', 'b.jpg'].map(name => path.join(run, name));
const fixtures = ['sample.jpg', 'oriented.jpg'].map(name => fs.readFileSync(path.join(repo, 'test/fixtures', name)));
assert.deepEqual(fixtures.map(bytes => bytes.length), [633, 675]);
// Each source fits independently; the two compressed envelopes cannot coexist.
process.env.REVELUMO_PREVIEW_CAPACITY_BYTES = '1351';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (mode === 'first') {
  fixtures.forEach((bytes, i) => fs.writeFileSync(sources[i], bytes, { flag: 'wx' }));
  fs.writeFileSync(path.join(run, 'hashes.json'), JSON.stringify(fixtures.map(hash)));
}
assert.deepEqual(sources.map(file => hash(fs.readFileSync(file))), JSON.parse(fs.readFileSync(path.join(run, 'hashes.json'), 'utf8')));
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: sources });
let heldPreview = null, loseReleaseAck = false;
const sessions = [], releases = [], checks = [];
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, async (event, request) => {
  const result = await listener(event, request);
  if (request?.op === 'begin-edit' && result.ok) sessions.push({ id: request.id, sessionId: result.value.sessionId });
  if (channel === 'revelumo:preview' && request?.op === 'preview' && result.ok) {
    const held = heldPreview;
    if (held && !held.entered && request.id === held.id) {
      held.entered = true; held.reservation = result.value.reservation;
      await held.promise;
    }
  }
  if (channel === 'revelumo:preview' && request?.op === 'release') {
    releases.push({ lease: request.lease, generation: request.generation, ok: result.ok });
    if (loseReleaseAck) { loseReleaseAck = false; throw new Error('Synthetic lost release acknowledgement after main accepted it'); }
  }
  return result;
});
require('./hidden-electron.cjs')(path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources/app.asar/.vite/build/index.cjs'));
let win;
const js = code => win.webContents.executeJavaScript(code), delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const api = (method, ...args) => js(`window.revelumo.${method}(...${JSON.stringify(args)})`);
async function until(work, label) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { const value = await work(); if (value) return value; await delay(20); }
  throw new Error('Timed out: ' + label);
}
async function click(selector) { await js(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function clickText(text) { await js(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === ${JSON.stringify(text)}).click()`); }
async function catalog() {
  await click('.back');
  await until(() => js('document.querySelector("main").dataset.view === "catalog" && document.querySelectorAll(".tile").length === 2 && !document.querySelector(".back")'), 'catalog exit');
}
async function open(id) { await click(`[data-photo-id="${id}"]`); }
async function ready() { await until(() => js('Boolean(document.querySelector("canvas")?.dataset.renderRequestId && !document.querySelector(".exposure input").disabled)'), 'rendered editing preview'); }
async function language(locale) {
  await until(() => js('Boolean(document.getElementById("language-choice") && !document.getElementById("language-choice").disabled)'), 'language selector');
  await js(`(() => { const field = document.getElementById('language-choice'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(field, ${JSON.stringify(locale)}); field.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await until(() => js(`document.documentElement.lang === ${JSON.stringify(locale)} && !document.getElementById('language-choice').disabled`), 'language ' + locale);
}
async function input(selector, value) {
  await js(`(() => { const field = document.querySelector(${JSON.stringify(selector)}); field.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(String(value))}); field.dispatchEvent(new Event('input', { bubbles: true })); field.blur(); })()`);
}
async function saved(ev, temperature) {
  await until(() => js(`Number(document.querySelector('.exposure input[type=number]')?.value) === ${ev} && Number(document.querySelector('.white-balance input[type=number]')?.value) === ${temperature} && document.querySelector('.save-status')?.textContent === 'Saved'`), 'saved recipe ' + ev + '/' + temperature);
}
function hold(id) {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return heldPreview = { id, entered: false, promise, release };
}
const timeout = setTimeout(() => { console.error('Preview admission UI timeout'); app.exit(1); }, 120000);
(async () => {
  await app.whenReady();
  win = await until(() => BrowserWindow.getAllWindows().find(item => item.webContents.getURL() === 'app://revelumo/index.html'), 'window');
  await until(() => js('Boolean(document.querySelector(".catalog-import") && !document.querySelector(".catalog-import").disabled)'), 'catalog initialized');
  if (mode === 'first') await click('.catalog-import');
  await until(() => js('document.querySelectorAll(".tile").length === 2'), 'two synthetic originals');
  const listed = await api('listPhotos'); assert.ok(listed.ok);
  const ids = sources.map(file => listed.value.find(photo => photo.name === path.basename(file)).id);
  if (mode === 'first') fs.writeFileSync(path.join(run, 'ids.json'), JSON.stringify(ids));
  else assert.deepEqual(ids, JSON.parse(fs.readFileSync(path.join(run, 'ids.json'), 'utf8')));
  if (mode === 'first') {
    const translations = [
      ['pt-BR', 'A capacidade para esta prévia está ocupada. Tente novamente após a prévia anterior terminar.', 'Tentar prévia novamente'],
      ['en', 'Capacity for this preview is occupied. Retry after the previous preview finishes.', 'Retry preview'],
      ['es', 'La capacidad para esta vista previa está ocupada. Vuelve a intentarlo cuando termine la vista previa anterior.', 'Volver a intentar la vista previa'],
    ];
    win.showInactive(); win.unmaximize(); win.setContentSize(760, 540);
    await until(() => js('innerWidth === 760 && innerHeight === 540'), 'minimum editing viewport');
    for (const [locale, error, retry] of translations) {
      await language(locale);
      const held = hold(ids[0]);
      await open(ids[0]); await until(() => held.entered, 'A completed with held IPC response');
      await catalog();
      const previousBSessions = sessions.filter(session => session.id === ids[1]).length;
      await open(ids[1]);
      await until(() => js('Boolean(document.querySelector(".preview-problem[role=alert] .preview-retry"))'), 'capacity alert ' + locale);
      assert.equal(await js('document.querySelector(".preview-problem").firstChild.textContent.trim()'), error);
      assert.equal(await js('document.querySelector(".preview-retry").textContent'), retry);
      assert.equal(await js('document.querySelector(".preview-retry").disabled'), false);
      assert.equal(await js('Boolean(document.querySelector(".original-notice"))'), false, 'capacity is not a missing or changed original');
      // Some window managers resize again after showing/focusing the window.
      // Check the actual viewport at each capture, not only at initialization.
      win.unmaximize(); win.setContentSize(760, 540);
      await until(() => js('innerWidth === 760 && innerHeight === 540'), 'capacity viewport ' + locale);
      await delay(100);
      const viewport = await js('({width:innerWidth,height:innerHeight,deviceScaleFactor:devicePixelRatio})');
      assert.deepEqual([viewport.width, viewport.height], [760, 540]);
      assert.equal(await js(`(() => { const button = document.querySelector('.preview-retry'); const bounds = button.getBoundingClientRect(); return bounds.width > 0 && bounds.height > 0 && bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight; })()`), true, 'translated retry remains visible');
      const capture = await win.webContents.capturePage();
      assert.deepEqual(await js('[innerWidth,innerHeight]'), [760, 540], 'viewport is stable through capture');
      fs.writeFileSync(path.join(run, 'capacity-' + locale + '.png'), capture.toPNG());
      await until(() => sessions.filter(session => session.id === ids[1]).length === previousBSessions + 1, 'B edit session');
      const before = sessions.filter(session => session.id === ids[1]);
      const current = before.at(-1);
      assert.ok(held.reservation);
      // The Spanish cycle also loses one response after main already accepted
      // the release. The next explicit Retry must recover that idempotent ACK.
      loseReleaseAck = locale === 'es';
      heldPreview = null; held.release();
      await until(() => releases.some(release => release.lease === held.reservation.lease), 'late A disposed without transfer');
      await js('document.querySelector(".preview-retry").focus()'); await click('.preview-retry'); await ready();
      assert.equal(sessions.filter(session => session.id === ids[1]).length, before.length, 'retry keeps the existing B session');
      assert.deepEqual(sessions.filter(session => session.id === ids[1]).at(-1), current);
      assert.equal(await js('document.querySelector("figcaption").textContent.startsWith("b.jpg")'), true, 'late A never replaces B');
      assert.equal(await js('document.activeElement === document.querySelector(".exposure input[type=range]")'), true, 'retry restores keyboard focus to editing');
      const oldAReleases = releases.filter(release => release.lease === held.reservation.lease);
      assert.equal(oldAReleases.length, locale === 'es' ? 2 : 1);
      assert.ok(oldAReleases.every(release => release.ok));
      checks.push({ locale, capacityMessage: error, retry, viewport, captureSize: capture.getSize(), sameSession: true, releaseAckRecovered: locale === 'es' });
      if (locale !== 'es') await catalog();
    }
    await language('en');
    await input('.exposure input[type=number]', 1); await saved(1, 0);
    await input('.white-balance input[type=number]', 15); await saved(1, 15);
    await input('.exposure input[type=number]', 2); await saved(2, 15);
    await clickText('Undo exposure'); await saved(1, 15);
    const recipe = await api('recipePhoto', ids[1]); assert.ok(recipe.ok);
    assert.equal(recipe.value.exposureTenths, 10); assert.equal(recipe.value.temperature, 15);
    await catalog();
    checks.push({ savedExposure: 10, savedTemperature: 15, redoRetained: true });
  } else {
    await language('en'); await open(ids[1]); await ready(); await saved(1, 15);
    assert.equal(await js(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Redo exposure').disabled`), false);
    await clickText('Redo exposure'); await saved(2, 15);
    const recipe = await api('recipePhoto', ids[1]); assert.ok(recipe.ok);
    assert.equal(recipe.value.exposureTenths, 20); assert.equal(recipe.value.temperature, 15);
    await catalog(); checks.push({ samePhotoIds: true, reopenedExposure: 10, redoExposure: 20, temperature: 15 });
  }
  assert.deepEqual(sources.map(file => hash(fs.readFileSync(file))), JSON.parse(fs.readFileSync(path.join(run, 'hashes.json'), 'utf8')));
  const result = { ok: true, mode, cap: 1351, compressedSourceBytes: [633, 675], ids, checks, originalsIntact: true, versions: process.versions };
  fs.writeFileSync(path.join(run, mode + '-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result)); clearTimeout(timeout); app.exit(0);
})().catch(error => {
  console.error(error.stack); fs.writeFileSync(path.join(run, mode + '-failure.txt'), error.stack); clearTimeout(timeout); app.exit(1);
});
