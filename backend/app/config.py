from dataclasses import dataclass, field
from datetime import date
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

@dataclass(frozen=True)
class Settings:
    db: Path = ROOT / 'data' / 'ai-office.sqlite3'
    api_key: str = field(default='', repr=False)
    base_url: str = 'https://api.deepseek.com'
    model: str = 'deepseek-flash'
    input_cny_per_million: int = 2
    output_cny_per_million: int = 8
    price_valid_until: str = '2026-12-18'
    max_tokens: int = 2500
    timeout_seconds: int = 90
    attempts_per_step: int = 2
    task_budget_micros: int = 1_000_000
    total_budget_micros: int = 10_000_000
    port: int = 8780

    def ready(self):
        return bool(self.api_key) and date.today() <= date.fromisoformat(self.price_valid_until)

    @classmethod
    def load(cls):
        values = json.loads((ROOT / 'config/ai.json').read_text())
        values.pop('provider'); values.pop('price_checked_on')
        if values['base_url'] != 'https://api.deepseek.com' or values['model'] != 'deepseek-flash':
            raise ValueError('模型配置不在已核验范围')
        if values['task_budget_micros'] > 1_000_000 or values['total_budget_micros'] > 10_000_000:
            raise ValueError('不能超过已批准的预算')
        if not 1 <= values['max_tokens'] <= 2500 or not 1 <= values['attempts_per_step'] <= 2:
            raise ValueError('调用次数或输出上限超出已核验范围')
        if values['input_cny_per_million'] < 2 or values['output_cny_per_million'] < 8:
            raise ValueError('费用预留不得低于已核验费率')
        key = os.environ.get('MODEL_API_KEY')
        if key is None:
            path = ROOT / '.env'
            if path.exists():
                for line in path.read_text().splitlines():
                    if line.startswith('MODEL_API_KEY='): key = line.partition('=')[2].strip()
        return cls(**values, api_key=key or '',
                   db=Path(os.environ.get('OFFICE_AI_DB', ROOT / 'data/ai-office.sqlite3')),
                   port=int(os.environ.get('OFFICE_AI_PORT', '8780')))
