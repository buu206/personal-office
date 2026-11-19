import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto, createHash } from 'node:crypto';
import vm from 'node:vm';
import { presetScript } from '../../../team-16/source/build.mjs';

const base = new URL('../', import.meta.url);
const ids = ['chief','technology','intelligence','daily-affairs','learning','review','inspection','creative','production','legal-business','analysis-specialist','network-engineer','implementation-engineer','art-editor','review-assistant','intelligence-adviser'].map(s=>'seat-'+s);
const groupMembers = [
  ['chief','review','intelligence','creative','technology','production'],
  ['chief','creative','production','legal-business','review'],
  ['chief','learning','daily-affairs'],
  ['chief','review','intelligence','intelligence-adviser','review-assistant'],
  ['chief','review','technology','network-engineer','implementation-engineer'],
  ['chief','analysis-specialist']
];
// Independent integration fixture: content is deliberately not release copy.
const fixture = {
  format:'solo-to-team.definition',version:'1.0.0',id:'public-team-fixture',name:'Test team',
  roles:ids.map(id=>({id,name:id,responsibility:'Development test fixture only.',avatar:null})),
  groups:groupMembers.map((members,i)=>({id:'group-'+i,name:'Group '+i,purpose:'Development test fixture only.',members:members.map(s=>'seat-'+s)})),
  workflow:{dispatch:'seat-chief',produce:'seat-production',review:'seat-review',deliver:'seat-chief'}
};
const original = new TextEncoder().encode('Example source\nquantity: 16\n');
const file = {name:'source.txt',size:original.length,arrayBuffer:async()=>original.slice().buffer};

async function runtime(presetCode) {
  const ctx=vm.createContext({Blob,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,DOMException,AbortController,crypto:webcrypto,atob,btoa,
    TeamPreset:{initial:()=>structuredClone(fixture)}});
  if(presetCode)vm.runInContext(presetCode,ctx,{filename:'shared-team-preset.js'});
  for(const name of ['../../team-16/source/web/core.js','../../team-16/source/web/adapters.js','vendor/zip-store.js','project.js'])
    vm.runInContext(await readFile(new URL(name,base),'utf8'),ctx,{filename:name});
  return vm.runInContext('({generate:DraftProject.generate,custom:TeamDefinition.initial(),initial:TeamPreset.initial})',ctx);
}
function unpack(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), entries=new Map();
  let at=0;
  while(view.getUint32(at,true)===0x04034b50) {
    assert.equal(view.getUint16(at+8,true),0,'stored ZIP expected');
    const size=view.getUint32(at+18,true),nameLen=view.getUint16(at+26,true),extraLen=view.getUint16(at+28,true);
    const name=new TextDecoder().decode(bytes.subarray(at+30,at+30+nameLen)),start=at+30+nameLen+extraLen;
    entries.set(name,bytes.slice(start,start+size));at=start+size;
  }
  assert.equal(view.getUint32(at,true),0x02014b50);
  return entries;
}
const parse=(entries,name)=>JSON.parse(new TextDecoder().decode(entries.get(name)));
async function build(generate,team,lang='zh') {
  return unpack(new Uint8Array(await (await generate({files:[file],task:'Prepare a checklist',criteria:'Preserve the source',scope:'receipt',team,lang})).arrayBuffer()));
}

test('default project carries all 16 roles, six groups and 26 memberships',async()=>{
  const {generate}=await runtime();
  const entries=await build(generate);
  const team=parse(entries,'team.definition.json');
  assert.equal(team.roles.length,16);
  assert.deepEqual(team.roles.map(r=>r.id),ids);
  assert.equal(team.groups.length,6);
  assert.equal(team.groups.reduce((n,g)=>n+g.members.length,0),26);
  const root='.dsh/skills/solo-to-team/references/';
  assert.deepEqual(parse(entries,root+'roster.json').rows.map(r=>r.id),ids);
  for(const id of ids)assert.ok(entries.has(root+'roles/role-'+id+'.json'),id+' role card missing');
  assert.deepEqual(parse(entries,root+'groups.json'),fixture.groups);
  assert.deepEqual(entries.get('inputs/originals/001-source.txt'),original);
  assert.equal(parse(entries,'inputs/manifest.json').files[0].sha256,createHash('sha256').update(original).digest('hex'));
});

test('an explicit custom team is preserved instead of replaced by the default',async()=>{
  const {generate,custom}=await runtime();
  const entries=await build(generate,custom);
  assert.deepEqual(parse(entries,'team.definition.json'),JSON.parse(JSON.stringify(custom)));
});

test('both languages use the same actual preset embedded by the team editor',async()=>{
  const {generate,initial}=await runtime(await presetScript());
  for(const lang of ['zh','en']) {
    const entries=await build(generate,undefined,lang);
    const actual=parse(entries,'team.definition.json');
    assert.deepEqual(actual,JSON.parse(JSON.stringify(initial(lang))));
    assert.deepEqual(actual.roles.map(r=>r.id),ids);
  }
});

test('intake exports carry full rules and preserve specialist routing from the shared adapter',async()=>{
  const {generate}=await runtime(await presetScript());
  const entries=await build(generate);
  for(const lang of ['zh','en']) {
    const path='references/template-rules/groups.'+lang+'.md';
    assert.ok(entries.has(path),'full rules missing from intake project: '+path);
    assert.equal(new TextDecoder().decode(entries.get(path)),await readFile(new URL('../../../team-16/source/presets/groups.'+lang+'.md',import.meta.url),'utf8'));
  }
  const skill=new TextDecoder().decode(entries.get('.dsh/skills/solo-to-team/SKILL.md'));
  assert.match(skill,/references\/template-rules\/groups\.zh\.md/);
  assert.match(skill,/原执行席/);
  assert.match(skill,/only|仅/);
});

test('actual built intake imports and exports custom bodies without changing their text',async()=>{
  const out=join(await mkdtemp(join(tmpdir(),'mas-body-intake-')),'index.html');
  execFileSync(process.execPath,['build.mjs',out],{cwd:fileURLToPath(base)});
  const html=await readFile(out,'utf8');
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  assert.equal(scripts.length,7);
  const ctx=vm.createContext({Blob,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,DOMException,AbortController,crypto:webcrypto,atob,btoa});
  // Execute the actual embedded import/export modules; the final script binds browser UI events.
  for(const code of scripts.slice(0,-1))vm.runInContext(code,ctx);
  const api=vm.runInContext('({generate:DraftProject.generate,initial:TeamDefinition.initial,load:TeamDefinition.importDefinition})',ctx);
  const raw=api.initial(),duty='\n    if ready:\r\n\tprint("Cafe\u0301")  \n',purpose='    Keep indentation\r\nCafe\u0301\n\n';
  raw.roles[0].responsibility=duty;raw.groups[0].purpose=purpose;
  const imported=api.load(JSON.parse(JSON.stringify(raw))).team;
  assert.equal(imported.roles[0].responsibility,duty);
  assert.equal(imported.groups[0].purpose,purpose);
  const entries=await build(api.generate,imported);
  const output=parse(entries,'team.definition.json');
  assert.equal(output.roles[0].responsibility,duty);
  assert.equal(output.groups[0].purpose,purpose);
  const refs='.dsh/skills/solo-to-team/references/';
  assert.equal(parse(entries,refs+'roles/role-lead.json').responsibility,duty);
  assert.equal(parse(entries,refs+'groups.json')[0].purpose,purpose);
});
