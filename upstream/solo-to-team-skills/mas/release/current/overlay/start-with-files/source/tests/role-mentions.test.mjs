import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,mkdtemp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {webcrypto,createHash} from 'node:crypto';
import {presetScript} from '../../../team-16/source/build.mjs';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
async function runtime(lang='zh'){
 const ctx=vm.createContext({Blob,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,DOMException,AbortController,crypto:webcrypto,atob,btoa,console});
 const nodes=new Map(),events=new Map();
 class Element{
  constructor(){this.children=[];this.dataset={};this.listeners=new Map();this.value='';}
  set innerHTML(value){throw Error('Unsafe HTML rendering: '+value);}
  append(...xs){this.children.push(...xs);}replaceChildren(...xs){this.children=[...xs];}setAttribute(k,v){this[k]=v;}
  addEventListener(t,f){this.listeners.set(t,f);}querySelectorAll(){return [];}
  reset(){for(const id of ['task','criteria'])nodes.get(id).value='';nodes.get('authorized').checked=false;nodes.get('scope').value='receipt';}
  emit(t){return (this.listeners.get(t)||this['on'+t])?.({target:this,preventDefault(){}});}
 }
 for(const id of ['status','export','task','criteria','authorized','scope','cancel','draft-files','custom-team','default-team','file-list','scope-help','team-summary','team-info','total','lang','clear','brief','role-mentions','role-mentions-title','role-mentions-help','role-mentions-list'])nodes.set(id,new Element());
 nodes.get('scope').value='receipt';
 ctx.document={getElementById:id=>nodes.get(id),createElement:()=>new Element(),documentElement:{},querySelectorAll:()=>[]};
 ctx.location={hash:lang==='en'?'#en':'#zh'};ctx.window={addEventListener:(t,f)=>events.set(t,f)};
 vm.runInContext(await presetScript(),ctx);
 for(const p of ['../../../team-16/source/web/core.js','../../../team-16/source/web/adapters.js','../vendor/zip-store.js','../../../team-16/source/web/role-mentions.js','../project.js','../page.js'])vm.runInContext(await read(p),ctx);
 const text=e=>[e.textContent||'',...e.children.map(text)].join('\n');
 return {ctx,nodes,events,panel:()=>text(nodes.get('role-mentions-list')),async import(d){const raw=JSON.stringify(d);nodes.get('custom-team').files=[{size:Buffer.byteLength(raw),text:async()=>raw}];await nodes.get('custom-team').emit('change');}};
}
test('imported subsets show a persistent literal-name notice in zh/en; restoring or clearing removes it',async()=>{
 for(const lang of ['zh','en']){
  const u=await runtime(lang),d=plain(vm.runInContext("TeamPreset.initial('"+lang+"')",u.ctx));
  d.roles=d.roles.filter(r=>r.id!=='seat-intelligence');for(const g of d.groups)g.members=g.members.filter(id=>id!=='seat-intelligence');
  await u.import(d);assert.equal(u.nodes.get('role-mentions').hidden,false,'Imported subset must show the notice');
  assert.match(u.nodes.get('status').textContent,lang==='zh'?/上方有未选岗位提及提醒/:/notice above/);
  assert.match(u.panel(),lang==='zh'?/情报顾问/:/Intelligence Adviser/);
  u.ctx.location.hash=lang==='zh'?'#en':'#zh';u.events.get('hashchange')();assert.equal(u.nodes.get('role-mentions').hidden,false);
  u.nodes.get('default-team').emit('click');assert.equal(u.nodes.get('role-mentions').hidden,true);
  await u.import(d);u.nodes.get('clear').emit('click');assert.equal(u.nodes.get('role-mentions').hidden,true);
 }
});
test('the notice is advisory only and user labels render as text',async()=>{
 const u=await runtime(),d=plain(vm.runInContext('TeamPreset.initial()',u.ctx));
 d.roles=d.roles.filter(r=>r.id!=='seat-intelligence');for(const g of d.groups)g.members=g.members.filter(id=>id!=='seat-intelligence');
 d.roles.find(r=>r.id==='seat-intelligence-adviser').name='<img src=x onerror=alert(1)>顾问';await u.import(d);
 assert.equal(u.nodes.get('role-mentions').hidden,false);assert.match(u.panel(),/<img src=x onerror=alert\(1\)>顾问/);
 u.nodes.get('draft-files').files=[{name:'source.txt',size:4,arrayBuffer:async()=>new TextEncoder().encode('text').buffer}];u.nodes.get('draft-files').emit('change');
 u.nodes.get('task').value='Prepare a summary';u.nodes.get('criteria').value='Keep the source';u.nodes.get('authorized').checked=true;u.nodes.get('authorized').emit('input');
 assert.equal(u.nodes.get('export').disabled,false,'The notice must not add a confirmation gate');
 assert.equal(u.nodes.get('role-mentions').hidden,false);
});
test('real built intake contains seven scripts, shared advisory bytes, matching CSP and visible placement outside details',async()=>{
 const out=join(await mkdtemp(join(tmpdir(),'mas-mention-intake-')),'index.html');
 execFileSync(process.execPath,['build.mjs',out],{cwd:fileURLToPath(new URL('../',import.meta.url))});
 const html=await readFile(out,'utf8'),code=await read('../../../team-16/source/web/role-mentions.js');
 assert.ok(html.includes('<script>'+code+'</script>'),'Shared module must be embedded by the real build');
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);assert.equal(scripts.length,7);
 for(const script of scripts)assert.ok(html.includes("'sha256-"+createHash('sha256').update(script).digest('base64')+"'"));
 const details=html.indexOf('<details class="team-opt"'),end=html.indexOf('</details>',details),notice=html.indexOf('id="role-mentions"'),button=html.indexOf('id="export"');
 assert.ok(notice>end && notice<button,'Notice must be outside collapsed team details and before Build');
});

