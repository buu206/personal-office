'use strict';
(()=>{
  const $=key=>document.getElementById(key), node=(tag,value)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=value;return e;};
  const slots=['base','mine','next'];
  let en=location.hash==='#en';
  const lang=()=>en?'en':'zh', t=(zh,eg)=>en?eg:zh;
  const labels={
    brand:['一人成阵','Solo to Team'],local:['本地配置更新','Local configuration update'],title:['更新我的团队','Update my team'],
    intro:['把新版改善带进自己的队伍。原来的岗位名、头像和群籍可以逐项保留。','Bring upstream improvements into your team while keeping your role names, portraits and group membership.'],
    choose:['选择同一支团队的三份配置','Choose three definitions of the same team'],
    history:['本页只比较内容；团队ID相同不能证明三份文件有共同母版。请确认母版来源。','This page compares content. Matching team IDs do not verify a shared history. Check the original base yourself.'],
    base:['原母版','Original base'],mine:['我的队伍','My team'],next:['候选新版','Upstream candidate'],
    baseHint:['你最初据以改队伍的版本','The version you originally customized'],
    mineHint:['当前实际想保留的版本','Your current customized version'],
    nextHint:['你想比较的上游版本','The upstream version you want to compare'],
    compare:['比较三份文件','Compare files'],clear:['清空本页','Clear page'],review:['逐项决定','Review the changes'],
    download:['下载新的团队配置','Download updated team file'],
    scope:['页面在本地比较，另存新的 JSON。每份最多 32 MiB、200 席及 200 群。宿主账号、权限和运行中的任务需在原平台处理。','Compare locally and download a new JSON file. Limit per input: 32 MiB, 200 roles and 200 groups. Account permissions and running tasks are handled in your host.'],
    manual:['可比对写在岗位职责和群用途中的说明。单独的手册文件及平台私有字段不属于这个配置格式。','Role responsibilities and group descriptions can be compared. Separate handbooks and host-specific settings are outside this definition format.'],
    name:['名称','Name'],responsibility:['岗位职责','Responsibility'],avatar:['头像','Portrait'],purpose:['群用途','Group purpose'],members:['群成员','Group membership'],
    dispatch:['派工','Dispatch'],produce:['制作','Production'],reviewStage:['独立审核','Independent review'],deliver:['交回','Final return'],
    order:['共有对象的排列','Order of shared items'],groups:['群','Group'],roles:['岗位','Role']
  };
  const tr=key=>labels[key][en?1:0];
  const data=new Map(),loadErrors=new Map(),loadSeq=new Map(),choices=new Map(),images=new Map();
  let plan=null,revision=0;
  function message(s='',fault=false){$('status').textContent=s;$('status').dataset.fault=String(fault);}
  function slotNotes(){
    for(const k of slots){
      const d=data.get(k),fault=loadErrors.get(k),note=$(k+'-note');
      note.textContent=fault?fault.filename+' · '+t('无法载入：','Could not load: ')+fault.reason:d?d.filename+' · '+d.team.id+' · '+d.team.roles.length+t(' 席',' roles'):t('尚未选取','No file selected');
      note.dataset.fault=String(Boolean(fault));
      if(fault)$(k).setAttribute('aria-invalid','true');else $(k).removeAttribute('aria-invalid');
    }
    $('compare').disabled=slots.some(k=>!data.has(k));
  }
  function forgetComparison(){
    revision++;plan=null;choices.clear();images.clear();$('review').hidden=true;
    $('decisions').replaceChildren();$('unchanged').replaceChildren();$('download').disabled=true;message();
  }
  async function load(k,file){
    if(!file)return;const token=(loadSeq.get(k)||0)+1;loadSeq.set(k,token);
    data.delete(k);loadErrors.delete(k);forgetComparison();slotNotes();
    try{
      if(!file.size||file.size>TeamDefinition.maxDocument)throw Error(t('请选择 0–32 MiB 之间的非空团队 JSON。','Choose a nonempty JSON file of at most 32 MiB.'));
      const team=TeamUpdate.read(JSON.parse(await file.text()),lang());
      if(loadSeq.get(k)!==token)return;
      data.set(k,{filename:file.name,team});slotNotes();
    }catch(err){if(loadSeq.get(k)===token){loadErrors.set(k,{filename:file.name,reason:err.message});slotNotes();message(tr(k)+' · '+err.message,true);}}
  }
  async function avatarDigest(dataURL) {
    if(!images.has(dataURL)){
      const bytes=Uint8Array.from(atob(dataURL.split(',')[1]),c=>c.charCodeAt(0));
      images.set(dataURL,crypto.subtle.digest('SHA-256',bytes).then(out=>Array.from(new Uint8Array(out).subarray(0,6),b=>b.toString(16).padStart(2,'0')).join('')));
    }
    return images.get(dataURL);
  }
  function portrait(box,avatar){
    if(!avatar){box.append(node('p',t('未设头像','No portrait')));return;}
    const img=node('img');img.src=avatar.data;img.alt=t('该版本头像','Portrait for this version');img.loading='lazy';
    const note=node('small',avatar.mime);box.append(img,note);
    avatarDigest(avatar.data).then(hash=>{note.textContent=avatar.mime+' · SHA '+hash;}).catch(()=>{note.textContent=avatar.mime;});
  }
  function value(box,row,v){
    if(v===undefined){box.append(node('p',t('此版本没有该项','Absent from this version')));return;}
    const [kind,id,field]=row.parts;
    if(field==='avatar'){portrait(box,v);return;}
    if(v===null){box.append(node('p','—'));return;}
    if(Array.isArray(v)){box.append(node('p',v.join(' · ')));return;}
    if(typeof v==='object'){
      box.append(node('p',v.name),node('p',kind==='roles'?v.responsibility:v.purpose));
      if(kind==='roles')portrait(box,v.avatar);
      else box.append(node('small',tr('members')),node('p',v.members.join(' · ')));
      return;
    }
    box.append(node('p',String(v)));
  }
  function title(r){
    const [ns,id,field]=r.parts;
    if(ns==='name')return t('团队名称','Team name');
    if(ns==='workflow')return tr(id==='review'?'reviewStage':id);
    if(id==='@order')return tr(ns)+' · '+tr('order');
    const name=(plan.mine[ns].find(x=>x.id===id)||plan.next[ns].find(x=>x.id===id)||plan.base[ns].find(x=>x.id===id))?.name||id;
    return tr(ns)+' · '+name+(field?' · '+tr(field):'');
  }
  function meaning(r){
    if(r.state==='mine')return t('只有你改过，保留你的版本。','Only your version changed. Your edit is retained.');
    if(r.state==='same')return t('你与新版的改动一致。','Your version and the candidate agree.');
    if(r.state==='conflict')return t('双方作了不同的修改，请决定保留哪一侧。','Both sides made different changes. Choose the value to retain.');
    if(r.parts.length===2&&['groups','roles'].includes(r.parts[0])&&r.parts[1]!=='@order'){
      if(r.next===undefined)return t('新版删除了该项。采纳后将从新文件中移除。','The candidate removes this item. Accepting it drops it from the new file.');
      if(r.base===undefined)return t('新版新增该项。由你决定是否纳入。','The candidate adds this item. Choose whether to include it.');
    }
    if(r.parts[0]==='workflow'||r.parts[2]==='members')return t('新版调整人员衔接或群籍，须由你逐项确认。','The candidate changes a handoff or group membership. Explicit approval is required.');
    return t('新版有改动，请选择是否采用。','The upstream candidate changed this field. Choose whether to adopt it.');
  }
  function updateResult(){
    if(!plan)return;const result=TeamUpdate.resolve(plan,choices,lang());
    $('download').disabled=!result.team;
    if(result.pending.length){message(t('还有 ','')+result.pending.length+t(' 项需要你选择。',' choices remain.'));return;}
    if(result.issues.length){message(result.issues.join('\n')+'\n'+t('请调整上述选择，或修改来源配置后重新打开。原文件均保留。','Adjust the choices above or edit and reopen a source file. All originals are preserved.'),true);return;}
    message(t('已通过同版编队台格式与交接检查。新文件可以下载。','The result passed the same builder schema and handoff checks. You can download it.'));
  }
  function showRow(row){
    const card=node('article');card.className='field';card.dataset.change=row.key;
    card.append(node('h3',title(row)),node('code',row.key));
    const caption=node('p',meaning(row));caption.className='meaning';card.append(caption);
    const grid=node('div');grid.className='compare-grid';
    for(const k of slots){const box=node('div');box.append(node('small',tr(k)));value(box,row,row[k]);grid.append(box);}card.append(grid);
    if(row.required){
      const wrap=node('label');wrap.className='select-wrap';wrap.append(node('span',t('本项决定','Decision')));
      const select=node('select');select.dataset.choice=row.key;select.setAttribute('aria-label',title(row)+' · '+row.key);
      for(const [id,word] of [['',t('请选择','Choose')],['mine',t('保留我的','Keep mine')],['next',t('采用候选新版','Use upstream candidate')]]){
        const op=node('option',word);op.value=id;select.append(op);
      }
      select.value=choices.get(row.key)||'';
      select.onchange=()=>{revision++;if(select.value)choices.set(row.key,select.value);else choices.delete(row.key);updateResult();};
      wrap.append(select);card.append(wrap);
    }
    return card;
  }
  function render(){
    if(!plan)return;
    const req=plan.rows.filter(r=>r.required),retained=plan.rows.filter(r=>!r.required);
    $('review').hidden=false;
    $('overview').textContent=plan.mine.name+' · '+plan.mine.id+' · '+req.length+t(' 项需选择，',' require a decision · ')+retained.length+t(' 项自动保留。',' retained or agreed.');
    $('decisions').replaceChildren(...req.map(showRow));
    $('retained').hidden=!retained.length;$('retained-title').textContent=t('查看本地独有或双方一致的改动','Local-only or matching edits')+' ('+retained.length+')';
    $('unchanged').replaceChildren(...retained.map(showRow));updateResult();
  }
  $('compare').onclick=()=>{
    if(slots.some(k=>!data.has(k)))return;
    forgetComparison();
    try{plan=TeamUpdate.compare(...slots.map(k=>data.get(k).team),lang());render();}
    catch(e){message(e.message,true);}
  };
  $('download').onclick=async()=>{
    if(!plan||$('download').disabled)return;
    const version=revision,res=TeamUpdate.resolve(plan,choices,lang());if(!res.team){updateResult();return;}
    try{
      const bytes=new TextEncoder().encode(JSON.stringify(res.team,null,2)+'\n'),buffer=await crypto.subtle.digest('SHA-256',bytes);
      if(version!==revision||!plan)return;
      const digest=Array.from(new Uint8Array(buffer).subarray(0,12),v=>v.toString(16).padStart(2,'0')).join('');
      const a=node('a'),url=URL.createObjectURL(new Blob([bytes],{type:'application/json'}));
      a.href=url;a.download=res.team.id+'-updated-'+digest+'.team.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
      message(t('已交给浏览器下载。可在原编队台点“打开配置”查看；宿主内团队没有被改动。','Download requested. Use Open a file in the existing builder to view it. No host-team changes were made.'));
    }catch(e){if(version===revision)message(e.message,true);}
  };
  function translate(){
    en=location.hash==='#en';document.documentElement.lang=lang()==='en'?'en':'zh-CN';document.title=tr('title')+' · '+tr('brand');
    for(const e of document.querySelectorAll('[data-i]'))e.textContent=tr(e.dataset.i);
    $('lang').textContent=t('English','中文');$('lang').lang=t('en','zh-CN');slotNotes();if(plan)render();
    else if(!$('status').textContent)message(t('三份配置到齐后可比较。','Choose all three definitions to compare.'));
  }
  for(const k of slots)$(k).onchange=e=>{const f=e.target.files[0];e.target.value='';load(k,f);};
  $('lang').onclick=()=>{location.hash=en?'zh':'en';};window.addEventListener('hashchange',translate);
  $('clear').onclick=()=>{for(const k of slots){loadSeq.set(k,(loadSeq.get(k)||0)+1);$(k).value='';}data.clear();loadErrors.clear();forgetComparison();slotNotes();message(t('已清空本次比较。','Comparison cleared.'));};
  translate();
})();
