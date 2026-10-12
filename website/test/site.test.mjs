import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const out=mkdtempSync(join(tmpdir(),'revelumo-site-'));
test('build produces home and guide in all three languages',()=>{
 const result=spawnSync(process.execPath,['website/build.mjs',out],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 for(const [lang,prefix] of [['en',''],['pt-BR','pt-BR/'],['es','es/']])for(const route of ['', 'guide/']){
  const file=join(out,prefix,route,'index.html');assert.ok(existsSync(file),file);
  assert.ok(readFileSync(file,'utf8').includes(`<html lang="${lang}">`));
 }
});

test('all same-site links, anchors, scripts and images resolve under the project base',()=>{
 const routes=['','guide/','pt-BR/','pt-BR/guide/','es/','es/guide/'];
 for(const route of routes){
  const html=readFileSync(join(out,route,'index.html'),'utf8');
  for(const [,url] of html.matchAll(/(?:href|src)="([^"]+)"/g)){
   if(/^https?:/.test(url))continue;
   const target=new URL(url,'https://local.test/revelumo/'+route);
   assert.ok(target.pathname.startsWith('/revelumo/'),url);
   let local=join(out,target.pathname.slice('/revelumo/'.length));if(target.pathname.endsWith('/'))local=join(local,'index.html');
   assert.ok(existsSync(local),`${route}: ${url}`);
   if(target.hash)assert.ok(readFileSync(local,'utf8').includes(`id="${target.hash.slice(1)}"`),url);
  }
  assert.equal((html.match(/rel="alternate"/g)||[]).length,3);
 }
});

test('comparison has a native keyboard control and honest localized explanation',()=>{
 for(const [lang,path] of [['en',''],['pt-BR','pt-BR/'],['es','es/']]){
  const html=readFileSync(join(out,path,'index.html'),'utf8');
  assert.match(html,/<label for="comparison-range">/);assert.match(html,/type="range" min="0" max="100" value="50"/);
  assert.match(html,/CSS/);assert.match(html,/<noscript>/);assert.match(html,/aria-describedby="comparison-note comparison-hint"/);
 }
});

test('styles honor reduced motion and interactions avoid tracking and network calls',()=>{
 const css=readFileSync(join(out,'assets/style.css'),'utf8');assert.match(css,/prefers-reduced-motion/);assert.match(css,/:focus-visible/);
 const js=readFileSync(join(out,'assets/site.js'),'utf8');assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|localStorage|sendBeacon/);
});

test('no-script comparison identifies the stacked order and removes unavailable-control directions',()=>{
 for(const route of ['','pt-BR/','es/']){
 const html=readFileSync(join(out,route,'index.html'),'utf8');
 assert.match(html,/<noscript><p class="nojs-order">[^<]+<\/p>/);
 assert.match(html,/#comparison-hint\{display:none\}/);
 }
});

test('header and guide navigation have distinct localized landmark names',()=>{
 for(const route of ['guide/','pt-BR/guide/','es/guide/']){
  const html=readFileSync(join(out,route,'index.html'),'utf8');
  const names=[...html.matchAll(/<nav[^>]*aria-label="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(names).size,names.length);
 }
});

test('guide explicitly preserves white-balance redo and links complete localized source setup',()=>{
 const expected=[['','white-balance edits neither','README.md'],['pt-BR/','ajustes de balanço de branco não','README.pt-BR.md'],['es/','cambios de balance de blancos no','README.es.md']];
 for(const [route,phrase,readme] of expected){const html=readFileSync(join(out,route,'guide/index.html'),'utf8');assert.ok(html.toLowerCase().includes(phrase));assert.ok(html.includes(readme+'#instalacao'));assert.ok(html.includes('SQLite'));}
});

test('Pages deployment is main-only after successful build with job-local permissions',()=>{
 const workflow=readFileSync('.github/workflows/website.yml','utf8');
 assert.match(workflow,/deploy:\n    if: github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'/);
 assert.match(workflow,/needs: check/);
 assert.match(workflow,/permissions:\n      pages: write\n      id-token: write/);
 assert.match(workflow,/environment:\n      name: github-pages/);
 assert.match(workflow,/path: website\/dist/);
 assert.doesNotMatch(workflow,/pull_request_target|contents: write|secrets\./);
});

test('language documentation reflects the integrated catalog without claiming a fully translated editor', async()=>{
 const {locales}=await import('../content.mjs');
 for(const locale of Object.values(locales)){
  assert.match(locale.guideIntro,/PT-BR\/EN\/ES/);
  assert.match(locale.guideIntro,/persist/);
  assert.match(locale.guideIntro,/editor/);
  assert.match(locale.roadmapItems[0][1],/PT-BR\/EN\/ES/);
 }
 assert.match(locales.en.guideIntro,/partial/);
 assert.match(locales['pt-BR'].guideIntro,/parcia/);
 assert.match(locales.es.guideIntro,/parcia/);
 assert.match(locales.en.screenshot,/shown in Portuguese/);
 assert.match(locales.en.guideSteps[1][1],/Import JPEGs/);
});
