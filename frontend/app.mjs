import {createState,validateState,createProject,tick,togglePause,selectProject,selectRole,setDraft,stageProgress,activeProject,serialize,restore} from './state.mjs';

const $=id=>document.getElementById(id), KEY='personal-office.workspace.v1', BACKUP=KEY+'.before-import';
let state,fullTeam,defaultTeam,room=0,brokenRaw=null,storageBlocked=false,lastStructure='',lastProjectStructure='',importVersion=0;
const statusNames={running:'演示中',paused:'已暂停',completed:'已完成'};
const categories=['统筹协调','研究分析','内容制作','创意设计','审核把关'];
const roleStage=[-1,0,1,2,3];
function element(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
function notify(message,error=false){$('notice').textContent=message;$('notice').hidden=!message;$('notice').setAttribute('role',error?'alert':'status');$('settings-status').textContent=message;}
function family(role,index){const id=role.id+' '+role.name;if(/chief|coordinator|统筹|首席/.test(id))return 0;if(/intelligence|research|analysis|情报|研究|分析/.test(id))return 1;if(/production|writer|撰写|生产/.test(id))return 2;if(/creative|art|designer|设计|美术|创意/.test(id))return 3;if(/review|inspection|审核|督查/.test(id))return 4;return index%5;}
function persist(next,force=false){
  if(brokenRaw!==null&&!force){notify('本地存档无法读取。请先在设置中导出原件，再导入有效备份。',true);return false;}
  try{localStorage.setItem(KEY,serialize(next));storageBlocked=false;$('save-status').textContent='✓ 已保存到本机';return true;}
  catch{storageBlocked=true;$('save-status').textContent='保存失败 · 已暂停';notify('浏览器无法保存存档，演示已暂停。请导出备份，检查存储权限或空间后再继续。',true);return false;}
}
function commit(next,{draft=false,force=false}={}){
  if(!persist(next,force)){if(activeProject(state)?.status==='running')state=togglePause(state);render();return false;}
  state=next;if(force){brokenRaw=null;$('export-damaged').hidden=true;}if(!draft)render();return true;
}
function safely(fn){try{fn();}catch(error){notify(error.message,true);}}
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=element('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function exportState(){download(serialize(state),'个人办公室-演示存档.json');notify('已请求下载存档，请在浏览器下载列表确认保存。');}
function updateInput(){if(document.activeElement!==$('task-input'))$('task-input').value=state.draft;$('char-count').textContent=`${$('task-input').value.length} / 2000`;}
function renderProjects(){
 const structure=state.projects.map(p=>p.id+':'+p.title).join('|');
 if(structure!==lastProjectStructure||!$('project-list').childNodes.length){lastProjectStructure=structure;$('project-list').replaceChildren();
  if(!state.projects.length)$('project-list').append(element('p','empty-projects','还没有项目。写下一个任务，让团队开始协作。'));
  for(const p of state.projects){const b=element('button','project-button');b.dataset.project=p.id;b.append(element('strong','',p.title));const meta=element('div','project-meta');meta.append(element('span','project-status'),element('span','project-percent'));const track=element('div','track');track.append(element('span'));b.append(meta,track);b.onclick=()=>safely(()=>{if(commit(selectProject(state,p.id)))notify('');});$('project-list').append(b);}
 }
 for(const b of $('project-list').querySelectorAll('button')){const p=state.projects.find(p=>p.id===b.dataset.project);b.classList.toggle('active',p.id===state.selectedProject);b.setAttribute('aria-pressed',String(p.id===state.selectedProject));b.querySelector('.project-status').textContent=statusNames[p.status];b.querySelector('.project-percent').textContent=p.progress+'%';b.querySelector('.track span').style.width=p.progress+'%';}
 $('project-count').textContent=state.projects.length;$('complete-count').textContent=state.projects.filter(p=>p.status==='completed').length;
}
// Natural facing direction follows the pose in each transparent illustration.
const meetingPoses = [
  { file: 'pikachu.png', facing: 'right', action: 'coordinate' },
  { file: 'bulbasaur.png', facing: 'right', action: 'read' },
  { file: 'squirtle.png', facing: 'right', action: 'type' },
  { file: 'mew.png', facing: 'left', action: 'draw' },
  { file: 'charizard.png', facing: 'left', action: 'scan' },
];

function meetingSeat(role, seatIndex) {
  const memberIndex = room * 5 + seatIndex;
  const pose = meetingPoses[family(role, memberIndex)];
  const button = element('button', 'robot');
  button.dataset.species = pose.file.replace('.png', '');
  button.dataset.role = role.id;
  button.dataset.action = pose.action;
  button.setAttribute('aria-label', '查看' + role.name + '的职责');
  const facing = pose.facing;
  const figure = element('span', 'figure');
  figure.setAttribute('aria-hidden', 'true');
  figure.style.setProperty('--turn', facing === pose.facing ? '1' : '-1');
  const art = element('span', 'robot-art');
  art.style.setProperty('--robot-image', 'url(assets/' + pose.file + ')');
  figure.append(art);
  const label = element('span', 'robot-name');
  label.append(element('b', '', String(memberIndex + 1).padStart(2, '0')), element('span', '', role.name));
  button.append(figure, label);
  button.onclick = () => safely(() => {
    const index = roleStage[family(role, memberIndex)];
    inspectedNode = index >= 0 ? index : null;
    commit(selectRole(state, role.id));
  });
  return button;
}
const partnerTypes = [
  {type:'电', symbol:'ϟ', color:'#e8bb38', art:'pikachu', skill:'统筹协调'},
  {type:'草 / 毒', symbol:'✿', color:'#7eac62', art:'bulbasaur', skill:'研究分析'},
  {type:'水', symbol:'●', color:'#6eaacb', art:'squirtle', skill:'内容制作'},
  {type:'超能力', symbol:'✦', color:'#c989ad', art:'mew', skill:'创意设计'},
  {type:'火 / 飞行', symbol:'♨', color:'#db8a59', art:'charizard', skill:'审核把关'},
];
function createPartnerCard(role, seatIndex) {
  const memberIndex = room * 5 + seatIndex;
  const visual = partnerTypes[family(role,memberIndex)];
  const button = element('button','partner-card');
  button.type = 'button';
  button.dataset.role = role.id;
  button.style.setProperty('--type-color',visual.color);
  const header = element('span','card-header');
  header.append(element('strong','',role.name),element('span','energy',visual.symbol));
  const artwork = element('span','card-art');
  const portrait = element('canvas','card-sprite');
  portrait.width = 128;
  portrait.height = 128;
  portrait.dataset.species = visual.art;
  portrait.setAttribute('aria-hidden','true');
  artwork.append(portrait);
  const type = element('span','card-type',visual.type+' 属性');
  const skill = element('span','card-skill',visual.skill);
  const progress = element('span','card-progress');
  progress.append(element('span','','任务进度'),element('b'));
  const track = element('span','track');
  track.append(element('span'));
  button.append(header,artwork,type,skill,progress,track,element('span','card-state'));
  button.onclick = () => {
    const target = [...$('robots').children].find(b=>b.dataset.role===role.id);
    target?.click();
  };
  return button;
}
function updatePartnerCards(project, stages) {
  for (const button of $('party-cards').children) {
    const index = state.team.roles.findIndex(r=>r.id===button.dataset.role);
    const stageIndex = roleStage[family(state.team.roles[index],index)];
    const stage = stages[stageIndex];
    const progress = stageIndex<0 ? project?.progress??0 : stage.progress;
    const status = stageIndex<0 ? project?.status??'queued' : stage.status;
    button.classList.toggle('selected',button.dataset.role===state.selectedRole);
    button.setAttribute('aria-pressed',String(button.dataset.role===state.selectedRole));
    button.querySelector('.card-progress b').textContent=progress+'%';
    button.querySelector('.track span').style.width=progress+'%';
    button.querySelector('.card-state').textContent=({running:'正在协作',paused:'等待继续',completed:'已完成',queued:'待命中'})[status];
  }
}
function renderRoles(){
 const totalRooms=Math.ceil(state.team.roles.length/5);room=Math.min(room,totalRooms-1);
 const signature=state.team.id+'|'+state.team.roles.map(r=>r.id+':'+r.name).join('|')+'|'+room;
 if(signature!==lastStructure){lastStructure=signature;
  const members = state.team.roles.slice(room * 5, room * 5 + 5);
  $('robots').replaceChildren(...members.map(meetingSeat));
  $('party-cards').replaceChildren(...members.map(createPartnerCard));
 }
 const project=activeProject(state), stages=stageProgress(project);
 updatePartnerCards(project,stages);
 for(const b of $('robots').children){const index=state.team.roles.findIndex(r=>r.id===b.dataset.role),f=family(state.team.roles[index],index);const working=project?.status==='running'&&(f===0||stages[roleStage[f]]?.status==='running');b.classList.toggle('selected',b.dataset.role===state.selectedRole);b.classList.toggle('robot-working',working);b.setAttribute('aria-pressed',String(b.dataset.role===state.selectedRole));}
 const index=state.team.roles.findIndex(r=>r.id===state.selectedRole),role=state.team.roles[index];
 $('role-title').textContent=role.name;$('role-category').textContent=categories[family(role,index)];$('role-emblem').textContent=String(index+1).padStart(2,'0');
 const brief=(role.duty||'按团队任务分工参与本地协作演示。').split('\n')[0].replace(/^-\s*职责：|\*\*/g,'');$('role-duty').textContent=brief;$('role-full-duty').textContent=role.duty||brief;
 $('team-count').textContent=state.team.roles.length;$('room-label').textContent=`营地 ${String(room+1).padStart(2,'0')}`;$('room-page').textContent=`${String(room+1).padStart(2,'0')} / ${String(totalRooms).padStart(2,'0')}`;
 $('room-prev').disabled=room===0;$('room-next').disabled=room===totalRooms-1;
}
const nodeStates = {running:'运行中', paused:'已暂停', completed:'已完成', queued:'待调度'};
let inspectedNode = null;
let inspectedProject = null;

function inspectNode(index) {
  const member = state.team.roles.findIndex((role, i) => roleStage[family(role, i)] === index);
  inspectedNode = index;
  if (member >= 0) {
    room = Math.floor(member / 5);
    commit(selectRole(state, state.team.roles[member].id));
  } else {
    render();
  }
}

function renderActivity(project, stages) {
  if (project?.id !== inspectedProject) {
    inspectedNode = null;
    inspectedProject = project?.id;
  }
  const current = stages.findIndex(s => s.status === 'running' || s.status === 'paused');
  const inspected = inspectedNode ?? (current >= 0 ? current : project ? stages.length - 1 : 0);
  const stage = stages[inspected];
  const role = state.team.roles.find((r,i) => roleStage[family(r,i)] === inspected);
  const completed = stages.filter(s => s.status === 'completed').length;
  const flow = $('flow-nodes');
  if (!flow.children.length) {
    stages.forEach((s,index) => {
      const button = element('button','flow-node');
      button.type = 'button';
      button.append(element('span','port'), element('code','',s.id), element('strong','',s.name), element('small'));
      button.onclick = () => safely(() => inspectNode(index));
      flow.append(button);
    });
  }
  stages.forEach((s,index) => {
    const button = flow.children[index];
    button.dataset.state = s.status;
    button.setAttribute('aria-pressed',String(index === inspected));
    button.lastElementChild.textContent = nodeStates[s.status];
    button.style.setProperty('--step',s.progress + '%');
  });
  $('flow-summary').textContent = completed + ' / ' + stages.length + ' 节点完成';
  $('gauge-value').textContent = project?.progress ?? 0;
  document.querySelector('.gauge').style.setProperty('--fill', (project?.progress ?? 0) + '%');
  $('monitor-state').textContent = project ? statusNames[project.status] : '等待输入';
  $('follow-node').hidden = inspectedNode === null;
  const code = $('node-output');
  code.replaceChildren();
  for (const [label,value] of [['负责伙伴',role?.name ?? '待分配'],['当前环节',stage.name],['状态',nodeStates[stage.status]],['环节进度',stage.progress+'%']]) {
    const row=element('div','partner-stat');
    row.append(element('span','',label),element('strong','',value));
    code.append(row);
  }
  const log = $('activity');
  const signature = JSON.stringify([project?.id,stages.map(s => s.status)]);
  if (log.dataset.signature === signature) return;
  log.dataset.signature = signature;
  log.replaceChildren();
  if (!project) {
    log.append(element('p','activity-empty','等待第一条任务。'));
    return;
  }
  for (const s of stages.filter(item => item.status !== 'queued')) {
    const row = element('div','trace-event');
    row.dataset.state = s.status;
    row.append(element('code','',s.id),element('span','',s.name),element('small','',nodeStates[s.status]));
    log.append(row);
  }
}
function render(){
 if(!state)return;updateInput();renderProjects();renderRoles();const p=activeProject(state),stages=stageProgress(p);
 $('screen-title').textContent=p?.title||'给团队一个新目标';$('screen-status').textContent=p?statusNames[p.status]:'等待任务';$('screen-percent').replaceChildren(document.createTextNode(String(p?.progress||0)),element('span','','%'));$('screen-bar').style.width=(p?.progress||0)+'%';
 const current=stages.find(s=>s.status==='running'||s.status==='paused');$('screen-caption').textContent=p?.status==='completed'?'全部演示环节已完成':current?current.name+' · '+(p.status==='paused'?'等待继续':'模拟处理中'):'从第一个想法开始';
 if(!$('screen-stages').children.length)for(const s of stages){const wrap=element('div','screen-stage');wrap.append(element('span','',s.name));const t=element('div','track');t.append(element('span'));wrap.append(t);$('screen-stages').append(wrap);}
 [...$('screen-stages').children].forEach((n,i)=>{n.classList.toggle('active',stages[i].status==='running');n.classList.toggle('done',stages[i].status==='completed');n.querySelector('.track span').style.width=stages[i].progress+'%';});
 $('pause-button').disabled=!p||p.status==='completed'||brokenRaw!==null;$('pause-button').textContent=p?.status==='completed'?'已完成':p?.status==='paused'?'继续演示':'暂停';
 $('start-button').disabled=!state.draft.trim()||p?.status==='running'||brokenRaw!==null;
 $('scene-caption').textContent=p?.status==='running'?'团队正在推进模拟任务':p?.status==='completed'?'这次协作演示已完成':p?'演示已暂停，随时继续':'伙伴就位，等待你的灵感';
 $('result-card').hidden=p?.status!=='completed';renderActivity(p,stages);
}
function changeTeam(team){const normalized=createState(team).team;const next={...state,team:normalized,selectedRole:normalized.roles[0].id};validateState(next);if(commit(next)){room=0;render();notify('已切换展示团队，现有项目与进度保留。');}}
async function readJSONFile(file){if(!file||!/\.json$/i.test(file.name))throw Error('请选择JSON文件。');if(file.size>8*1024*1024)throw Error('文件不能超过8 MiB。');return file.text();}
try{
 const response=await fetch('assets/team.json');if(!response.ok)throw Error('团队配置加载失败，请重新启动Demo。');fullTeam=await response.json();
 const ids=['seat-chief','seat-intelligence','seat-production','seat-art-editor','seat-review'];defaultTeam={id:'office-five',name:'五人演示团队',roles:ids.map(id=>fullTeam.roles.find(r=>r.id===id))};
 state=createState(defaultTeam);
 try{const saved=localStorage.getItem(KEY);if(saved!==null){try{state=restore(saved);$('save-status').textContent='✓ 已恢复本地存档';}catch{brokenRaw=saved;notify('本地存档格式损坏，已保留原件。请打开设置，导出原件或导入有效备份。',true);$('export-damaged').hidden=false;}}
 else{state=togglePause(tick(createProject(state,'本周行业简报'),36));persist(state);}}
 catch{storageBlocked=true;notify('浏览器未允许本地存储。请允许存储后重试，或使用导出保存。',true);}
 render();
}catch(error){notify(error.message,true);$('start-button').disabled=true;}

$('task-input').addEventListener('input',()=>safely(()=>{if(!state)return;const value=$('task-input').value;const next=setDraft(state,value);if(commit(next,{draft:true})){ $('char-count').textContent=value.length+' / 2000';$('start-button').disabled=!value.trim()||activeProject(state)?.status==='running';}}));
$('task-form').addEventListener('submit',event=>{event.preventDefault();safely(()=>{if(!state||activeProject(state)?.status==='running')return;if(commit(createProject(state,$('task-input').value))){$('task-input').value='';notify('模拟任务已开始。可暂停，刷新后会恢复为暂停状态。');render();}});});
$('sample-task').onclick=()=>safely(()=>{if(commit(setDraft(state,'整理一份本周行业简报，归纳三个趋势，并给出正文与配图建议。')))$('task-input').focus();});
$('new-project').onclick=()=>{$('task-input').focus();$('task-input').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
$('pause-button').onclick=()=>safely(()=>{if(commit(togglePause(state)))notify(activeProject(state)?.status==='running'?'已继续模拟演示。':'已暂停，进度已保存。');});
$('room-prev').onclick=()=>{room=Math.max(0,room-1);renderRoles();};$('room-next').onclick=()=>{room=Math.min(Math.ceil(state.team.roles.length/5)-1,room+1);renderRoles();};
$('follow-node').onclick = () => { inspectedNode = null; render(); };
const appleKeyboard = /Mac|iPhone|iPad/.test(navigator.platform);
$('run-shortcut').textContent = appleKeyboard ? '⌘ ↵' : 'Ctrl ↵';
$('task-input').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.isComposing && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    if (!$('start-button').disabled) $('task-form').requestSubmit();
  }
});
$('export-result').onclick = () => safely(() => {
  const project = activeProject(state);
  if (project?.status !== 'completed') return;
  const record = {mode:'simulation',project,stages:stageProgress(project)};
  download(JSON.stringify(record,null,2),'工作流-模拟运行记录.json');
});
for(const id of ['export-main','export-settings'])$(id).onclick=()=>safely(exportState);
$('settings-open').onclick=()=>{$('team-select').value=state?.team.id===fullTeam?.id?'full':state?.team.id==='office-five'?'demo':'';$('settings-dialog').showModal();};
$('settings-close').onclick=()=>{$('settings-dialog').close();$('settings-open').focus();};
$('settings-dialog').addEventListener('close',()=>$('settings-open').focus());
$('team-select').onchange=()=>safely(()=>changeTeam($('team-select').value==='full'?fullTeam:defaultTeam));
$('export-damaged').onclick=()=>download(brokenRaw||'','个人办公室-待修复原始存档.json');
$('import-state').onchange=async event=>{const file=event.target.files[0],version=++importVersion;if(!file)return;try{const next=restore(await readJSONFile(file));if(version!==importVersion)return;const previous=brokenRaw??serialize(state);localStorage.setItem(BACKUP,previous);if(commit(next,{force:true})){room=0;render();notify('存档已恢复，演示处于暂停状态。导入前的存档已备份。');}}catch(error){notify('未导入：'+error.message,true);}finally{event.target.value='';}};
$('import-team').onchange=async event=>{const file=event.target.files[0],version=++importVersion;if(!file)return;try{const raw=await readJSONFile(file);if(version!==importVersion)return;const team=TeamDefinition.importDefinition(JSON.parse(raw),'zh').team;changeTeam(team);}catch(error){notify('团队未导入：'+error.message,true);}finally{event.target.value='';}};
const previousButton=element('button','','导出导入前备份');previousButton.onclick=()=>safely(()=>{const previous=localStorage.getItem(BACKUP);if(!previous)throw Error('还没有导入前备份。');download(previous,'个人办公室-导入前备份.json');});document.querySelector('.settings-actions').append(previousButton);
setInterval(()=>{if(state&&!storageBlocked&&brokenRaw===null&&activeProject(state)?.status==='running')safely(()=>commit(tick(state,2)));},1500);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state&&activeProject(state)?.status==='running')safely(()=>commit(togglePause(state)));});

try {
  const {startPixelCamp} = await import('./pixel-camp.mjs');
  await startPixelCamp($('scene'));
} catch {
  $('scene-caption').textContent='伙伴动作加载失败，请刷新重试；职位卡片仍可使用';
}
