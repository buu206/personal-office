import {createHash} from 'node:crypto';

export function packReadiness({busy,teamLoading,invalidTeam,fileCount,task,criteria,authorized,en=false}) {
  if(busy)return en?'Building the project…':'正在生成项目…';
  const missing=[];
  if(!fileCount)missing.push(en?'choose at least one source file':'选择至少一份底稿');
  if(!task.trim())missing.push(en?'fill in the task':'填写任务要求');
  if(!criteria.trim())missing.push(en?'fill in acceptance criteria':'填写验收标准');
  if(teamLoading)missing.push(en?'wait for the team file to load':'等待团队文件读取完成');
  else if(invalidTeam)missing.push(en?'choose a valid team or restore the default team':'重选有效团队或恢复默认团队');
  if(!authorized)missing.push(en?'confirm file authorization (confirm again after changing files or team)':'勾选材料授权（更换文件或团队后需重新确认）');
  return missing.length?(en?'Before generating: ':'还不能生成：')+missing.join(en?'; ':'；'):(en?'Ready. Generate the ZIP below.':'已准备好，可以生成项目 ZIP。');
}

// Apply an explicit, checked adaptation to the immutable upstream snapshot.
// Business validation and download behavior stay upstream-owned.
export function enhancePackFeedback(html) {
  const anchor="    $('cancel').hidden=!busy;";
  let changed=0,oldHash,newHash;
  const result=html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g,(tag,attrs,source)=>{
    if(!source.includes(anchor))return tag;
    if(source.split(anchor).length!==2)throw Error('打包控件结构变化，停止构建');
    changed++;
    const extra=`
    let hint=$('pack-readiness');
    if(!hint){
      hint=node('p');hint.id='pack-readiness';hint.setAttribute('role','status');hint.setAttribute('aria-live','polite');
      $('export').before(hint);$('export').setAttribute('aria-describedby','pack-readiness');
    }
    hint.textContent=packReadiness({busy,teamLoading,invalidTeam,fileCount:files.length,task:$('task').value,criteria:$('criteria').value,authorized:$('authorized').checked,en});
    hint.dataset.ready=String(!$('export').disabled);
`;
    const patched=source.replace('  function lock(){','  '+packReadiness.toString()+'\n  function lock(){').replace(anchor,anchor+extra);
    if(patched===source||!patched.includes('function packReadiness('))throw Error('打包状态函数结构变化，停止构建');
    const hash=s=>createHash('sha256').update(s).digest('base64');
    oldHash=hash(source);newHash=hash(patched);
    return '<script'+attrs+'>'+patched+'</script>';
  });
  if(changed!==1||!result.includes("'sha256-"+oldHash+"'"))throw Error('无法安全适配打包脚本或CSP');
  return result.replace("'sha256-"+oldHash+"'","'sha256-"+newHash+"'");
}
