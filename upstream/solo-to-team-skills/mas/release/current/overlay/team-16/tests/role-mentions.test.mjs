import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto,createHash} from 'node:crypto';
import {presetScript,build} from '../source/build.mjs';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
const templates=await Promise.all(['zh','en'].map(async lang=>JSON.parse(await read('../source/presets/team.'+lang+'.json'))));
function subset(lang=0){const d=plain(templates[lang]);d.roles=d.roles.filter(r=>r.id!=='seat-intelligence');for(const g of d.groups)g.members=g.members.filter(id=>id!=='seat-intelligence');return d;}
async function context(){
 const ctx=vm.createContext({TextEncoder,TextDecoder,Blob,Uint8Array,DataView,crypto:webcrypto,atob,btoa,console});
 vm.runInContext(await read('../source/web/core.js'),ctx);
  vm.runInContext(await read('../source/web/focus-retention.js'),ctx);
 vm.runInContext(await presetScript(),ctx);
 try{vm.runInContext(await read('../source/web/role-mentions.js'),ctx);}catch(e){if(e.code!=='ENOENT')throw e;}
 return ctx;
}
function api(ctx){assert.equal(vm.runInContext('typeof RoleMentions',ctx),'object','The role-mention advisory API must exist');return vm.runInContext('RoleMentions',ctx);}
function harness(ctx,lang='zh'){
 const nodes=new Map(),events=new Map();let mount;
 class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.listeners=new Map();this.classList={toggle(){}};}
  set id(v){this._id=v;nodes.set(v,this);}get id(){return this._id;}
  set innerHTML(v){throw Error('User strings must never be rendered as HTML: '+v);}
  append(...xs){this.children.push(...xs);}replaceChildren(...xs){this.children=[...xs];}
  addEventListener(t,f){this.listeners.set(t,f);}setAttribute(k,v){this[k]=v;}
  emit(t){return this.listeners.get(t)?.({target:this});}focus(){}select(){}
 }
 for(const id of ['team-name','team-id','status','lang','sidebar','editor','import','export','rules-export','document-file','import-banner','apply-import','cancel-import','pending-label','role-mentions','role-mentions-title','role-mentions-help','role-mentions-list']){const e=new Element();e.id=id;}
 const modes=['role','group','flow'].map(mode=>{const e=new Element('button');e.dataset.mode=mode;return e;});
 ctx.document={getElementById:id=>nodes.get(id),createElement:t=>new Element(t),documentElement:{},body:new Element('body'),querySelectorAll:s=>s.includes('data-mode')?modes:[]};
 ctx.location={hash:lang==='en'?'#en':'#zh'};ctx.window={addEventListener:(t,f)=>events.set(t,f)};
 ctx.UnifiedHosts={mount(o){mount=o;return {sync(){},reset(){},availability(){}};}};
 function select(kind,id){modes.find(m=>m.dataset.mode===kind).emit('click');const button=nodes.get('sidebar').children.find(e=>e.dataset.key===id);assert.ok(button,id);button.emit('click');}
 const text=e=>[e.textContent||'',...e.children.map(text)].join('\n');
 return {nodes,events,team:()=>plain(mount.getTeam()),select,remove(id){select('role',id);nodes.get('delete-item').emit('click');},panel:()=>text(nodes.get('role-mentions-list')),change(id,value){nodes.get(id).value=value;nodes.get(id).emit('input');},async import(d){const raw=JSON.stringify(d);nodes.get('document-file').files=[{name:'subset.json',size:Buffer.byteLength(raw),text:async()=>raw}];nodes.get('document-file').emit('change');await new Promise(setImmediate);if(nodes.get('import-banner').hidden===false)nodes.get('apply-import').emit('click');}};
}

test('missing Intelligence Officer is identified only as literal mentions in retained roles and groups, both languages',async()=>{
 const ctx=await context(),a=api(ctx),catalog=a.createCatalog(templates);
 for(let lang=0;lang<2;lang++){
  const d=subset(lang),before=JSON.stringify(d),rows=plain(a.find(d,catalog));
  assert.ok(rows.some(r=>r.kind==='role'&&r.id==='seat-intelligence-adviser'&&r.mentions.some(m=>m.roleId==='seat-intelligence')));
  assert.ok(rows.some(r=>r.kind==='group'&&r.id==='group-advisers'&&r.mentions.some(m=>m.roleId==='seat-intelligence')));
  assert.equal(JSON.stringify(d),before);
  assert.ok(rows.every(r=>r.mentions.every(m=>m.roleId==='seat-intelligence')));
 }
 assert.equal(plain(a.find(templates[0],catalog)).length,0);assert.equal(plain(a.find(templates[1],catalog)).length,0);
});

test('stable ID, custom same-name roles, cleared prose and fresh inputs recompute without hidden state',async()=>{
 const ctx=await context(),a=api(ctx),catalog=a.createCatalog(templates),catBefore=JSON.stringify(catalog);
 const renamed=plain(templates[0]);renamed.roles.find(r=>r.id==='seat-intelligence').name='My research role';
 assert.equal(a.find(renamed,catalog).length,0,'Stable ID survives renaming');
 const d=subset(),custom=plain(templates[0].roles.find(r=>r.id==='seat-intelligence'));custom.id='custom-research';custom.name='Intelligence Officer';d.roles.push(custom);
 assert.equal(a.find(d,catalog).length,0,'A current bilingual same-name role satisfies the name reference');
 const cleared=subset();for(const r of cleared.roles)r.responsibility='Current duties';for(const g of cleared.groups)g.purpose='Current collaboration';
 assert.equal(a.find(cleared,catalog).length,0);assert.ok(a.find(subset(),catalog).length>0);assert.equal(a.find(templates[0],catalog).length,0);
 assert.equal(JSON.stringify(catalog),catBefore);
});

