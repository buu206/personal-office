import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {presetScript} from '../source/build.mjs';

test('downloadable rule references contain both complete source documents and a scoped usage note',async()=>{
  const context=vm.createContext({});
  vm.runInContext(await presetScript(),context);
  assert.equal(vm.runInContext('typeof TeamPreset.ruleReferences',context),'function');
  const refs=vm.runInContext('TeamPreset.ruleReferences()',context);
  assert.equal(refs.length,3);
  assert.equal(new Set(refs.map(x=>x.path)).size,3);
  for(const lang of ['zh','en']){
    const name='references/template-rules/groups.'+lang+'.md';
    const source=await readFile(new URL('../source/presets/groups.'+lang+'.md',import.meta.url),'utf8');
    assert.equal(refs.find(x=>x.path===name)?.content,source);
  }
  const note=refs.find(x=>x.path.endsWith('README.md'))?.content;
  assert.match(note,/reference/i);
  assert.match(note,/not automatically/i);
  vm.runInContext('TeamPreset.ruleReferences()[0].content="overwritten"',context);
  assert.notEqual(vm.runInContext('TeamPreset.ruleReferences()[0].content',context),'overwritten');
});
