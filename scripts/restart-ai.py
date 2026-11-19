import http.cookiejar
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
TEMP=Path(os.environ['RESTART_CHECK_DIR']).resolve()
if TEMP==ROOT or ROOT in TEMP.parents:sys.exit('Recovery checks require an isolated temporary directory')

def call(method,path,body=None):
    port=(TEMP/'port').read_text();base='http://127.0.0.1:'+port
    jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    session=json.loads(client.open(base+'/api/v1/session',timeout=5).read())
    req=urllib.request.Request(base+'/api/v1'+path,method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type':'application/json','X-Office-Token':session['csrf_token']})
    return json.loads(client.open(req,timeout=5).read())

action=sys.argv[1]
if action=='start':
    if (TEMP/'port').exists():port=int((TEMP/'port').read_text())
    else:
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        (TEMP/'port').write_text(str(port))
    env={**os.environ,'MODEL_API_KEY':'','OFFICE_AI_PORT':str(port),'OFFICE_AI_DB':str(TEMP/'test.sqlite3')}
    with (TEMP/'server.log').open('ab') as log:
        proc=subprocess.Popen([str(ROOT/'backend/.venv/bin/python'),'-m','uvicorn','app.main:create_app','--factory','--host','127.0.0.1','--port',str(port),'--no-access-log','--log-level','critical'],cwd=ROOT/'backend',env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
    (TEMP/'pid').write_text(str(proc.pid))
    for _ in range(80):
        if proc.poll() is not None:sys.exit('Recovery service failed to start')
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/v1/health',timeout=.5) as r:
                if r.status==200:print(proc.pid);break
        except Exception:time.sleep(.1)
    else:
        proc.terminate();sys.exit('Recovery service did not become healthy')
elif action=='write':
    marker=sys.argv[2]
    print(call('POST','/tasks',dict(title=marker,criteria='recovery test',material='',material_consent=True,idempotency_key=marker))['id'])
elif action=='read':print(call('GET','/tasks/'+sys.argv[2])['title'])
elif action=='stop':pass  # verify.sh owns process termination and temporary directory removal.
else:sys.exit('Unknown action')
