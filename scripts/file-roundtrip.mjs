// 验收辅助：使用与页面相同的规范化、序列化与导入函数。
// 不声称浏览器未保存草稿能够恢复。只操作调用方给出的临时文件。
import {readFile, writeFile, link, unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const core=createRequire(import.meta.url)('../upstream/solo-to-team-skills/mas/release/current/overlay/team-16/source/web/core.js');
const [action,path,nonce]=process.argv.slice(2);
try {
  if (!path || !['save','load'].includes(action)) throw Error('Usage: file-roundtrip.mjs save|load path [nonce]');
  if (action==='save') {
    if (!nonce || !/^rc-[a-zA-Z0-9-]+$/.test(nonce)) throw Error('Invalid check marker');
    const input=JSON.parse(await readFile(new URL('../upstream/solo-to-team-skills/mas/release/current/overlay/team-16/source/presets/team.zh.json',import.meta.url),'utf8'));
    input.name=nonce;
    const team=core.normalize(input,'zh');
    const temp=path+'.'+randomUUID()+'.tmp';
    try {
      await writeFile(temp,JSON.stringify(team,null,2)+'\n',{flag:'wx',mode:0o600});
      await link(temp,path); // 原子发布，已有文件不覆盖。
    } finally {await unlink(temp).catch(()=>{});}
  } else {
    const data=await readFile(path);
    if(data.length>core.maxDocument) throw Error('File too large');
    const team=core.importDefinition(JSON.parse(data.toString('utf8')),'zh').team;
    process.stdout.write(team.name+'\n');
  }
} catch(error) {console.error(error.message); process.exitCode=1;}
