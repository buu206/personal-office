'use strict';
const UnifiedHosts=(()=>{
  const $=id=>document.getElementById(id);
  const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const raw=a=>Uint8Array.from(atob(a.data.slice(a.data.indexOf(',')+1)),c=>c.charCodeAt(0));
  const json=x=>JSON.stringify(x,null,2)+'\n';
  const known=new WeakMap();
  function pictureMeta(avatar) {
    if(!known.has(avatar)){
      const bytes=raw(avatar).length;
      known.set(avatar,{om:bytes>65536,wb:WorkBuddyExport.needsCopy(avatar)});
    }
    return known.get(avatar);
  }
  function limited(team,host){
    if(host!=='maus' && host!=='wb')return [];
    return team.roles.filter(r=>r.avatar && pictureMeta(r.avatar)[host==='maus'?'om':'wb']);
  }
  async function openMausPhoto(a){
    const image=new Image(); image.src=a.data; await image.decode();
    const canvas=document.createElement('canvas');
    for(const size of [512,384,256,192,128,96]){
      canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');
      const f=Math.min(1,size/image.naturalWidth,size/image.naturalHeight),w=image.naturalWidth*f,h=image.naturalHeight*f;
      const paint=()=>ctx.drawImage(image,(size-w)/2,(size-h)/2,w,h);
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';paint();
      let url=canvas.toDataURL('image/png');
      if(raw({data:url}).length<=65536)return {mime:'image/png',data:url};
      ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);paint();
      for(const q of [.86,.69,.50]){
        url=canvas.toDataURL('image/jpeg',q);
        if(raw({data:url}).length<=65536)return {mime:'image/jpeg',data:url};
      }
    }
    throw Error('头像无法适配 64 KiB，请仅在此次导出去除该图。 / Could not fit the avatar; omit it for this export.');
  }

  // Build a portable guide from the owner-provided plan. No Grok or account calls.
  function grokArchive(team,batch){
    const rules=typeof TeamPreset!=='undefined'&&typeof TeamPreset.ruleReferences==='function'?TeamPreset.ruleReferences():[];
    if(!Array.isArray(rules)||rules.some(f=>typeof f?.path!=='string'||typeof f.content!=='string'))throw Error('Invalid rule-reference attachments.');
    const templateGroups=typeof TeamPreset!=='undefined'&&typeof TeamPreset.initial==='function'?['zh','en'].flatMap(lang=>TeamPreset.initial(lang).groups):[];
    const p=GrokPlan.rosterPlan(team,batch,{ruleFiles:rules.map(f=>f.path),ruleDocuments:rules,templateGroups}), entries=rules.map(f=>[f.path,f.content]);
    for(let i=0;i<team.roles.length;i++){
      const r=team.roles[i],c=p.roles[i];
      if(r.avatar){
        // Keep reserved Windows names, such as CON, out of archive basenames.
        c.avatar_file='avatars/role-'+r.id+'.'+{'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[r.avatar.mime];
        entries.push([c.avatar_file,raw(r.avatar)]);
      }
      entries.push(['roles/role-'+r.id+'.txt',json(c)]);
    }
    const introZh=GrokPlan.instructions(false),introEn=GrokPlan.instructions(true);
    const escaped=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    const ruleLinks=['zh','en'].map(lang=>{
      const path='references/template-rules/groups.'+lang+'.md';
      return rules.some(f=>f.path===path)?'<li><a href="'+escaped(path)+'">'+escaped(path)+'</a></li>':'<li>未随包 / Not included: '+escaped(path)+' — 请从原团队分发包另取 / obtain from the team distribution.</li>';
    }).join('');
    const ruleGuide='<h2>完整群规 / Full group rules</h2><ul>'+ruleLinks+'</ul><p>每席岗位卡已包含当前所属群的执行摘要与成员关联。full_rules 的路径指向默认模板参考；当前群已修改或无法匹配时，不列模板章节锚点，不能把全文套作自定义群规则。向各独立 Bot 提供当前卡，并另行提供本单确认适用的章节，请其回读。文件存在不代表宿主已读取；默认参考不能覆盖当前编辑记录，也不增加权限。</p><p>Each role card includes its current group summaries and relationships. full_rules paths point to default-template references. Edited or unmatched groups have no template-section anchors; do not apply those defaults as custom-group rules. Provide each Bot its current card plus only the sections established as applicable and request a readback. Files do not load automatically, replace edited records or grant authority.</p>';
    const guides=p.roles.map(c=>'<li><b>'+escaped(c.name)+'</b> · <a href="roles/role-'+c.key+'.txt">岗位卡 / Role card</a>'+
      (c.avatar_file?' · <a href="'+c.avatar_file+'">头像 / Avatar</a>':'')+'</li>').join('');
    const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>Grok Bot · '+escaped(p.team.label)+'</title><style>*{box-sizing:border-box}body{font:17px/1.65 system-ui,sans-serif;background:#f7f6ee;color:#17352d;max-width:780px;margin:auto;padding:32px 20px}a{color:#005b4c}textarea{width:100%;min-height:160px;font:inherit;padding:10px}li{margin:5px 0}h1{line-height:1.22}</style><h1>'+escaped(p.team.label)+'</h1><p>在自己的 Grok 首席对话中附上 <a href="grok-plan.json" download>grok-plan.json</a>。选择下面一种语言复制消息，先核预览和归属，再决定是否真实建席。已建席同时核批次和绑定，遇同名冲突保留原对象。</p><p>Attach the plan to your own lead’s chat. Copy one message below; review the actual seats before approving changes. Reconcile existing objects before creating more.</p><h2>预览请求</h2><textarea readonly aria-label="Grok 中文指引">'+escaped(introZh)+'</textarea><h2>Preview request</h2><textarea readonly aria-label="English Grok guide">'+escaped(introEn)+'</textarea><h2>岗位卡 / Role cards</h2><ul>'+guides+'</ul><p>若账号不能代建，只对缺席使用 Grok 侧栏的 ＋ → Create a Bot。到每位 Bot 的原对话提供对应岗位卡，请它回读；把实际手动派工或搬文件的步骤标为人工。逻辑群不是原生聊天室，群籍不授予权限。</p><p>If creation is unavailable, use + → Create a Bot only for missing seats, give each Bot its own role card, and identify any handoff you carried manually. Group lists are coordination data only.</p></html>';
    entries.unshift(['Start-here.html',html.replace('</html>',ruleGuide+'</html>')],['grok-plan.json',json(p)]);
    return LocalTeamZip(entries);
  }

  const descriptions={
    maus:[['OpenMausBot 部门文件','OpenMausBot department file'],['0.1.148 本地模板，可分别指定派工与交回席。默认仅建席位。若要一并建群，请逐群勾选。导入会新建部门；先核同名。包内 ask 仅为建议。首次用原生机器人“资料 → 权限”核岗位默认和专用目录；另核派单首席当前对话、实际新委派子会话及复用旧对话的权限。默认 Ask 不覆盖已有显式 Full，Ask 不等于完全只读。权限由用户本人决定，详见 SETUP。','0.1.148 local template. Different seats may dispatch and return the final deliverable. Rooms are off by default. Select any native rooms below. Import creates a new department. Check for duplicate names. Package ask is advisory. First check each Bot’s default in native Profile → Permissions and its work folder; separately check the dispatching lead’s current chat, actual new delegated chats and reused chats. Default Ask leaves existing explicit Full unchanged. Ask is not fully read-only. Permissions remain the user’s decision; see SETUP.']],
    dsh:[['DeepSeek Harness 根工作区','DeepSeek Harness project workspace'],['0.2.1-rc.5。解压到新空目录，保留 .dsh；选含 team.definition.json 的这一层为工作区，在新会话用 /solo-to-team。根会话同时派工和交回。逻辑群只用于协作说明。','0.2.1-rc.5. Extract into an empty folder, keep .dsh and select the directory containing team.definition.json. Use /solo-to-team in a fresh session. Dispatch and delivery share the root role. Groups are context only.']],
    wb:[['WorkBuddy 原生专家团 ZIP','WorkBuddy native expert-team ZIP'],['按 5.9.3 格式生成。在“我的专家 → 创建专家团”附上 ZIP，请内置创建器私有导入，遇同名差异先停。主理人组织并回件，制作和独审各由另一席完成。群不变聊天室，配置不保证并发。','Designed for 5.9.3. Attach the ZIP in My experts → Create expert team and request private import. Stop on conflicting names. The lead dispatches and returns work. Production and review require two other seats. Groups are context only; concurrency depends on the host.']],
    grok:[['Grok Bot 账号内引导包','Grok Bot guided setup pack'],['本入口提供 Grok 引导式建队，整队原生导入尚未验证。打开 ZIP 中的 Start-here.html，在自己的主 Bot 对话附上方案。先预览再就缺席逐项确认；缺少代办能力时，按包内步骤手建。导出不会登录、建 Bot 或创建群。','This entry provides guided Grok setup. Native whole-team import has not been verified. Open Start-here.html and attach the plan in your primary Bot’s chat. Preview first, then approve missing seats. Follow the manual steps if the host cannot create them. Downloading performs no login, Bot creation or group setup.']]
  };
  function mount({getTeam,getRevision,isBusy,language,offerDownload}){
    let host='maus',batch='',busy=false,selections=new Map(),policy='keep',previousImages=[],currentGroups=new Map(),epoch=0;
    let deepseekMode='native';
    const t=(a,b)=>language()==='en'?b:a;
    const say=(s,warning=false)=>{$('host-status').textContent=s;$('host-status').classList.toggle('warning',warning);};
    const pick=(v,label,sel)=>{const e=make('option',label);e.value=v;e.selected=sel;return e;};
    const dsPanel=DSBotPanel.create({getTeam,getRevision,t,changed,rerender:sync,say});
    function syncChoices(){
      const team=getTeam(),next=new Map(team.groups.map(g=>[g.id,JSON.stringify([g.name,g.purpose,g.members])]));
      for(const [key] of selections)if(next.get(key)!==currentGroups.get(key))selections.delete(key);
      currentGroups=next;
      const affected=limited(team,host), refs=affected.map(r=>r.avatar);
      if(refs.length!==previousImages.length || refs.some((r,i)=>previousImages[i]!==r))policy='keep';
      previousImages=refs;
      return affected;
    }
    function availability(){
      const team=getTeam(),pending=limited(team,host);
      $('host-download').disabled=busy||isBusy()||(host==='dsh' && deepseekMode==='dsbot' && !dsPanel.ready())||(!['derive','omit'].includes(policy)&&pending.length>0)||(host==='grok'&&!/^[a-z0-9][a-z0-9-]{0,31}$/.test(batch));
      for(const b of document.querySelectorAll('[data-host]'))b.disabled=busy;
    }
    function changed(){epoch++;say('');availability();}
    function rooms(team,parent){
      if(!team.groups.length)return;
      const f=make('fieldset');f.id='native-rooms';f.append(make('legend',t('可选原生群聊 · 默认 0 个','Optional native rooms · none selected by default')));
      for(const g of team.groups){
        const row=make('div');row.className='roomline';const check=make('input');check.type='checkbox';check.dataset.room=g.id;check.checked=selections.has(g.id);
        const l=make('label');l.append(check,document.createTextNode(' '+g.name));row.append(l,make('small',g.purpose+' · '+g.members.map(id=>team.roles.find(r=>r.id===id)?.name??id).join(' / ')));
        const select=make('select');select.dataset.reply=g.id;select.setAttribute('aria-label',g.name+' '+t('应答人','responder'));select.disabled=!check.checked;
        select.append(pick('',t('仅提及时应答','Only respond to mentions'),!selections.get(g.id)?.agent));
        for(const id of g.members)select.append(pick(id,t('由以下席先应答：','First responder: ')+(team.roles.find(r=>r.id===id)?.name??id),selections.get(g.id)?.agent===id));
        check.onchange=()=>{select.disabled=!check.checked;if(check.checked)selections.set(g.id,{kind:'mentions'});else selections.delete(g.id);select.value='';changed();};
        select.onchange=()=>{selections.set(g.id,select.value?{kind:'agent',agent:select.value}:{kind:'mentions'});changed();};row.append(select);f.append(row);
      }
      parent.append(f);
    }
    function images(affected,parent){
      if(!affected.length)return;
      const f=make('fieldset');f.append(make('legend',t('此次导出的头像','Avatars in this export')));
      const why=host==='maus'?t('OpenMaus 单图上限 64 KiB。','OpenMaus limits each avatar to 64 KiB.'):t('WorkBuddy 适配 512×512 PNG/JPEG，单图不超过 500,000 字节。','The WorkBuddy adapter expects 512×512 PNG/JPEG up to 500,000 bytes.');
      f.append(make('p',why+' '+t('需处理：','Needs attention: ')+affected.map(r=>r.name).join(' / ')));
      const sel=make('select');sel.id='avatar-policy';sel.setAttribute('aria-label',t('超限头像如何处理','How to handle incompatible avatars'));
      sel.append(pick('keep',t('先保留原图，暂停本端导出','Keep originals; hold this export'),policy==='keep'),pick('derive',t('仅为本次导出制作适配副本（可能缩放、白底 JPEG）','Create export copies (may resize or use JPEG on white)'),policy==='derive'),pick('omit',t('只在这份导出中省略不合规头像','Omit incompatible avatars from this export'),policy==='omit'));
      sel.onchange=()=>{policy=sel.value;changed();};f.append(sel,make('small',t('合规头像沿用原字节；原中性文件和编辑中的原图不变。WorkBuddy 被省略的自选图使用随包岗位示意图。','Compatible pictures stay byte-identical. The neutral file and draft keep the originals. WorkBuddy substitutes a bundled role icon for an omitted picture.')));parent.append(f);
    }
    function sync(focusTarget){
      const opt=$('host-options');
      return FocusRetention.preserve([opt],()=>{
      const team=getTeam();opt.replaceChildren();
      $('hosts-title').textContent=t('从这份团队配置导出','Export this team');
      $('hosts-hint').textContent=t('选一个平台。你可以继续编辑，或切换平台导出同一支团队，无需再次打开配置。','Choose a platform. Keep editing or switch platforms to export this same team without reopening the file.');
      for(const b of document.querySelectorAll('[data-host]'))b.setAttribute('aria-pressed',String(b.dataset.host===host));
      const [name,guide]=descriptions[host];$('host-format').textContent=t(...name);$('host-description').textContent=t(...guide);
      $('source-count').textContent=team.name+' · '+team.roles.length+t(' 席',' roles')+' · '+team.groups.length+t(' 个逻辑群',' logical groups');
      $('host-download').textContent=t('下载','Download')+' '+t(...name);
      if(host==='dsh'){
        const mode=make('select');mode.id='deepseek-variant';
        const label=make('label',t('DeepSeek 使用方式','DeepSeek setup'));label.htmlFor=mode.id;
        mode.append(pick('native',t('DeepSeek Harness 原生项目','Native DeepSeek Harness project'),deepseekMode==='native'),
          pick('dsbot',t('已有 DS Bot v0.3.2 · 导出建队计划','I already have DS Bot v0.3.2 · prepare a team plan'),deepseekMode==='dsbot'));
        mode.onchange=()=>{deepseekMode=mode.value;changed();sync();};opt.append(label,mode);
        if(deepseekMode==='dsbot'){
          $('host-format').textContent=t('DS Bot 建队计划','DS Bot team plan');
          $('host-description').textContent=t('面向已安装 DS Bot v0.3.2 且已有 Main Bot 的用户。计划依据该版本公开源码及团队本地检查制作，尚未经真实 DS Bot 建队运行；能否创建以你的 Main Bot 实际返回为准。建队台页面本身不发起网络请求。实际办单需要宿主账号有可用模型；建席时的欢迎消息可能消耗已有模型额度。','For users who already have DS Bot v0.3.2 and a working Main Bot. This plan is based on the public v0.3.2 source and our local checks. We have not run team creation in a live DS Bot. Use the actual response from your Main Bot to determine what was created. The builder page itself makes no network requests. Running real tasks requires an available model in your host account. Greeting messages when creating Bots may consume existing model credits.');
          $('host-download').textContent=t('下载 DS Bot 建队计划 ZIP','Download DS Bot plan ZIP');
          dsPanel.render(opt);
        }
      }
      const affected=syncChoices();
      if(host==='maus')rooms(team,opt);
      if(host==='grok'){
        const label=make('label',t('批次标记（续办时沿用原值）','Batch ID (reuse the same value when resuming)'));label.htmlFor='grok-batch';
        const input=make('input');input.type='text';input.id='grok-batch';input.value=batch;input.maxLength=32;input.placeholder='project-01';input.autocomplete='off';
        input.oninput=()=>{batch=input.value;changed();};
        opt.append(label,input,make('small',t('1–32 位小写字母、数字或短横线，首位为字母或数字。','Use 1–32 lowercase letters, digits or hyphens, starting with a letter or digit.')));
      }
      images(affected,opt);availability();
      },focusTarget);
    }
    async function download(){
      if(busy || isBusy())return;let unchanged=false;
      try{
        const version=getRevision(),choiceStamp=epoch,current=host,p=policy;
        let d=TeamDefinition.normalize(getTeam(),language());const affected=limited(d,current);
        if(affected.length && p==='keep')return;
        busy=true;availability();say(t('正在生成本地文件…','Building the local file…'));
        // normalize produced fresh role, group and image records; never edit the caller's draft.
        if(p==='omit')for(const r of affected)r.avatar=null;
        if(current==='maus' && p==='derive')for(const r of affected)r.avatar=await openMausPhoto(r.avatar);
        let blob,name;
        if(current==='maus'){
          blob=await NativeRoomExport.build(d,[...selections].map(([id,responder])=>({id,responder})));name=d.id+'.openmaus.json';
        }else if(current==='dsh' && deepseekMode==='dsbot'){
          const result=await dsPanel.archive();blob=result.blob;name=result.filename;
        }else if(current==='dsh'){blob=await TeamBuilderAdapters.exportDeepSeekHarness(d);name=d.id+'-deepseek.zip';}
        else if(current==='wb'){const r=await WorkBuddyExport.build(d,{convert:p==='derive'});blob=r.blob;name=r.filename;}
        else{blob=grokArchive(d,batch);name=d.id+'-'+batch+'-grok-guide.zip';}
        unchanged=version===getRevision() && choiceStamp===epoch && current===host;
        if(!unchanged){say(t('配置或选项已变，请按当前版本重新下载。','The draft changed. Export the current version again.'),true);return;}
        offerDownload(blob,name);
        say(t('已交给浏览器下载：','Offered to your browser: ')+name+t('。使用前请在自己的宿主核对；此页只生成文件。','. Preview in your own host. No installation was performed here.'));
      }catch(e){say(e.message||String(e),true);}finally{busy=false;availability();}
    }
    for(const b of document.querySelectorAll('[data-host]'))b.addEventListener('click',()=>{if(busy)return;host=b.dataset.host;policy='keep';previousImages=[];epoch++;say('');sync();});
    $('host-download').addEventListener('click',download);
    return {sync,availability,reset(){epoch++;batch='';dsPanel.reset();selections.clear();currentGroups.clear();previousImages=[];policy='keep';say('');sync();}};
  }
  return {mount};
})();

