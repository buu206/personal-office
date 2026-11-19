import importlib.util
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from app.config import Settings
from app.repository import Repository
spec=importlib.util.spec_from_file_location('smoke_common',ROOT/'scripts/ai-smoke-common.py');common=importlib.util.module_from_spec(spec);spec.loader.exec_module(common)
stage=sys.argv[1] if len(sys.argv)>1 else '阶段2-2'
if stage not in ('阶段2-2','阶段3-3'):sys.exit(1)
try:
    s=json.loads((ROOT/'docs/evidence'/stage/'smoke-summary.json').read_text())
    assert s['format']=='personal-office.real-smoke.v1' and s['source']=='deepseek' and s['status']=='passed'
    assert s['fingerprint']==common.fingerprint() and len(s['tasks'])>=(5 if stage=='阶段2-2' else 1)
    settings=Settings.load()
    assert settings.db.exists()
    repo=Repository(settings)
    for item in s['tasks']:
        task=repo.get(item['id']);assert task['status']=='completed'
        calls=repo.calls(item['id']);assert len(calls)>=3 and {c['id'] for c in calls}==set(item['calls'])
        assert any(c['stage'].startswith('review') and c['result']=='succeeded' for c in calls)
        assert all(c['result']!='started' for c in calls)
    print('真实模型完整链路及当前代码指纹通过；内容质量待用户评分。')
except Exception:
    print('待验：缺少当前代码对应的5条真实完整链路，或调用/产物证据不匹配。')
    sys.exit(1)
