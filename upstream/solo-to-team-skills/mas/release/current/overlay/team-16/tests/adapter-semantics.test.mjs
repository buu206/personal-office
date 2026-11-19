import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {modulesInOrder} from '../source/build.mjs';
const read=name=>readFile(new URL(name,import.meta.url),'utf8');
const roster=JSON.parse(await read('./fixtures/roster-lock.json'));
const referenceFiles=[
 {path:'references/template-rules/README.md',content:'Default-template references only. Current edited records remain authoritative; no automatic loading.'},
 {path:'references/template-rules/groups.zh.md',content:'# Test fixture full rules in Chinese\n'+['common',...roster.groups.map(g=>g.id)].map(id=>'<a id="'+id+'"></a>').join('\n')},
 {path:'references/template-rules/groups.en.md',content:'# Test fixture full rules in English\n'+['common',...roster.groups.map(g=>g.id)].map(id=>'<a id="'+id+'"></a>').join('\n')}
];
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const contracts={
  'seat-review-assistant':'Accept routine work only from the Review Officer and return findings to that officer.',
  'seat-intelligence-adviser':'Accept routine work only from the Intelligence Officer and return findings to that officer.',
  'seat-analysis-specialist':'Accept private consultations directly from the user. Do not forward private content to the chief without the user requesting that topic.',
  'seat-inspection':'In a material dispute involving the chief, report directly to the user and notify the chief as specified by this role.'
 };
 return {format:'solo-to-team.definition',version:'1.0.0',id:'semantics-fixture',name:'Semantics fixture',
  roles:roster.roles.map(r=>({...r,responsibility:contracts[r.id]||'Work within this role and the verified task request.',avatar:null})),
  groups:roster.groups.map(g=>({...g,purpose:'Activate registered handoffs only. Verify original user authorization and preserve privacy.',members:[...g.members]})),
  workflow:{dispatch:'seat-chief',produce:'seat-production',review:'seat-review',deliver:'seat-chief'}};
}
async function context(withRules=true){
 const ctx=vm.createContext({TextEncoder,TextDecoder,Blob,Uint8Array,DataView,crypto:webcrypto,atob,btoa});
 const {scripts}=await modulesInOrder();
 for(const name of ['core.js','adapters.js','rooms.js','template.js','zip-store.js','workbuddy.js','grok-plan.js','hosts.js']){
  let code=scripts.find(s=>s.name===name).code;
  if(name==='hosts.js')code=code.replace('return {mount};','return {mount,grokArchive};');
  vm.runInContext(code,ctx);
 }
 if(withRules)ctx.TeamPreset={ruleReferences:()=>referenceFiles.map(f=>({...f})),initial:()=>fixture()};
 ctx.team=fixture();return ctx;
}
async function unzip(blob){
 const b=Buffer.from(await blob.arrayBuffer()),entries=new Map();let at=0;
 while(b.readUInt32LE(at)===0x04034b50){
  assert.equal(b.readUInt16LE(at+8),0);
  const size=b.readUInt32LE(at+18),nameLen=b.readUInt16LE(at+26),extra=b.readUInt16LE(at+28);
  const name=b.subarray(at+30,at+30+nameLen).toString('utf8'),start=at+30+nameLen+extra;
  assert.ok(!entries.has(name));entries.set(name,b.subarray(start,start+size).toString('utf8'));at=start+size;
 }
 assert.equal(b.readUInt32LE(at),0x02014b50);
 assert.equal(b.readUInt16LE(b.length-12),entries.size);
 return entries;
}
test('OpenMaus preserves specialist commissioning and direct-user exits instead of forcing dispatch',async()=>{
 const ctx=await context();
 const doc=JSON.parse(await vm.runInContext('TeamBuilderAdapters.exportOpenMausBot(team)',ctx).text());
 for(const id of ['seat-review-assistant','seat-intelligence-adviser','seat-analysis-specialist','seat-inspection']){
  const soul=doc.package.agents.find(r=>r.key===id).soul,role=ctx.team.roles.find(r=>r.id===id);
  assert.doesNotMatch(soul,/经派工席明确委托的工作/u,'An added dispatch-only rule contradicts this specialist card.');
  assert.ok(soul.includes(role.responsibility),'The original responsibility must remain in the export.');
  assert.match(soul,/岗位卡规定的委托入口/u);
  assert.match(soul,/不扩大/u);
 }
 assert.match(doc.package.team.brief,/四阶段.*仅适用于/u);
 assert.equal(doc.package.team.leader,'seat-chief');
});
test('WorkBuddy keeps business origin and private/direct exits distinct from lead transport',async()=>{
 const ctx=await context(),result=await vm.runInContext('WorkBuddyExport.build(team)',ctx),files=await unzip(result.blob);
 for(const id of ['seat-review-assistant','seat-intelligence-adviser','seat-analysis-specialist','seat-inspection']){
  const hostId=result.map.hostIds[id],card=[...files].find(([p])=>p.endsWith('/agents/'+hostId+'.md'))[1];
  assert.doesNotMatch(card,/Accept only a task from the lead\./);
  assert.match(card,/transport.*not.*commissioning authority/is);
  assert.match(card,/verifiable original request/i);
  assert.match(card,/original.*return.*recipient/is);
  assert.match(card,/do not relay private content/i);
  const assignment=JSON.parse(card.split('Project assignment (JSON data):\n')[1].trim());
  assert.equal(assignment.responsibility,ctx.team.roles.find(r=>r.id===id).responsibility);
 }
 const lead=[...files].find(([p])=>p.endsWith('/agents/'+result.map.hostIds['seat-chief']+'.md'))[1];
 assert.match(lead,/actual executor/i);
 assert.match(lead,/only.*default.*workflow/is);
});
test('Grok per-seat files carry exactly their related group contexts, matching the full plan',async()=>{
 const ctx=await context(),files=await unzip(vm.runInContext("UnifiedHosts.grokArchive(team,'regression')",ctx));
 const plan=JSON.parse(files.get('grok-plan.json'));
 for(const role of ctx.team.roles){
  const card=JSON.parse(files.get('roles/role-'+role.id+'.txt'));
  assert.deepEqual(card,plan.roles.find(r=>r.key===role.id));
  const expected=plan.groups.filter(g=>g.members.includes(role.id));
  assert.deepEqual(card.group_context,expected,'Each separate Bot needs its applicable executable group summaries.');
  assert.deepEqual(card.groups,expected.map(g=>g.key),'Keep legacy group IDs.');
  for(const g of card.group_context){
   assert.equal(g.purpose,ctx.team.groups.find(x=>x.id===g.key).purpose);
   assert.deepEqual(g.full_rules.map(r=>r.path),referenceFiles.slice(1).map(r=>r.path));
   assert.ok(g.full_rules.every(r=>r.included_in_archive && r.anchors.includes('common') && r.anchors.includes(g.key)));
  }
  assert.equal(card.rule_loading.automatic,false);
 }
 assert.deepEqual(plan.roles.find(r=>r.key==='seat-inspection').group_context,[]);
 const start=files.get('Start-here.html');
 assert.match(start,/references\/template-rules\/groups\.zh\.md/);
});
test('all standalone ZIPs actually include supplied same-source full-rule documents',async()=>{
 const ctx=await context();
 const dsh=await unzip(vm.runInContext('TeamBuilderAdapters.exportDeepSeekHarness(team)',ctx));
 const wb=await unzip((await vm.runInContext('WorkBuddyExport.build(team)',ctx)).blob);
 const grok=await unzip(vm.runInContext("UnifiedHosts.grokArchive(team,'rules')",ctx));
  assert.match(dsh.get('.dsh/skills/solo-to-team/SKILL.md'),/references\/template-rules\/groups\.zh\.md/);
  for(const [path,card] of wb)if(path.includes('/agents/'))assert.match(card,/references\/template-rules\/groups\.zh\.md/);
 for(const file of referenceFiles){
  assert.equal(dsh.get(file.path),file.content,'DSH attachment');
  assert.equal(grok.get(file.path),file.content,'Grok attachment');
  assert.equal([...wb].find(([p])=>p.endsWith('/'+file.path))?.[1],file.content,'WorkBuddy attachment');
 }
 for(const files of [dsh,wb,grok]){
  const combined=[...files].filter(([p])=>/README\.md$|Start-here\./.test(p)).map(([,text])=>text).join('\n');
  assert.match(combined,/not.*automatically|no automatic|不会自动/is);
  assert.match(combined,/edited|编辑/i,'Default references must not overwrite edited team data.');
 }
});
test('without the optional rule API, standalone exports disclose missing full-rule attachments',async()=>{
 const ctx=await context(false);
 const dsh=await unzip(vm.runInContext('TeamBuilderAdapters.exportDeepSeekHarness(team)',ctx));
 const wb=await unzip((await vm.runInContext('WorkBuddyExport.build(team)',ctx)).blob);
 const grok=await unzip(vm.runInContext("UnifiedHosts.grokArchive(team,'no-rules')",ctx));
 for(const files of [dsh,wb,grok]){
  assert.equal([...files.keys()].some(p=>p.endsWith('references/template-rules/groups.zh.md')),false);
  const guides=[...files].filter(([p])=>/README\.md$|Start-here\./.test(p)).map(([,text])=>text).join('\n');
  assert.match(guides,/not included|未附|未随包/i);
 }
 const plan=JSON.parse(grok.get('grok-plan.json'));
 assert.ok(plan.groups.every(g=>g.full_rules.every(r=>r.included_in_archive===false)));
});

