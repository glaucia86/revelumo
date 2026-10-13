// Synthetic, packaged first/reopen scenario. The native file chooser is the
// only product boundary replaced; all mutations use the renderer/preload IPC.
const { app, BrowserWindow, dialog } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const run = path.resolve(process.argv[2] || '.');
const mode = process.argv[3];
assert.ok(['first', 'reopen'].includes(mode), 'Expected first or reopen');
const marker = JSON.parse(fs.readFileSync(path.join(run, 'run.json'), 'utf8'));
assert.equal(marker.runId, path.basename(run));
assert.equal(marker.scenario, 'synthetic-jpeg-workflow-v1');
const fatal = error => {
  const message = error?.stack || String(error);
  fs.writeFileSync(path.join(run, `${mode}-failure.txt`), message);
  console.error(message); app.exit(1);
};
process.on('uncaughtException', fatal); process.on('unhandledRejection', fatal);
dialog.showErrorBox = (title, message) => fatal(new Error(`${title}: ${message}`));
app.getPreferredSystemLanguages = () => ['pt-BR'];
const profile = path.join(run, 'profile');
if (mode === 'first') assert.equal(fs.existsSync(profile), false, 'First requires a fresh profile');
else assert.equal(fs.existsSync(profile), true, 'Reopen requires the previous isolated profile');
for (const [key, directory] of [['userData', profile], ['sessionData', path.join(run, 'session')], ['crashDumps', path.join(run, 'crashes')]]) {
  fs.mkdirSync(directory, { recursive: true }); app.setPath(key, directory);
}
let selection = { canceled: true, filePaths: [] };
dialog.showOpenDialog = async () => selection;
const archive = path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources', 'app.asar');
const packaged = JSON.parse(fs.readFileSync(path.join(archive, 'package.json'), 'utf8'));
const checks = [];
const originals = ['synthetic-a.jpg', 'synthetic-b.jpg'];
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const hashOriginals = () => Object.fromEntries(originals.map(name => [name, hash(path.join(run, name))]));
const expectedRecipe = { exposureTenths: 13, temperature: 40, tint: -20 };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let win;
const js = expression => win.webContents.executeJavaScript(expression);
const api = async (name, ...args) => {
  const result = await js(`window.revelumo.${name}(${args.map(value => JSON.stringify(value)).join(',')})`);
  assert.equal(result.ok, true, `${name}: ${JSON.stringify(result)}`); return result.value;
};
const button = label => `Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === ${JSON.stringify(label)} || b.textContent.trim() === ${JSON.stringify(label)})`;
const click = label => js(`${button(label)}.click()`);
async function until(work, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { const value = await work(); if (value) return value; await delay(30); }
  throw new Error(`Timed out waiting for ${label}`);
}
async function input(label, value) {
  await js(`(() => { const e = document.querySelector('[aria-label=${JSON.stringify(label)}]'); e.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(String(value))});
    e.dispatchEvent(new Event('input', { bubbles: true })); e.blur(); })()`);
}
async function verifyRecipe(id) {
  const recipe = await api('recipePhoto', id);
  for (const [key, value] of Object.entries(expectedRecipe)) assert.equal(recipe[key], value, key);
  for (const [label, value] of [['Exposição em EV', '1.3'], ['Temperatura relativa', '40'], ['Matiz relativo', '-20']]) {
    assert.equal(await js(`document.querySelector('[aria-label=${JSON.stringify(label)}]').value`), value, label);
  }
  return recipe;
}
const timeout = setTimeout(() => fatal(new Error('JPEG workflow stage exceeded 120 seconds')), 120000);
// Keep the harness alive just long enough to record normal window-close flush.
app.on('before-quit', event => { if (win?.isDestroyed()) event.preventDefault(); });
require('./hidden-electron.cjs')(path.join(archive, '.vite/build/index.cjs'));
(async () => {
  await app.whenReady();
  win = await until(() => BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === 'app://revelumo/index.html'), 'packaged origin');
  await until(() => js(`Boolean(window.revelumo && ${button('Importar JPEGs')} && !${button('Importar JPEGs')}.disabled)`), 'ready import control');
  const preferences = win.webContents.getLastWebPreferences();
  for (const key of ['sandbox', 'contextIsolation', 'webSecurity']) assert.equal(preferences[key], true, key);
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(await js('typeof require'), 'undefined'); checks.push('isolation');
  let expected;
  if (mode === 'first') {
    assert.deepEqual(await api('listPhotos'), []);
    for (const name of originals) fs.copyFileSync(path.join(repo, 'test/fixtures/sample.jpg'), path.join(run, name), fs.constants.COPYFILE_EXCL);
    const hashes = hashOriginals();
    selection = { canceled: false, filePaths: originals.map(name => path.join(run, name)) };
    await click('Importar JPEGs');
    await until(() => js('document.querySelectorAll(".tile").length === 2'), 'two imported JPEGs');
    const photos = await api('listPhotos');
    assert.deepEqual(photos.map(photo => photo.name).sort(), [...originals].sort());
    assert.equal(new Set(photos.map(photo => photo.id)).size, 2);
    for (const photo of photos) assert.match(photo.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expected = { photos, hashes }; checks.push('import', 'identity');
  } else {
    expected = JSON.parse(fs.readFileSync(path.join(run, 'expected.json'), 'utf8'));
    assert.deepEqual(await api('listPhotos'), expected.photos);
    checks.push('import', 'identity');
  }
  const photo = expected.photos.find(value => value.name === originals[0]);
  assert.ok(photo);
  await click(`Abrir ${originals[0]}`);
  await until(() => js(`Boolean(document.querySelector('.viewer canvas')?.dataset.revision && document.querySelector('[aria-label="Temperatura relativa"]') && !${button('4 estrelas')}.disabled)`), 'editor preview and classification');
  if (mode === 'first') {
    await click('4 estrelas');
    await until(async () => (await api('classificationPhoto', photo.id)).rating === 4, 'confirmed rating');
    await until(() => js(`!${button('Selecionada')}.disabled`), 'enabled flag control');
    await click('Selecionada');
    await until(async () => (await api('classificationPhoto', photo.id)).flag === 'selected', 'confirmed flag');
    await input('Exposição em EV', 1.3); await input('Temperatura relativa', 40); await input('Matiz relativo', -20);
  }
  await until(async () => {
    const value = await api('recipePhoto', photo.id);
    return Object.entries(expectedRecipe).every(([key, expectedValue]) => value[key] === expectedValue) &&
      await js('document.querySelector(".save-status")?.textContent === "Salvo"');
  }, 'confirmed saved recipe');
  const classification = await api('classificationPhoto', photo.id);
  assert.equal(classification.rating, 4); assert.equal(classification.flag, 'selected');
  assert.equal(await js(`${button('4 estrelas')}.getAttribute('aria-pressed')`), 'true');
  assert.equal(await js(`${button('Selecionada')}.getAttribute('aria-pressed')`), 'true');
  checks.push('classification');
  const recipe = await verifyRecipe(photo.id); checks.push('adjustments');
  assert.deepEqual(hashOriginals(), expected.hashes); checks.push('originals');
  if (mode === 'first') fs.writeFileSync(path.join(run, 'expected.json'), JSON.stringify(expected, null, 2));
  win.close(); await until(() => win.isDestroyed(), 'normal close and flush');
  assert.deepEqual(hashOriginals(), expected.hashes, 'closing preserves original hashes');
  const result = { status: 'passed', runId: marker.runId, mode, pid: process.pid,
    version: packaged.version, platform: process.platform, versions: process.versions,
    checks, photos: expected.photos, classification, recipe, hashes: hashOriginals() };
  fs.writeFileSync(path.join(run, `${mode}-result.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result)); clearTimeout(timeout); app.exit(0);
})().catch(fatal);
