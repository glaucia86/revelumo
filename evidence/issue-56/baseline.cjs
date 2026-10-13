// External test-only baseline. Does not change src, preload, sandbox or pixel algorithm.
const {app,BrowserWindow,dialog,ipcMain}=require('electron');
const fs=require('node:fs'),disk=require('original-fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks'),{performance}=require('node:perf_hooks');
const repo=path.resolve(__dirname,'../..'),run=path.resolve(process.argv[2]),instrument=process.argv[3]==='on';
const manifest=require('./fixtures/manifest.json'),fixtures=manifest.fixtures,install=require('./observer.cjs').install;
const sha=f=>crypto.createHash('sha256').update(disk.readFileSync(f)).digest('hex');
const packageFile=path.join(repo,'out/Revelumo-linux-x64/resources/app.asar'),packageSha256=sha(packageFile);
for(const f of fixtures){assert.ok(f.width*f.height<=480000&&f.bytes<1024*1024);assert.equal(sha(path.join(__dirname,'fixtures',f.name)),f.sha256);}
assert.equal(fs.readdirSync(run).length,0,'baseline requires an empty fresh run directory');
for(const name of ['userData','sessionData','crashDumps']){const dir=path.join(run,name);fs.mkdirSync(dir,{recursive:false});app.setPath(name,dir);}
app.getPreferredSystemLanguages=()=>['en-US'];dialog.showOpenDialog=async()=>({canceled:false,filePaths:fixtures.map(f=>path.join(__dirname,'fixtures',f.name))});
const records=[],scope=new AsyncLocalStorage();let enabled=false,currentStep=null;
const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,fn)=>handle(channel,async(event,request)=>{
 const op=request?.op;const record={op,allocations:0,allocationBytes:0,payloadCopies:0,payloadBytes:0,hashes:[]};
 const start=performance.now();return scope.run(record,async()=>{const result=await fn(event,request);record.ms=performance.now()-start;record.ok=result.ok;record.id=request?.id;if(enabled&&['status','preview','adjustments'].includes(op))records.push({...record,step:currentStep});return result;});
});
if(instrument){
 const alloc=Buffer.alloc;Buffer.alloc=function(...args){const b=Reflect.apply(alloc,this,args),r=scope.getStore();if(enabled&&r){r.allocations++;r.allocationBytes+=b.byteLength;}return b;};
 const from=Uint8Array.from;Uint8Array.from=function(...args){const b=Reflect.apply(from,this,args),r=scope.getStore();if(enabled&&r){r.payloadCopies++;r.payloadBytes+=b.byteLength;}return b;};
 const hash=crypto.createHash;crypto.createHash=function(...args){const h=Reflect.apply(hash,this,args),digest=h.digest;h.digest=function(...a){const value=Reflect.apply(digest,this,a),r=scope.getStore();if(enabled&&r&&typeof value==='string'&&fixtures.some(f=>f.sha256===value))r.hashes.push(value);return value;};return h;};
}
let win;const js=s=>win.webContents.executeJavaScript(s),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){const v=await fn();if(v)return v;await delay(20);}throw Error('Timeout '+label);}
async function click(s){await js(`document.querySelector(${JSON.stringify(s)}).click()`);}
async function input(s,v){await js(`(()=>{let e=document.querySelector(${JSON.stringify(s)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${v});e.dispatchEvent(new Event('input',{bubbles:true}));e.blur();})()`);}
const sessions=new Set(),pending=new Set(),snapshots=[];let observerFailure=null;
async function attach(){win.webContents.debugger.attach('1.3');win.webContents.debugger.on('message',(_e,method,p)=>{
 if(method==='Runtime.bindingCalled'&&p.name==='labEmit'){snapshots.push({step:currentStep,...JSON.parse(p.payload)});}
 if(method==='Target.attachedToTarget'&&p.targetInfo.type==='worker'){
 const work=(async()=>{await win.webContents.debugger.sendCommand('Runtime.addBinding',{name:'labEmit'},p.sessionId);await win.webContents.debugger.sendCommand('Runtime.evaluate',{expression:`(${install.toString()})()`},p.sessionId);sessions.add(p.sessionId);await win.webContents.debugger.sendCommand('Runtime.runIfWaitingForDebugger',{},p.sessionId);})();pending.add(work);work.catch(e=>observerFailure=e).finally(()=>pending.delete(work));
 }else if(method==='Target.detachedFromTarget')sessions.delete(p.sessionId);
 });await win.webContents.debugger.sendCommand('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true});}
async function workerCounts(){if(!instrument)return null;await Promise.all([...pending]);if(observerFailure)throw observerFailure;assert.equal(sessions.size,1);const r=await win.webContents.debugger.sendCommand('Runtime.evaluate',{expression:'JSON.stringify(globalThis.labAllocationCounts)',returnByValue:true},[...sessions][0]);return JSON.parse(r.result.value);}
require(path.join(repo,'test/hidden-electron.cjs'))(path.join(packageFile,'.vite/build/index.cjs'));
const timer=setTimeout(()=>{console.error('baseline timeout');app.exit(1);},180000);
(async()=>{
 await app.whenReady();win=await until(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='app://revelumo/index.html'),'window');
 const p=win.webContents.getLastWebPreferences();for(const k of ['sandbox','contextIsolation','webSecurity'])assert.equal(p[k],true);assert.equal(p.nodeIntegration,false);
 await until(()=>js('Boolean(document.querySelector(".catalog-import")&&!document.querySelector(".catalog-import").disabled)'),'boot');await click('.catalog-import');await until(()=>js('document.querySelectorAll(".tile").length===3&&!document.querySelector(".catalog-import").disabled&&Array.from(document.querySelectorAll(".thumbnail img")).every(x=>x.complete&&x.naturalWidth>0)'),'import');
 const photos=(await js('window.revelumo.listPhotos()')).value;assert.equal(photos.length,3);
 if(instrument)await attach();
 await js(`(()=>{const Native=window.Worker;window.labCounts={created:0,terminated:0,live:0,peak:0,prepares:0,ready:0,renders:0,pixels:0,transferBytes:0,pixelBytes:0,detached:0};window.Worker=class extends Native{constructor(...a){super(...a);this.stopped=false;labCounts.created++;labCounts.live++;labCounts.peak=Math.max(labCounts.peak,labCounts.live);this.addEventListener('message',e=>{if(e.data.op==='ready')labCounts.ready++;if(e.data.op==='pixels'){labCounts.pixels++;labCounts.pixelBytes+=e.data.buffer.byteLength;}});}postMessage(m,...a){if(m.op==='prepare'){labCounts.prepares++;labCounts.transferBytes+=m.bytes.byteLength;const b=m.bytes;super.postMessage(m,...a);if(b.byteLength===0)labCounts.detached++;}else{if(m.op==='render')labCounts.renders++;super.postMessage(m,...a);}}terminate(){if(!this.stopped){this.stopped=true;labCounts.live--;labCounts.terminated++;}super.terminate();}};})()`);
 enabled=true;const steps=[],order=['a','b','a','a','b','c'];
 for(let i=0;i<order.length;i++){
 const name=order[i]+'.jpg',photo=photos.find(p=>p.name===name);currentStep=i;const before=await js('({...labCounts})'),start=performance.now();
 await click('[aria-label="Open '+name+'"]');await until(()=>js('Boolean(document.querySelector("canvas")?.dataset.renderRequestId&&!document.querySelector(".exposure input").disabled)'),'ready');const openMs=performance.now()-start;
 const old=await js('Number(document.querySelector("canvas").dataset.renderRequestId)'),oldEv=await js('Number(document.querySelector(".exposure input[type=number]").value)');const editStart=performance.now();await input('.exposure input[type=number]',oldEv===1?-1:1);
 await until(()=>js(`Number(document.querySelector('canvas')?.dataset.renderRequestId)>${old}&&document.querySelector('.save-status')?.textContent==='Saved'&&!document.querySelector('.exposure input').disabled`),'render/saved');const editMs=performance.now()-editStart;
 const allocations=await workerCounts(),canvasHash=await js(`(()=>{const c=document.querySelector('canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let h=2166136261;for(const n of d)h=Math.imul(h^n,16777619);return {width:c.width,height:c.height,hash:h>>>0}})()`);
 await click('.back');await until(()=>js('Boolean(document.querySelector(".grid")&&!document.querySelector(".viewer"))'),'catalog');const after=await js('({...labCounts})');assert.equal(after.live,0);assert.equal(after.peak,1);
 steps.push({i,sequence:i<3?'ABA':'ABC',name,openMs,editMs,totalMs:performance.now()-start,allocationsBeforeExit:allocations,allocations:instrument?snapshots.filter(x=>x.step===i).at(-1)?.counts:null,canvasHash,before,after});
 }
 enabled=false;if(instrument)win.webContents.debugger.detach();for(const f of fixtures)assert.equal(sha(path.join(__dirname,'fixtures',f.name)),f.sha256);
 const report={status:'passed',checkoutSha:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),packageSourceVerified:false,packageSha256,instrument,versions:process.versions,platform:process.platform,manifest,steps,records,snapshots,counts:await js('({...labCounts})')};
 assert.equal(report.counts.prepares,6);assert.equal(report.counts.ready,6);assert.equal(report.counts.detached,6);assert.equal(records.filter(r=>r.op==='preview'&&r.ok).length,6);
 if(instrument){assert.equal(records.filter(r=>r.op==='preview').flatMap(r=>r.hashes).length,6);assert.ok(steps.every(s=>s.allocations.readbacks===1&&s.allocations.typedBytes>0));}
 fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(report,null,2));clearTimeout(timer);app.quit();
})().catch(e=>{console.error(e.stack);app.exit(1);});
