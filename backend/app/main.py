import asyncio
from contextlib import asynccontextmanager, suppress
from datetime import date
import fcntl
import secrets
import re
from pathlib import Path
from urllib.parse import urlsplit
from fastapi import FastAPI, Request, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, FileResponse, Response, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from .config import Settings
from .repository import Repository
from .engine import Engine
from .schemas import (CreateTask, Mutation, TaskView, TaskList, ErrorResponse, OfficeError,
                      Session, Capabilities, Health)

STATIC=Path(__file__).parent.parent/'static'
DIST=Path(__file__).resolve().parents[2]/'frontend'/'dist'

def error(code,message,status=400):
    return JSONResponse({'error':{'code':code,'message':message}},status_code=status)

class Boundary:
    """Validate local browser origin and bound request bodies before JSON parsing."""
    def __init__(self,app,settings,session,csrf):
        self.app,self.settings,self.session,self.csrf=app,settings,session,csrf

    async def __call__(self,scope,receive,send):
        if scope['type']!='http':return await self.app(scope,receive,send)
        request=Request(scope);headers=request.headers
        expected={f'127.0.0.1:{self.settings.port}',f'localhost:{self.settings.port}'}
        origin=headers.get('origin')
        origin_ok=origin is None or origin in {'http://'+h for h in expected}
        if headers.get('host') not in expected or not origin_ok or headers.get('sec-fetch-site')=='cross-site':
            return await error('ORIGIN_REJECTED','仅允许本机同源访问',403)(scope,receive,send)
        path=scope['path'];method=scope['method']
        public=path in ('/','/check.js','/api/v1/session','/api/v1/health')
        if path.startswith('/api/') and not public:
            cookie=request.cookies.get('office_session','')
            if not secrets.compare_digest(cookie,self.session):
                return await error('SESSION_REQUIRED','请重新打开验收页面',401)(scope,receive,send)
            if method not in ('GET','HEAD') and not secrets.compare_digest(headers.get('x-office-token',''),self.csrf):
                return await error('CSRF_REJECTED','请求来源验证失败，请刷新页面',403)(scope,receive,send)
        if method in ('POST','PUT','PATCH'):
            if headers.get('content-type','').split(';')[0]!='application/json':
                return await error('CONTENT_TYPE','请提交JSON',415)(scope,receive,send)
            body=bytearray()
            while True:
                message=await receive()
                if message['type']=='http.disconnect':return
                body.extend(message.get('body',b''))
                if len(body)>100_000:return await error('BODY_TOO_LARGE','请求超过100KB',413)(scope,receive,send)
                if not message.get('more_body'):break
            delivered=False
            original_receive=receive
            async def bounded_receive():
                nonlocal delivered
                if not delivered:
                    delivered=True
                    return {'type':'http.request','body':bytes(body),'more_body':False}
                return await original_receive()
            receive=bounded_receive
        async def safe_send(message):
            if message['type']=='http.response.start':
                csp="default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
                if path.startswith('/studio/'):
                    csp="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
                    # Existing tool pages carry build-verified script hashes. Preserve that policy.
                    for name in ('team-16','start-with-files','update-team'):
                        if path==f'/studio/tools/{name}/index.html':
                            html=(DIST/'tools'/name/'index.html').read_text()
                            policy=re.search(r'<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]+)"',html)
                            if policy:csp=policy.group(1)+"; frame-ancestors 'none'"
                message['headers']+= [(b'cache-control',b'no-store'),(b'x-content-type-options',b'nosniff'),
                                      (b'content-security-policy',csp.encode())]
            await send(message)
        await self.app(scope,receive,safe_send)

