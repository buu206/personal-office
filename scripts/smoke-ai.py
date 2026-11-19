"""Real HTTP -> local task pipeline -> DeepSeek -> persisted artifact smoke. No fake provider."""
import importlib.util
import json
import os
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
import httpx
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from app.config import Settings
from app.repository import Repository
spec=importlib.util.spec_from_file_location('smoke_common',ROOT/'scripts/ai-smoke-common.py');common=importlib.util.module_from_spec(spec);spec.loader.exec_module(common)
settings=Settings.load()
if not settings.ready():sys.exit('真实冒烟待验：请在本机配置有效密钥并核验费率，没有进行模型调用。')
repo=Repository(settings)
base='http://127.0.0.1:'+str(settings.port)
evidence=ROOT/'docs/evidence/阶段2-2';evidence.mkdir(parents=True,exist_ok=True)
record=evidence/'冒烟记录.md';summary_path=evidence/'smoke-summary.json'
run_id=str(uuid.uuid4());seen=set();tasks=[]
summary={'format':'personal-office.real-smoke.v1','source':'deepseek','run_id':run_id,'fingerprint':common.fingerprint(),'status':'running','tasks':[]}
def save():
    tmp=summary_path.with_suffix('.tmp');tmp.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');tmp.replace(summary_path)
def log_calls(task_id):
    for call in repo.calls(task_id):
        if call['id'] in seen or call['result']=='started':continue
        seen.add(call['id'])
        if not record.exists():record.write_text('# 冒烟记录（脚本自动生成）\n\n- 模型：'+settings.model+'\n\n| 时间 | 链路 | 请求 ID | 输入 token | 输出 token | 首字耗时 | 总耗时 | 结构校验 | 重试次数 | 结果 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n')
        stamp=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        with record.open('a') as f:f.write('| '+stamp+' | '+run_id+':'+call['stage']+' | '+(call['request_id'] or '-')+' | '+str(call['input_tokens'] if call['input_tokens'] is not None else '-')+' | '+str(call['output_tokens'] if call['output_tokens'] is not None else '-')+' | N/A（非流式） | '+str(call['elapsed_ms']/1000)+'s | '+('通过' if call['result']=='succeeded' else '失败')+' | '+str(call['retry'])+' | '+('通过' if call['result']=='succeeded' else '失败')+' |\n')
samples=[
 ('把会议记录整理为行动清单','列出任务、责任人、期限；没有的信息标待确认','公开合成材料：周一会议决定小王整理客户反馈，周五前提交；小李梳理FAQ，期限未定。预算没有讨论。'),
 ('为内部读书会写一份执行方案','包含目标、流程、分工和待确认事项；不得编造预算','公开合成材料：拟下周三下午举办一小时线上读书会，参与者8人，小陈主持。书目尚未确定，场地费用不适用。'),
 ('把周报素材整理为简洁周报','分本周完成、风险、下周计划；保留数字','公开合成材料：本周整理20条客户问题，修复3个文案错误。还有5条问题待产品确认。下周准备帮助文档初稿。'),
 ('根据材料整理功能发布通知草稿','面向内部同事，明确已实现与暂未提供，不能声称已经发布','公开合成材料：新版拟增加团队文件导出和版本对比，本周五计划测试。暂不提供多人在线协同，具体发布日期未确定。'),
 ('整理文档交接方案','写交接清单、验收方式与缺口；不虚构实际操作','公开合成材料：需将项目说明、FAQ与操作指南交给接手人。小林负责FAQ，项目说明已有初稿，操作指南尚未开始，接手人未确定。')]
save()
try:
    with httpx.Client(base_url=base,timeout=10,trust_env=False) as client:
        session=client.get('/api/v1/session');session.raise_for_status();headers={'X-Office-Token':session.json()['csrf_token']}
        for i,(title,criteria,material) in enumerate(samples):
            r=client.post('/api/v1/tasks',headers=headers,json=dict(title=title,criteria=criteria,material=material,material_consent=True,idempotency_key='smoke-'+run_id+'-'+str(i)));r.raise_for_status();task=r.json()
            r=client.post('/api/v1/tasks/'+task['id']+'/run',headers=headers,json={'version':task['version']});r.raise_for_status()
            deadline=time.monotonic()+1200
            while time.monotonic()<deadline:
                r=client.get('/api/v1/tasks/'+task['id']);r.raise_for_status();task=r.json();log_calls(task['id'])
                if task['status'] not in ('queued','planning','writing','reviewing','revising'):break
                time.sleep(.6)
            else:raise RuntimeError('Smoke deadline reached')
            calls=repo.calls(task['id']);summary['tasks'].append({'id':task['id'],'status':task['status'],'calls':[c['id'] for c in calls]});tasks.append(task);save()
            print('样例',i+1,task['status'],'调用数',len(calls),flush=True)
            if task['status']!='completed':raise RuntimeError('Real task did not pass review')
    summary['status']='passed';summary['fingerprint']=common.fingerprint();save()
    report=ROOT/'docs/阶段文档/真实AI样例评分.md'
    lines=['# 真实AI样例（脚本生成，内容质量待用户评分）','', '评分：每条按覆盖要求、事实依据、可用性各1–3分；标出不能接受项。工程成功不替代内容质量验收。','']
    for i,t in enumerate(tasks):
        lines+=['## 样例 '+str(i+1),t['title'],'', '材料：'+t['material'],'']
        for step in t['steps']:
            if step['stage'] in ('write','revise'):lines+=[step['stage'],step['output']['markdown'],'']
            if step['stage'].startswith('review'):lines+=['审核：'+json.dumps(step['output'],ensure_ascii=False),'']
        lines+=['评分：覆盖要求 __ /3；事实依据 __ /3；可用性 __ /3；不能接受项：__','']
    report.write_text('\n'.join(lines))
    print('5条真实链路完成；样例已保存，内容质量待用户打分。')
except Exception:
    summary['status']='failed';save()
    print('真实冒烟未通过；已保留实际调用记录。请检查任务状态与本机配置，不把本结果标记为通过。',file=sys.stderr)
    sys.exit(1)
