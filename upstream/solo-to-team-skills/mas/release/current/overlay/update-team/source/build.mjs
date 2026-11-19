import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const read=async name=>(await readFile(new URL(name,root),'utf8')).replaceAll('\r\n','\n');
const hash=s=>"'sha256-"+createHash('sha256').update(s).digest('base64')+"'";
const html=await read('index.html'),css=await read('update.css');
const tags=/<script src="([a-z0-9./-]+\.js)"><\/script>/g;
const paths=[...html.matchAll(tags)].map(m=>m[1]);
const expected=['../../team-16/source/web/core.js','merge.js','app.js'];
if(paths.length!==expected.length||paths.some((p,i)=>p!==expected[i]))throw Error('Expected the shared team-16 core, merge.js and app.js.');
const scripts=await Promise.all(paths.map(read));if(scripts.some(s=>/<\/script/i.test(s)))throw Error('Unexpected script content.');
let i=0;const result=html.replace(tags,()=>'<script>'+scripts[i++]+'</script>').replace('<link rel="stylesheet" href="update.css">',()=>'<style>'+css+'</style>').replace("script-src 'self'","script-src "+scripts.map(hash).join(' ')).replace("style-src 'self'","style-src "+hash(css));
const output=process.argv[2]||'更新我的团队.html',bytes=Buffer.from(result);try{await writeFile(output,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||!(await readFile(output)).equals(bytes))throw e;}
console.log(createHash('sha256').update(bytes).digest('hex'),output);
