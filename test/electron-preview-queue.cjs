// Real packaged app; synthetic small originals. Hold only the filesystem boundary.
const { app, BrowserWindow, dialog, ipcMain, nativeImage } = require('electron');
const assert = require('node:assert/strict'), fs = require('node:fs'), fsp = require('node:fs/promises');
const path = require('node:path'), crypto = require('node:crypto'), { syncBuiltinESMExports } = require('node:module');
const repo = path.resolve(__dirname, '..'), run = path.resolve(process.argv[2]), mode = process.argv[3] || 'first';
for (const name of ['userData','sessionData','crashDumps']) { const dir = path.join(run,name); fs.mkdirSync(dir,{recursive:true}); app.setPath(name,dir); }
app.getPreferredSystemLanguages = () => ['en-US'];
const paths = ['a.jpg','b.jpg','c.jpg'].map(name=>path.join(run,name));
if(mode==='first') for(const [i,fixture] of ['sample.jpg','exposure-orientation-6.jpg','export/circuit-source.jpg'].entries()) fs.copyFileSync(path.join(repo,'test/fixtures',fixture),paths[i],fs.constants.COPYFILE_EXCL);
const originals = paths.map(file=>fs.readFileSync(file));
const realHash=crypto.createHash, digest=bytes=>realHash('sha256').update(bytes).digest('hex');
if(mode==='first') fs.writeFileSync(path.join(run,'hashes.json'),JSON.stringify(originals.map(digest)));
assert.deepEqual(originals.map(digest),JSON.parse(fs.readFileSync(path.join(run,'hashes.json'),'utf8')));
let io = paths.map(()=>({reads:0,hashes:0,decodes:0})), hold=null, invalidations=0, previews=0, uiBlocker=null, heldInvalidation=null;
const realOpen=fsp.open;
fsp.open=async(...args)=>{
  const handle=await realOpen(...args), index=paths.indexOf(args[0]);
  if(index>=0) { const read=handle.read.bind(handle); handle.read=async(...params)=>{
    io[index].reads++;
    if(hold && hold.path===args[0] && !hold.entered) { hold.entered=true; await hold.promise; }
    return read(...params);
  }; }
  return handle;
};
crypto.createHash=(...args)=>{const hash=realHash(...args), update=hash.update.bind(hash);hash.update=(bytes,...rest)=>{if(Buffer.isBuffer(bytes)){const i=originals.findIndex(original=>original.equals(bytes));if(i>=0)io[i].hashes++;}return update(bytes,...rest);};return hash;};
const realDecode=nativeImage.createFromBuffer;
nativeImage.createFromBuffer=(bytes,...rest)=>{const i=originals.findIndex(original=>original.equals(bytes));if(i>=0)io[i].decodes++;return realDecode(bytes,...rest);};
syncBuiltinESMExports();
dialog.showOpenDialog=async()=>({canceled:false,filePaths:paths});
const register=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,listener)=>register(channel,async(event,request)=>{
  if(channel==='revelumo:preview'){previewHandler=listener;previewEvent=event;}
  if(channel==='revelumo:preview'&&request?.op==='invalidate')invalidations++;
  if(channel==='revelumo:preview'&&request?.op==='preview')previews++;
  const result=await listener(event,request);
  if(channel==='revelumo:preview'&&request?.op==='invalidate'&&heldInvalidation){
    const held=heldInvalidation;heldInvalidation=null;held.entered=true;await held.promise;
    if(held.fail)return {ok:false,code:'invalid-request',message:'Synthetic stale retirement rejection'};
  }
  if(channel==='revelumo:invoke'&&request?.op==='status'&&uiBlocker?.target===request.id){
    const block=uiBlocker; uiBlocker=null;
    block.promise=listener(event,{op:'status',id:block.id});
    await until(()=>hold?.entered,'UI queue blocker');
    io[1]={reads:0,hashes:0,decodes:0};
  }
  return result;
});
let win, previewHandler, previewEvent;
const js=code=>win.webContents.executeJavaScript(code), delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(work,label){const end=Date.now()+15000;while(Date.now()<end){const result=await work();if(result)return result;await delay(20);}throw new Error('Timed out: '+label);}
const api=(method,...args)=>js(`window.revelumo.${method}(...${JSON.stringify(args)})`);
async function discardResults(...names) {
  await js(`(async () => { for (const name of ${JSON.stringify(names)}) {
    const result = await window[name];
    if (result.ok && result.value.reservation) { const receipt = result.value.reservation; result.value.bytes = null; await window.revelumo.releasePreview(receipt); }
    delete window[name];
  } })()`);
}
function gate(file){let release;const promise=new Promise(r=>{release=r;});hold={path:file,promise,release,entered:false};return hold;}
const reset=()=>{io=paths.map(()=>({reads:0,hashes:0,decodes:0}));};
const timer=setTimeout(()=>{console.error('Preview queue timeout');app.exit(1);},90000);
require('./hidden-electron.cjs')(path.join(repo,'out',`Revelumo-${process.platform}-${process.arch}`,'resources/app.asar/.vite/build/index.cjs'));
(async()=>{
  await app.whenReady();win=await until(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='app://revelumo/index.html'),'window');
  await until(()=>js('Boolean(document.querySelector(".catalog-import")&&!document.querySelector(".catalog-import").disabled)'),'app');
  if(mode==='first'){const imported=await api('importJpeg');assert.ok(imported.ok);assert.equal(imported.value.items.length,3);}
  const listed=await api('listPhotos');assert.ok(listed.ok);const ids=paths.map(file=>listed.value.find(photo=>photo.name===path.basename(file)).id);
  const checks=[];
  if(mode==='first'){
    reset();const a=gate(paths[0]);
    await js(`window.a=window.revelumo.previewPhoto(${JSON.stringify(ids[0])});void 0`);await until(()=>a.entered,'A reading');
    await js(`window.bSettles=0;window.b=window.revelumo.previewPhoto(${JSON.stringify(ids[1])}).then(r=>{bSettles++;return r});window.c=window.revelumo.previewPhoto(${JSON.stringify(ids[2])});void 0`);
    assert.deepEqual(await js('window.b'),{ok:false,canceled:true});assert.equal(await js('bSettles'),1);
    assert.deepEqual(io[1],{reads:0,hashes:0,decodes:0});a.release();assert.equal((await js('window.a')).ok,true);assert.equal((await js('window.c')).ok,true);hold=null;
    assert.deepEqual(io[1],{reads:0,hashes:0,decodes:0});assert.equal(await js('bSettles'),1);checks.push({name:'A-B-C drops B before read/hash/decode',io:structuredClone(io)});
    await discardResults('a', 'c');
    reset();const blocked=gate(paths[0]);
    await js(`window.blocker=window.revelumo.originalStatus(${JSON.stringify(ids[0])});void 0`);await until(()=>blocked.entered,'protected queue');
    await js(`window.retired=window.revelumo.previewPhoto(${JSON.stringify(ids[1])});void 0`);
    await api('invalidatePreview');blocked.release();await js('window.blocker');assert.deepEqual(await js('window.retired'),{ok:false,canceled:true});hold=null;
    assert.deepEqual(io[1],{reads:0,hashes:0,decodes:0});checks.push({name:'dispatched stale request checks token inside protected queue',io:structuredClone(io)});
    const session=await api('beginEditingPhoto',ids[0]);assert.ok(session.ok);const saving=gate(paths[0]);
    await js(`window.active=window.revelumo.previewPhoto(${JSON.stringify(ids[0])});void 0`);await until(()=>saving.entered,'save queue blocker');
    await js(`window.order=[];window.old=window.revelumo.previewPhoto(${JSON.stringify(ids[1])});window.save=window.revelumo.saveExposure(${JSON.stringify(ids[0])},${JSON.stringify(session.value.sessionId)},1,10,2).then(r=>{order.push('save');return r});window.last=window.revelumo.previewPhoto(${JSON.stringify(ids[2])}).then(r=>{order.push('preview');return r});void 0`);
    assert.deepEqual(await js('window.old'),{ok:false,canceled:true});saving.release();await js('window.active');assert.equal((await js('window.save')).ok,true);assert.equal((await js('window.last')).ok,true);hold=null;assert.deepEqual(await js('order'),['save','preview']);
    await discardResults('active', 'last');
    assert.equal((await api('endEditingPhoto',ids[0],session.value.sessionId)).ok,true);checks.push({name:'latest preview does not overtake accepted save'});
    // A real UI opening is queued behind another protected read after status.
    await api('invalidatePreview');await js('document.querySelector(".catalog-import").click()');await until(()=>js('document.querySelectorAll(".tile").length===3'),'grid');
    const ui=gate(paths[0]), block={id:ids[0],target:ids[1]};uiBlocker=block;const beforePreview=previews;
    await js('document.querySelector("[aria-label=\\"Open b.jpg\\"]").click()');await until(()=>previews>beforePreview,'UI preview admitted');
    const beforeExit=invalidations;await js('document.querySelector(".back").click()');await until(()=>invalidations>beforeExit,'UI exit invalidation');
    ui.release();await block.promise;hold=null;await until(()=>js('document.querySelector("main").dataset.view==="catalog"'),'catalog exit');
    assert.deepEqual(io[1],{reads:0,hashes:0,decodes:0});checks.push({name:'UI catalog exit retires queued preview after successful leave',io:structuredClone(io)});
  }
  if(mode==='first'){
    await api('invalidatePreview');
    const oldContext=await previewHandler(previewEvent,{op:'context'});assert.ok(oldContext.ok);
    // Inject only the Electron lifecycle event boundary while the old document
    // is still alive. Its first/lazy handshake must fail before commit.
    win.webContents.emit('did-start-navigation',{},'app://revelumo/index.html',false,true);
    assert.equal((await previewHandler(previewEvent,{op:'context'})).ok,false,'navigation start must not enroll the old document');
    const reloaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
    win.reload();await reloaded;
    await until(()=>js('Boolean(document.querySelector(".catalog-import")&&!document.querySelector(".catalog-import").disabled)'),'reloaded app');
    const freshPreview = await api('previewPhoto',ids[0]);
    assert.equal(freshPreview.ok,true,'fresh preload obtains a fresh document token');
    const receipt = freshPreview.value.reservation; freshPreview.value.bytes = null; await api('releasePreview', receipt);
    assert.deepEqual(await previewHandler(previewEvent,{op:'preview',id:ids[0],generation:1000,document:oldContext.value}),{ok:false,canceled:true});
    checks.push({name:'navigation-start handshake fails closed; real reload rejects old token'});
    for(const fail of [false,true]){
      let release;const held={fail,entered:false,promise:new Promise(resolve=>{release=resolve;})};heldInvalidation=held;
      await js('document.querySelector(".workspace-navigation button").click()');await until(()=>held.entered,'held catalog exit');
      assert.equal(await js('document.querySelector(".gallery").getAttribute("aria-busy")'),'true','catalog refresh must expose its pending invalidation before the query begins');
      await js(`document.querySelector('[data-photo-id="${ids[2]}"]').click()`);
      await until(()=>js('Boolean(document.querySelector("canvas")?.dataset.renderRequestId)'),'newer selected photo');
      release();await until(()=>js('!document.querySelector(".back")?.disabled'),'older exit settled');
      assert.equal(await js('document.querySelector("main").dataset.view'),'editor','obsolete catalog action must not reset the newer selection');
      assert.equal(await js('Boolean(document.querySelector(".exit-failure"))'),false,'obsolete rejection must not replace newer UI');
      assert.equal(await js('document.querySelector("figcaption").textContent.startsWith("c.jpg")'),true);
      await js('document.querySelector(".back").click()');await until(()=>js('document.querySelector("main").dataset.view==="catalog"'),'race cleanup');
    }
    checks.push({name:'newer selection survives a late catalog-exit acknowledgement or failure'});
  }
  const recipe=await api('recipePhoto',ids[0]);assert.ok(recipe.ok);assert.equal(recipe.value.exposureTenths,10);
  assert.deepEqual(paths.map(file=>digest(fs.readFileSync(file))),JSON.parse(fs.readFileSync(path.join(run,'hashes.json'),'utf8')));
  const result={ok:true,mode,checks,versions:process.versions,originalHashesIntact:true,persistedExposure:recipe.value.exposureTenths};
  fs.writeFileSync(path.join(run,mode+'-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));clearTimeout(timer);app.quit();
})().catch(error=>{console.error(error.stack);fs.writeFileSync(path.join(run,mode+'-failure.txt'),error.stack);clearTimeout(timer);app.exit(1);});
