import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs');
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith('/revelumo/')){res.writeHead(404).end();return;}let p=u.pathname.slice('/revelumo/'.length);if(p.endsWith('/')||!p)p+='index.html';if(p.includes('..'))throw Error();const data=await readFile(join(process.cwd(),'website/dist',p));res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[extname(p)]||'text/plain');res.end(data);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
const checks=[];
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [320,390,768,1440])for(const route of ['','guide/','pt-BR/','pt-BR/guide/','es/','es/guide/']){
  await page.setViewportSize({width,height:900});await page.goto(`http://127.0.0.1:${port}/revelumo/${route}`);await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width} ${route}`);
  assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('main').count(),1);
  assert.ok(await page.locator('img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)),`image ${route}`);
  checks.push({width,route,overflow:false});
 }
 await page.setViewportSize({width:1440,height:1000});await page.goto(`http://127.0.0.1:${port}/revelumo/`);await page.screenshot({path:'website/evidence/home-desktop.png',fullPage:true});
 await page.locator('#comparison-range').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#comparison-range').inputValue(),'51');assert.equal(await page.locator('.comparison').evaluate(e=>e.style.getPropertyValue('--split')),'51%');
 await page.goto(`http://127.0.0.1:${port}/revelumo/guide/`);await page.locator('.languages a[hreflang="es"]').click();assert.ok(page.url().endsWith('/es/guide/'));
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(`http://127.0.0.1:${port}/revelumo/`);assert.equal(await page.locator('h1').evaluate(e=>getComputedStyle(e).animationName),'none');
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'skip');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'website/evidence/home-mobile.png',fullPage:true});
 await page.goto(`http://127.0.0.1:${port}/revelumo/pt-BR/guide/`);await page.screenshot({path:'website/evidence/guide-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:900}});const p=await nojs.newPage();await p.goto(`http://127.0.0.1:${port}/revelumo/`);assert.ok(await p.locator('.comparison-after').isVisible());assert.equal(await p.locator('.comparison-after').evaluate(e=>getComputedStyle(e).position),'relative');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await nojs.close();
 console.log(JSON.stringify({checks,keyboardSlider:true,languageContext:true,reducedMotion:true,skipLink:true,noJavaScript:true,pageErrors:errors},null,2));
}finally{await browser.close();server.close();}
