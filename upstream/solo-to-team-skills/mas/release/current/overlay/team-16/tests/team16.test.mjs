import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash, webcrypto} from 'node:crypto';
import * as builder from '../source/build.mjs';

const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const roster = JSON.parse(await read('./fixtures/roster-lock.json'));
const plain = x => JSON.parse(JSON.stringify(x));
const workflow = {dispatch:'seat-chief',produce:'seat-production',review:'seat-review',deliver:'seat-chief'};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function assertRoster(team) {
  assert.equal(team.roles.length,16);
  assert.equal(team.groups.length,6);
  assert.equal(team.groups.reduce((n,g)=>n+g.members.length,0),26);
  assert.deepEqual(plain(team.roles.map(r=>r.id)),roster.roles.map(r=>r.id));
  assert.deepEqual(plain(team.groups.map(({id,members})=>({id,members}))),roster.groups.map(({id,members})=>({id,members})));
  assert.deepEqual(plain(team.workflow),workflow);
}
async function context() {
  const ctx=vm.createContext({TextEncoder,TextDecoder,Blob,Uint8Array,DataView,crypto:webcrypto,atob,btoa,console});
  vm.runInContext(await read('../source/web/core.js'),ctx);
  vm.runInContext(await read('../source/web/focus-retention.js'),ctx);
  // Metadata-only test seam for unchanged 512px PNG/JPEG passthrough. This is NOT browser image decoding.
  const core=vm.runInContext('TeamDefinition',ctx);
  ctx.Image=class {
    set src(data){
      try{
        const mime=data.slice(5,data.indexOf(';')),raw=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));
        const {width,height}=core.inspectRaster(raw,mime);this.naturalWidth=width;this.naturalHeight=height;
        queueMicrotask(()=>this.onload?.());
      }catch(error){queueMicrotask(()=>this.onerror?.(error));}
    }
  };
  // Deliberately assert the missing public interface before inspecting generated code.
  assert.equal(typeof builder.presetScript,'function','build.mjs must export presetScript()');
  const code=await builder.presetScript();
  assert.equal(typeof code,'string');
  assert.equal(/<\/script/i.test(code),false);
  vm.runInContext(code,ctx);
  vm.runInContext(await read('../source/web/role-mentions.js'),ctx);
  return ctx;
}

test('public preset provides the locked 16 roles / 6 groups / 26 memberships in zh and en',async()=>{
  const ctx=await context();
  for(const lang of ['zh','en']){
    const team=vm.runInContext(`TeamPreset.initial('${lang}')`,ctx);
    assertRoster(team);
    ctx.value=team;
    assert.deepEqual(plain(vm.runInContext(`TeamDefinition.normalize(value,'${lang}')`,ctx)),plain(team));
  }
  assert.deepEqual(plain(vm.runInContext('TeamPreset.initial()',ctx)),plain(vm.runInContext("TeamPreset.initial('zh')",ctx)));
  assert.deepEqual(plain(vm.runInContext("TeamPreset.initial('other')",ctx)),plain(vm.runInContext("TeamPreset.initial('zh')",ctx)));
});

test('each initial() returns isolated nested data, including across locales',async()=>{
  const ctx=await context();
  const before=plain(vm.runInContext('TeamPreset.initial()',ctx));
  vm.runInContext("const first=TeamPreset.initial();first.name='Changed';first.roles[0].responsibility='Edited';first.groups[0].members.pop();first.workflow.dispatch='seat-review';",ctx);
  assert.deepEqual(plain(vm.runInContext('TeamPreset.initial()',ctx)),before);
  assertRoster(vm.runInContext("TeamPreset.initial('en')",ctx));
});