def create_app(settings=None,provider=None,run_worker=True):
    settings=settings or Settings.load()
    repo=Repository(settings);engine=Engine(repo,settings,provider)
    session=secrets.token_urlsafe(32);csrf=secrets.token_urlsafe(32)
    @asynccontextmanager
    async def lifespan(app):
        lock=open(str(settings.db)+'.lock','a')
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:
            lock.close();raise RuntimeError('该数据目录已有AI服务运行') from None
        repo.recover()
        worker=asyncio.create_task(engine.worker()) if run_worker else None
        try:yield
        finally:
            if worker:
                worker.cancel()
                with suppress(asyncio.CancelledError):await worker
            fcntl.flock(lock,fcntl.LOCK_UN);lock.close()
    app=FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
    app.state.repo=repo;app.state.engine=engine
    app.add_middleware(Boundary,settings=settings,session=session,csrf=csrf)
    @app.exception_handler(OfficeError)
    async def office_error(request,exc):return error(exc.code,exc.message,exc.status)
    @app.exception_handler(RequestValidationError)
    async def validation_error(request,exc):return error('VALIDATION','输入格式、长度或必填字段不正确',422)
    @app.exception_handler(HTTPException)
    async def http_error(request,exc):return error('NOT_FOUND' if exc.status_code==404 else 'HTTP_ERROR','请求不可用',exc.status_code)
    @app.exception_handler(Exception)
    async def unknown_error(request,exc):return error('INTERNAL_ERROR','服务暂时不可用',500)
    @app.get('/')
    async def index():return RedirectResponse('/studio/',status_code=307)
    @app.get('/studio/')
    async def studio():
        if not (DIST/'studio.html').is_file():raise OfficeError('BUILD_REQUIRED','请运行启动工作室.command完成构建',503)
        return FileResponse(DIST/'studio.html')
    @app.get('/studio/index.html')
    async def studio_index():return RedirectResponse('/studio/',status_code=307)
    @app.get('/check.js')
    async def js():return FileResponse(STATIC/'check.js',media_type='text/javascript')
    @app.get('/api/v1/health',response_model=Health)
    async def health():return Health()
    @app.get('/api/v1/session',response_model=Session)
    async def bootstrap(response:Response):
        response.set_cookie('office_session',session,httponly=True,samesite='strict')
        return Session(csrf_token=csrf)
    @app.get('/api/v1/capabilities',response_model=Capabilities)
    async def capabilities():
        return Capabilities(configured=bool(settings.api_key),pricing_current=date.today()<=date.fromisoformat(settings.price_valid_until),
            model=settings.model,**repo.budget(),total_budget_micros=settings.total_budget_micros,
            task_budget_micros=settings.task_budget_micros,supported=['文本整理','方案撰写'])
    @app.get('/api/v1/tasks',response_model=TaskList)
    async def tasks(offset:int=Query(default=0,ge=0,le=100000)):return TaskList(tasks=repo.list(offset))
    @app.post('/api/v1/tasks',response_model=TaskView,status_code=201)
    async def create(data:CreateTask):return repo.create(data)
    @app.get('/api/v1/tasks/{task_id}',response_model=TaskView)
    async def get_task(task_id:str):return repo.get(task_id)
    @app.post('/api/v1/tasks/{task_id}/run',response_model=TaskView)
    async def run(task_id:str,mutation:Mutation):
        engine.ensure_ready()
        return repo.mutate(task_id,mutation.version,'run')
    @app.post('/api/v1/tasks/{task_id}/retry',response_model=TaskView)
    async def retry(task_id:str,mutation:Mutation):
        engine.ensure_ready()
        return repo.mutate(task_id,mutation.version,'retry')
    @app.post('/api/v1/tasks/{task_id}/cancel',response_model=TaskView)
    async def cancel(task_id:str,mutation:Mutation):return repo.mutate(task_id,mutation.version,'cancel')
    @app.get('/api/v1/tasks/{task_id}/artifact')
    async def artifact(task_id:str):
        task=repo.get(task_id)
        documents=[s for s in task['steps'] if s['stage'] in ('write','revise')]
        if not documents:raise OfficeError('NO_ARTIFACT','尚未生成文档',404)
        return Response(documents[-1]['output']['markdown'],media_type='text/markdown; charset=utf-8',
             headers={'Content-Disposition':'attachment; filename="office-document.md"','X-Office-Review-Status':task['status']})
    app.mount('/studio',StaticFiles(directory=str(DIST),check_dir=False),name='studio-assets')
    return app
