import test from 'node:test';
import assert from 'node:assert/strict';
import {packReadiness,enhancePackFeedback} from '../tools/pack-feedback.mjs';
const ready={busy:false,teamLoading:false,invalidTeam:false,fileCount:1,task:'整理材料',criteria:'保留原件',authorized:true};
test('readiness lists missing fields and renewed authorization',()=>{
 const text=packReadiness({...ready,fileCount:0,task:'  ',criteria:'',authorized:false});
 for(const label of ['至少一份底稿','任务要求','验收标准','更换文件或团队后需重新确认'])assert.ok(text.includes(label));
});
test('team reading and invalid team are explained without a false ready state',()=>{
 assert.match(packReadiness({...ready,teamLoading:true}),/等待团队/);
 assert.match(packReadiness({...ready,invalidTeam:true}),/重选有效团队/);
});
test('ready and busy states are distinct in both supported languages',()=>{
 assert.match(packReadiness(ready),/^已准备好/);assert.match(packReadiness({...ready,busy:true}),/^正在生成/);
 assert.match(packReadiness({...ready,en:true}),/^Ready/);
 assert.match(packReadiness({...ready,authorized:false,en:true}),/confirm again/);
});
test('adapter rejects changed upstream markup',()=>assert.throws(()=>enhancePackFeedback('<script>unknown()</script>')));