test('actual app keeps a persistent advisory across unrelated edits and locale changes, and undo clears it',async()=>{
 const ctx=await context(),ui=harness(ctx);
 vm.runInContext(await read('../source/web/app.js'),ctx);
 assert.equal(ui.nodes.get('role-mentions').hidden,true,'The complete template has no missing-name advisory');
 ui.remove('seat-intelligence');
 assert.equal(ui.nodes.get('role-mentions').hidden,false,'Removing a commissioning officer must expose the advisory');
 assert.match(ui.panel(),/情报顾问/);assert.match(ui.panel(),/情报官/);assert.match(ui.panel(),/顾问团/);
 assert.match(ui.nodes.get('status').textContent,/上方/);assert.doesNotMatch(ui.panel(),/\[seat-/);
 ui.change('team-name','Edited team');assert.equal(ui.nodes.get('role-mentions').hidden,false);
 ctx.location.hash='#en';ui.events.get('hashchange')();assert.equal(ui.nodes.get('role-mentions').hidden,false);assert.match(ui.nodes.get('role-mentions-help').textContent,/literal/i);
 // A fresh deletion has undo state; generic edits intentionally clear the existing app undo.
 const second=await context(),v=harness(second);vm.runInContext(await read('../source/web/app.js'),second);
 v.remove('seat-intelligence');v.nodes.get('undo-delete').emit('click');assert.equal(v.nodes.get('role-mentions').hidden,true);
});

test('actual app import, core-three subset, prose edits and HTML-like names render safely without changing data',async()=>{
 const ctx=await context(),ui=harness(ctx);vm.runInContext(await read('../source/web/app.js'),ctx);
 const d=subset();for(const r of d.roles)r.avatar=null;
 d.roles.find(r=>r.id==='seat-intelligence-adviser').name='<img src=x onerror=alert(1)>情报顾问 & test';
 await ui.import(d);assert.equal(ui.nodes.get('role-mentions').hidden,false);assert.match(ui.panel(),/<img src=x onerror=alert\(1\)>情报顾问 & test/);assert.deepEqual(ui.team(),d);
 assert.match(ui.nodes.get('status').textContent,/上方有未选岗位提及提醒/);
 for(const r of ui.team().roles){ui.select('role',r.id);ui.change('item-description','Current duties');}
 for(const g of ui.team().groups){ui.select('group',g.id);ui.change('item-description','Current collaboration');}
 assert.equal(ui.nodes.get('role-mentions').hidden,true,'Editing the actual prose removes old mentions');
 const core=plain(templates[0]);core.roles=core.roles.filter(r=>['seat-chief','seat-production','seat-review'].includes(r.id));for(const r of core.roles)r.avatar=null;for(const g of core.groups)g.members=g.members.filter(id=>core.roles.some(r=>r.id===id));
 await ui.import(core);assert.equal(ui.nodes.get('role-mentions').hidden,false);assert.match(ui.panel(),/生活官/);assert.match(ui.panel(),/内务部/);assert.deepEqual(ui.team(),core);
});

test('English import and custom same-name insertion clear only the matched advisory',async()=>{
 const ctx=await context(),ui=harness(ctx,'en');vm.runInContext(await read('../source/web/app.js'),ctx);
 const d=subset(1);for(const r of d.roles)r.avatar=null;await ui.import(d);
 assert.equal(ui.nodes.get('role-mentions').hidden,false);assert.match(ui.panel(),/Intelligence Officer/);
 const custom=plain(templates[1].roles.find(r=>r.id==='seat-intelligence'));custom.id='custom-officer';custom.avatar=null;d.roles.push(custom);
 await ui.import(d);assert.equal(ui.nodes.get('role-mentions').hidden,true);assert.deepEqual(ui.team(),d);
});

test('standalone output embeds the advisory module and CSP covers its actual bytes',async()=>{
 const html=await build();
 assert.match(html,/<section[^>]+id="role-mentions"/);
 const code=await read('../source/web/role-mentions.js');
 assert.ok(html.includes('<script>'+code+'</script>'));
 assert.ok(html.includes("'sha256-"+createHash('sha256').update(code).digest('base64')+"'"));
 assert.ok(html.indexOf('id="role-mentions"')<html.indexOf('id="host-panel"'));
});

test('role deletion reports the actual affected groups in both languages and undo restores them',async()=>{
 for(const lang of ['zh','en']){
  const ctx=await context(),ui=harness(ctx,lang);vm.runInContext(await read('../source/web/app.js'),ctx);
  const before=ui.team(),affected=before.groups.filter(g=>g.members.includes('seat-intelligence'));
  assert.equal(affected.length,2);
  ui.remove('seat-intelligence');
  const message=ui.nodes.get('status').textContent;
  assert.match(message,lang==='zh'?/退出 2 个群/:/removed from 2 groups/i);
  for(const group of affected)assert.ok(message.includes(group.name));
  assert.ok(ui.team().groups.every(g=>!g.members.includes('seat-intelligence')));
  assert.equal(ui.nodes.get('role-mentions').hidden,false,'Existing handoff advisory stays visible');
  ui.nodes.get('undo-delete').emit('click');assert.deepEqual(ui.team(),before);
  ui.remove('seat-chief');assert.deepEqual(ui.team(),before,'A bound workflow role remains protected');
  ui.remove('seat-inspection');
  assert.doesNotMatch(ui.nodes.get('status').textContent,lang==='zh'?/退出 \d+ 个群/:/removed from \d+ groups/i,'A role outside groups has no group-removal claim');
 }
});

