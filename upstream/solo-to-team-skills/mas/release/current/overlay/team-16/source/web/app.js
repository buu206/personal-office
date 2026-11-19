'use strict';
(() => {
  const C=TeamDefinition;
  const $=id=>document.getElementById(id);
  const language=()=>location.hash==='#en'?'en':'zh';
  const tr=(zh,en)=>language()==='en'?en:zh;
  const messages={
    brand:['一人成阵','Solo to Team'],title:['16席六群建队台','16-role team builder'],
    intro:['从 16 席、6 群的完整团队开始，把分工、沟通群和交接方式改成自己团队的做法。','Start with the complete 16-role, 6-group team. Define whom your team needs, where they coordinate, and who hands work to whom.'],
    sampleNotice:['先选适合任务的岗位，核对职责和群关系，再选平台导出。','Choose the roles for your task, check their duties and groups, then export for your platform.'],
    pilotScope:['第一单可从首席、生产、审核三席开始，其他岗位按任务启用。六群是可调整的建议配置。','Start a first task with the lead, producer and reviewer. Activate other roles as needed and adapt the suggested groups.'],
    ruleDownload:['下载群规全文','Download full group rules'],
    ruleHint:['向相应助手提供适用小节，并核对它读到的内容。全文是默认模板参考，不会自动加载或覆盖你的修改。','Provide the relevant sections to each assistant and verify receipt. These are default-template references; they are not loaded automatically and do not override your edits.'],
    fileIdentity:['配置文件标识','Configuration ID'],identityHint:['同一团队沿用这个标识；制作另一支团队时可更换。','Keep the ID for this team. Use a different ID for a separate team.'],
    evidenceTitle:['自定义导出实测到了哪一步？','What has been verified for custom exports?'],
    independentScope:['建队器核对生产与独审的席位 ID 是否不同。两席背后是否同一操作者、审核是否实际独立，要看运行记录和审核席打开的成品。','The builder checks that production and review have different role IDs. The run record and the file the reviewer opened are needed to establish who operated those seats and whether review was independent.'],
    hostEvidence:['以下为此前四席版本的验证记录；本次 16 席扩展尚待逐端实测。固定首单包与用户导出的岗位包是两份不同的文件，各自核收。自定义 DeepSeek 样例改名并新增一席后，据团队本机观察，使用当时四席版本建队器导出的项目在本机宿主运行；界面显示 3 个子任务，留有岗位分工、审核记录和第四席回件。云端复核未取得平台运行日志。自定义 OpenMausBot 四席部门文件已用 0.1.148 的实际数据层在隔离存储导入；用户真实账号界面跑单尚未实测。两项的回执和导入记录留在团队侧，未放入本包，读者无法在包内复核。','These are historical verification records for the earlier four-seat version; the present 16-seat extension still requires testing on each host. The fixed starter and a team exported by the editor are separate artifacts with separate evidence. In the team’s local observation, a renamed four-seat team ran in DeepSeek Harness from a project exported by the earlier four-seat builder version. The UI showed three subtasks; retained files cover assignments, review and the fourth seat’s return. Cloud review had no platform runtime logs. A custom four-seat OpenMausBot department was imported with the native 0.1.148 data layer in isolated storage. A run in a real user account through its UI remains untested. The team holds the receipts and import records for these two observations outside this package; readers cannot independently verify them from this download.'],
    hostTitle:['带到你的平台','Take the team to your host'],
    hostHint:['OpenMausBot 导出部门与岗位，带群协作说明。DeepSeek Harness 用项目子任务，原会话由派工席交回，要求两项指向同一角色。此处的群籍与职责不创建原生群聊或授予账户权限。','OpenMausBot carries the department, roles and group instructions. DeepSeek Harness runs project subtasks and requires its dispatcher to return work in the same session. Group membership here creates no native room or account permission.'],
    exportMaus:['导出 OpenMausBot 部门文件','Export OpenMausBot department'],exportDsh:['导出 DeepSeek Harness 项目','Export DeepSeek Harness project'],
    import:['打开配置','Open a file'],export:['保存配置文件','Save team file'],teamName:['团队名称','Team name'],
    roles:['席位','Roles'],groups:['群组','Groups'],workflow:['交接','Handoffs'],
    replace:['使用这份配置','Use this file'],cancel:['取消','Cancel'],
    privacy:['页面在本地处理数据，不发起网络请求。下载的是本地文件；到宿主中安装、确认权限、发出首单是分开的步骤。','This page processes data locally and makes no network requests. You download a local file. Host installation, permissions and sending the first task are separate steps.']
  };
  let team=TeamPreset.initial(language()), mode='role', selected=team.workflow.dispatch, dirty=false, revision=0, pending=null, importEpoch=0;
  const roleCatalog=RoleMentions.createCatalog([TeamPreset.initial('zh'),TeamPreset.initial('en')]);
  let roleMentionCount=0;
  let avatarBusy=0, undo=null, lastStatus=null, platformPanel=null;
  const avatarReads=new WeakMap();
  const pickText=(array)=>tr(array[0],array[1]);
  const stageNames={dispatch:['归口派工','Dispatch'],produce:['制作成品','Produce'],review:['独立审核','Review independently'],deliver:['交回成品','Deliver back']};
  function node(tag,content,cls) {
    const el=document.createElement(tag);
    if(content!==undefined && content!==null) el.textContent=content;
    if(cls) el.className=cls;
    return el;
  }
  function button(text,action,cls,id) {
    const el=node('button',text,cls);el.type='button';if(id) el.id=id;
    el.addEventListener('click',action);return el;
  }
  function status(zh,en,error=false) {
    lastStatus=[zh,en,error];$('status').textContent=tr(zh,en);$('status').classList.toggle('warning',error);
  }
  function edited() {
    dirty=true;revision+=1;undo=null;platformPanel?.sync();
    renderRoleMentions();
    status('有未保存的改动','Unsaved changes');
  }
  function renderRoleMentions() {
    const rows=RoleMentions.find(team,roleCatalog),panel=$('role-mentions'),list=$('role-mentions-list');
    roleMentionCount=rows.length;panel.hidden=rows.length===0;list.replaceChildren();
    $('role-mentions-title').textContent=tr('职责或群说明提到了未选岗位','Duties or group notes mention unselected roles');
    $('role-mentions-help').textContent=tr(
      '以下职责或群说明仍提到未选岗位。请核对接单、交接和回件安排，必要时修改文字或补回岗位。这里只检查模板岗位名称的文字匹配；同名不证明授权关系。',
      'These duties or group notes still name unselected roles. Check who receives assignments, handoffs and returns; edit the text or restore roles as needed. This is a literal match of template role names; a matching name does not establish authority.');
    for(const row of rows){
      const names=row.mentions.flatMap(mention=>mention.names).join(tr('、',', '));
      list.append(node('li',tr(row.kind==='role'?'席位':'群组',row.kind==='role'?'Role':'Group')+' “'+row.name+'”'+tr(' 提及：',' mentions: ')+names));
    }
  }
  function findRole(id) {return team.roles.find(r=>r.id===id);}
  function objects() {return mode==='role'?team.roles:team.groups;}
  function item() {return objects().find(x=>x.id===selected);}
  function decorateAvailability() {
    $('export').disabled=avatarBusy>0;
    platformPanel?.availability();
  }
  function langLabels() {
    document.documentElement.lang=language()==='en'?'en':'zh-CN';
    document.title=tr('16席六群建队台 · 一人成阵','16-role team builder · Solo to Team');
    for(const el of document.querySelectorAll('[data-i]')) el.textContent=pickText(messages[el.dataset.i]);
    $('lang').textContent=tr('English','中文');$('lang').href=tr('#en','#zh');$('lang').lang=tr('en','zh-CN');
    if(lastStatus)status(...lastStatus); else status('本地草稿','Local draft');
    $('team-name').value=team.name;$('team-id').value=team.id;
    if(pending) showPending();platformPanel?.sync(true);
  }
  function avatarView(r,kind) {
    const el=node('span',null,kind);
    if (r.avatar) {
      const img=node('img');img.src=r.avatar.data;img.alt='';el.append(img);
    } else el.textContent=(Array.from(r.name.trim())[0] || '·').toUpperCase();
    return el;
  }
  function switchMode(next) {
    mode=next;selected=next==='role'?team.roles[0]?.id:next==='group'?team.groups[0]?.id:null;
    render();
  }
  function renderSide() {return FocusRetention.preserve([$('sidebar')],drawSide);}
  function selectedPick(){
    return [...$('sidebar').querySelectorAll('[data-key]')].find(el=>el.dataset.key===selected)||$('add-item');
  }
  function drawSide() {
    for(const b of document.querySelectorAll('button[data-mode]')) b.setAttribute('aria-current',String(b.dataset.mode===mode));
    const side=$('sidebar');side.replaceChildren();
    if(mode==='flow') {
      side.append(node('p',tr('建队器核对生产与独审的席位 ID 是否不同。两席背后是否同一操作者、审核是否实际独立，要看运行记录和审核席打开的成品。','The builder checks that production and review have different role IDs. The run record and the file the reviewer opened are needed to establish who operated those seats and whether review was independent.'),'explain'));
      return;
    }
    for(const obj of objects()) {
      const b=button('',()=>{selected=obj.id;render();},'pick');b.dataset.key=obj.id;
      b.setAttribute('aria-current',String(selected===obj.id));
      if(mode==='role') b.append(avatarView(obj,'dot'));
      b.append(node('span',obj.name||tr('未命名','Untitled')));side.append(b);
    }
    side.append(button(mode==='role'?tr('＋ 新增席位','＋ Add role'):tr('＋ 新增群组','＋ Add group'),addItem,'add','add-item'));
    if(undo) side.append(button(tr('撤销刚才的删除','Undo deletion'),undoDelete,null,'undo-delete'));
  }
  function generateID(prefix,items) {
    const used=new Set(items.map(x=>x.id));
    let id;
    do {
      const bytes=crypto.getRandomValues(new Uint8Array(12));
      id=prefix+'-'+Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
    } while(used.has(id));
    return id;
  }
  function addItem() {
    const role=mode==='role', list=objects(), id=generateID(role?'role':'group',list);
    const prefix=role?tr('新席位 ','New role '):tr('新群组 ','New group ');
    const names=new Set(list.map(x=>x.name));let j=1;while(names.has(prefix+j))j++;
    const value=role?{id,name:prefix+j,responsibility:'',avatar:null}:{id,name:prefix+j,purpose:'',members:[]};
    list.push(value);selected=id;edited();render(active=>active.id==='add-item'?$('item-name'):null);
    if(document.activeElement!==$('item-name'))$('item-name').focus();
    $('item-name').select();
  }
  function field(parent,id,label,value,long,change) {
    const wrap=node('div',null,'field'), lab=node('label',label);lab.htmlFor=id;
    const el=node(long?'textarea':'input');if(!long)el.type='text';
    el.id=id;el.value=value;el.autocomplete='off';el.addEventListener('input',()=>change(el.value));
    wrap.append(lab,el);parent.append(wrap);return el;
  }
  function undoDelete(){
    if(!undo)return;
    const old=undo;team=old.team;mode=old.mode;selected=old.id;edited();render(active=>active.id==='undo-delete'?selectedPick():null);status('已撤销删除，记得保存。','Deletion undone. Save your changes.');
  }
  function removeItem() {
    const obj=item();if(!obj)return;
    if(mode==='role') {
      const bindings=C.stages.filter(k=>team.workflow[k]===obj.id);
      if(bindings.length) {
        status('请先到「交接」改派职责：'+bindings.map(k=>stageNames[k][0]).join('、'),'Reassign first under Handoffs: '+bindings.map(k=>stageNames[k][1]).join(', '),true);return;
      }
      if (team.groups.some(g=>g.members.length===1 && g.members[0]===obj.id)) {
        status('这是某个群唯一的成员。请先调整该群的成员，或删除空闲群。','This is a group’s only member. Reassign its membership or remove that group first.',true);return;
      }
    }
    const affectedGroups=mode==='role'?team.groups.filter(g=>g.members.includes(obj.id)).map(g=>g.name):[];
    const saved={team:JSON.parse(JSON.stringify(team)),mode,id:obj.id};
    if(mode==='role') {
      team.roles=team.roles.filter(r=>r.id!==obj.id);
      team.groups.forEach(g=>{g.members=g.members.filter(id=>id!==obj.id);});
    } else team.groups=team.groups.filter(g=>g.id!==obj.id);
    selected=objects()[0]?.id;edited();undo=saved;render(active=>active.id==='delete-item'?selectedPick():null);
    const groupNoticeZh=affectedGroups.length?' 同时退出 '+affectedGroups.length+' 个群：'+affectedGroups.join('、')+'。':'';
    const groupNoticeEn=affectedGroups.length?' Also removed from '+affectedGroups.length+' group'+(affectedGroups.length===1?'':'s')+': '+affectedGroups.join(', ')+'.':'';
    if(roleMentionCount)status('已移除；上方列出仍提及未选岗位的职责或群说明，请核对。'+groupNoticeZh,'Removed. Check the notice above for duties or group notes that still name unselected roles.'+groupNoticeEn);
    else status('已从草稿移除，可撤销或保存。'+groupNoticeZh,'Removed from the draft. Undo or save.'+groupNoticeEn);
  }
  async function confirmDecode(avatar) {
    const image=new Image();
    await new Promise((resolve,reject)=>{
      image.onload=()=>resolve();image.onerror=()=>reject(Error(tr('浏览器无法解码这张头像。','The browser could not decode this image.')));
      image.src=avatar.data;
    });
    if (!image.naturalWidth || !image.naturalHeight || Math.max(image.naturalWidth,image.naturalHeight)>2048)
      throw Error(tr('头像尺寸超出限制。','Image dimensions are outside the limit.'));
  }
  async function attachAvatar(file,r){
    if(!file)return;
    const identity=team, epoch=(avatarReads.get(r)||0)+1;
    avatarReads.set(r,epoch);
    avatarBusy++;decorateAvailability();
    try{
      if(!C.types.includes(file.type) || file.size>C.maxAvatar || !file.size || /\.svgz?$/i.test(file.name))
        throw Error(tr('请选择不超过 512 KiB 的 PNG、JPEG 或 WebP。','Choose a PNG, JPEG or WebP no larger than 512 KiB.'));
      const bytes=new Uint8Array(await file.arrayBuffer());C.inspectRaster(bytes,file.type);
      const reader=new FileReader();
      const data=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Image read failed'));reader.readAsDataURL(file);});
      const avatar={mime:file.type,data};await confirmDecode(avatar);
      if(identity!==team || !team.roles.includes(r))return;
      if (avatarReads.get(r)!==epoch) return;
      r.avatar=avatar;edited();render();
    }catch(ex){status(ex.message,ex.message,true);}
    finally{avatarBusy--;decorateAvailability();}
  }
  function roleForm(container,r) {
    const row=node('div',null,'avatar-row');row.append(avatarView(r,'portrait'));
    const ctrl=node('div'),actions=node('div',null,'actions');
    const input=node('input');input.type='file';input.id='avatar-file';input.accept='image/png,image/jpeg,image/webp';input.hidden=true;
    input.addEventListener('change',()=>{const f=input.files[0];input.value='';attachAvatar(f,r);});
    actions.append(button(tr('选择头像','Choose avatar'),()=>input.click(),null,'choose-avatar'),input);
    if(r.avatar)actions.append(button(tr('移除头像','Remove avatar'),()=>{avatarReads.set(r,(avatarReads.get(r)||0)+1);r.avatar=null;edited();render(active=>active.id==='remove-avatar'?$('choose-avatar'):null);},null,'remove-avatar'));
    ctrl.append(node('p',tr('PNG / JPEG / WebP，单张 ≤ 512 KiB，边长 ≤ 2048 像素。','PNG / JPEG / WebP, up to 512 KiB and 2048 pixels per side.'),'explain'),actions);
    row.append(ctrl);container.append(row);
    field(container,'item-description',tr('岗位职责','Responsibility'),r.responsibility,true,v=>{r.responsibility=v;edited();});
  }
  function groupForm(container,g) {
    field(container,'item-description',tr('群用途','Group purpose'),g.purpose,true,v=>{g.purpose=v;edited();});
    const f=node('div',null,'field');f.append(node('h3',tr('群成员','Group members')),node('p',tr('入群用于知情与协作。派工权和宿主权限仍按原授权执行。','Group membership shares context. Dispatch authority and host permissions stay with their existing owners.'),'explain'));
    const list=node('div',null,'checks');
    for(const r of team.roles) {
      const label=node('label'),cb=node('input');cb.type='checkbox';cb.checked=g.members.includes(r.id);cb.value=r.id;cb.dataset.member=r.id;
      cb.addEventListener('change',()=>{g.members=cb.checked?[...g.members,r.id]:g.members.filter(x=>x!==r.id);edited();});label.append(cb,node('span',r.name));list.append(label);
    }
    f.append(list);container.append(f);
  }
  function flowForm(container){
    const title=node('h2',tr('一项任务怎样交回','How work gets delivered'));title.id='editor-title';
    container.append(title,node('p',tr('首席可兼任派工与交回。此处只核生产与独审使用不同 ID，实际独立性以运行记录为准。','One lead can dispatch and deliver. This check compares role IDs. Review independence is established by the actual run.'),'explain'));
    const grid=node('div',null,'flow');
    for(const key of C.stages){
      const wrap=node('div',null,'field'),label=node('label',pickText(stageNames[key])),select=node('select');
      label.htmlFor=select.id='stage-'+key;
      for(const r of team.roles){const opt=node('option',r.name);opt.value=r.id;select.append(opt);}
      select.value=team.workflow[key];
      select.addEventListener('change',()=>{team.workflow[key]=select.value;edited();if(team.workflow.produce===team.workflow.review)status('生产与独审的席位 ID 必须不同。','Use different role IDs for production and review.',true);});wrap.append(label,select);grid.append(wrap);
    }
    container.append(grid);
  }
  function render(focusTarget) {
    return FocusRetention.preserve([$('sidebar'),$('editor')],()=>{
    renderRoleMentions();
    drawSide();const editor=$('editor');editor.replaceChildren();if(mode==='flow'){flowForm(editor);return;}
    const obj=item();const heading=node('h2',obj?.name||tr('新增群组后编辑','Add a group to edit it'));heading.id='editor-title';editor.append(heading);
    if(!obj)return;
    editor.append(node('p',tr('固定标识 ','Stable ID ')+obj.id,'meta'));
    field(editor,'item-name',mode==='role'?tr('席位名称','Role name'):tr('群名称','Group name'),obj.name,false,v=>{
      obj.name=v;edited();heading.textContent=v||tr('未命名','Untitled');renderSide();
    });
    if(mode==='role')roleForm(editor,obj);else groupForm(editor,obj);
    const actions=node('div',null,'actions danger');actions.append(button(mode==='role'?tr('移除席位','Remove role'):tr('移除群组','Remove group'),removeItem,null,'delete-item'));editor.append(actions);
    },focusTarget);
  }
  function showPending(){
    $('import-banner').hidden=false;
    const n=pending.team.roles.length,m=pending.team.groups.length;
    const extra=pending.legacy?tr(' 此旧包将只取岗位、群籍和交接职责。',' The original starter is mapped to roles, membership and workflow.'):'';
    $('pending-label').textContent=tr('打开「'+pending.team.name+'」？含 '+n+' 席、'+m+' 群，会替换当前未保存的草稿。','Open “'+pending.team.name+'” with '+n+' roles and '+m+' groups? It will replace the current draft.')+extra;
  }
  async function openFile(file){
    if(!file)return;
    const token=++importEpoch, whenRead=revision;
    pending=null;$('import-banner').hidden=true;
    try{
      if(file.size>C.maxDocument || !file.size)throw Error(tr('配置文件须为有效 JSON，最大 32 MiB。','Choose a nonempty team JSON file under 32 MiB.'));
      const model=C.importDefinition(JSON.parse(await file.text()),language());
      const images=new Set();
      for(const r of model.team.roles){if(r.avatar && !images.has(r.avatar.data)){await confirmDecode(r.avatar);images.add(r.avatar.data);}}
      if(token!==importEpoch)return;
      pending=model;
      if(dirty || model.legacy || whenRead!==revision){showPending();return;}
      acceptFile();
    }catch(ex){if(token===importEpoch)status(tr('打开失败：','Could not open: ')+ex.message,tr('打开失败：','Could not open: ')+ex.message,true);}
  }
  function acceptFile(){
    if(!pending)return;
    const focusFrom=document.activeElement===$('apply-import')?$('apply-import'):null;
    const legacy=pending.legacy;team=pending.team;pending=null;dirty=legacy;revision++;undo=null;platformPanel?.reset();
    $('import-banner').hidden=true;$('team-name').value=team.name;$('team-id').value=team.id;switchMode('role');
    FocusRetention.moveFromHidden(focusFrom,$('team-name'));
    const noticeZh=roleMentionCount?' 上方有未选岗位提及提醒，请核对。':'',noticeEn=roleMentionCount?' Check the unselected-role notice above.':'';
    if(legacy)status('已从原包提取席位、群籍与交接，请另存编辑器文件。'+noticeZh,'Mapped the starter’s roles, groups and workflow. Save a new editor file.'+noticeEn);
    else status('已从文件打开，可继续编辑。'+noticeZh,'Opened from file. You can continue editing.'+noticeEn);
  }
  function offerDownload(blob,filename) {
    const a=node('a');const href=URL.createObjectURL(blob);a.href=href;a.download=filename;
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);
  }
  function saveFile(){
    try{
      if(avatarBusy) return;
      const clean=C.normalize(team,language());const blob=new Blob([JSON.stringify(clean,null,2)+'\n'],{type:'application/json'});
      if(blob.size>C.maxDocument)throw Error(tr('成品超过 32 MiB。请缩小或移除部分头像再保存。','This file exceeds 32 MiB. Reduce or remove some avatars before saving.'));
      offerDownload(blob,clean.id+'.team.json');
      team=clean;dirty=false;undo=null;revision++;platformPanel?.sync();$('team-name').value=team.name;$('team-id').value=team.id;render();
      status('已向浏览器提交保存，可在下载位置打开该 JSON。','File offered for download. Reopen that JSON from your download location.');
    }catch(ex){status(ex.message,ex.message,true);}
  }
  $('team-id').addEventListener('input',e=>{team.id=e.target.value;edited();});
  $('team-name').addEventListener('input',e=>{team.name=e.target.value;edited();});
  for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>switchMode(b.dataset.mode));
  $('import').addEventListener('click',()=>$('document-file').click());
  $('document-file').addEventListener('change',e=>{const file=e.target.files[0];e.target.value='';openFile(file);});
  $('export').addEventListener('click',saveFile);
  $('rules-export').addEventListener('click',()=>{
    const entries=TeamPreset.ruleReferences().map(item=>[item.path,item.content]);
    offerDownload(LocalTeamZip(entries),'solo-to-team-group-rules.zip');
    status('已提交群规全文下载；请按任务向相应助手提供适用小节。','Full rules offered for download; provide relevant sections to the assigned assistants.');
  });
  platformPanel=UnifiedHosts.mount({getTeam:()=>team,getRevision:()=>revision,isBusy:()=>avatarBusy>0,language,offerDownload});
  $('apply-import').addEventListener('click',acceptFile);
  $('cancel-import').addEventListener('click',()=>{
    const focusFrom=document.activeElement===$('cancel-import')?$('cancel-import'):null;
    pending=null;importEpoch++;$('import-banner').hidden=true;
    FocusRetention.moveFromHidden(focusFrom,$('import'));
  });
  window.addEventListener('hashchange',()=>{langLabels();render();});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  langLabels();render();
})();
