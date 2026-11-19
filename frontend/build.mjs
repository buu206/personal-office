import {studioShell} from './studio-shell.mjs';
import {skinTool} from './tools/skin.mjs';
import {readFile,writeFile,mkdir,copyFile,cp,rm,rename,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('.',import.meta.url)),dist=join(root,'dist'),stage=join(root,'.build-next');
const overlay=resolve(root,'../upstream/solo-to-team-skills/mas/release/current/overlay');
const files=['index.html','styles.css','meeting.css','console.css','pokemon.css','trainer.css','pixel-camp.mjs','pixel-motion.mjs','app.mjs','state.mjs','studio.mjs','ai-client.mjs','ai-state.mjs','studio.css','favicon.svg','assets/camp-stump.png','assets/bulbasaur.png','assets/mew.png','assets/pikachu.png','assets/squirtle.png','assets/charizard.png','assets/team.json'];
for (const dex of ['0025','0001','0007','0006','0151']) for (const suffix of ['Walk-Anim.png','credits.txt']) files.push('assets/pixel/'+dex+'-'+suffix);
files.push('assets/pixel/animations.json');
for(const f of files)await access(join(root,f));
await rm(stage,{recursive:true,force:true});await mkdir(join(stage,'assets'),{recursive:true});
const manifest={format:'personal-office.static-build',version:1,files:[]};
for(const file of files){await mkdir(join(stage,file,'..'),{recursive:true});await copyFile(join(root,file),join(stage,file));manifest.files.push({file,sha256:createHash('sha256').update(await readFile(join(stage,file))).digest('hex')});}
await copyFile(join(overlay,'team-16/source/web/core.js'),join(stage,'team-core.js'));
const toolStyles = await readFile(join(root,'tools/theme.css'),'utf8');
for (const name of ['team-16','start-with-files','update-team']) {
  const html = await readFile(join(overlay,name,'index.html'),'utf8');
  const themed = skinTool(html,name,toolStyles);
  const file = 'tools/'+name+'/index.html';
  await mkdir(join(stage,'tools',name),{recursive:true});
  await writeFile(join(stage,file),themed);
  manifest.files.push({file,sha256:createHash('sha256').update(themed).digest('hex')});
}
const studio=studioShell(await readFile(join(root,'index.html'),'utf8'));
await writeFile(join(stage,'studio.html'),studio);
manifest.files.push({file:'studio.html',sha256:createHash('sha256').update(studio).digest('hex')});
await writeFile(join(stage,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const index=await readFile(join(stage,'index.html'),'utf8');
for(const [,url] of index.matchAll(/(?:src|href)="([^"#]+)"/g)){if(!url.startsWith('./')&&!/^(https?:|data:)/.test(url))await access(join(stage,url));}
await rm(dist,{recursive:true,force:true});await rename(stage,dist);
console.log('Demo生产构建通过：HTML、JS、样式、场景、角色、团队数据与三个旧工具；运行时无需外网。');
