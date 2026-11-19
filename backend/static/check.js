'use strict';
const $=id=>document.getElementById(id);
let csrf='',selected=null,current=null,busy=false,submission=null;
const names={draft:'待开始',queued:'已排队',planning:'首席拆解',writing:'生产官撰写',reviewing:'独立审核',revising:'生产官返修',completed:'审核通过·已交付',needs_revision:'审核未通过·需修改',failed:'失败',cancelled:'已取消',interrupted:'服务中断·等待重试'};
async function api(path,method='GET',body){
 const r=await fetch('/api/v1'+path,{method,headers:method==='GET'?{}:{'Content-Type':'application/json','X-Office-Token':csrf},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw Error(data.error?.message||'请求失败');return data;
}
function notice(text){$('notice').textContent=text;}
async function refresh(){
 const c=await api('/capabilities');$('capabilities').textContent=`${c.configured?'密钥已配置':'尚未配置密钥，请双击配置AI.command后重启服务'} · 模型 ${c.model} · 已计入 ${(c.spent_micros/1e6).toFixed(4)} / ${c.total_budget_micros/1e6} 元${c.halted?' · 预算异常已停止':''}${c.pricing_current?'':' · 需更新费率核验'}`;
 const list=await api('/tasks');$('tasks').replaceChildren();
 for(const t of list.tasks){const b=document.createElement('button');b.textContent=t.title+' · '+names[t.status];b.onclick=()=>{selected=t.id;refresh().catch(e=>notice(e.message));};$('tasks').append(b,document.createElement('br'));}
 if(!selected)return;
 current=await api('/tasks/'+selected);$('detail').hidden=false;$('task-title').textContent=current.title;
 $('status').textContent=`${names[current.status]} · 已计入 ${(current.spent_micros/1e6).toFixed(4)} 元${current.error_code?' · '+current.error_code:''}`;
 $('run').disabled=busy||current.status!=='draft'||!c.configured||!c.pricing_current||c.halted;
 $('retry').disabled=busy||!['failed','interrupted'].includes(current.status)||!c.configured||!c.pricing_current||c.halted;
 $('cancel').disabled=busy||!['draft','queued','planning','writing','reviewing','revising'].includes(current.status);
 $('output').textContent=current.steps.map(s=>s.stage+'\n'+JSON.stringify(s.output,null,2)).join('\n\n');
 $('download').hidden=!current.steps.some(s=>['write','revise'].includes(s.stage));$('download').href='/api/v1/tasks/'+current.id+'/artifact';
}
$('task-form').onsubmit=async e=>{
 e.preventDefault();if(busy)return;busy=true;$('create').disabled=true;
 const input={title:$('title').value,criteria:$('criteria').value,material:$('material').value,material_consent:$('consent').checked};
 const signature=JSON.stringify(input);if(submission?.signature!==signature)submission={signature,key:crypto.randomUUID()};
 try{const t=await api('/tasks','POST',{...input,idempotency_key:submission.key});selected=t.id;notice('已保存。点“开始真实执行”才会调用模型。');await refresh();}
 catch(e){notice(e.message);}finally{busy=false;$('create').disabled=false;}
};
for(const action of ['run','retry','cancel'])$(action).onclick=async()=>{
 if(busy||!current)return;busy=true;for(const id of ['run','retry','cancel'])$(id).disabled=true;
 try{await api('/tasks/'+current.id+'/'+action,'POST',{version:current.version});notice(action==='cancel'?'已停止后续调度':'已提交真实执行');}
 catch(e){notice(e.message);}finally{busy=false;await refresh().catch(e=>notice(e.message));}
};
(async()=>{try{csrf=(await api('/session')).csrf_token;await refresh();setInterval(()=>{if(!busy)refresh().catch(e=>notice('连接中断：'+e.message));},2000);}catch(e){notice(e.message);}})();
