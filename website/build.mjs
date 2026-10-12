import {mkdir,writeFile,cp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {locales} from './content.mjs';
import {render} from './render.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function build({outDir=join(root,'website/dist'),basePath='/revelumo/'}={}) {
 if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath))throw new Error('Invalid base path');
 await mkdir(outDir,{recursive:true});
 for(const [lang,c] of Object.entries(locales))for(const page of ['home','guide']){
  const dir=join(outDir,c.path,page==='guide'?'guide':'');await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'index.html'),render(lang,page,basePath));
 }
 await cp(join(root,'website/public'),join(outDir,'assets'),{recursive:true});
 for(const file of ['revelumo-cobre-catalog.png','revelumo-editor.png'])await cp(join(root,'docs/assets/screenshots',file),join(outDir,'assets',file));
 await cp(join(root,'src/renderer/theme/fonts/geist-latin.woff2'),join(outDir,'assets/geist-latin.woff2'));
 await cp(join(root,'LICENSE'),join(outDir,'LICENSE.txt'));
 await cp(join(root,'public/licenses/Geist-OFL.txt'),join(outDir,'assets/OFL.txt'));
 await writeFile(join(outDir,'.nojekyll'),'');
 return outDir;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log(await build({outDir:process.argv[2]?resolve(process.argv[2]):undefined}));
