import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { presetScript } from '../../team-16/source/build.mjs';
const base=new URL('./',import.meta.url);
const read=async name=>(await readFile(new URL(name,base),'utf8')).replaceAll('\r\n','\n');
const hash=code=>"'sha256-"+createHash('sha256').update(code).digest('base64')+"'";
const html=await read('index.html'),css=await read('page.css');
const rx=/<script src="([a-z0-9./-]+\.js)"><\/script>/g;
const codes=await Promise.all([...html.matchAll(rx)].map(m=>m[1]==='team-preset.js'?presetScript():read(m[1])));
if(codes.length!==7||codes.some(x=>/<\/script/i.test(x)))throw Error('Changed module layout.');
let i=0;const output=html.replace(rx,()=>'<script>'+codes[i++]+'</script>').replace('<link rel="stylesheet" href="page.css">',()=>'<style>'+css+'</style>')
.replace("script-src 'self'",'script-src '+codes.map(hash).join(' ')).replace("style-src 'self'",'style-src '+hash(css));
const target=process.argv[2]||'带底稿开工.html';const bytes=Buffer.from(output);
try{await writeFile(target,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||!(await readFile(target)).equals(bytes))throw e;}
console.log(createHash('sha256').update(bytes).digest('hex'),target);