function uiHarness(ctx,lang) {
  const nodes=new Map(),events=new Map();
  class Element {
    constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.listeners=new Map();this.classList={toggle(){}};}
    set id(value){this._id=value;nodes.set(value,this);} get id(){return this._id;}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=[...children];}
    addEventListener(type,listener){this.listeners.set(type,listener);}
    setAttribute(key,value){this[key]=value;}
    emit(type){this.listeners.get(type)?.({target:this});}
    focus(){} select(){}
  }
  for(const id of ['team-name','team-id','status','lang','sidebar','editor','import','export','rules-export','document-file','import-banner','apply-import','cancel-import','pending-label','role-mentions','role-mentions-title','role-mentions-help','role-mentions-list']){const el=new Element();el.id=id;}
  const modes=['role','group','flow'].map(mode=>{const el=new Element('button');el.dataset.mode=mode;return el;});
  ctx.document={getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag),documentElement:{},querySelectorAll:selector=>selector.includes('data-mode')?modes:[],body:new Element('body')};
  ctx.location={hash:lang==='en'?'#en':'#zh'};
  ctx.window={addEventListener:(type,handler)=>events.set(type,handler)};
  let mounted;
  ctx.UnifiedHosts={mount(options){mounted=options;return {sync(){},availability(){},reset(){}};}};
  return {nodes,events,team:()=>mounted.getTeam()};
}

test('actual app boots both locales, selects dispatch, and language changes preserve edits',async()=>{
  for(const lang of ['zh','en']){
    const ctx=await context(),ui=uiHarness(ctx,lang);
    vm.runInContext(await read('../source/web/app.js'),ctx);
    assertRoster(ui.team());
    assert.equal(ui.nodes.get('item-name').value,ui.team().roles.find(r=>r.id===workflow.dispatch).name);
    ui.nodes.get('team-name').value='User team';ui.nodes.get('team-name').emit('input');
    ui.nodes.get('item-description').value='User responsibility';ui.nodes.get('item-description').emit('input');
    const before=plain(ui.team());
    ctx.location.hash=lang==='en'?'#zh':'#en';ui.events.get('hashchange')();
    assert.deepEqual(plain(ui.team()),before);
    assert.equal(ui.nodes.get('item-description').value,'User responsibility');
  }
});

async function zipEntries(blob) {
  const bytes=Buffer.from(await blob.arrayBuffer()),entries=new Map();let offset=0;
  while(bytes.readUInt32LE(offset)===0x04034b50){
    assert.equal(bytes.readUInt16LE(offset+8),0,'ZIP method must be STORE');
    const size=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28);
    const name=bytes.subarray(offset+30,offset+30+nameLength).toString('utf8'),start=offset+30+nameLength+extra;
    assert.ok(!entries.has(name));entries.set(name,bytes.subarray(start,start+size));offset=start+size;
  }
  assert.equal(bytes.readUInt32LE(offset),0x02014b50);
  assert.equal(bytes.readUInt32LE(bytes.length-22),0x06054b50);
  assert.equal(bytes.readUInt16LE(bytes.length-12),entries.size);
  return entries;
}

