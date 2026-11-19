export const statusNames={draft:'草稿 · 待出发',queued:'等待伙伴接单',planning:'首席拆解中',writing:'生产官撰写中',reviewing:'督查官审核中',revising:'生产官返修中',completed:'文档已交付 · 请核对',needs_revision:'审核未通过 · 请核对',failed:'执行失败',cancelled:'已取消后续步骤',interrupted:'服务中断 · 可重试'};
export const running=new Set(['queued','planning','writing','reviewing','revising']);
const ids=['plan','write','review','revise','review_final'];
export const stepNames={plan:'首席拆解',write:'文档撰写',review:'独立审核',revise:'文档返修',review_final:'再次审核'};
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(s);
const number=n=>Number.isSafeInteger(n)&&n>=0;
export function checkTask(t){
 if(!t||!validId(t.id)||!Object.hasOwn(statusNames,t.status)||!number(t.version)||!number(t.spent_micros)||typeof t.title!=='string'||typeof t.criteria!=='string'||typeof t.material!=='string'||!Array.isArray(t.steps))throw Error('任务数据无法识别，请刷新后重试；未更改已有结果。');
 const seen=new Set();
 for(const s of t.steps){if(!ids.includes(s.stage)||seen.has(s.stage)||!s.output||typeof s.output!=='object')throw Error('步骤数据不完整');seen.add(s.stage);
  if(['write','revise'].includes(s.stage)&&(typeof s.output.markdown!=='string'||typeof s.output.title!=='string'))throw Error('文档数据不完整');
  if(s.stage.startsWith('review')&&(typeof s.output.approved!=='boolean'||typeof s.output.summary!=='string'||!Array.isArray(s.output.issues)||s.output.issues.some(i=>typeof i!=='string')))throw Error('审核数据不完整');
 }
 return t;
}
export function checkCapabilities(c){if(!c||typeof c.configured!=='boolean'||typeof c.pricing_current!=='boolean'||typeof c.halted!=='boolean'||typeof c.model!=='string'||!number(c.spent_micros)||!number(c.total_budget_micros)||!number(c.task_budget_micros))throw Error('服务配置无法识别');return c;}
export function taskView(t){
 if(t)checkTask(t);
 const steps=t?.steps??[],outputs=Object.fromEntries(steps.map(s=>[s.stage,s.output]));
 const extra=outputs.review?.approved===false||steps.some(s=>['revise','review_final'].includes(s.stage));
 const route=ids.slice(0,extra?5:3);
 const active=t?.status==='planning'?'plan':t?.status==='writing'?'write':t?.status==='revising'?'revise':t?.status==='reviewing'?(outputs.revise?'review_final':'review'):null;
 const nodes=route.map(id=>({id,name:stepNames[id],state:outputs[id]?'completed':active===id?'running':'queued'}));
 const document=outputs.revise??outputs.write??null;
 return {nodes,done:nodes.filter(s=>s.state==='completed').length,total:nodes.length,active,document,review:outputs.review_final??outputs.review??null,label:t?statusNames[t.status]:'等待新的委托'};
}
export function canRun(t,c){return !!c?.configured&&c.pricing_current&&!c.halted&&c.spent_micros<c.total_budget_micros&&(!t||t.spent_micros<c.task_budget_micros);}
export function taskPath(id){if(!validId(id))throw Error('任务地址无效');return '/tasks/'+id;}
