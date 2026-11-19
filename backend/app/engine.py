import asyncio
import hashlib
import json
import time
from pathlib import Path
from pydantic import ValidationError
from .provider import DeepSeek, ProviderError
from .repository import encode
from .schemas import Plan, Document, Review, OfficeError

PROMPTS=Path(__file__).parent/'prompts'

class Engine:
    def __init__(self,repo,settings,provider=None,audit=None):
        self.repo,self.settings=repo,settings
        self.provider=provider or DeepSeek(settings)
        self.audit=audit

    def ensure_ready(self):
        if not self.settings.api_key:raise OfficeError('MODEL_NOT_CONFIGURED','请先双击配置AI.command填写本机密钥',503)
        if not self.settings.ready():raise OfficeError('PRICING_EXPIRED','费率核验已到期，请先重新核对费用配置',503)
        if self.repo.budget()['halted']:raise OfficeError('BUDGET_HALTED','用量异常，已停止后续调用',409)

    async def call(self,task_id,stage,prompt,data,schema):
        self.ensure_ready()
        messages=[{'role':'system','content':(PROMPTS/(prompt+'.txt')).read_text()},
                  {'role':'user','content':encode(data)}]
        # Byte fallback overestimates normal text tokenization. Add framing overhead and 100% margin.
        bound=len(encode(messages).encode('utf-8'))+4096
        amount=2*(bound*self.settings.input_cny_per_million+self.settings.max_tokens*self.settings.output_cny_per_million)
        for retry in range(self.settings.attempts_per_step):
            call_id=self.repo.reserve(task_id,stage,amount,retry)
            started=time.monotonic();result=None;error=None;retryable=False;output=None
            try:
                result=await self.provider.complete(messages)
                if not result.content.strip():raise ValueError('empty response')
                output=schema.model_validate_json(result.content).model_dump()
            except ProviderError as exc:
                error=exc.code;retryable=exc.retryable
            except (ValueError,ValidationError):
                error='MODEL_SCHEMA';retryable=True
            except asyncio.CancelledError:
                self.repo.settle(call_id,elapsed_ms=int((time.monotonic()-started)*1000),error_code='PROCESS_INTERRUPTED')
                if self.audit:self.audit(self.repo.calls(task_id)[-1])
                raise
            except Exception:
                error='MODEL_INITIALIZATION';retryable=False
            error=self.repo.settle(call_id,usage=result.usage if result else None,
                  request_id=result.request_id if result else None,elapsed_ms=int((time.monotonic()-started)*1000),error_code=error)
            if self.audit:self.audit(self.repo.calls(task_id)[-1])
            if not error:return output
            if self.repo.get(task_id)['status']=='cancelled':raise OfficeError('CANCELLED','任务已取消',409)
            if not retryable or retry+1>=self.settings.attempts_per_step:
                raise OfficeError(error,'模型步骤未完成；已保存状态和费用记录，可查看后重试',502)
            await asyncio.sleep(min(2**retry,2))
        raise RuntimeError('Unreachable')

    async def execute(self,task_id):
        try:
            task=self.repo.get(task_id)
            if task['status']!='queued':return
            self.ensure_ready()
            outputs={s['stage']:s['output'] for s in task['steps']}
            context={k:task[k] for k in ('title','criteria','material')}
            stages=[('plan','planning','plan',Plan),('write','writing','write',Document),('review','reviewing','review',Review),
                    ('revise','revising','write',Document),('review_final','reviewing','review',Review)]
            for seq,(stage,status,prompt,schema) in enumerate(stages):
                if stage in ('revise','review_final') and outputs.get('review',{}).get('approved'):
                    break
                if stage in outputs:continue
                if not self.repo.advance(task_id,status):return
                data=dict(context,plan=outputs.get('plan'))
                artifact_hash=None
                if stage.startswith('review'):
                    artifact=outputs['revise' if stage=='review_final' else 'write']
                    artifact_hash=hashlib.sha256(encode(artifact).encode()).hexdigest()
                    data.update(document=artifact,artifact_hash=artifact_hash)
                if stage=='revise':data.update(document=outputs['write'],review=outputs['review'])
                output=await self.call(task_id,stage,prompt,data,schema)
                if not self.repo.add_step(task_id,stage,seq,output,artifact_hash):return
                outputs[stage]=output
            review=outputs.get('review_final',outputs.get('review'))
            self.repo.advance(task_id,'completed' if review and review['approved'] else 'needs_revision')
        except asyncio.CancelledError:raise
        except OfficeError as exc:self.repo.advance(task_id,'failed',exc.code)
        except Exception:self.repo.advance(task_id,'failed','INTERNAL_ERROR')

    async def worker(self):
        while True:
            task_id=self.repo.next_queued()
            if task_id:await self.execute(task_id)
            else:await asyncio.sleep(.2)
