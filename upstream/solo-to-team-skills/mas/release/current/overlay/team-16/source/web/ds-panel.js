'use strict';
const DSBotPanel=(()=>{
  function create({getTeam,getRevision,t,changed,rerender,say}){
    const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
    const json=value=>JSON.stringify(value,null,2)+'\n';
    const byID=id=>document.getElementById(id);
    let batch='', portraits=false, scrubbed=false, occupied='', journal=null, journalName='', reading=false, readToken=0;
    let excluded=new Set(), groupModes=new Map(), groupKeys=new Map(), seenRevision=-1, serial=0;
    function ready(){return !reading && scrubbed && /^[a-z0-9][a-z0-9-]{0,15}$/.test(batch);}
    function invalidate(){
      scrubbed=false;serial++;
      const c=byID('ds-scrubbed');if(c)c.checked=false;
      const v=byID('ds-results');if(v)v.replaceChildren();
      changed();
    }
    function reset(){
      batch='';portraits=false;scrubbed=false;occupied='';journal=null;journalName='';
      reading=false;readToken++;excluded.clear();groupModes.clear();groupKeys.clear();seenRevision=-1;serial++;
    }
    function syncTeam(team){
      if(seenRevision===getRevision())return;
      seenRevision=getRevision();scrubbed=false;serial++;
      for(const id of Object.values(team.workflow))excluded.delete(id);
      const keys=new Map(team.groups.map(g=>[g.id,JSON.stringify(g)]));
      for(const id of groupModes.keys()) if(keys.get(id)!==groupKeys.get(id))groupModes.delete(id);
      groupKeys=keys;
      const ids=new Set(team.roles.map(r=>r.id));for(const value of excluded)if(!ids.has(value))excluded.delete(value);
    }
    function box(parent,text,id){const f=el('fieldset');if(id)f.id=id;f.append(el('legend',text));parent.append(f);return f;}
    function line(parent,caption,control){const l=el('label');l.append(el('span',caption),control);parent.append(l);}
    function check(parent,caption,id,value,onchange){
      const l=el('label'),c=el('input');c.type='checkbox';if(id)c.id=id;c.checked=value;
      c.onchange=()=>onchange(c.checked);l.className='ds-check';l.append(c,document.createTextNode(' '+caption));parent.append(l);return c;
    }
    function pick(parent,caption,items,value,onchange){
      const s=el('select');for(const [key,label] of items){const o=el('option',label);o.value=key;s.append(o);}
      s.value=value;s.onchange=()=>onchange(s.value);line(parent,caption,s);return s;
    }
    function choice(g){return groupModes.get(g.id)||{kind:'reference'};}
    function buildInput(){
      // Keep only selected portable fields. With portraits off, images do not even enter the plan fingerprint.
      const src=getTeam(),required=new Set(Object.values(src.workflow));
      const roles=src.roles.filter(r=>required.has(r.id)||!excluded.has(r.id)).map(r=>({
        id:r.id,name:r.name,responsibility:r.responsibility,avatar:portraits?r.avatar:null
      }));
      const ids=new Set(roles.map(r=>r.id));
      const groups=src.groups.filter(g=>choice(g).kind!=='omit').map(g=>{
        const missing=g.members.filter(id=>!ids.has(id));
        if(missing.length)throw Error(t('群含未选岗位：','The group includes unselected roles: ')+g.name+
          t('。请将该群改为“不随包”，或重新选择全部原成员。',' — omit the group or select its original members.'));
        return {id:g.id,name:g.name,purpose:g.purpose,members:[...g.members]};
      });
      const selected={format:src.format,version:src.version,id:src.id,name:src.name,workflow:{...src.workflow},roles,groups};
      const policies=Object.fromEntries(groups.map(g=>[g.id,choice(g)]));
      return DSPlanner.build(selected,{batch,avatars:portraits,occupied:occupied.split(/\r?\n/),groups:policies,receipts:journal});
    }
    function present(result){
      const area=byID('ds-results');if(!area)return;
      const summary=el('ul');const names={preflight:t('待现场查对','Check in host'),reference:t('仅资料','Reference'),
        compare_existing:t('核对已有对象','Reconcile existing'),await_members:t('先核成员','Verify members first'),blocked:t('有缺项','Blocked')};
      const stats={};for(const obj of result.plan.objects)stats[obj.action]=(stats[obj.action]||0)+1;
      for(const [state,n] of Object.entries(stats))summary.append(el('li',names[state]+' · '+n));
      const details=el('details');details.append(el('summary',t('查看逐项核对表','Inspect the planned objects')));
      for(const obj of result.plan.objects){
        const x=el('p',obj.name+' · '+names[obj.action]);if(obj.issues.length)x.append(el('small',obj.issues.join(' ')));details.append(x);
      }
      area.replaceChildren(summary,details);
    }
    async function preview(){
      const v=serial,rev=getRevision();
      try{const result=await buildInput();if(v!==serial||rev!==getRevision()||!byID('ds-results'))return;present(result);say(t('计划预览已就绪。','Plan preview ready.'));}
      catch(e){if(v===serial)say(e.message,true);}
    }
    async function archive(){
      if(!ready())throw Error(t('请先填写本批标识并核对资料。','Set the batch ID and review the selected data.'));
      const result=await buildInput();present(result);
      const files=[['开工入口-START.md',makeRunbook(result.plan)],['plan.json',json(result.plan)],['receipts.json',json(result.receipts)],...result.assets];
      return {blob:LocalTeamZip(files),filename:'DSBot-'+result.plan.batch+'-plan.zip'};
    }
    function render(parent){
      const team=getTeam();syncTeam(team);
      const info=box(parent,t('本次计划','Plan scope'));
      const b=el('input');b.id='ds-batch';b.type='text';b.maxLength=16;b.autocomplete='off';b.placeholder='project-1';b.value=batch;
      b.oninput=()=>{batch=b.value;invalidate();};line(info,t('项目批次（续办沿用）','Batch ID (keep it to resume)'),b);
      const rs=box(parent,t('要带入本批的岗位','Roles in this batch'));const required=new Set(Object.values(team.workflow));
      for(const r of team.roles){
        const fixed=required.has(r.id);const c=check(rs,r.name+(fixed?t(' · 工作流所需',' · required by workflow'):''),'',fixed||!excluded.has(r.id),v=>{
          if(v)excluded.delete(r.id);else excluded.add(r.id);invalidate();rerender();
        });c.disabled=fixed;c.dataset.dsSeat=r.id;
      }
      check(rs,t('随包带入已选席位的自定义头像','Include custom portraits for selected roles'),'ds-avatars',portraits,v=>{portraits=v;invalidate();});
      rs.append(el('small',t('原图每张最多 119,982 字节。超限会列出缺项。','DS Bot accepts up to 119,982 raw bytes per portrait. Oversized images are flagged.')));
      const gs=box(parent,t('群与实际管理员','Groups and actual administrator'));
      gs.append(el('small',t('每个原生群连同自动加入的 Main Bot 共 2–12 个 Bot；这个上限按单群计算。只传完整原成员，群和管理员须在宿主确认。','Each native group has 2–12 Bots including the Main Bot, which joins automatically. The limit applies per group. Keep the original members together. Confirm membership and admin in the host.')));
      for(const g of team.groups){
        const f=el('div');f.className='ds-group';gs.append(f);
        const row=choice(g);
        const selector=pick(f,g.name,[['omit',t('不随包','Omit from this plan')],['reference',t('仅协作资料','Reference only')],['native',t('拟建原生群','Plan a native group')]],row.kind,kind=>{
          groupModes.set(g.id,kind==='native'?{kind,mode:'admin',admin:'@main'}:{kind});invalidate();rerender();
        });selector.dataset.dsGroup=g.id;
        if(row.kind==='omit')continue;
        f.append(el('small',g.members.map(id=>team.roles.find(r=>r.id===id)?.name??id).join(' · ')));
        if(row.kind==='native'){
          pick(f,t('实际管理员','Actual administrator'),[['@main',t('安装者 Main Bot','Installing Main Bot')],...g.members.map(id=>[id,team.roles.find(r=>r.id===id)?.name??id])],row.admin,v=>{
            groupModes.set(g.id,{...row,admin:v});invalidate();rerender();
          }).dataset.dsAdmin=g.id;
          pick(f,t('回复方式','Reply mode'),[['admin',t('管理员先答','Admin first')],['everyone',t('成员依次回复','Everyone in sequence')]],row.mode,v=>{
            groupModes.set(g.id,{...row,mode:v});invalidate();rerender();
          }).dataset.dsMode=g.id;
        }
      }
      const ex=el('details');ex.open=!!journalName||!!occupied;ex.append(el('summary',t('同名与续办','Existing names and resume')));parent.append(ex);
      const known=el('textarea');known.id='ds-known';known.rows=2;known.value=occupied;known.maxLength=16000;
      known.oninput=()=>{occupied=known.value;invalidate();};line(ex,t('只填已知冲突的本批全名，每行一个','Known conflicting batch names only, one per line'),known);
      const journalInput=el('input');journalInput.id='ds-receipts';journalInput.type='file';journalInput.accept='.json,application/json';
      journalInput.onchange=async()=>{
        const f=journalInput.files[0];journalInput.value='';if(!f)return;const v=++readToken;reading=true;invalidate();
        try{
          if(f.size>4*1024*1024||!f.size)throw Error(t('无效的续办文件大小。','Invalid receipt-file size.'));
          const obj=JSON.parse(await f.text());if(v!==readToken)return;journal=obj;journalName=f.name;
        }catch(e){if(v!==readToken)return;journal={invalid:true};journalName=t('无效，需清除或重新选择','Invalid; clear or replace');say(e.message,true);}
        if(v===readToken){reading=false;rerender();}
      };
      line(ex,t('可选，导入同一方案的 receipts.json','Optional: receipts.json from the same plan'),journalInput);
      if(journalName){
        ex.append(el('small',journalName));const clear=el('button',t('清除续办记录','Clear receipt file'));clear.type='button';
        clear.onclick=()=>{readToken++;reading=false;journal=null;journalName='';invalidate();rerender(active=>active===clear?byID('ds-receipts'):null);};ex.append(clear);
      }
      ex.append(el('small',t('保留原计划。批次、席位、头像、群或管理员变化后须另立计划。旧独立规划器的回执随原计划续办。','Keep the original plan. Batch, roster, portrait or room/admin changes require a separate plan. Resume earlier standalone-planner batches with their original pack.')));
      const view=el('button',t('查看计划','Preview plan'));view.id='ds-preview';view.type='button';view.onclick=preview;parent.append(view);
      const area=el('div');area.id='ds-results';area.setAttribute('aria-live','polite');parent.append(area);
      check(parent,t('已核本批只含可用岗位、群说明与获准头像。','I checked that these roles, group notes and portraits may be used in this batch.'),'ds-scrubbed',scrubbed,v=>{scrubbed=v;changed();});
    }
    return {ready,render,archive,reset};
  }
  return {create};
})();
