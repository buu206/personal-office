import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash,webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const source=new URL('../',import.meta.url);
const evidence=process.env.MAS_UPDATE_TEST_OUTPUT||await mkdtemp(join(tmpdir(),'mas-update-body-'));
await mkdir(evidence,{recursive:true});
execFileSync(process.execPath,['build.mjs',join(evidence,'index.html')],{cwd:fileURLToPath(source)});
const html=await readFile(join(evidence,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,3);
const copy=x=>JSON.parse(JSON.stringify(x));
const duty='\n    if ready:\r\n\tprint("Cafe\u0301")  \n';
const purpose='    Preserve this group block\r\n\tCafe\u0301\n\n';

// Only DOM/file/download interfaces are substituted. All three scripts, including
// actual app import, decision and download callbacks, come from the built HTML.
function runtime(lang='zh'){
 const nodes=new Map(),downloads=[];let blob;
 class Element{
  constructor(tag=''){this.tag=tag;this.children=[];this.dataset={};this.value='';}
  set innerHTML(v){throw Error('Unexpected HTML rendering: '+v);}
  append(...xs){this.children.push(...xs);}replaceChildren(...xs){this.children=[...xs];}
  setAttribute(k,v){this[k]=v;}removeAttribute(k){delete this[k];}remove(){}
  click(){if(this.tag==='a')downloads.push({name:this.download,blob});}
  emit(type){return this['on'+type]?.({target:this,preventDefault(){}});}
 }
 for(const id of ['base','mine','next','base-note','mine-note','next-note','status','compare','clear','review','decisions','unchanged','download','overview','retained','retained-title','lang'])nodes.set(id,new Element());
 const ctx=vm.createContext({Blob,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,crypto:webcrypto,atob,btoa,
  document:{getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag),body:new Element('body'),documentElement:{},querySelectorAll:()=>[]},
  location:{hash:lang==='en'?'#en':'#zh'},window:{addEventListener(){}},setTimeout:()=>0,
  URL:{createObjectURL:value=>{blob=value;return 'blob:test';},revokeObjectURL(){}}});
 for(const script of scripts)vm.runInContext(script,ctx);
 const api=vm.runInContext('({initial:TeamDefinition.initial,read:TeamUpdate.read,compare:TeamUpdate.compare,resolve:TeamUpdate.resolve})',ctx);
 const walk=e=>[e,...e.children.flatMap(walk)];
 return {api,nodes,downloads,async load(slot,data){
  const raw=JSON.stringify(data);nodes.get(slot).files=[{name:slot+'.team.json',size:Buffer.byteLength(raw),text:async()=>raw}];nodes.get(slot).emit('change');
  // The app starts an async file read without returning its promise from onchange.
  await new Promise(resolve=>setImmediate(resolve));
 },async compare(base,mine,next){for(const [slot,data] of [['base',base],['mine',mine],['next',next]])await this.load(slot,data);assert.equal(nodes.get('compare').disabled,false);nodes.get('compare').emit('click');},
 choose(key,side){const select=walk(nodes.get('decisions')).find(n=>n.dataset.choice===key);assert.ok(select,'Missing actual UI choice: '+key);select.value=side;select.emit('change');},
 async download(label){assert.equal(nodes.get('download').disabled,false,nodes.get('status').textContent);await nodes.get('download').emit('click');const latest=downloads.at(-1);assert.ok(latest);const raw=await latest.blob.text();if(label)await writeFile(join(evidence,label+'.team.json'),raw);return JSON.parse(raw);}};
}
function baseFixture(ui){return copy(ui.api.initial());}
const fieldRow=(plan,key)=>plan.rows.find(r=>r.key===key);

test('actual built updater keeps unchanged bodies through import, compare and download',async()=>{
 const ui=runtime(),team=baseFixture(ui);team.roles[0].responsibility=duty;team.groups[0].purpose=purpose;
 await writeFile(join(evidence,'unchanged-input.team.json'),JSON.stringify(team,null,2)+'\n');
 await ui.compare(team,team,team);const output=await ui.download('unchanged-actual');
 assert.deepEqual(output,team);
});

test('local formatting-only changes remain local changes and survive download',async()=>{
 const ui=runtime(),base=baseFixture(ui);base.roles[0].responsibility='Exact code';base.groups[0].purpose='Exact group';
 const mine=copy(base);mine.roles[0].responsibility='    Exact code\r\n';mine.groups[0].purpose='\n    Exact group\n';
 const snapshot=JSON.stringify([base,mine]);await ui.compare(base,mine,base);
 const output=await ui.download('local-actual');assert.equal(output.roles[0].responsibility,mine.roles[0].responsibility);assert.equal(output.groups[0].purpose,mine.groups[0].purpose);
 assert.equal(fieldRow(ui.api.compare(base,mine,base),'roles/lead/responsibility')?.state,'mine');
 assert.equal(JSON.stringify([base,mine]),snapshot);
});

