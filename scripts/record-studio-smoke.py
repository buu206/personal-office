"""Capture an actual browser-created task's server call ledger, without issuing model calls."""
import importlib.util,json,sys,time,uuid
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from app.config import Settings
from app.repository import Repository
spec=importlib.util.spec_from_file_location('common',ROOT/'scripts/ai-smoke-common.py');common=importlib.util.module_from_spec(spec);spec.loader.exec_module(common)
evidence=ROOT/'docs/evidence/阶段3-3';evidence.mkdir(parents=True,exist_ok=True)
marker=evidence/'browser-run.json'
if sys.argv[1:] == ['--begin']:
    marker.write_text(json.dumps({'run_id':str(uuid.uuid4()),'started':int(time.time()),'fingerprint':common.fingerprint()}))
    print('Browser smoke marker ready; no model call issued.')
    sys.exit(0)
try:
    run=json.loads(marker.read_text());assert run['fingerprint']==common.fingerprint()
    settings=Settings.load();repo=Repository(settings);task=repo.get(sys.argv[1]);calls=repo.calls(task['id'])
    assert len(calls)>=3 and all(datetime.fromisoformat(c['started']).timestamp()>=run['started'] and c['result']!='started' for c in calls)
    assert all(c['model']==settings.model for c in calls)
    record=evidence/'冒烟记录.md'
    if not record.exists():record.write_text('# 冒烟记录（脚本自动采集真实浏览器任务账本）\n- 模型：'+settings.model+'\n\n| 时间 | 链路 | 请求 ID | 输入 token | 输出 token | 首字耗时 | 总耗时 | 结构校验 | 重试次数 | 结果 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n')
    existing=record.read_text()
    with record.open('a') as f:
        for c in calls:
            identity=run['run_id']+':'+c['id']
            if identity in existing:continue
            f.write('| '+datetime.fromisoformat(c['started']).astimezone(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d %H:%M:%S')+' | '+identity+':'+c['stage']+' | '+(c['request_id'] or '-')+' | '+str(c['input_tokens'])+' | '+str(c['output_tokens'])+' | N/A（非流式） | '+str(c['elapsed_ms']/1000)+'s | '+('通过' if c['result']=='succeeded' else '失败')+' | '+str(c['retry'])+' | '+('通过' if c['result']=='succeeded' else '失败')+' |\n')
    passed=task['status']=='completed'
    summary={'format':'personal-office.real-smoke.v1','source':'deepseek','run_id':run['run_id'],'fingerprint':run['fingerprint'],'status':'passed' if passed else 'failed','tasks':[{'id':task['id'],'status':task['status'],'calls':[c['id'] for c in calls]}]}
    (evidence/'smoke-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    assert passed
    print('Browser task completed; actual server call evidence recorded. Calls:',len(calls))
except Exception:
    print('Real browser smoke not passed: check task state, timing and current code fingerprint.');sys.exit(1)