test('edited and removed groups never acquire nonexistent or automatic default-rule bindings',async()=>{
 const ctx=await context(),original=fixture();
 ctx.team.groups[0].name='Custom operations name';
 ctx.team.groups[1].id='custom-creation-room';
 ctx.team.groups[1].purpose='User-edited scope only.';
 const removed=ctx.team.groups.pop().id;
 const files=await unzip(vm.runInContext("UnifiedHosts.grokArchive(team,'edited-groups')",ctx));
 const plan=JSON.parse(files.get('grok-plan.json'));
 assert.deepEqual(plan.groups.map(g=>g.key),ctx.team.groups.map(g=>g.id));
 assert.equal(plan.groups.some(g=>g.key===removed),false);
 for(const group of plan.groups){
  const edited=[original.groups[0].id,'custom-creation-room'].includes(group.key);
  for(const ref of group.full_rules){
   const fullText=files.get(ref.path);
   assert.equal(typeof fullText,'string','A claimed included reference must be an actual ZIP entry.');
   if(edited)assert.deepEqual(ref.anchors,[],'Edited groups must not inherit template-rule anchors.');
   else assert.deepEqual(ref.anchors,['common',group.key]);
   for(const anchor of ref.anchors)assert.ok(fullText.includes('<a id="'+anchor+'"></a>'),'No fabricated anchor: '+anchor);
   assert.equal(ref.scope,'default-template-reference');
   assert.equal(ref.current_group_matches_template,!edited);
  }
 }
 for(const role of plan.roles){
  assert.deepEqual(role.group_context,plan.groups.filter(g=>g.members.includes(role.key)));
  assert.equal(role.group_context.some(g=>g.key===removed),false);
  assert.equal(role.rule_loading.automatic,false);
 }
 const dsh=await unzip(vm.runInContext('TeamBuilderAdapters.exportDeepSeekHarness(team)',ctx));
 assert.deepEqual(JSON.parse(dsh.get('team.definition.json')).groups,ctx.team.groups);
 const wb=await unzip((await vm.runInContext('WorkBuddyExport.build(team)',ctx)).blob);
 const coordination=JSON.parse([...wb].find(([p])=>p.endsWith('/references/coordination.json'))[1]);
 assert.deepEqual(coordination.groups,ctx.team.groups);
 const maus=JSON.parse(await (await vm.runInContext("NativeRoomExport.build(team,team.groups.map(g=>({id:g.id,responder:{kind:'mentions'}})))",ctx)).text());
 assert.deepEqual(maus.package.rooms.map(r=>r.key),ctx.team.groups.map(g=>g.id));
 ctx.team.groups=[];
 const empty=JSON.parse((await unzip(vm.runInContext("UnifiedHosts.grokArchive(team,'no-groups')",ctx))).get('grok-plan.json'));
 assert.deepEqual(empty.groups,[]);
 assert.ok(empty.roles.every(r=>r.group_context.length===0));
});

