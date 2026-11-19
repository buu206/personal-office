import hashlib
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from .schemas import OfficeError

OWNER = 'local-owner'
ACTIVE = ('queued', 'planning', 'writing', 'reviewing', 'revising')

def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')

def encode(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

class Repository:
    def __init__(self, settings):
        self.settings = settings
        self.path = Path(settings.db)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.connect() as con:
            version = con.execute('PRAGMA user_version').fetchone()[0]
            if version not in (0, 1): raise RuntimeError('Unsupported database schema')
            con.executescript('''
                CREATE TABLE IF NOT EXISTS tasks(
                  id TEXT PRIMARY KEY, owner TEXT NOT NULL, idem TEXT NOT NULL,
                  fingerprint TEXT NOT NULL, payload TEXT NOT NULL,
                  status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0,
                  error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                  UNIQUE(owner, idem));
                CREATE TABLE IF NOT EXISTS steps(
                  task_id TEXT NOT NULL REFERENCES tasks(id), stage TEXT NOT NULL,
                  sequence INTEGER NOT NULL, output TEXT NOT NULL, artifact_hash TEXT,
                  PRIMARY KEY(task_id,stage));
                CREATE TABLE IF NOT EXISTS calls(
                  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), stage TEXT NOT NULL,
                  reserved INTEGER NOT NULL, cost INTEGER NOT NULL, model TEXT NOT NULL,
                  started TEXT NOT NULL, elapsed_ms INTEGER NOT NULL DEFAULT 0,
                  input_tokens INTEGER, output_tokens INTEGER, request_id TEXT,
                  result TEXT NOT NULL DEFAULT 'started', error_code TEXT, retry INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
                PRAGMA user_version=1;
            ''')
        self.path.chmod(0o600)

    def _connect(self):
        con = sqlite3.connect(self.path, timeout=10)
        con.row_factory = sqlite3.Row
        con.execute('PRAGMA foreign_keys=ON')
        return con

    @contextmanager
    def connect(self):
        con = self._connect()
        try:
            with con: yield con
        finally: con.close()

    @contextmanager
    def tx(self):
        con = self._connect()
        try:
            con.execute('BEGIN IMMEDIATE')
            yield con
            con.commit()
        except BaseException:
            con.rollback(); raise
        finally: con.close()

    def _row(self, con, task_id, owner=OWNER):
        row = con.execute('SELECT * FROM tasks WHERE id=? AND owner=?', (task_id, owner)).fetchone()
        if row is None: raise OfficeError('NOT_FOUND', '任务不存在', 404)
        return row

    def _view(self, con, row):
        payload = json.loads(row['payload'])
        steps = con.execute('SELECT * FROM steps WHERE task_id=? ORDER BY sequence', (row['id'],)).fetchall()
        cost = con.execute('SELECT coalesce(sum(cost),0) FROM calls WHERE task_id=?', (row['id'],)).fetchone()[0]
        return dict(id=row['id'], **payload, status=row['status'], version=row['version'],
                    error_code=row['error_code'], created_at=row['created_at'], updated_at=row['updated_at'],
                    spent_micros=cost, steps=[dict(stage=s['stage'], sequence=s['sequence'],
                    output=json.loads(s['output']), artifact_hash=s['artifact_hash']) for s in steps])

    def get(self, task_id, owner=OWNER):
        with self.connect() as con: return self._view(con, self._row(con, task_id, owner))

    def list(self, offset=0, owner=OWNER):
        with self.connect() as con:
            rows=con.execute('SELECT * FROM tasks WHERE owner=? ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?', (owner, offset)).fetchall()
            return [self._view(con, r) for r in rows]

    def create(self, request, owner=OWNER):
        payload = request.model_dump(exclude={'idempotency_key', 'material_consent'})
        fingerprint = hashlib.sha256(encode(payload).encode()).hexdigest()
        with self.tx() as con:
            previous = con.execute('SELECT * FROM tasks WHERE owner=? AND idem=?', (owner, request.idempotency_key)).fetchone()
            if previous:
                if previous['fingerprint'] != fingerprint: raise OfficeError('IDEMPOTENCY_CONFLICT', '相同提交标识对应不同内容', 409)
                return self._view(con, previous)
            task_id = str(uuid.uuid4()); stamp=now()
            con.execute('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?)',
                        (task_id, owner, request.idempotency_key, fingerprint, encode(payload), 'draft', 0, None, stamp, stamp))
            return self._view(con, self._row(con, task_id, owner))

    def mutate(self, task_id, version, action, owner=OWNER):
        with self.tx() as con:
            row = self._row(con, task_id, owner)
            if row['version'] != version: raise OfficeError('STALE_VERSION', '任务已变化，请刷新后重试', 409)
            allowed = {'run': {'draft'}, 'retry': {'failed', 'interrupted'}, 'cancel': set(ACTIVE) | {'draft'}}
            if row['status'] not in allowed[action]: raise OfficeError('INVALID_STATE', '当前状态不能执行此操作', 409)
            target = 'cancelled' if action == 'cancel' else 'queued'
            con.execute('UPDATE tasks SET status=?,version=version+1,error_code=NULL,updated_at=? WHERE id=?', (target, now(), task_id))
            return self._view(con, self._row(con, task_id, owner))

    def next_queued(self):
        with self.connect() as con:
            row=con.execute("SELECT id FROM tasks WHERE status='queued' AND owner=? ORDER BY created_at,id LIMIT 1", (OWNER,)).fetchone()
            return row[0] if row else None

    def recover(self):
        with self.tx() as con:
            con.execute("UPDATE tasks SET status='interrupted',error_code='PROCESS_INTERRUPTED',version=version+1,updated_at=? WHERE status IN (?,?,?,?,?)", (now(), *ACTIVE))
            con.execute("UPDATE calls SET result='failed',error_code='PROCESS_INTERRUPTED' WHERE result='started'")

    def advance(self, task_id, state, error_code=None):
        with self.tx() as con:
            row=self._row(con, task_id)
            if row['status'] == 'cancelled': return False
            con.execute('UPDATE tasks SET status=?,error_code=?,version=version+1,updated_at=? WHERE id=?', (state,error_code,now(),task_id))
            return True

    def add_step(self, task_id, stage, sequence, output, artifact_hash=None):
        with self.tx() as con:
            if self._row(con,task_id)['status']=='cancelled': return False
            con.execute('INSERT INTO steps VALUES(?,?,?,?,?)', (task_id,stage,sequence,encode(output),artifact_hash))
            con.execute('UPDATE tasks SET version=version+1,updated_at=? WHERE id=?',(now(),task_id))
            return True

    def budget(self):
        with self.connect() as con:
            return dict(spent_micros=con.execute('SELECT coalesce(sum(cost),0) FROM calls').fetchone()[0],
                        halted=con.execute("SELECT 1 FROM meta WHERE key='budget_halted'").fetchone() is not None)

    def reserve(self, task_id, stage, amount, retry):
        with self.tx() as con:
            row=self._row(con,task_id)
            if row['status'] not in ACTIVE: raise OfficeError('CANCELLED', '任务已停止',409)
            if con.execute("SELECT 1 FROM meta WHERE key='budget_halted'").fetchone():
                raise OfficeError('BUDGET_HALTED','用量异常，已停止后续调用',409)
            used=con.execute('SELECT coalesce(sum(cost),0) FROM calls').fetchone()[0]
            task_used=con.execute('SELECT coalesce(sum(cost),0) FROM calls WHERE task_id=?',(task_id,)).fetchone()[0]
            if used+amount>self.settings.total_budget_micros or task_used+amount>self.settings.task_budget_micros:
                raise OfficeError('BUDGET_EXCEEDED','达到已批准预算，未发起本次调用',409)
            call_id=str(uuid.uuid4())
            con.execute('INSERT INTO calls(id,task_id,stage,reserved,cost,model,started,retry) VALUES(?,?,?,?,?,?,?,?)',
                        (call_id,task_id,stage,amount,amount,self.settings.model,now(),retry))
            return call_id

    def settle(self, call_id, usage=None, request_id=None, elapsed_ms=0, error_code=None):
        with self.tx() as con:
            row=con.execute('SELECT * FROM calls WHERE id=?',(call_id,)).fetchone()
            if row['result']!='started': raise RuntimeError('Call already settled')
            cost=row['reserved']
            if usage is not None:
                cost=usage[0]*self.settings.input_cny_per_million+usage[1]*self.settings.output_cny_per_million
                if cost>row['reserved']:
                    con.execute("INSERT OR REPLACE INTO meta VALUES('budget_halted','true')")
                    error_code='USAGE_EXCEEDS_RESERVATION'
            con.execute('UPDATE calls SET cost=?,input_tokens=?,output_tokens=?,request_id=?,elapsed_ms=?,result=?,error_code=? WHERE id=?',
                        (cost,usage[0] if usage else None,usage[1] if usage else None,request_id,elapsed_ms,'failed' if error_code else 'succeeded',error_code,call_id))
            return error_code

    def calls(self, task_id):
        with self.connect() as con:
            self._row(con,task_id)
            return [dict(r) for r in con.execute('SELECT * FROM calls WHERE task_id=? ORDER BY started,rowid',(task_id,))]
