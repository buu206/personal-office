'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const labels={
    brand:['一人成阵','Solo to Team'],title:['带底稿开工','Start with your drafts'],
    intro:['把手里的原件和任务要求装进一个新项目，交给自己的首席。','Put your source files and brief in one project for your team lead.'],
    files:['底稿原件','Source files'],select:['选择文件','Choose files'],add:['可分次添加','Add in more than one batch'],
    limits:['1–8 份，每份不超过 12 MiB，合计不超过 32 MiB。支持普通文档、无宏 Office、PDF 和图片。','Choose 1–8 files, up to 12 MiB each and 32 MiB total. Plain text, standard macro-free Office documents, PDF and images are supported.'],
    formats:['支持的格式与同名处理','Formats and duplicate names'],
    formatDetails:['MD、TXT、CSV、PDF、DOCX、XLSX、PPTX、PNG、JPEG、WebP。同名文件各有独立序号；原名、字节数和指纹都写进随包清单。','MD, TXT, CSV, PDF, DOCX, XLSX, PPTX, PNG, JPEG and WebP. Each file gets its own numbered path. The manifest preserves its original name, size and hash.'],
    brief:['任务要求','Task brief'],task:['想让团队做什么？','What should the team do?'],criteria:['你怎么判断做对了？','What must the result satisfy?'],
    handoff:['交给首席','Handoff to your lead'],stage:['这次先做哪一步？','What is authorized now?'],
    receipt:['只收件，等我再说','Receipt only; wait for my next message'],produce:['确认收件后，开始制作和独审','Acknowledge, then produce and review'],
    ownTeam:['可选：选择现有中性团队 JSON','Optional: choose an existing team definition JSON'],restore:['用默认 16 席','Use the 16-role team'],
    right:['我有权将所选材料交给自己使用的宿主。','I have the right to give these files to my chosen host.'],
    export:['生成项目 ZIP','Build project ZIP'],cancel:['取消生成','Cancel build'],clear:['清空本页','Clear form'],
    after:['解压到新空目录，在 DeepSeek Harness 中选含 JOB.json 的那一层。打开 START.md，按本次授权发首条消息。','Extract to a new empty folder. In DeepSeek Harness open the folder containing JOB.json. Open START.en.md and send the first message for your chosen scope.'],
    privacy:['整个页面在本地处理，不发网络请求，也不把所选文件写进浏览器存储。下载只生成新 ZIP。真实办单使用宿主的账号、模型和权限。','The page processes files locally with no network requests or browser storage. Downloading creates a new ZIP. Running a task uses your host account, model and permissions.']
  };
  let en=location.hash==='#en',files=[],next=0,team=null,invalidTeam=false,teamLoading=false,teamEpoch=0,generation=null;
  const roleCatalog=RoleMentions.createCatalog([TeamPreset.initial('zh'),TeamPreset.initial('en')]);
  let roleMentionCount=0,teamSelectionNotice=false;
  const t=(zh,eg)=>en?eg:zh;
  function tell(text='',fault=false){teamSelectionNotice=false;$('status').textContent=text;$('status').dataset.fault=String(fault);}
  function selectedTeamStatus(){
    tell(t('已选用自定义团队。','Custom team selected.')+(roleMentionCount?t(' 上方有未选岗位提及提醒，请核对。',' Check the unselected-role notice above.'):''));
    teamSelectionNotice=true;
  }
  function byteCount(n){return n<1024?n+' B':n<1024*1024?(n/1024).toFixed(1)+' KiB':(n/(1024*1024)).toFixed(2)+' MiB';}
  function lock(){
    const busy=!!generation;
    $('export').disabled=busy||teamLoading||invalidTeam||!files.length||!$('task').value.trim()||!$('criteria').value.trim()||!$('authorized').checked;
    for(const id of ['draft-files','task','criteria','authorized','scope','custom-team','default-team'])$(id).disabled=busy;
    for(const b of $('file-list').querySelectorAll('button'))b.disabled=busy;
    $('cancel').hidden=!busy;
  }
  function showScope(){
    $('scope-help').textContent=$('scope').value==='receipt'?t('只要求收件。首席在原会话确认原件和版次，等你下次直接委托。','The lead acknowledges the actual inputs and source versions in your chat, then waits.') :
      t('你向宿主首席发送开工消息后，它先确认收件，再派制作、独审并回到原会话交件。','After you send the start message, the lead acknowledges receipt, assigns production and review, and delivers in your original chat.');
  }
  function roster(){
    const d=team||TeamPreset.initial(en?'en':'zh');
    $('team-summary').textContent=invalidTeam?t('团队文件有问题','Team file needs attention'):d.name+' · '+d.roles.length+t(' 席 · ',' roles · ')+d.groups.length+t(' 群',' groups');
    $('team-info').textContent=invalidTeam?t('请重选有效 JSON，或点“用默认 16 席”。','Choose a valid JSON or use the 16-role team.'):d.roles.map(r=>r.name).join(' · ');
    const rows=invalidTeam?[]:RoleMentions.find(d,roleCatalog),list=$('role-mentions-list');
    roleMentionCount=rows.length;$('role-mentions').hidden=rows.length===0;list.replaceChildren();
    $('role-mentions-title').textContent=t('职责或群说明提到了未选岗位','Duties or group notes mention unselected roles');
    $('role-mentions-help').textContent=t('以下职责或群说明仍提到未选岗位。请核对接单、交接和回件安排，必要时修改文字或补回岗位。这里只检查模板岗位名称的文字匹配；同名不证明授权关系。','These duties or group notes still name unselected roles. Check who receives assignments, handoffs and returns; edit the text or restore roles as needed. This is a literal match of template role names; a matching name does not establish authority.');
    for(const row of rows)list.append(node('li',t(row.kind==='role'?'席位':'群组',row.kind==='role'?'Role':'Group')+' “'+row.name+'”'+t(' 提及：',' mentions: ')+row.mentions.flatMap(mention=>mention.names).join(t('、',', '))));
  }
  function renderFiles(){
    $('file-list').replaceChildren();
    for(const row of files){
      const li=node('li'),name=node('span',row.file.name),size=node('small',byteCount(row.file.size)),remove=node('button',t('移除','Remove'));
      remove.type='button';remove.dataset.remove=row.key;remove.setAttribute('aria-label',t('移除 ','Remove ')+row.file.name);
      remove.onclick=()=>{files=files.filter(r=>r!==row);$('authorized').checked=false;tell();renderFiles();};
      li.append(name,size,remove);$('file-list').append(li);
    }
    $('total').textContent=files.length+t(' 份原件 · ',' files · ')+byteCount(files.reduce((n,r)=>n+r.file.size,0))+' / 32 MiB';lock();
  }
  function translate(){
    en=location.hash==='#en';document.documentElement.lang=en?'en':'zh-CN';document.title=t('带底稿开工 · 一人成阵','Start with your drafts · Solo to Team');
    document.querySelectorAll('[data-i]').forEach(e=>{const v=labels[e.dataset.i];if(v)e.textContent=v[en?1:0];});
    $('lang').textContent=t('English','中文');$('lang').lang=t('en','zh-CN');$('lang').setAttribute('aria-label',t('Switch to English','切换中文'));
    $('task').placeholder=t('例如：根据附件拟一份可交接的执行表。','Example: Turn these drafts into a handover sheet.');
    $('criteria').placeholder=t('例如：逐项列明负责人、数量和来源；未确定的地方单列。','Example: Include owners, quantities and sources. Separate unconfirmed items.');
    roster();showScope();renderFiles();if(teamSelectionNotice)selectedTeamStatus();
  }
  $('lang').onclick=()=>{location.hash=en?'zh':'en';};window.addEventListener('hashchange',translate);
  $('draft-files').onchange=e=>{
    const added=Array.from(e.target.files);e.target.value='';if(!added.length)return;
    try{DraftProject.checkList([...files.map(r=>r.file),...added]);files.push(...added.map(file=>({key:String(++next),file})));$('authorized').checked=false;tell();renderFiles();}
    catch(err){tell(err.message,true);}
  };
  $('custom-team').onchange=async e=>{
    const f=e.target.files[0];e.target.value='';if(!f)return;const stamp=++teamEpoch;teamLoading=true;lock();tell();$('authorized').checked=false;
    try{
      if(!f.size||f.size>TeamDefinition.maxDocument)throw Error(t('团队 JSON 为空或超过 32 MiB。','Team JSON is empty or exceeds 32 MiB.'));
      const r=TeamDefinition.importDefinition(JSON.parse(await f.text()),en?'en':'zh').team;
      if(r.workflow.dispatch!==r.workflow.deliver)throw Error(t('DSH 由同一根会话派工和交回。请调整分工或选择其他团队。','This DSH adapter requires dispatch and delivery in the same root role.'));
      if(stamp!==teamEpoch)return;team=r;invalidTeam=false;roster();selectedTeamStatus();
    }catch(err){if(stamp!==teamEpoch)return;team=null;invalidTeam=true;tell(err.message,true);}
    finally{if(stamp===teamEpoch){teamLoading=false;roster();lock();}}
  };
  $('default-team').onclick=()=>{teamEpoch++;team=null;invalidTeam=false;teamLoading=false;$('authorized').checked=false;roster();tell();lock();};
  for(const id of ['task','criteria','authorized'])$(id).addEventListener('input',lock);
  $('scope').onchange=()=>{showScope();lock();};
  function cancel(){if(generation){generation.abort();generation=null;}lock();}
  $('cancel').onclick=()=>{cancel();tell(t('已取消生成，所选资料仍在本页。','Build cancelled. Your selections remain on this page.'));};
  $('clear').onclick=()=>{cancel();teamEpoch++;teamLoading=false;team=null;invalidTeam=false;files=[];$('brief').reset();roster();showScope();renderFiles();tell(t('本页选择已清空。','The form has been cleared.'));};
  $('brief').onsubmit=async e=>{
    e.preventDefault();if($('export').disabled||generation)return;
    const ctl=new AbortController();generation=ctl;lock();tell(t('正在生成项目…','Building the project…'));
    try{
      const blob=await DraftProject.generate({files:files.map(r=>r.file),task:$('task').value,criteria:$('criteria').value,scope:$('scope').value,team,lang:en?'en':'zh',signal:ctl.signal,
        progress:(i,n)=>tell(t('正在核读原件 ','Checking source ')+i+' / '+n)});
      if(ctl.signal.aborted||generation!==ctl)return;
      // Keep two different projects distinct even when the browser writes directly to the same download folder.
      const tag=new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));
      if(ctl.signal.aborted||generation!==ctl)return;
      const short=Array.from(tag.subarray(0,12),byte=>byte.toString(16).padStart(2,'0')).join('');
      const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='Solo-to-Team-'+$('scope').value+'-'+short+'.zip';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
      tell(t('已交给浏览器下载。解压到新空目录，从 START.md 开始。','Download requested. Extract in a new empty folder and open START.en.md.'));
    }catch(err){if(generation===ctl&&!ctl.signal.aborted)tell(err.message,true);}
    finally{if(generation===ctl){generation=null;lock();}}
  };
  translate();
})();
