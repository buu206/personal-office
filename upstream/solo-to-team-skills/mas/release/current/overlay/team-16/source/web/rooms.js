'use strict';
const NativeRoomExport=(()=>{
  const core=typeof TeamDefinition!=='undefined'?TeamDefinition:require('./core.js');
  const adapters=typeof TeamBuilderAdapters!=='undefined'?TeamBuilderAdapters:require('./adapters.js');
  const bytes=x=>new TextEncoder().encode(x).length;
  function parse(input){return core.importDefinition(input).team}
  async function build(input,choices=[]){
    const team=core.normalize(input);
    if(!Array.isArray(choices)||choices.length>30)throw Error('每次最多选择 30 个原生群聊。');
    const gs=new Map(team.groups.map(g=>[g.id,g])),picked=new Set();
    const rooms=choices.map(({id,responder})=>{
      const g=gs.get(id);
      if(!g||picked.has(id))throw Error('选择中存在重复或未知群。');
      picked.add(id);
      if(!g.name.trim()||g.name.length>100||/[\x00-\x1f\x7f]/u.test(g.name))throw Error('群名须为单行且不超过 100 个字符单位。');
      if(g.purpose.length>12000)throw Error('群说明超过该版 12,000 字符单位上限。');
      if(responder?.kind!=='mentions' && !(responder?.kind==='agent' && g.members.includes(responder.agent)))throw Error('默认应答席只能取该群中的实际成员，或选择仅在提及时应答。');
      const defaultResponder=responder.kind==='agent'?{kind:'agent',agent:responder.agent}:{kind:'mentions'};
      return {key:g.id,name:g.name,members:[...g.members],bulletin:g.purpose,defaultResponder};
    });
    const base=await adapters.exportOpenMausBot(team);
    if(!rooms.length)return base;
    const doc=JSON.parse(await base.text()),prefix='群成员与用途仅作组织说明，本包不创建聊天室。';
    const sections=doc.package.team.brief.split('\n\n');
    if(!sections[1]?.startsWith(prefix))throw Error('基础部门生成器版本不符，已停止。');
    sections[1]='只创建导入预览所列的已选择群聊；其他群仅留作团队说明。群籍与应答席不授予管理、审批或对外行动权限。'+sections[1].slice(prefix.length);
    doc.package.team.brief=sections.join('\n\n');doc.package.rooms=rooms;
    const payload=JSON.stringify(doc,null,2)+'\n';
    if(bytes(doc.package.team.brief)>24000||bytes(payload)>4*1024*1024)throw Error('超出宿主的部门说明或 4 MiB 包体边界。请保留中性源文件并减少本次群或素材。');
    return new Blob([payload],{type:'application/json'});
  }
  return {parse,build};
})();
if(typeof window!=='undefined')window.NativeRoomExport=NativeRoomExport;
if(typeof module!=='undefined'&&module.exports)module.exports=NativeRoomExport;
