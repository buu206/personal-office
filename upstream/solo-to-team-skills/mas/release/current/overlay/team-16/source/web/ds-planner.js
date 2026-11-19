'use strict';
const DSPlanner = (() => {
  const maxAvatarBytes=119982;
  const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
  const safeBatch=s=>/^[a-z0-9][a-z0-9-]{0,15}$/.test(s);
  const normalizeName=s=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
  const cleanText=(text,field)=>{
    if(/(?:sk-[a-z\d_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:bearer|api[_ -]?key|password|token|cookie)\s*[:= ]\s*[^\s]{5,}|(?:验证码|口令|密码|密钥)\s*[:：=]\s*\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)|(?:^|\D)1[3-9]\d{9}(?:\D|$))/i.test(text))
      throw Error(field+' 检出可能的口令、联系方式或个人路径。请用通用岗位资料。Possible sensitive data; use generic role data.');
  };
  function note(row,message){row.issues.push(message);}
  function modeOf(g,opts) {
    const v=opts.groups?.[g.id]??{kind:'reference'};
    if(v.kind==='reference')return {kind:'reference'};
    if(v.kind!=='native' || !['admin','everyone'].includes(v.mode) || !(v.admin==='@main'||g.members.includes(v.admin)))
      throw Error('群 '+g.name+' 的原生群主或回复方式无效。Choose Main or an intended group member and a valid reply mode.');
    return {kind:'native',mode:v.mode,admin:v.admin};
  }
  function teamSample(n=20){
    const team=TeamDefinition.initial();team.id='field-demo';team.name='Field coordination sample';
    team.roles=Array.from({length:n},(_,i)=>({id:'seat-'+(i+1),name:'Desk '+(i+1),responsibility:i===0?'Coordinate scoped work and return reviewed files.':i===1?'Prepare the deliverable and revise documented findings.':i===2?'Independently inspect the submitted revision.':'Check assigned local materials and return a short result.',avatar:null}));
    team.workflow={dispatch:'seat-1',produce:'seat-2',review:'seat-3',deliver:'seat-1'};
    team.groups=Array.from({length:6},(_,i)=>({id:'cell-'+(i+1),name:'Working group '+(i+1),purpose:'Share the agreed version, progress and review notes.',members:[...new Set([team.roles[0].id,...Array.from({length:3},(_,k)=>team.roles[(i*3+k+1)%n].id)])]}));
    return team;
  }
  function validateJournal(j,key,objects){
    if(!j)return new Map();
    if(j.format!=='solo-to-team.dsbot-receipts'||j.version!=='1.0'||j.plan_sha256!==key||!Array.isArray(j.objects))throw Error('续办记录与这份计划不匹配。Resume file does not match this plan.');
    const refs=new Map(objects.map(r=>[r.kind+':'+r.id,r]));const seen=new Map();
    if(j.objects.length!==objects.length)throw Error('续办记录对象数量不符。Different object count in resume file.');
    for(const rec of j.objects){
      const k=rec.kind+':'+rec.id,r=refs.get(k);
      if(!r||seen.has(k)||r.name!==rec.expected_name||r.marker!==rec.marker||!['pending','uncertain','verified','blocked','reference'].includes(rec.state))throw Error('续办对象名称、标记或状态不符。Invalid resume mapping.');
      if(Object.keys(rec).some(key=>!['kind','id','expected_name','marker','state','receipt_ref','native_id'].includes(key)))throw Error('续办记录字段异常。Unexpected receipt fields.');
      for(const v of [rec.receipt_ref,rec.native_id])if(v!==null&&(typeof v!=='string'||!/^[A-Za-z0-9_.:#/ -]{1,96}$/.test(v)||v.includes('..')||v.startsWith('/')))throw Error('回执只放本批短索引，勿放正文。Use a short receipt reference.');
      for(const ref of [rec.receipt_ref,rec.native_id]) if(ref)cleanText(ref,'续办短索引 / Receipt reference');
      if(rec.state==='verified'&&!rec.receipt_ref)throw Error('已核对象需要原生成功回执索引。Verified entries need a receipt reference.');
      seen.set(k,{state:rec.state,receipt_ref:rec.receipt_ref,native_id:rec.native_id});
    }
    return seen;
  }
  function readTeam(input){
    if(Array.isArray(input?.roles) && input.roles.some(r=>r && ['private','main','permission','permissions','model','credentials'].some(k=>Object.hasOwn(r,k))))
      throw Error('中性输入不能移植私有身份、主 Bot 身份、模型或账户权限。私有 Bot 不可编入原生群。Remove host-specific access fields first.');
    if(Array.isArray(input?.groups) && input.groups.some(g=>g && ['permission','permissions','admin','owner'].some(k=>Object.hasOwn(g,k))))
      throw Error('群权限不能从 JSON 继承；原生群管理员在预览中明确选定。Native group authority must be explicitly chosen.');
    return TeamDefinition.normalize(input);
  }
  async function build(input,opts){
    const t=readTeam(input);const batch=String(opts.batch??'').trim();
    if(!safeBatch(batch))throw Error('批次用 1–16 个小写字母、数字或连字符。Use a short lowercase batch ID.');
    const planned=t.groups.map(g=>modeOf(g,opts));
    cleanText([t.id,t.name,...t.roles.flatMap(r=>[r.id,r.name,r.responsibility]),...t.groups.flatMap(g=>[g.id,g.name,g.purpose])].join('\n'),'团队定义');
    const sourceSHA=await hash(JSON.stringify(t));
    // Bind the installed role text to the batch identity for this adapter.
    const roleProtocol = [TeamDefinition.workLanguage.en, TeamDefinition.workLanguage.zh,
      TeamDefinition.receiptScope.en, TeamDefinition.receiptScope.zh].join('\n');
    const key=await hash(JSON.stringify({version:2,sourceSHA,batch,avatars:!!opts.avatars,planned,protocolSHA:await hash(roleProtocol)}));
    for(const collection of [t.roles,t.groups]){
      const names=collection.map(x=>normalizeName(batch+'·'+x.name));
      if(new Set(names).size!==names.length)throw Error('归一后的本批目标名称重复。请先区分全角、大小写或连续空格近似的名称。Duplicate normalized target names.');
    }
    const allRoles=new Map(t.roles.map(r=>[r.id,batch+'·'+r.name]));
    const flow=Object.fromEntries(Object.entries(t.workflow).map(([k,v])=>[k,allRoles.get(v)]));
    const known=new Set((opts.occupied||[]).filter(x=>typeof x==='string'&&x.trim()).map(normalizeName));
    const objects=[],assets=new Map();
    const markerFor=async(kind,id)=>'[mas-dsbot/'+batch+'/'+(kind==='bot'?'b':'g')+'/'+(await hash(key+'|'+kind+'|'+id)).slice(0,20)+']';
    const genericA='只用本批实际存在的席位和现有授权。遇缺口将具体缺件交回本批派工席，不假设另有技术席，不更改账号权限。';
    for(const r of t.roles){
      const marker=await markerFor('bot',r.id);
      const row={kind:'bot',id:r.id,name:allRoles.get(r.id),marker,issues:[],action:'preflight',avatar_file:null,create_bot:null};
      if(row.name.length>40||/[@`\r\n]/.test(row.name))note(row,'名称不符合宿主 40 字符或提及字符限制。Name cannot be represented.');
      const collision=known.has(normalizeName(row.name));
      if(opts.avatars&&r.avatar){
        const b64=r.avatar.data.slice(r.avatar.data.indexOf(',')+1);const raw=atob(b64);
        if(raw.length>maxAvatarBytes)note(row,'头像超过 DS Bot 原始字节上限 119982。缩小头像或明确改选默认头像。Avatar over limit.');
        else {
          const bytes=Uint8Array.from(raw,ch=>ch.charCodeAt(0));
          const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[r.avatar.mime];
          // Keep valid portable role IDs like CON and AUX away from reserved Windows path names.
          row.avatar_file='avatars/role-'+r.id+'.'+ext;assets.set(row.avatar_file,bytes);
        }
      }
      const jobs=Object.keys(t.workflow).filter(k=>t.workflow[k]===r.id);
      const lines=[marker,roleProtocol,'岗位资料 '+JSON.stringify({name:r.name,responsibility:r.responsibility,workflow_roles:jobs})+'。','本批派工、制作、独审和原处交回分别是 '+JSON.stringify(flow)+'。按本岗位责任处理实际收到的材料与版次；审核须独立打开成品。',genericA];
      row.expected_role=r.name.length<=24?r.name:'项目席';
      if(row.issues.length){row.action='blocked';if(row.avatar_file){assets.delete(row.avatar_file);row.avatar_file=null;}}
      else if(collision){row.action='compare_existing';note(row,'已标记同名，需原创建回执＋本次重读才可复用，不再发送创建。Reconcile without creating.');}
      else row.create_bot={name:row.name,role:row.expected_role,instructions:lines.join('\n')};
      if(r.name.length>24)row.role_label_note='宿主短标签用“项目席”；完整岗位名在名称与职责首段。';
      objects.push(row);
    }
    const byRole=new Map(objects.map(o=>[o.id,o]));
    for(let i=0;i<t.groups.length;i++){
      const g=t.groups[i],policy=planned[i],marker=await markerFor('group',g.id);
      const row={kind:'group',id:g.id,name:batch+'·'+g.name,marker,purpose:g.purpose,members:[...g.members],policy,issues:[],action:policy.kind==='native'?'preflight':'reference',create_group:null};
      if(policy.kind==='native'){
        if(row.name.length>60||/["\r\n]/.test(row.name)||row.name.replace(/\s+/g,' ')!==row.name)note(row,'宿主会裁切或规范化群名。请缩短/改为单行。Room name would be changed.');
        if(g.members.length+1>12)note(row,'加自动加入的 Main Bot 后超过 12 席，需改为仅资料或另拟分群。Exceeds the native limit including Main.');
        const collision=known.has(normalizeName(row.name));
        if(g.members.some(id=>byRole.get(id).action==='blocked'))note(row,'所依赖的席位存在冲突或缺件。Member mapping is blocked.');
        const notice=marker+'\n'+g.purpose+'\n成员用于协作知情，原有授权继续生效。';
        if(notice.length>2000)note(row,'群公告超过 2000 字符。Shorten the group purpose.');
        if(row.issues.length)row.action='blocked';
        else if(collision){row.action='compare_existing';note(row,'已标记同名群，只核原回执和当前成员、管理员、模式及标记。Reconcile only.');}
        else {
          if(g.members.some(id=>byRole.get(id).action==='compare_existing')){row.action='await_members';note(row,'须先核满意向成员的所有权；核过后再建此群。Wait for member ownership.');}
          row.create_group={name:row.name,members:g.members.map(id=>allRoles.get(id)),notice,mode:policy.mode};
          if(policy.admin!=='@main')row.create_group.admin=allRoles.get(policy.admin);
        }
      }
      objects.push(row);
    }
    const restored=validateJournal(opts.receipts,key,objects);
    // A previous attempt is a reason to re-read its identity. Never export a fresh
    // creation call for an uncertain or verified object merely because its name list is empty.
    for(const obj of objects){
      const prev=restored.get(obj.kind+':'+obj.id);
      if(!prev || !['verified','uncertain','blocked'].includes(prev.state)) continue;
      if(obj.action!=='blocked' && obj.action!=='reference'){
        obj.action=prev.state==='blocked'?'blocked':'compare_existing';
        note(obj,'有前次处理记录。只核本批原件和现场归属。Reconcile the prior attempt before any new action.');
      }
      if(obj.kind==='bot')obj.create_bot=null;else obj.create_group=null;
    }
    for(const room of objects.filter(obj=>obj.kind==='group' && obj.create_group)){
      if(room.members.some(id=>byRole.get(id).action==='blocked')){
        room.create_group=null;room.action='blocked';
        note(room,'本批成员仍有阻塞。A required member remains blocked.');
      }else if(room.members.some(id=>byRole.get(id).action==='compare_existing')){
        room.action='await_members';
        note(room,'先回读前次成员的真实归属。Reconcile members before applying this room template.');
      }
    }
    const receipts={format:'solo-to-team.dsbot-receipts',version:'1.0',plan_sha256:key,objects:objects.map(o=>{
      const prev=restored.get(o.kind+':'+o.id);
      return {kind:o.kind,id:o.id,expected_name:o.name,marker:o.marker,state:prev?.state??(o.action==='reference'?'reference':o.action==='blocked'?'blocked':'pending'),receipt_ref:prev?.receipt_ref??null,native_id:prev?.native_id??null};
    })};
    const plan={format:'solo-to-team.dsbot-plan',version:'1.0',host:'DS Bot v0.3.2',batch,team:t.name,source_sha256:sourceSHA,plan_sha256:key,workflow:flow,objects};
    return {plan,receipts,assets};
  }
  return {build,readTeam,teamSample,maxAvatarBytes};
})();
