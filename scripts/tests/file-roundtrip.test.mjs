import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../file-roundtrip.mjs',import.meta.url));
const run=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8'});
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'office-roundtrip-'));t.after(()=>rm(dir,{recursive:true,force:true}));return join(dir,'team.json');}
test('saved team restores marker and topology in a fresh process',async t=>{
  const path=await fixture(t);assert.equal(run('save',path,'rc-fresh-process').status,0);
  assert.equal(run('load',path).stdout.trim(),'rc-fresh-process');
  const team=JSON.parse(await readFile(path,'utf8'));assert.equal(team.roles.length,16);assert.equal(team.groups.length,6);
});
test('saving never overwrites an existing team',async t=>{
  const path=await fixture(t);assert.equal(run('save',path,'rc-original').status,0);
  const before=await readFile(path);assert.notEqual(run('save',path,'rc-replacement').status,0);
  assert.deepEqual(await readFile(path),before);
});
test('damaged JSON fails closed',async t=>{const path=await fixture(t);await writeFile(path,'{"roles":');assert.notEqual(run('load',path).status,0);});
test('unknown schema version fails closed',async t=>{
  const path=await fixture(t);run('save',path,'rc-schema');const team=JSON.parse(await readFile(path,'utf8'));team.version='99.0.0';
  await writeFile(path,JSON.stringify(team));assert.notEqual(run('load',path).status,0);
});
test('producer cannot become its own independent reviewer',async t=>{
  const path=await fixture(t);run('save',path,'rc-review');const team=JSON.parse(await readFile(path,'utf8'));team.workflow.review=team.workflow.produce;
  await writeFile(path,JSON.stringify(team));assert.notEqual(run('load',path).status,0);
});
