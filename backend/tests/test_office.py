import asyncio
import json
from dataclasses import replace
from datetime import date,timedelta
import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.schemas import CreateTask,OfficeError
from app.repository import Repository
from app.provider import Completion,ProviderError,DeepSeek
from app.engine import Engine
from app.main import create_app
import httpx

PLAN={'goal':'整理方案','outline':['任务','时间'],'gaps':[]}
DOC={'title':'方案','markdown':'# 方案\n\n按材料安排，缺项待确认。','gaps':[]}
YES={'approved':True,'summary':'符合材料和要求','issues':[]}
NO={'approved':False,'summary':'缺少责任人','issues':['列出责任人']}

@pytest.fixture
def settings(tmp_path):
    return Settings(db=tmp_path/'office.sqlite3',api_key='unit-test-only',price_valid_until=(date.today()+timedelta(days=1)).isoformat())

def request(key='test-request-001',**kw):
    return CreateTask(title='整理行动清单',criteria='标明负责人',material='小王整理资料',material_consent=True,idempotency_key=key,**kw)

class Fake:
    def __init__(self,*outputs):self.outputs=list(outputs or [PLAN,DOC,YES]);self.messages=[]
    async def complete(self,messages):
        self.messages.append(messages);result=self.outputs.pop(0)
        if isinstance(result,Exception):raise result
        return Completion(json.dumps(result,ensure_ascii=False) if not isinstance(result,str) else result,(100,100),'test-request')

def queued(repo,key='test-request-001'):
    t=repo.create(request(key));return repo.mutate(t['id'],t['version'],'run')

async def test_document_chain_and_review_hash(settings):
    repo=Repository(settings);t=queued(repo);fake=Fake();await Engine(repo,settings,fake).execute(t['id']);done=repo.get(t['id'])
    assert done['status']=='completed'
    assert [s['stage'] for s in done['steps']]==['plan','write','review']
    assert done['steps'][-1]['artifact_hash'] in fake.messages[-1][1]['content']
    assert done['spent_micros']==3000

async def test_review_rejection_triggers_one_revision_then_stops(settings):
    repo=Repository(settings);t=queued(repo);fake=Fake(PLAN,DOC,NO,DOC,NO)
    await Engine(repo,settings,fake).execute(t['id']);done=repo.get(t['id'])
    assert done['status']=='needs_revision';assert len(fake.messages)==5;assert len(done['steps'])==5

async def test_revision_passes_independent_review(settings):
    repo=Repository(settings);t=queued(repo);fake=Fake(PLAN,DOC,NO,DOC,YES)
    await Engine(repo,settings,fake).execute(t['id']);assert repo.get(t['id'])['status']=='completed'

async def test_invalid_json_retries_then_fails_without_artifact(settings,monkeypatch):
    async def no_sleep(n):pass
    monkeypatch.setattr('app.engine.asyncio.sleep',no_sleep)
    repo=Repository(settings);t=queued(repo);fake=Fake('not-json',' ')
    await Engine(repo,settings,fake).execute(t['id']);done=repo.get(t['id'])
    assert done['status']=='failed';assert done['error_code']=='MODEL_SCHEMA';assert not done['steps'];assert len(repo.calls(t['id']))==2

async def test_provider_timeout_keeps_reservation(settings,monkeypatch):
    async def no_sleep(n):pass
    monkeypatch.setattr('app.engine.asyncio.sleep',no_sleep)
    repo=Repository(settings);t=queued(repo);fake=Fake(*[ProviderError('MODEL_TIMEOUT','timeout',True) for _ in range(2)])
    await Engine(repo,settings,fake).execute(t['id']);calls=repo.calls(t['id'])
    assert len(calls)==2;assert all(c['cost']==c['reserved'] for c in calls);assert repo.get(t['id'])['status']=='failed'

async def test_initialization_error_is_safe(settings):
    repo=Repository(settings);t=queued(repo);fake=Fake(RuntimeError('sensitive-provider-value'))
    await Engine(repo,settings,fake).execute(t['id']);done=repo.get(t['id'])
    assert done['error_code']=='MODEL_INITIALIZATION';assert 'sensitive' not in json.dumps(done)

async def test_cancel_while_call_in_flight_stops_new_steps(settings):
    repo=Repository(settings);t=queued(repo)
    class CancelProvider:
        async def complete(self,messages):
            cur=repo.get(t['id']);repo.mutate(t['id'],cur['version'],'cancel')
            return Completion(json.dumps(PLAN),(100,100),'cancel-test')
    await Engine(repo,settings,CancelProvider()).execute(t['id']);done=repo.get(t['id'])
    assert done['status']=='cancelled';assert not done['steps'];assert len(repo.calls(t['id']))==1