test('team-selection status and advisory switch languages together after subset import',async()=>{
 const u=await runtime(),d=plain(vm.runInContext('TeamPreset.initial()',u.ctx));
 d.roles=d.roles.filter(r=>r.id!=='seat-intelligence');for(const g of d.groups)g.members=g.members.filter(id=>id!=='seat-intelligence');
 await u.import(d);assert.match(u.nodes.get('status').textContent,/上方有未选岗位提及提醒/);
 u.ctx.location.hash='#en';u.events.get('hashchange')();
 assert.match(u.nodes.get('role-mentions-title').textContent,/unselected roles/);
 assert.equal(u.nodes.get('status').textContent,'Custom team selected. Check the unselected-role notice above.');
 u.ctx.location.hash='#zh';u.events.get('hashchange')();assert.match(u.nodes.get('status').textContent,/已选用自定义团队。 上方有未选岗位提及提醒/);
});

test('a later error survives language changes instead of becoming a team-selection success',async()=>{
 const u=await runtime(),d=plain(vm.runInContext('TeamPreset.initial()',u.ctx));
 d.roles=d.roles.filter(r=>r.id!=='seat-intelligence');for(const g of d.groups)g.members=g.members.filter(id=>id!=='seat-intelligence');
 await u.import(d);
 u.nodes.get('draft-files').files=[{name:'blocked.exe',size:4}];u.nodes.get('draft-files').emit('change');
 const error=u.nodes.get('status').textContent;assert.equal(u.nodes.get('status').dataset.fault,'true');
 u.ctx.location.hash='#en';u.events.get('hashchange')();
 assert.equal(u.nodes.get('status').textContent,error);assert.equal(u.nodes.get('status').dataset.fault,'true');
 assert.doesNotMatch(u.nodes.get('status').textContent,/Custom team selected/);
});

test('active build progress is not replaced when the interface language changes',async()=>{
 const u=await runtime(),d=plain(vm.runInContext('TeamPreset.initial()',u.ctx));
 d.roles=d.roles.filter(r=>r.id!=='seat-intelligence');for(const g of d.groups)g.members=g.members.filter(id=>id!=='seat-intelligence');
 await u.import(d);
 u.nodes.get('draft-files').files=[{name:'source.txt',size:4}];u.nodes.get('draft-files').emit('change');
 u.nodes.get('task').value='Prepare a summary';u.nodes.get('criteria').value='Keep the source';u.nodes.get('authorized').checked=true;u.nodes.get('authorized').emit('input');
 let finish;u.ctx.buildGate=new Promise(resolve=>{finish=resolve;});
 // Hold only the generator boundary. This exercises real page status handling without a business export.
 vm.runInContext('DraftProject.generate=options=>{options.progress(1,1);return buildGate;}',u.ctx);
 const pending=u.nodes.get('brief').emit('submit');const progress=u.nodes.get('status').textContent;assert.match(progress,/正在核读原件/);
 u.ctx.location.hash='#en';u.events.get('hashchange')();assert.equal(u.nodes.get('status').textContent,progress);
 u.nodes.get('cancel').emit('click');finish(new Blob());await pending;
 assert.match(u.nodes.get('status').textContent,/Build cancelled/);
});

