import test from 'node:test';
import assert from 'node:assert/strict';
import {createState, createProject, tick, togglePause, selectProject, selectRole, setDraft,
  serialize, restore, validateState, stageProgress, activeProject, MAX_PROJECTS} from '../state.mjs';

test('real team roles remain one-to-one without carrying avatar payloads', () => {
  const team = {id:'team',name:'团队',roles:Array.from({length:16},(_,i)=>({id:`r${i}`,name:`角色${i}`,responsibility:`职责${i}`,avatar:'large'}))};
  const s=createState(team); assert.equal(s.team.roles.length,16); assert.equal(s.team.roles[15].duty,'职责15');
  assert.equal(s.team.roles[0].avatar,undefined); assert.equal(s.projects.length,0);
});
test('creating a project preserves prior state and draft persists independently', () => {
  const initial=setDraft(createState(),'任务草稿'); const next=createProject(initial,'  制作周报  ');
  assert.equal(initial.projects.length,0); assert.equal(initial.draft,'任务草稿');
  assert.equal(next.draft,''); assert.equal(activeProject(next).title,'制作周报'); assert.equal(activeProject(next).status,'running');
});
test('all views can derive coherent sequential progress', () => {
  let s=createProject(createState(),'研究'); s=tick(s,37);
  const stages=stageProgress(activeProject(s));
  assert.deepEqual(stages.map(x=>x.progress),[100,48,0,0]);
  assert.equal(stages.reduce((n,x)=>n+x.progress,0)/4,37);
});
test('pause freezes progress and resume continues without elapsed-time jumps', () => {
  let s=tick(createProject(createState(),'研究'),10); s=togglePause(s);
  assert.equal(activeProject(tick(s)).progress,10);
  s=tick(togglePause(s)); assert.equal(activeProject(s).progress,12);
});
test('completion is bounded and cannot be resumed or exceeded', () => {
  let s=tick(createProject(createState(),'研究'),99);s=tick(s);
  assert.equal(activeProject(s).progress,100); assert.equal(activeProject(s).status,'completed');
  assert.deepEqual(tick(togglePause(s)),s); assert.ok(stageProgress(activeProject(s)).every(x=>x.status==='completed'));
});
test('creating and selecting projects never advances a background project', () => {
  let s=tick(createProject(createState(),'第一个'),10);const first=s.selectedProject;
  s=createProject(s,'第二个');const second=s.selectedProject;
  assert.equal(s.projects.find(x=>x.id===first).status,'paused');
  s=selectProject(s,first);assert.equal(s.projects.find(x=>x.id===second).status,'paused');
  s=tick(s);assert.equal(activeProject(s).progress,10);
  s=tick(togglePause(s));assert.equal(activeProject(s).progress,12);assert.equal(s.projects.find(x=>x.id===second).progress,0);
});
test('serialize/restore retains projects, role selection and draft but pauses running work', () => {
  let s=tick(createProject(createState(),'恢复任务'),44);s=selectRole(s,s.team.roles[2].id);s=setDraft(s,'下一条输入');
  const restored=restore(serialize(s));assert.equal(activeProject(restored).status,'paused');
  assert.equal(activeProject(restored).progress,44); assert.equal(restored.selectedRole,s.selectedRole);assert.equal(restored.draft,'下一条输入');
  assert.equal(activeProject(s).status,'running');
});
test('corrupt, unknown and unsafe persisted structures fail without resetting state', () => {
  assert.throws(()=>restore('{broken'),/有效JSON/);
  for (const modify of [s=>s.version=99,s=>s.selectedRole='missing',s=>s.team.roles.push(s.team.roles[0]),
    s=>s.projects[0].progress=NaN,s=>s.projects[0].status='completed',s=>s.extra=true,s=>s.projects[0].id='']) {
    const s=createProject(createState(),'任务');modify(s);assert.throws(()=>validateState(s));
  }
  assert.throws(()=>restore(' '.repeat(8*1024*1024+1)),/大小限制/);
});
test('bounded inputs and unknown selections do not mutate a valid state', () => {
  const s=createState(); const before=serialize(s);
  for (const title of ['', '   ', 'x'.repeat(2001), null]) assert.throws(()=>createProject(s,title));
  assert.throws(()=>setDraft(s,'x'.repeat(2001)));assert.throws(()=>selectRole(s,'absent'));assert.throws(()=>selectProject(s,'absent'));
  assert.throws(()=>tick(s,-1));assert.throws(()=>tick(s,0.5));assert.equal(serialize(s),before);
});
test('project limit is explicit and does not discard earlier projects', () => {
  let s=createState();for(let i=0;i<MAX_PROJECTS;i++)s=createProject(s,`项目${i}`);
  assert.throws(()=>createProject(s,'溢出'),/30/);assert.equal(s.projects.length,MAX_PROJECTS);
  assert.equal(s.projects.at(-1).title,'项目0');
});
test('boundary between stages starts next stage without inconsistent totals',()=>{
  const s=tick(createProject(createState(),'任务'),25);const stages=stageProgress(activeProject(s));
  assert.deepEqual(stages.map(x=>x.progress),[100,0,0,0]);assert.equal(stages[1].status,'running');assert.equal(stages[2].status,'queued');
});