async def test_retry_resumes_saved_steps(settings):
    repo=Repository(settings);t=queued(repo)
    await Engine(repo,settings,Fake(PLAN,ProviderError('MODEL_AUTH_FAILED','bad key'))).execute(t['id'])
    failed=repo.get(t['id']);assert len(failed['steps'])==1
    repo.mutate(t['id'],failed['version'],'retry');fake=Fake(DOC,YES)
    await Engine(repo,settings,fake).execute(t['id']);assert repo.get(t['id'])['status']=='completed';assert len(fake.messages)==2

async def test_budget_stops_before_network(settings):
    settings=replace(settings,task_budget_micros=1);repo=Repository(settings);t=queued(repo);fake=Fake()
    await Engine(repo,settings,fake).execute(t['id']);assert not fake.messages
    assert repo.get(t['id'])['error_code']=='BUDGET_EXCEEDED'

def test_budget_is_cumulative_across_tasks_and_reopen(settings):
    settings=replace(settings,total_budget_micros=100);repo=Repository(settings);a=queued(repo,'budget-task-a');b=queued(repo,'budget-task-b')
    repo.reserve(a['id'],'plan',60,0);repo=Repository(settings)
    with pytest.raises(OfficeError,match='预算'):repo.reserve(b['id'],'plan',41,0)
    assert repo.budget()['spent_micros']==60

def test_concurrent_budget_reservations_are_atomic(settings):
    from concurrent.futures import ThreadPoolExecutor
    settings=replace(settings,total_budget_micros=100);repo=Repository(settings);t=queued(repo)
    def reserve():
        try:repo.reserve(t['id'],'plan',60,0);return True
        except OfficeError:return False
    with ThreadPoolExecutor(max_workers=2) as pool:assert sum(pool.map(lambda _:reserve(),range(2)))==1

def test_oversized_usage_halts_every_task(settings):
    repo=Repository(settings);t=queued(repo);cid=repo.reserve(t['id'],'plan',10,0)
    assert repo.settle(cid,usage=(100,100))=='USAGE_EXCEEDS_RESERVATION'
    with pytest.raises(OfficeError,match='停止'):repo.reserve(t['id'],'write',10,0)

def test_crash_recovery_preserves_inflight_charge_and_output(settings):
    repo=Repository(settings);t=queued(repo);repo.add_step(t['id'],'plan',0,PLAN)
    repo.reserve(t['id'],'write',100,0);repo=Repository(settings);repo.recover();done=repo.get(t['id'])
    assert done['status']=='interrupted';assert done['steps'][0]['output']==PLAN;assert done['spent_micros']==100
    assert repo.next_queued() is None

def test_idempotency_and_version_prevent_duplicate_execution(settings):
    repo=Repository(settings);a=repo.create(request());b=repo.create(request());assert a['id']==b['id']
    changed=request().model_copy(update={'title':'不同任务'})
    with pytest.raises(OfficeError):repo.create(changed)
    repo.mutate(a['id'],0,'run')
    with pytest.raises(OfficeError):repo.mutate(a['id'],0,'run')

def test_owner_is_checked_on_reads_and_writes(settings):
    repo=Repository(settings);t=repo.create(request(),owner='someone-else')
    assert repo.list()==[]
    with pytest.raises(OfficeError):repo.get(t['id'])
    with pytest.raises(OfficeError):repo.mutate(t['id'],0,'run')

@pytest.mark.parametrize('method,path',[('GET','/api/v1/tasks'),('POST','/api/v1/tasks')])
def test_session_required(settings,method,path):
    with TestClient(create_app(settings,run_worker=False),base_url='http://127.0.0.1:8780') as c:
        assert c.request(method,path,json=request().model_dump() if method=='POST' else None).status_code==401

def session_client(settings):
    return TestClient(create_app(settings,run_worker=False),base_url='http://127.0.0.1:8780',raise_server_exceptions=False)

def login(c):
    r=c.get('/api/v1/session');assert 'httponly' in r.headers['set-cookie'].lower()
    return {'X-Office-Token':r.json()['csrf_token']}

def test_csrf_origin_host_and_body_guards(settings):
    with session_client(settings) as c:
        headers=login(c)
        assert c.post('/api/v1/tasks',json=request().model_dump()).status_code==403
        assert c.post('/api/v1/tasks',json=request().model_dump(),headers={**headers,'Origin':'https://evil.test'}).status_code==403
        assert c.get('/api/v1/session',headers={'Host':'evil.test'}).status_code==403
        assert c.get('/api/v1/session',headers={'Sec-Fetch-Site':'cross-site'}).status_code==403
        assert c.post('/api/v1/tasks',content='x'*100001,headers={**headers,'Content-Type':'application/json'}).status_code==413
        assert c.post('/api/v1/tasks',content='abc',headers=headers).status_code==415

def test_api_create_and_get_and_invalid_json(settings):
    with session_client(settings) as c:
        headers=login(c);r=c.post('/api/v1/tasks',json=request().model_dump(),headers=headers);assert r.status_code==201
        assert c.get('/api/v1/tasks/'+r.json()['id']).json()['title']=='整理行动清单'
        bad=c.post('/api/v1/tasks',json={'secret':'private-value'},headers=headers)
        assert bad.status_code==422;assert 'private-value' not in bad.text
        assert c.get('/api/v1/tasks/'+r.json()['id']+'/artifact').status_code==404

