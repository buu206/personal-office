import {OfficeAPI} from './ai-client.mjs';
import {taskView,statusNames,running,canRun} from './ai-state.mjs';
const $=id=>document.getElementById(id),api=new OfficeAPI(),DRAFT='personal-office.ai-draft.v1';
let current=null,selected=new URLSearchParams(location.hash.slice(1)).get('task'),tasks=[],cap=null,offset=0,busy=false,online=false,loading=true,polling=false,rerun=false,timer=null,failures=0,selectionVersion=0,submission=null,chosenRole=0,inspected=null;
const roles=[{id:'chief',name:'首席协调员',species:'pikachu',type:'电',color:'#e8bb38',symbol:'ϟ',duty:'根据材料拆解任务、列出文档结构与信息缺口。',steps:['plan']},{id:'research',name:'情报官',species:'bulbasaur',type:'草 / 毒',color:'#7eac62',symbol:'✿',duty:'本轮文档链路未启用独立检索；不会联网搜集资料。',steps:[]},{id:'writer',name:'生产官',species:'squirtle',type:'水',color:'#6eaacb',symbol:'●',duty:'按原始材料撰写文档，审核不通过时最多返修一次。',steps:['write','revise']},{id:'creative',name:'创意官',species:'mew',type:'超能力',color:'#c989ad',symbol:'✦',duty:'本轮文档链路未启用独立创意或图像生成。',steps:[]},{id:'reviewer',name:'督查官',species:'charizard',type:'火 / 飞行',color:'#db8a59',symbol:'♨',duty:'独立核对文档与原文，检查事实、覆盖要求和信息缺口。模型审核通过后仍需你核对。',steps:['review','review_final']}];
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function notice(text,error=false){$('notice').hidden=!text;$('notice').textContent=text;$('notice').setAttribute('role',error?'alert':'status');}
function fields(){return {title:$('task-input').value,criteria:$('criteria-input').value,material:$('material-input').value};}
function storeDraft(){try{localStorage.setItem(DRAFT,JSON.stringify({format:1,...fields(),submission}));}catch{notice('浏览器无法保存输入草稿；请先“仅保存草稿”到本机服务。',true);}}
function choose(id){selected=id;current=null;inspected=null;selectionVersion++;history.replaceState(null,'','#task='+encodeURIComponent(id));render();refresh();}
function controls(){
 const valid=$('task-input').value.trim()&&$('criteria-input').value.trim()&&$('material-consent').checked;
 $('start-button').disabled=busy||!online||!valid||!canRun(null,cap);
 $('save-draft').disabled=busy||!online||!valid;
 $('cancel-task').disabled=busy||!online||!current||!['draft',...running].includes(current.status);
 $('resume-task').hidden=current?.status!=='draft';$('retry-task').hidden=!['failed','interrupted'].includes(current?.status);
 $('resume-task').disabled=$('retry-task').disabled=busy||!online||!canRun(current,cap);
 $('list-prev').disabled=busy||offset===0;$('list-next').disabled=busy||tasks.length<50;
 $('char-count').textContent=$('task-input').value.length+' / 2000';
}
function renderList(){
 const signature=JSON.stringify([selected,offset,tasks.map(t=>[t.id,t.title,t.status,t.steps.length]),loading]);
 if($('project-list').dataset.signature!==signature){$('project-list').dataset.signature=signature;$('project-list').replaceChildren();
  if(!tasks.length)$('project-list').append(el('p','empty-projects',loading?'正在读取委托…':online?'还没有委托。写下目标，让伙伴开始。':'无法读取委托，请重新连接。'));
  for(const t of tasks){const b=el('button','project-button');b.classList.toggle('active',selected===t.id);b.setAttribute('aria-pressed',String(selected===t.id));b.append(el('strong','',t.title));const meta=el('div','project-meta');meta.append(el('span','',statusNames[t.status]),el('span','',t.created_at?new Date(t.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):''));b.append(meta);b.onclick=()=>choose(t.id);$('project-list').append(b);}
 }
 $('project-count').textContent=tasks.length;$('complete-count').textContent=tasks.filter(t=>t.status==='completed').length;$('list-page').textContent=String(offset/50+1);
}
function buildPartners(){
 for(const [i,r] of roles.entries()){
  const robot=el('button','robot');robot.dataset.species=r.species;robot.dataset.role=r.id;robot.setAttribute('aria-label','查看'+r.name+'的职责');const figure=el('span','figure'),art=el('span','robot-art');art.style.setProperty('--robot-image','url(assets/'+r.species+'.png)');figure.append(art);const label=el('span','robot-name');label.append(el('b','',String(i+1)),el('span','',r.name));robot.append(figure,label);robot.onclick=()=>{chosenRole=i;inspected=r.steps[0]??null;render();};$('robots').append(robot);
  const card=el('button','partner-card');card.dataset.role=r.id;card.style.setProperty('--type-color',r.color);const header=el('span','card-header');header.append(el('strong','',r.name),el('span','energy',r.symbol));const artwork=el('span','card-art'),canvas=el('canvas','card-sprite');canvas.width=canvas.height=128;canvas.dataset.species=r.species;canvas.setAttribute('aria-hidden','true');artwork.append(canvas);const progress=el('span','card-progress');progress.append(el('span','','实际分工'),el('b'));const track=el('span','track');track.append(el('span'));card.append(header,artwork,el('span','card-type',r.type+' 属性'),el('span','card-skill',r.steps.length?'文档协作':'本轮未启用'),progress,track,el('span','card-state'));card.onclick=robot.onclick;$('party-cards').append(card);
 }
 $('team-count').textContent='5';$('room-label').textContent='草地营地';$('room-page').textContent='3 位执行 / 2 位待命';
}
function render(){
 controls();renderList();const v=taskView(current),fraction=v.done+'/'+v.total,ratio=v.done/v.total*100;
 $('connection-state').textContent=online?(cap?.configured?'AI 已连接':'待配置密钥'):(loading?'连接中':'连接中断');document.body.classList.toggle('connection-lost',!online);
 $('save-status').textContent=online?'✓ 任务与成果保存在本机':'保留最后状态 · 等待重连';
 $('budget-status').textContent=cap?`累计计入 ${(cap.spent_micros/1e6).toFixed(4)} / ${cap.total_budget_micros/1e6} 元${!cap.configured?' · 请配置密钥':!cap.pricing_current?' · 需重新核验费率':cap.halted?' · 用量异常已停止':''}`:'预算状态暂不可用';
 $('gauge-value').textContent=v.done;$('gauge-total').textContent='/ '+v.total;document.querySelector('.gauge').style.setProperty('--fill',ratio+'%');$('monitor-state').textContent=v.label;
 $('screen-title').textContent=current?.title??'给伙伴一个新目标';$('screen-status').textContent=online?v.label:'连接中断 · 状态待同步';$('screen-percent').replaceChildren(document.createTextNode(String(v.done)),el('span','',' / '+v.total));$('screen-bar').style.width=ratio+'%';$('screen-caption').textContent='已完成步骤 · 非耗时预测';
 $('scene-caption').textContent=current?`${v.label} · ${fraction} 步骤`:'伙伴就位，等待你的委托';$('flow-summary').textContent=fraction+' 步骤完成';
 const sig=JSON.stringify([v.nodes,inspected]);if($('flow-nodes').dataset.signature!==sig){$('flow-nodes').dataset.signature=sig;$('flow-nodes').replaceChildren();$('screen-stages').replaceChildren();for(const s of v.nodes){const b=el('button','flow-node');b.dataset.state=s.state;b.setAttribute('aria-pressed',String(inspected===s.id));b.append(el('span','port'),el('code','',s.id),el('strong','',s.name),el('small','',s.state==='completed'?'已完成':s.state==='running'?'处理中':'待开始'));b.onclick=()=>{inspected=s.id;chosenRole=roles.findIndex(r=>r.steps.includes(s.id));render();};$('flow-nodes').append(b);const n=el('div','screen-stage');n.classList.toggle('active',s.state==='running');n.classList.toggle('done',s.state==='completed');n.append(el('span','',s.name));const track=el('div','track'),bar=el('span');bar.style.width=s.state==='completed'?'100%':'0%';track.append(bar);n.append(track);$('screen-stages').append(n);}}
 for(const [i,r] of roles.entries()){const work=online&&r.steps.includes(v.active),done=r.steps.some(id=>current?.steps.some(s=>s.stage===id));const card=$('party-cards').children[i],robot=$('robots').children[i];card.classList.toggle('selected',i===chosenRole);card.setAttribute('aria-pressed',String(i===chosenRole));robot.classList.toggle('selected',i===chosenRole);robot.classList.toggle('robot-working',work);card.querySelector('.card-progress b').textContent=work?'执行中':done?'已有产出':'—';card.querySelector('.track span').style.width=done?'100%':'0%';card.querySelector('.card-state').textContent=!r.steps.length?'本轮未参与':!online?'状态待同步':work?'正在协作':done?'阶段产出已保存':'等待任务';}
 const role=roles[chosenRole]??roles[0];$('role-title').textContent=role.name;$('role-category').textContent=role.steps.length?'文档执行伙伴':'待命伙伴';$('role-duty').textContent=role.duty;$('role-full-duty').textContent=role.duty;$('role-emblem').textContent=String(chosenRole+1).padStart(2,'0');
 const node=v.nodes.find(n=>n.id===(inspected??v.active))??v.nodes[0];$('node-output').replaceChildren();for(const [k,val] of [['当前环节',node.name],['负责伙伴',roles.find(r=>r.steps.includes(node.id))?.name??'待命'],['执行状态',node.state==='completed'?'产出已保存':node.state==='running'?'正在处理':'尚未开始']]){const row=el('div','partner-stat');row.append(el('span','',k),el('strong','',val));$('node-output').append(row);}$('follow-node').hidden=inspected===null;
 const activitySig=JSON.stringify([current?.id,current?.status,current?.steps]);if($('activity').dataset.signature!==activitySig){$('activity').dataset.signature=activitySig;$('activity').replaceChildren();for(const s of v.nodes.filter(s=>s.state!=='queued')){const row=el('div','trace-event');row.dataset.state=s.state;row.append(el('span','',s.name),el('small','',s.state==='completed'?'已保存':'处理中'));$('activity').append(row);}}
 const hints={failed:'执行未完成，已保留产物与费用。可重试失败步骤。',interrupted:'服务中断。不会自动重放付费调用，可手动重试。',cancelled:'已停止后续步骤；已发出的请求可能仍计费。',needs_revision:'返修后仍未通过审核，以下文档需人工修改。',draft:'草稿已保存，点击“开始此草稿”才调用模型。',completed:'文档已通过模型审核，请核对事实后使用。'};
 $('task-message').textContent=!online?'连接中断不代表任务停止；重新连接后会同步真实状态。':(hints[current?.status]??(current?'取消仅停止后续调用，在途请求可能计费。':''))+(current?.error_code?'（'+current.error_code+'）':'');
 $('result-card').hidden=!v.document;$('artifact-label').textContent=current?.status==='completed'?'交付文档已就绪':'已有草稿 · 尚未通过最终审核';$('review-summary').textContent=v.review?[v.review.summary,...v.review.issues].join('\n'):'等待独立审核';
 if(v.document){$('artifact-download').href=api.artifact(current.id);if($('document-dialog').open)fillDocument();}
}
function fillDocument(){const v=taskView(current);if(!v.document)return;$('document-title').textContent=v.document.title;$('document-body').textContent=v.document.markdown;$('document-status').textContent=v.label+' · 模型生成，请核对';$('document-download').href=api.artifact(current.id);}
async function refresh(){
 if(polling){rerun=true;return;}clearTimeout(timer);polling=true;const version=selectionVersion,id=selected;
 try{const c=await api.capabilities(),list=await api.list(offset);let task=id?await api.get(id):null;
  if(version!==selectionVersion){rerun=true;return;}
  const recovered=failures>0;cap=c;tasks=list;current=task;online=true;loading=false;failures=0;if(recovered)notice('已重新连接，任务状态已同步。');else if($('notice').textContent==='正在同步…')notice('任务状态已同步。');render();
 }catch(e){if(version===selectionVersion){online=false;loading=false;failures++;notice(e.message,true);render();}}
 finally{polling=false;if(rerun){rerun=false;refresh();}else if(!online||running.has(current?.status)||tasks.some(t=>running.has(t.status)))timer=setTimeout(refresh,document.hidden?15000:Math.min(15000,1500*2**Math.min(failures,3)));}
}
async function submit(run){
 if(busy||!$('task-input').value.trim()||!$('criteria-input').value.trim()||!$('material-consent').checked)return;
 busy=true;controls();const values=fields(),signature=JSON.stringify(values);if(submission?.signature!==signature)submission={signature,key:crypto.randomUUID()};storeDraft();
 try{let t=await api.create({...values,material_consent:true,idempotency_key:submission.key});selected=t.id;current=t;selectionVersion++;history.replaceState(null,'','#task='+t.id);
  if(run&&t.status==='draft')t=await api.mutate(t,'run');current=t;notice(run?'已提交真实执行，伙伴将按步骤协作。':'草稿已保存，没有调用模型。');
 }catch(e){notice(e.message,true);}finally{busy=false;await refresh();}
}
async function act(action){if(busy||!current)return;busy=true;controls();try{current=await api.mutate(current,action);notice(action==='cancel'?'已取消后续步骤；在途请求可能仍计费。':'已提交，请查看伙伴动态。');}catch(e){notice(e.message,true);}finally{busy=false;await refresh();}}
for(const id of ['task-input','criteria-input','material-input'])$(id).addEventListener('input',()=>{$('material-consent').checked=false;storeDraft();controls();});$('material-consent').onchange=controls;
$('task-form').onsubmit=e=>{e.preventDefault();submit(true);};$('save-draft').onclick=()=>submit(false);$('cancel-task').onclick=()=>act('cancel');$('retry-task').onclick=()=>act('retry');$('resume-task').onclick=()=>act('run');
$('new-project').onclick=()=>{submission=null;storeDraft();$('task-input').focus();$('task-input').scrollIntoView({block:'center'});};
$('sample-task').onclick=()=>{$('task-input').value='把会议材料整理为行动清单';$('criteria-input').value='列出事项、负责人、期限；缺失信息标待确认，不把计划写成已完成。';$('material-input').value='公开合成材料：小王周五前整理客户反馈；小李负责FAQ，期限未定。预算未讨论。';$('material-consent').checked=false;storeDraft();controls();};
$('refresh-tasks').onclick=()=>{notice('正在同步…');refresh();};$('list-prev').onclick=()=>{offset=Math.max(0,offset-50);selectionVersion++;refresh();};$('list-next').onclick=()=>{offset+=50;selectionVersion++;refresh();};$('follow-node').onclick=()=>{inspected=null;render();};
$('settings-open').onclick=()=>$('settings-dialog').showModal();$('settings-close').onclick=()=>$('settings-dialog').close();$('settings-dialog').onclose=()=>$('settings-open').focus();
$('read-document').onclick=()=>{fillDocument();$('document-dialog').showModal();};$('document-close').onclick=()=>$('document-dialog').close();$('document-dialog').onclose=()=>$('read-document').focus();
$('run-shortcut').textContent=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘ ↵':'Ctrl ↵';$('task-input').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing&&(e.metaKey||e.ctrlKey)){e.preventDefault();if(!$('start-button').disabled)$('task-form').requestSubmit();}};
document.querySelector('.skip').onclick=e=>{e.preventDefault();$('task-input').focus();};
window.addEventListener('hashchange',()=>{selected=new URLSearchParams(location.hash.slice(1)).get('task');current=null;selectionVersion++;refresh();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('online',refresh);
try{const raw=localStorage.getItem(DRAFT);if(raw){const d=JSON.parse(raw);if(d.format!==1||typeof d.title!=='string'||typeof d.criteria!=='string'||typeof d.material!=='string')throw Error();$('task-input').value=d.title;$('criteria-input').value=d.criteria;$('material-input').value=d.material;if(d.submission&&typeof d.submission.signature==='string'&&typeof d.submission.key==='string')submission=d.submission;}}catch{notice('输入草稿无法恢复，原存档未删除。已保存的任务仍在本机服务中。',true);}
buildPartners();render();try{await api.session();await refresh();}catch(e){online=false;loading=false;notice(e.message,true);render();timer=setTimeout(refresh,5000);}
try{const {startPixelCamp}=await import('./pixel-camp.mjs');await startPixelCamp($('scene'));}catch{notice('伙伴动画未加载，任务和文档功能仍可使用。',true);}
