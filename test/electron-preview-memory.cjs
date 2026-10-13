// Packaged product. Synthetic JPEGs, native dialog and Worker/IPC fault boundaries only.
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const run = path.resolve(process.argv[2]), mode = process.argv[3] || 'first', repo = path.resolve(__dirname, '..');
for (const name of ['userData', 'sessionData', 'crashDumps']) { const dir = path.join(run, name); fs.mkdirSync(dir, { recursive: true }); app.setPath(name, dir); }
app.getPreferredSystemLanguages = () => ['en-US'];
const source = path.join(run, 'source.jpg'), secondSource = path.join(run, 'second.jpg'), hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (mode === 'first') { fs.copyFileSync(path.join(repo, 'test/fixtures/export/circuit-source.jpg'), source, fs.constants.COPYFILE_EXCL); fs.writeFileSync(path.join(run,'original.sha256'), hash(source)); fs.copyFileSync(path.join(repo,'test/fixtures/exposure-orientation-6.jpg'),secondSource,fs.constants.COPYFILE_EXCL); fs.writeFileSync(path.join(run,'second.sha256'),hash(secondSource)); assert.notEqual(hash(source),hash(secondSource)); }
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source,secondSource] });
dialog.showSaveDialog = async () => ({ canceled:false, filePath:path.join(run,'recovered-export.jpg') });
let beginCount = 0, previewCount = 0, invalidationCount = 0, failInvalidationAt = 0, failRetirement = false, failEnd = false, failSave = false, heldPreview = null, heldExportStatus = null;
const register = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => register(channel, async (event, request) => {
  if (request?.op === 'begin-edit') beginCount++;
  if (channel === 'revelumo:preview' && request?.op === 'invalidate') { invalidationCount++; if (failRetirement || invalidationCount === failInvalidationAt) return { ok:false, code:'invalid-request', message:'Synthetic retirement failure' }; }
  if (request?.op === 'end-edit' && failEnd) return { ok:false, code:'invalid-request', message:'Synthetic end-edit failure' };
  if (request?.op === 'preview') previewCount++;
  if (request?.op === 'adjustments' && failSave) return { ok:false, code:'catalog-error', message:'Synthetic save failure', descriptor:{key:'errors.saveAdjustment'} };
  const result = await listener(event, request);
  if (request?.op === 'preview' && heldPreview) { heldPreview.entered = true; await heldPreview.promise; }
  if (channel === 'revelumo:export' && request?.op === 'status' && result.ok && result.value.state === 'succeeded' && heldExportStatus) { heldExportStatus.entered=true; await heldExportStatus.promise; }
  return result;
});
require('./hidden-electron.cjs')(path.join(repo, 'out', `Revelumo-${process.platform}-${process.arch}`, 'resources', 'app.asar', '.vite', 'build', 'index.cjs'));
let win;
const js = async code => { try { return await win.webContents.executeJavaScript(code); } catch (cause) { throw new Error('Renderer script failed: '+code, {cause}); } }, delay = ms => new Promise(r => setTimeout(r, ms));
async function until(work, label) { const end = Date.now()+15000; while (Date.now()<end) { const value = await work(); if (value) return value; await delay(25); } throw new Error('Timed out: '+label); }
async function click(selector) { await js(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function input(selector, value) { await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.blur();})()`); }
async function ready() { await until(()=>js('Boolean(document.querySelector("canvas")?.dataset.renderRequestId && !document.querySelector(".exposure input").disabled)'), 'editing ready'); }
async function saved() { await until(()=>js('document.querySelector(".save-status")?.textContent === "Saved"'), 'saved'); }
const timer = setTimeout(()=>{ console.error('Preview lifecycle timeout'); app.exit(1); },120000);
(async()=>{
  await app.whenReady(); win = await until(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='app://revelumo/index.html'),'window');
  const preferences=win.webContents.getLastWebPreferences();
  assert.equal(preferences.sandbox,true); assert.equal(preferences.contextIsolation,true); assert.equal(preferences.nodeIntegration,false); assert.equal(preferences.webSecurity,true);
  await until(()=>js('Boolean(document.querySelector(".catalog-import") && !document.querySelector(".catalog-import").disabled)'),'app');
  if (mode==='first') { await click('.catalog-import'); await until(()=>js('Boolean(document.querySelector(".tile"))'),'import'); }
  await js(`(()=>{
    const Native=window.Worker;
    window.previewProbe={live:0,peak:0,created:0,terminated:0,failNext:${mode==='first'},workers:[],pendingReady:[]};
    window.Worker=class extends Native {
      constructor(...args) { if(previewProbe.throwNext) {previewProbe.throwNext=false; throw new Error('Synthetic worker allocation failure');} super(...args); this.stopped=false; previewProbe.live++; previewProbe.created++; previewProbe.peak=Math.max(previewProbe.peak,previewProbe.live); previewProbe.workers.push(this); }
      set onmessage(handler) { this.handleMessage=handler; super.onmessage=event=>{if(event.data.op==='ready' && previewProbe.holdReady) {previewProbe.pendingReady.push(()=>handler(event));return;} handler(event);}; }
      get onmessage() { return this.handleMessage; }
      postMessage(message,...args) { if(message.op==='prepare') this.envelope={id:message.id,sessionId:message.sessionId}; if(message.op==='prepare' && previewProbe.failNext) { previewProbe.failNext=false; queueMicrotask(()=>this.onerror?.(new Event('error'))); return; } super.postMessage(message,...args); }
      terminate() { if(!this.stopped) {this.stopped=true;previewProbe.live--;previewProbe.terminated++;} super.terminate(); }
    };
  })()`);
  await click('[aria-label="Open source.jpg"]');
  if (mode==='first') {
    await until(()=>js('Boolean(document.querySelector(".preview-retry"))'),'explicit preview retry action');
    assert.equal(await js('previewProbe.live'),0,'failed worker retired');
    assert.equal(await js('document.querySelector("canvas").width'),1,'failed surface released');
    await delay(150); assert.equal(previewCount,1,'no automatic retry');
    win.showInactive(); await delay(100); win.unmaximize(); win.setContentSize(760,540); await until(()=>js('innerWidth===760 && innerHeight===540'),'minimum viewport'); await delay(100);
    assert.equal(await js('(()=>{const r=document.querySelector(".preview-retry").getBoundingClientRect(),p=document.querySelector(".editing").getBoundingClientRect();return r.top>=p.top && r.bottom<=p.bottom && r.left>=p.left && r.right<=p.right})()'),true,'retry is visible in the minimum editing viewport');
    fs.writeFileSync(path.join(run,'preview-error-en.png'),(await win.webContents.capturePage()).toPNG());
    for (const [locale, label] of [['pt-BR','Tentar prévia novamente'],['es','Volver a intentar la vista previa'],['en','Retry preview']]) {
      await js(`(()=>{const e=document.getElementById('language-choice');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(locale)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await until(()=>js(`document.querySelector('.preview-retry')?.textContent===${JSON.stringify(label)} && !document.getElementById('language-choice').disabled`),'translated retry '+locale);
      assert.equal(await js('(()=>{const r=document.querySelector(".preview-retry").getBoundingClientRect(),p=document.querySelector(".editing").getBoundingClientRect();return r.top>=p.top && r.bottom<=p.bottom && r.right<=p.right})()'),true,'translated retry fits');
      fs.writeFileSync(path.join(run,'preview-error-'+locale+'.png'),(await win.webContents.capturePage()).toPNG());
    }
    await js('document.querySelector(".preview-retry").focus()');
    await click('.preview-retry'); await ready();
    assert.equal(await js('document.activeElement===document.querySelector(".exposure input[type=range]")'),true,'explicit retry returns keyboard focus to editing');
    assert.equal(beginCount,1,'retry preserves edit session'); assert.equal(previewCount,2,'explicit retry authenticates original');
    await input('.exposure input[type=number]',1); await saved();
    await input('.white-balance input[type=number]',25); await saved();
    // Retirement runs once after flush; a hook/end-edit failure preserves session and draft.
    for (const fault of ['retirement','end-edit']) {
      const beforeInvalidation=invalidationCount;
      failRetirement=fault==='retirement'; failEnd=fault==='end-edit';
      await js('document.querySelector(".back").click();document.querySelector(".back").click()');
      await until(()=>js('Boolean(document.querySelector(".exit-failure"))'),'retirement failure '+fault);
      assert.equal(invalidationCount,beforeInvalidation+1,'duplicate exit does not retire twice');
      assert.equal(beginCount,1); assert.equal(await js('Number(document.querySelector(".exposure input[type=number]").value)'),1);
      assert.equal(await js('Number(document.querySelector(".white-balance input[type=number]").value)'),25);
      failRetirement=false; failEnd=false;
      await js('Array.from(document.querySelectorAll(".exit-failure button")).find(b=>b.textContent==="Stay").click()');
      await ready();
    }
    // A failed retry must remain recoverable even if Worker construction fails.
    await js('previewProbe.workers.at(-1).onerror(new Event("error")); previewProbe.throwNext=true');
    await until(()=>js('Boolean(document.querySelector(".preview-retry"))'),'runtime worker failure');
    await click('.preview-retry');
    await until(()=>js('Boolean(document.querySelector(".preview-retry") && !document.querySelector(".preview-retry").disabled)'),'constructor failure retry remains available');
    assert.equal(beginCount,1); assert.equal(await js('previewProbe.live'),0);
    assert.equal(await js('Number(document.querySelector(".exposure input[type=number]").value)'),1);
    assert.equal(await js('Number(document.querySelector(".white-balance input[type=number]").value)'),25);
    await click('.preview-retry'); await ready(); assert.equal(beginCount,1);
    // Callbacks from retired attempts cannot invalidate the active preview.
    const beforePixels = await js('document.querySelector("canvas").dataset.renderRequestId');
    await js('(()=>{const old=previewProbe.workers[0];old.onerror(new Event("error"));old.onmessage({data:{op:"ready",...old.envelope}});})()');
    await delay(50); assert.equal(await js('Boolean(document.querySelector(".preview-retry"))'),false);
    assert.equal(await js('document.querySelector("canvas").dataset.renderRequestId'),beforePixels);

    // Failed autosave and exit preserve the pending draft across preview recovery.
    failSave = true; await input('.exposure input[type=number]',2);
    await until(()=>js('Array.from(document.querySelectorAll(".exposure button")).some(b=>b.textContent==="Retry saving")'),'save fault');
    await js('Array.from(document.querySelectorAll(".exposure button")).find(b=>b.textContent==="Retry saving").focus();previewProbe.workers.at(-1).onerror(new Event("error"))');
    await until(()=>js('Boolean(document.querySelector(".preview-retry"))'),'fault with draft');
    assert.equal(await js('document.activeElement?.textContent'), 'Retry saving','spontaneous failure does not steal save focus');
    const invalidationsBeforeFailedSave=invalidationCount;
    await click('.back'); await until(()=>js('Boolean(document.querySelector(".exit-failure"))'),'unsaved exit blocked');
    assert.equal(invalidationCount,invalidationsBeforeFailedSave,'failed save must not retire preview intent');
    assert.equal(await js('Number(document.querySelector(".exposure input[type=number]").value)'),2);
    await click('.preview-retry'); await ready(); assert.equal(beginCount,1);
    assert.equal(await js('Number(document.querySelector(".exposure input[type=number]").value)'),2);
    failSave=false;
    await js('Array.from(document.querySelectorAll(".exposure button")).find(b=>b.textContent==="Retry saving").click()'); await saved();
    await js('Array.from(document.querySelectorAll(".exit-failure button")).find(b=>b.textContent==="Stay").click()');
    await input('.exposure input[type=number]',1); await saved();

    // Re-reading authenticates bytes; a changed original cannot replace the base.
    const originalBytes=fs.readFileSync(source), workersBeforeIdentity=await js('previewProbe.created');
    fs.appendFileSync(source,Buffer.from([0]));
    await js('previewProbe.workers.at(-1).onerror(new Event("error"))');
    await until(()=>js('Boolean(document.querySelector(".preview-retry"))'),'fault before changed original');
    await click('.preview-retry');
    await until(()=>js('document.querySelector(".preview-problem")?.textContent.includes("differs from the cataloged original")'),'changed-original recovery refusal');
    assert.equal(await js('previewProbe.created'),workersBeforeIdentity,'changed bytes never reach another worker');
    assert.equal(await js('Number(document.querySelector(".exposure input[type=number]").value)'),1);
    assert.equal(await js('Number(document.querySelector(".white-balance input[type=number]").value)'),25);
    fs.writeFileSync(source,originalBytes); await until(()=>js('!document.querySelector(".preview-retry").disabled'),'identity retry enabled');
    await click('.preview-retry'); await ready(); assert.equal(beginCount,1);

    // A refused retry during a committed-export exit must retain recovery.
    let releaseExport; heldExportStatus={entered:false,promise:new Promise(resolve=>{releaseExport=resolve;})};
    await click('.export-jpeg'); await until(()=>heldExportStatus.entered,'held successful export status');
    await click('.back'); releaseExport(); heldExportStatus=null;
    await until(()=>js('Boolean(document.querySelector(".export-close-confirm"))'),'committed export exit confirmation');
    await js('previewProbe.workers.at(-1).onerror(new Event("error"))');
    await until(()=>js('Boolean(document.querySelector(".preview-retry"))'),'worker fault during export exit');
    const readsBeforeBlockedRetry=previewCount;
    await click('.preview-retry'); await delay(50);
    assert.equal(previewCount,readsBeforeBlockedRetry,'export exit rejects preview retry');
    assert.equal(await js('Boolean(document.querySelector(".preview-retry"))'),true,'refused retry keeps recovery action');
    await click('.export-stay'); await click('.preview-retry'); await ready();
    assert.equal(beginCount,1); assert.ok(fs.statSync(path.join(run,'recovered-export.jpg')).size>0);
    assert.equal(await js('Number(document.querySelector(".exposure input[type=number]").value)'),1);
    // Existing exposure history still navigates after repeated recovery/export.
    await js('Array.from(document.querySelectorAll(".exposure button")).find(b=>b.textContent==="Undo exposure").click()');
    await until(()=>js('Number(document.querySelector(".exposure input[type=number]").value)===2'),'undo after recovery'); await saved();
    await js('Array.from(document.querySelectorAll(".exposure button")).find(b=>b.textContent==="Redo exposure").click()');
    await until(()=>js('Number(document.querySelector(".exposure input[type=number]").value)===1'),'redo after recovery'); await saved();

    // Retire a prepared worker before its held ACK; the late ACK is ignored.
    await js('previewProbe.workers.at(-1).onerror(new Event("error")); previewProbe.holdReady=true');
    await until(()=>js('Boolean(document.querySelector(".preview-retry"))'),'prepare cancellation fault');
    await click('.preview-retry'); await until(()=>js('previewProbe.pendingReady.length===1'),'held ready ACK');
    await click('.back'); await until(()=>js('Boolean(document.querySelector(".tile"))'),'exit during preparation');
    assert.equal(await js('previewProbe.live'),0);
    await js('previewProbe.holdReady=false;previewProbe.pendingReady.splice(0).forEach(deliver=>deliver())');
    await delay(50); assert.equal(await js('Boolean(document.querySelector(".viewer"))'),false);
    await click('[aria-label="Open source.jpg"]'); await ready();

    // A late IPC preview response also cannot resurrect an exited editor.
    await js('previewProbe.workers.at(-1).onerror(new Event("error"))');
    await until(()=>js('Boolean(document.querySelector(".preview-retry"))'),'read cancellation fault');
    let releasePreview; heldPreview={entered:false,promise:new Promise(resolve=>{releasePreview=resolve;})};
    await click('.preview-retry'); await until(()=>heldPreview.entered,'held preview IPC');
    await click('.back'); await until(()=>js('Boolean(document.querySelector(".tile"))'),'exit during source read');
    releasePreview(); heldPreview=null; await delay(100);
    assert.equal(await js('Boolean(document.querySelector(".viewer"))'),false); assert.equal(await js('previewProbe.live'),0);
    await click('[aria-label="Open source.jpg"]'); await ready();
    await click('.back'); await until(()=>js('Boolean(document.querySelector(".tile"))'),'return catalog');
    assert.equal(await js('previewProbe.live'),0); assert.equal(await js('previewProbe.peak'),1);
    await click('[aria-label="Open second.jpg"]'); await ready();
    assert.equal(await js('Number(document.querySelector(".exposure input[type=number]").value)'),0);
    assert.equal(await js('Number(document.querySelector(".white-balance input[type=number]").value)'),0);
    const finalRetirements=invalidationCount; failInvalidationAt=finalRetirements+2;
    await click('.back'); await until(()=>js('Boolean(document.querySelector(".tile"))'),'return from distinct second photo');
    assert.equal(invalidationCount,finalRetirements+1,'successful exit has no second fallible retirement after ending the session');
    assert.equal(await js('previewProbe.live'),0); assert.equal(await js('previewProbe.peak'),1);
    const list=await js('window.revelumo.listPhotos()'); assert.ok(list.ok); fs.writeFileSync(path.join(run,'id'),list.value.find(p=>p.name==='source.jpg').id);
  } else {
    await ready(); assert.equal(await js('Number(document.querySelector(".exposure input[type=number]").value)'),1);
    assert.equal(await js('Number(document.querySelector(".white-balance input[type=number]").value)'),25);
    const list=await js('window.revelumo.listPhotos()'); assert.equal(list.value.find(p=>p.name==='source.jpg').id,fs.readFileSync(path.join(run,'id'),'utf8'));
    await click('.back'); await until(()=>js('Boolean(document.querySelector(".tile"))'),'return catalog');
  }
  assert.equal(hash(source),fs.readFileSync(path.join(run,'original.sha256'),'utf8'));
  assert.equal(hash(secondSource),fs.readFileSync(path.join(run,'second.sha256'),'utf8'));
  fs.writeFileSync(path.join(run,mode+'-result.json'),JSON.stringify({mode,platform:process.platform,arch:process.arch,versions:process.versions,beginCount,previewCount,workers:await js('({live:previewProbe.live,peak:previewProbe.peak,created:previewProbe.created,terminated:previewProbe.terminated})'),originalHash:hash(source)},null,2));
  clearTimeout(timer); app.exit(0);
})().catch(error=>{ console.error(error.stack||error);clearTimeout(timer);app.exit(1); });