test('new full preset survives OpenMaus rooms, DSH ZIP, WorkBuddy ZIP and Grok plans',async()=>{
  const ctx=await context();
  const {scripts}=await builder.modulesInOrder();
  for(const name of ['adapters.js','rooms.js','template.js','zip-store.js','workbuddy.js','grok-plan.js','hosts.js']){
    let code=scripts.find(s=>s.name===name).code;
    if(name==='hosts.js')code=code.replace('return {mount};','return {mount,grokArchive};');
    vm.runInContext(code,ctx);
  }
  for(const lang of ['zh','en']){
    ctx.team=vm.runInContext(`TeamPreset.initial('${lang}')`,ctx);
    const maus=await vm.runInContext("NativeRoomExport.build(team,team.groups.map(g=>({id:g.id,responder:{kind:'mentions'}})))",ctx);
    const doc=JSON.parse(await maus.text());
    assert.equal(doc.package.agents.length,16);
    assert.deepEqual(doc.package.rooms.map(({key,members})=>({id:key,members})),roster.groups.map(({id,members})=>({id,members})));
    assert.ok(Buffer.byteLength(doc.package.team.brief)<=24000);assert.ok(maus.size<=4*1024*1024);
    for(const agent of doc.package.agents){assert.equal(agent.approval,'ask');assert.ok(Buffer.byteLength(agent.soul)<=24000);}
    const dsh=await zipEntries(await vm.runInContext('TeamBuilderAdapters.exportDeepSeekHarness(team)',ctx));
    assertRoster(JSON.parse(dsh.get('team.definition.json')));
    const refs='.dsh/skills/solo-to-team/references/';
    assert.equal(JSON.parse(dsh.get(refs+'roster.json')).rows.length,16);
    assert.deepEqual(JSON.parse(dsh.get(refs+'groups.json')).map(({id,members})=>({id,members})),roster.groups.map(({id,members})=>({id,members})));
    assert.equal([...dsh.keys()].filter(p=>p.startsWith(refs+'roles/')).length,16);
    const wb=await vm.runInContext('WorkBuddyExport.build(team)',ctx),wbEntries=await zipEntries(wb.blob);
    assert.equal(wb.manifest.members.length,16);
    assert.equal([...wbEntries.keys()].filter(p=>p.includes('/agents/')).length,16);
    const coordination=JSON.parse([...wbEntries.entries()].find(([p])=>p.endsWith('/references/coordination.json'))[1]);
    assert.equal(coordination.roster.length,16);assert.deepEqual(coordination.groups.map(({id,members})=>({id,members})),roster.groups.map(({id,members})=>({id,members})));
    const grok=plain(vm.runInContext("GrokPlan.rosterPlan(team,'team16-test')",ctx));
    assert.equal(grok.roles.length,16);assert.equal(grok.groups.length,6);
    assert.deepEqual(grok.groups.map(({key,members})=>({id:key,members})),roster.groups.map(({id,members})=>({id,members})));
    const grokEntries=await zipEntries(vm.runInContext("UnifiedHosts.grokArchive(team,'team16-test')",ctx));
    const packedPlan=JSON.parse(grokEntries.get('grok-plan.json'));
    for(const role of ctx.team.roles){
      const card=JSON.parse(grokEntries.get('roles/role-'+role.id+'.txt'));
      assert.deepEqual(card,packedPlan.roles.find(r=>r.key===role.id));
      assert.deepEqual(card.group_context,packedPlan.groups.filter(g=>g.members.includes(role.id)));
      for(const group of card.group_context)for(const ref of group.full_rules){
        assert.equal(ref.current_group_matches_template,true);
        assert.deepEqual(ref.anchors,['common',group.key]);
        for(const anchor of ref.anchors)assert.ok(grokEntries.get(ref.path).toString('utf8').includes('<a id="'+anchor+'"></a>'));
      }
    }
    for(const file of vm.runInContext('TeamPreset.ruleReferences()',ctx)){
      assert.equal(dsh.get(file.path).toString('utf8'),file.content);
      assert.equal(grokEntries.get(file.path).toString('utf8'),file.content);
      assert.equal([...wbEntries].find(([p])=>p.endsWith('/'+file.path))[1].toString('utf8'),file.content);
    }
  }
});

test('standalone build includes the same preset script and matching CSP hashes',async()=>{
  const ctx=await context();void ctx;
  const code=await builder.presetScript(),html=await builder.build();
  assert.ok(html.includes('<script>'+code+'</script>'));
  assert.ok(html.includes("'sha256-"+createHash('sha256').update(code).digest('base64')+"'"));
  assert.equal(/<script src=/.test(html),false);
  assert.equal(html.includes('从三席开始'),false);
  assert.equal(html.includes('Start with three seats'),false);
});

test('9 frozen files and eight documented candidate patches match their recorded hashes',async()=>{
  const manifest=JSON.parse(await read('./fixtures/frozen-modules.json'));
  for(const [path,expected] of Object.entries(manifest))assert.equal(sha(await readFile(new URL('../source/'+path,import.meta.url))),expected,path);
  assert.equal(Object.keys(manifest).length,9);
  const patches=JSON.parse(await read('./fixtures/known-patches.json'));
  assert.equal(Object.keys(patches).length,8);
  for(const [path,record] of Object.entries(patches)){
    assert.equal(Object.hasOwn(manifest,path),false);
    assert.notEqual(record.originalSHA256,record.candidateSHA256);
    assert.equal(sha(await readFile(new URL('../source/'+path,import.meta.url))),record.candidateSHA256,path);
  }
});