def test_missing_key_is_not_fake_success(settings):
    with session_client(replace(settings,api_key='')) as c:
        headers=login(c);t=c.post('/api/v1/tasks',json=request().model_dump(),headers=headers).json()
        r=c.post('/api/v1/tasks/'+t['id']+'/run',json={'version':0},headers=headers)
        assert r.status_code==503;assert r.json()['error']['code']=='MODEL_NOT_CONFIGURED'
        assert c.get('/api/v1/tasks/'+t['id']).json()['status']=='draft'

def test_expired_pricing_blocks_network(settings):
    repo=Repository(settings)
    with pytest.raises(OfficeError,match='费率'):Engine(repo,replace(settings,price_valid_until='2020-01-01')).ensure_ready()

def test_key_never_returned_or_served(settings):
    with session_client(settings) as c:
        login(c)
        for path in ['/api/v1/capabilities','/.env','/data/ai-office.sqlite3','/api/v1/health']:
            assert settings.api_key not in c.get(path).text
        assert settings.api_key not in repr(settings)

async def test_official_request_shape_and_usage(settings):
    def handler(req):
        body=json.loads(req.content)
        assert body['model']=='deepseek-flash';assert body['thinking']=={'type':'disabled'}
        assert body['response_format']=={'type':'json_object'};assert 'tools' not in body
        return httpx.Response(200,json={'id':'chatcmpl-test','choices':[{'finish_reason':'stop','message':{'content':json.dumps(PLAN)}}],'usage':{'prompt_tokens':20,'completion_tokens':30}})
    result=await DeepSeek(settings,httpx.MockTransport(handler)).complete([{'role':'user','content':'test json'}])
    assert result.usage==(20,30)

@pytest.mark.parametrize('status,code,retry',[(401,'MODEL_AUTH_FAILED',False),(402,'MODEL_BALANCE',False),(429,'MODEL_UNAVAILABLE',True),(500,'MODEL_UNAVAILABLE',True),(302,'MODEL_UNAVAILABLE',False)])
async def test_http_failures_are_redacted(settings,status,code,retry):
    transport=httpx.MockTransport(lambda req:httpx.Response(status,text='sensitive-error-text'))
    with pytest.raises(ProviderError) as exc:await DeepSeek(settings,transport).complete([])
    assert exc.value.code==code and exc.value.retryable==retry;assert 'sensitive' not in str(exc.value)

async def test_bad_usage_cannot_release_reserved_cost(settings):
    transport=httpx.MockTransport(lambda req:httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':'{}'}}],'usage':{'prompt_tokens':-1,'completion_tokens':0}}))
    with pytest.raises(ProviderError):await DeepSeek(settings,transport).complete([])

def test_environment_empty_key_does_not_fall_back_to_dotenv(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY','');assert Settings.load().api_key==''

def test_data_directory_cannot_run_two_workers(settings):
    first=create_app(settings,run_worker=False)
    with TestClient(first,base_url='http://127.0.0.1:8780'):
        with pytest.raises(RuntimeError,match='已有AI服务'):
            with TestClient(create_app(settings,run_worker=False),base_url='http://127.0.0.1:8780'):pass

def test_recovery_changes_running_to_interrupted_in_new_service(settings):
    with session_client(settings) as c:
        headers=login(c);t=c.post('/api/v1/tasks',json=request().model_dump(),headers=headers).json()
        r=c.post('/api/v1/tasks/'+t['id']+'/run',json={'version':0},headers=headers)
        assert r.json()['status']=='queued'
    with session_client(settings) as c:
        login(c);assert c.get('/api/v1/tasks/'+t['id']).json()['status']=='interrupted'

async def test_successful_invalid_schema_still_charges_usage(settings,monkeypatch):
    async def no_sleep(n):pass
    monkeypatch.setattr('app.engine.asyncio.sleep',no_sleep)
    repo=Repository(settings);t=queued(repo);await Engine(repo,settings,Fake('{}','{}')).execute(t['id'])
    assert repo.get(t['id'])['spent_micros']==2000
    assert all(c['input_tokens']==100 for c in repo.calls(t['id']))

def test_real_studio_serves_only_built_assets_and_keeps_api_private(settings):
    with session_client(settings) as c:
        r=c.get('/');assert r.status_code==200;assert 'studio.mjs' in r.text
        assert 'app.mjs' not in r.text
        assert "script-src 'self'" in r.headers['content-security-policy']
        assert c.get('/studio/ai-client.mjs').status_code==200
        for path in ['/studio/.env','/studio/data/ai-office.sqlite3','/studio/%2e%2e/backend/app/config.py']:
            assert c.get(path).status_code==404
        assert c.get('/api/v1/tasks').status_code==401
        r=c.get('/studio/tools/team-16/index.html');assert r.status_code==200
        assert 'sha256-' in r.headers['content-security-policy']
