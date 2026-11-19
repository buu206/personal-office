import asyncio
import json
import re
import time
from dataclasses import dataclass
import httpx
from .schemas import OfficeError

@dataclass
class Completion:
    content: str
    usage: tuple[int,int]
    request_id: str

class ProviderError(OfficeError):
    def __init__(self, code, message, retryable=False):
        super().__init__(code,message,502)
        self.retryable=retryable

class DeepSeek:
    def __init__(self, settings, transport=None):
        self.settings=settings
        self.transport=transport

    async def complete(self, messages):
        s=self.settings
        if not s.api_key: raise ProviderError('MODEL_NOT_CONFIGURED','请先在本机配置模型密钥')
        payload=dict(model=s.model,messages=messages,stream=False,max_tokens=s.max_tokens,
                     thinking={'type':'disabled'},response_format={'type':'json_object'})
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(s.timeout_seconds,connect=10),
                                         follow_redirects=False,transport=self.transport,trust_env=False) as client:
                async with asyncio.timeout(s.timeout_seconds):
                    async with client.stream('POST',s.base_url+'/chat/completions',
                          headers={'Authorization':'Bearer '+s.api_key},json=payload) as response:
                        if response.status_code != 200:
                            code=response.status_code
                            if code in (401,403): raise ProviderError('MODEL_AUTH_FAILED','模型账户认证失败，请检查本机配置')
                            if code == 402: raise ProviderError('MODEL_BALANCE','模型账户余额不足')
                            raise ProviderError('MODEL_UNAVAILABLE','模型服务暂时不可用',code==429 or code>=500)
                        chunks=[];size=0
                        async for chunk in response.aiter_bytes():
                            size+=len(chunk)
                            if size>1_000_000: raise ProviderError('MODEL_RESPONSE_TOO_LARGE','模型响应超出限制')
                            chunks.append(chunk)
                        body=json.loads(b''.join(chunks))
            choice=body['choices'][0]; usage=body['usage']
            tokens=(usage['prompt_tokens'],usage['completion_tokens'])
            if any(type(n) is not int or n<0 for n in tokens): raise ValueError('invalid usage')
            # Truncation is not treated as usable output; retain its usage for settlement.
            content=choice['message']['content']
            if not isinstance(content,str): raise ValueError('invalid content')
            if choice.get('finish_reason')!='stop': content=''
            request_id=body.get('id','-')
            if not isinstance(request_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',request_id):request_id='-'
            return Completion(content,tokens,request_id)
        except ProviderError: raise
        except (httpx.TimeoutException,TimeoutError): raise ProviderError('MODEL_TIMEOUT','模型请求超时，已保留费用预留',True) from None
        except httpx.HTTPError: raise ProviderError('MODEL_NETWORK','模型连接失败，已保留费用预留',True) from None
        except Exception: raise ProviderError('MODEL_PROTOCOL','模型响应格式不完整，已保留费用预留') from None
