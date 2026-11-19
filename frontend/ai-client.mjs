import {checkTask,checkCapabilities,taskPath} from './ai-state.mjs';
export class OfficeAPI {
 constructor(fetcher=globalThis.fetch.bind(globalThis)){this.fetcher=fetcher;this.csrf='';this.sessionPending=null;}
 async session(){if(!this.sessionPending)this.sessionPending=this.request('/session','GET',undefined,false).then(s=>{if(typeof s.csrf_token!=='string')throw Error('会话数据无效');this.csrf=s.csrf_token;}).finally(()=>{this.sessionPending=null;});return this.sessionPending;}
 async request(path,method='GET',body,recover=true){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);let r,data;
  try{r=await this.fetcher('/api/v1'+path,{method,credentials:'same-origin',signal:controller.signal,headers:method==='GET'?{}:{'Content-Type':'application/json','X-Office-Token':this.csrf},body:body===undefined?undefined:JSON.stringify(body)});data=await r.json();}
  catch{throw Error('连接中断，任务可能仍在执行。输入已保留，请重新连接。');}finally{clearTimeout(timer);}
  if(r.status===401&&recover){await this.session();return this.request(path,method,body,false);}
  if(!r.ok){const e=new Error(typeof data.error?.message==='string'?data.error.message:'请求未完成，请重试');e.code=data.error?.code;throw e;}
  return data;
 }
 async list(offset=0){const r=await this.request('/tasks?offset='+offset);if(!Array.isArray(r.tasks))throw Error('任务列表无法识别');return r.tasks.map(checkTask);}
 async get(id){return checkTask(await this.request(taskPath(id)));}
 async capabilities(){return checkCapabilities(await this.request('/capabilities'));}
 async create(input){return checkTask(await this.request('/tasks','POST',input));}
 async mutate(t,action){if(!['run','retry','cancel'].includes(action))throw Error('操作无效');return checkTask(await this.request(taskPath(t.id)+'/'+action,'POST',{version:t.version}));}
 artifact(id){return '/api/v1'+taskPath(id)+'/artifact';}
}
