'use strict';
// The 0.2.2b neutral definition is the only accepted schema. Source files are never mutated.
const TeamUpdate = (() => {
  const stages = ['dispatch', 'produce', 'review', 'deliver'];
  const collections = {
    roles: ['name', 'responsibility', 'avatar'],
    groups: ['name', 'purpose', 'members']
  };
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const label = (lang, zh, en) => lang === 'en' ? en : zh;
  const maxRows = 200;

  // Give the IDs involved when structurally valid input files would produce an invalid composite.
  function referenceIssues(team, lang='zh') {
    const t = (zh,en) => label(lang,zh,en);
    const messages = [];
    const ids = new Set(team.roles.map(r => r.id));
    for (const [kind, rows] of Object.entries({roles:team.roles, groups:team.groups})) {
      const used = new Map();
      for (const item of rows) {
        const key=item.name.toLowerCase();
        if (used.has(key)) messages.push(t('名称重复','Duplicate name')+' “'+item.name+'” · '+kind+'/'+used.get(key)+' + '+kind+'/'+item.id);
        else used.set(key,item.id);
      }
    }
    for (const g of team.groups) {
      const missing=g.members.filter(id=>!ids.has(id));
      if (missing.length) messages.push('groups/'+g.id+'/members · '+t('缺少席位 ','missing roles ')+missing.join(', '));
    }
    for (const stage of stages) {
      if (!ids.has(team.workflow[stage])) messages.push('workflow/'+stage+' · '+t('缺少席位 ','missing role ')+team.workflow[stage]);
    }
    if (team.workflow.produce===team.workflow.review) {
      messages.push('workflow/produce + workflow/review · '+t('制作与独审指向同一席位 ','production and independent review have the same owner ')+team.workflow.produce);
    }
    return messages;
  }

  function read(raw,lang='zh') {
    // Reject unsupported metadata (permissions, model assignments, external handbook fields, etc.) through the same parser.
    if (Array.isArray(raw?.roles) && raw.roles.length>maxRows || Array.isArray(raw?.groups) && raw.groups.length>maxRows) {
      throw Error(label(lang,'每份配置限 200 席、200 群。','Each configuration supports up to 200 roles and 200 groups.'));
    }
    try { return TeamDefinition.normalize(raw,lang); }
    catch (err) {
      // Add concrete IDs where the source shape is sufficiently clear, without accepting invalid data.
      if (Array.isArray(raw?.roles)&&Array.isArray(raw?.groups)&&raw.workflow &&
          raw.roles.every(r=>typeof r?.id==='string'&&typeof r?.name==='string') &&
          raw.groups.every(g=>typeof g?.id==='string'&&typeof g?.name==='string'&&Array.isArray(g?.members)) &&
          stages.every(k=>typeof raw.workflow[k]==='string')) {
        const detail=referenceIssues(raw,lang);
        if (detail.length) throw Error(err.message+'\n'+detail.join('\n'));
      }
      throw err;
    }
  }

  function compare(baseInput,mineInput,nextInput,lang='zh') {
    const [base,mine,next]=[baseInput,mineInput,nextInput].map(x=>read(x,lang));
    if (base.id!==mine.id || base.id!==next.id) throw Error(label(lang,
      '三份 team ID 不一致，无法判断它们是同一支队伍。','The three team IDs differ; they do not identify the same team.')+
      ' '+[base.id,mine.id,next.id].join(' / '));
    const rows=[];
    function field(parts,a,b,c) {
      if (equal(a,b)&&equal(a,c)) return;
      const state=equal(b,c)?'same':equal(a,c)?'mine':equal(a,b)?'new':'conflict';
      rows.push({key:parts.join('/'),parts,base:a,mine:b,next:c,state,required:state==='new'||state==='conflict'});
    }
    field(['name'],base.name,mine.name,next.name);
    for (const [kind,fields] of Object.entries(collections)) {
      const tables=[base,mine,next].map(d=>new Map(d[kind].map(r=>[r.id,r])));
      const ids=new Set([...tables[0].keys(),...tables[1].keys(),...tables[2].keys()]);
      for (const id of ids) {
        const [a,b,c]=tables.map(tab=>tab.get(id));
        // A new ID independently introduced on both sides cannot safely be merged field by field.
        if (a===undefined||b===undefined||c===undefined) field([kind,id],a,b,c);
        else for (const name of fields) field([kind,id,name],a[name],b[name],c[name]);
      }
      // Compare ordering only among entities present in all three files. The owner decides
      // which ordering to use; local-only rows keep their slots and accepted new rows append.
      const shared=new Set([...ids].filter(id=>tables.every(tab=>tab.has(id))));
      const orders=[base,mine,next].map(d=>d[kind].map(r=>r.id).filter(id=>shared.has(id)));
      field([kind,'@order'],...orders);
    }
    for (const k of stages) field(['workflow',k],base.workflow[k],mine.workflow[k],next.workflow[k]);
    return {base,mine,next,rows};
  }

  function resolve(plan,choices,lang='zh') {
    const pending=plan.rows.filter(r=>r.required&&!['mine','next'].includes(choices.get(r.key)));
    if (pending.length) return {pending:pending.map(r=>r.key),issues:[],team:null};
    const out=clone(plan.mine), tables={roles:new Map(out.roles.map(r=>[r.id,r])),groups:new Map(out.groups.map(g=>[g.id,g]))};
    const ordering={};
    for (const row of plan.rows) {
      if (!row.required||choices.get(row.key)!=='next') continue;
      const [kind,id,slot]=row.parts, value=clone(row.next);
      if (kind==='name') out.name=value;
      else if (kind==='workflow') out.workflow[id]=value;
      else if (id==='@order') ordering[kind]=value;
      else if (slot) tables[kind].get(id)[slot]=value;
      else if (value===undefined) tables[kind].delete(id);
      else tables[kind].set(id,value);
    }
    for (const kind of Object.keys(collections)) {
      const table=tables[kind], had=new Set(plan.mine[kind].map(r=>r.id));
      let ids=plan.mine[kind].map(r=>r.id).filter(id=>table.has(id));
      if (ordering[kind]) {
        const members=new Set(ordering[kind]);const sorted=ordering[kind].filter(id=>table.has(id));let i=0;
        ids=ids.map(id=>members.has(id)?sorted[i++]:id);
      }
      ids.push(...plan.next[kind].map(r=>r.id).filter(id=>table.has(id)&&!had.has(id)));
      out[kind]=ids.map(id=>table.get(id));
    }
    const issues=referenceIssues(out,lang);
    if (issues.length) return {pending:[],issues,team:null};
    try {
      const team=read(out,lang);
      const bytes=new TextEncoder().encode(JSON.stringify(team,null,2)+'\n');
      if(bytes.length>TeamDefinition.maxDocument)throw Error(label(lang,'结果超过编队台 32 MiB 的配置上限。','The result exceeds the builder’s 32 MiB configuration limit.'));
      return {pending:[],issues:[],team};
    } catch(e) { return {pending:[],issues:[e.message],team:null}; }
  }
  return {read,compare,resolve};
})();
