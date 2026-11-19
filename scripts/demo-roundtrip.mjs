import {readFile,writeFile} from 'node:fs/promises';
import {createState,createProject,tick,serialize,restore,activeProject,setDraft} from '../frontend/state.mjs';
const [action,path,nonce]=process.argv.slice(2);
try{
 if(!path||!['save','load'].includes(action))throw Error('Expected save|load path [marker]');
 if(action==='save'){
  if(!nonce||!/^rc-[a-zA-Z0-9-]+$/.test(nonce))throw Error('Invalid marker');
  let state=tick(createProject(createState(),nonce),36);state=setDraft(state,'恢复验证草稿');
  await writeFile(path,serialize(state),{flag:'wx',mode:0o600});
 }else{
  const state=restore(await readFile(path,'utf8')),project=activeProject(state);
  if(project.progress!==36||project.status!=='paused'||state.draft!=='恢复验证草稿'||state.team.roles.length!==5)throw Error('State restore mismatch');
  process.stdout.write(project.title+'\n');
 }
}catch(error){console.error(error.message);process.exitCode=1;}
