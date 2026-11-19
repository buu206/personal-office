"""Shared deterministic code fingerprint for real-call evidence validation."""
import hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def fingerprint():
    digest=hashlib.sha256()
    for folder in ('backend','frontend','scripts','config'):
        for p in sorted((ROOT/folder).rglob('*')):
            if not p.is_file() or any(x in p.parts for x in ('.venv','node_modules','dist','__pycache__','.pytest_cache','.build-next','vendor')):continue
            if p.suffix not in ('.py','.js','.mjs','.html','.css','.json','.txt','.sh'):continue
            digest.update(str(p.relative_to(ROOT)).encode());digest.update(p.read_bytes())
    return digest.hexdigest()