test('upstream formatting-only changes require a choice and preserve the selected text',async()=>{
 const ui=runtime(),base=baseFixture(ui);base.roles[0].responsibility='Exact code';base.groups[0].purpose='Exact group';
 const next=copy(base);next.roles[0].responsibility='    Exact code\r\n';next.groups[0].purpose='\n    Exact group\n';
 await ui.compare(base,base,next);assert.equal(ui.nodes.get('download').disabled,true);
 ui.choose('roles/lead/responsibility','next');ui.choose('groups/delivery/purpose','next');
 const output=await ui.download('upstream-actual');assert.equal(output.roles[0].responsibility,next.roles[0].responsibility);assert.equal(output.groups[0].purpose,next.groups[0].purpose);
});

test('conflicting body choices keep exactly the selected side in both languages',async()=>{
 for(const lang of ['zh','en']){
  const ui=runtime(lang),base=baseFixture(ui),mine=copy(base),next=copy(base);
  mine.roles[0].responsibility=duty;mine.groups[0].purpose=purpose;
  next.roles[0].responsibility='\n    upstream Cafe\u0301\r\n';next.groups[0].purpose='\tupstream group\r\n\n';
  await ui.compare(base,mine,next);assert.equal(ui.nodes.get('download').disabled,true);
  for(const side of ['mine','next']){
   ui.choose('roles/lead/responsibility',side);ui.choose('groups/delivery/purpose',side);
   const output=await ui.download('conflict-'+lang+'-'+side),wanted=side==='mine'?mine:next;
   assert.equal(output.roles[0].responsibility,wanted.roles[0].responsibility);assert.equal(output.groups[0].purpose,wanted.groups[0].purpose);
  }
 }
});

test('adding or deleting a referenced role still requires a valid combined choice',async()=>{
 const ui=runtime(),base=baseFixture(ui),next=copy(base);
 next.roles.push({id:'helper',name:'Helper',responsibility:duty,avatar:null});next.groups[0].members.push('helper');
 await ui.compare(base,base,next);ui.choose('roles/helper','mine');ui.choose('groups/delivery/members','next');
 assert.equal(ui.nodes.get('download').disabled,true);assert.match(ui.nodes.get('status').textContent,/helper/);
 ui.choose('roles/helper','next');const added=await ui.download('added-actual');assert.deepEqual(added,next);
 const removed=copy(added);removed.roles=removed.roles.filter(r=>r.id!=='helper');removed.groups[0].members=removed.groups[0].members.filter(id=>id!=='helper');
 await ui.compare(added,added,removed);ui.choose('roles/helper','next');ui.choose('groups/delivery/members','mine');
 assert.equal(ui.nodes.get('download').disabled,true);assert.match(ui.nodes.get('status').textContent,/helper/);
 ui.choose('groups/delivery/members','next');assert.deepEqual(await ui.download('removed-actual'),removed);
});

test('workflow combination cannot assign production and independent review to one role',async()=>{
 const ui=runtime(),base=baseFixture(ui),next=copy(base);next.workflow.produce='reviewer';next.workflow.review='producer';
 await ui.compare(base,base,next);ui.choose('workflow/produce','next');ui.choose('workflow/review','mine');
 assert.equal(ui.nodes.get('download').disabled,true);assert.match(ui.nodes.get('status').textContent,/workflow\/produce \+ workflow\/review/);
 ui.choose('workflow/review','next');assert.deepEqual(await ui.download('workflow-actual'),next);
});

test('invalid or whitespace-only bodies still block input and download in both languages',async()=>{
 for(const lang of ['zh','en'])for(const field of ['responsibility','purpose'])for(const value of ['', ' \r\n\t ', null, 0]){
  const ui=runtime(lang),team=baseFixture(ui);if(field==='responsibility')team.roles[0][field]=value;else team.groups[0][field]=value;
  await ui.load('base',team);assert.equal(ui.nodes.get('compare').disabled,true);assert.equal(ui.nodes.get('download').disabled,true);assert.equal(ui.nodes.get('base-note').dataset.fault,'true');
 }
});

test('actual build embeds the shared core and matching CSP; historical core stays historical',async()=>{
 const core=await readFile(new URL('../../team-16/source/web/core.js',source),'utf8');
 assert.ok(scripts[0]===core.replaceAll('\r\n','\n'),'Built updater must embed the shared core bytes');
 const csp=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
 for(const script of scripts)assert.ok(csp.includes("'sha256-"+createHash('sha256').update(script).digest('base64')+"'"));
 const old=await readFile(new URL('core.js',source));assert.equal(createHash('sha256').update(old).digest('hex'),'7c9d067165ad9fdc6f1e80d90a20fb6d68102d074f8fe6217fe48e2a74d2d58f');
});
