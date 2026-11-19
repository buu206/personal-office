import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {modulesInOrder} from '../source/build.mjs';

// A narrow DOM lifecycle seam, not a browser: no layout, native key/Tab handling,
// accessibility tree, raster decoding or CSS focusability. All application modules
// and event listeners are real. ID lookup only sees connected nodes.
export function createDOM(html='', {focusFallback='body'}={}) {
  let document;
  const dataName = k => k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
  class Node {
    constructor(){this.parentNode=null;this.childNodes=[];this.ownerDocument=document;}
    getRootNode(){let n=this;while(n.parentNode)n=n.parentNode;return n;}
    get parentElement(){return this.parentNode instanceof Element?this.parentNode:null;}
    get isConnected(){let n=this;while(n.parentNode)n=n.parentNode;return n===document;}
    contains(n){for(;n;n=n.parentNode)if(n===this)return true;return false;}
    get children(){return this.childNodes.filter(x=>x instanceof Element);}
    get textContent(){return this.childNodes.map(x=>x.textContent).join('');}
    set textContent(v){this.replaceChildren(String(v??''));}
    append(...nodes){for(let n of nodes){if(!(n instanceof Node))n=new Text(String(n));if(n.parentNode)n.remove();n.parentNode=this;this.childNodes.push(n);}}
    appendChild(n){this.append(n);return n;}
    replaceChildren(...nodes){for(const n of [...this.childNodes])n.remove();this.append(...nodes);}
    remove(){if(!this.parentNode)return;if(this.contains(document._active))document._active=document._fallback||document.body;const p=this.parentNode;p.childNodes.splice(p.childNodes.indexOf(this),1);this.parentNode=null;}
    removeChild(n){if(n.parentNode!==this)throw Error('Not a child');n.remove();return n;}
  }
  class Text extends Node {
    constructor(v){super();this.data=v;}
    get textContent(){return this.data;}set textContent(v){this.data=String(v);}
  }
  function unescapeValue(v){return v.replace(/\\(["\\])/g,'$1');}
  function matches(el,selector){
    const parts=selector.trim().match(/^[a-zA-Z][\w-]*|[#.][\w-]+|\[[^\]]+\]|:[\w-]+/g)||[];
    if(parts.join('')!==selector.trim())throw Error('Unsupported test DOM selector: '+selector);
    return parts.every(part=>{
      if(part[0]==='#')return el.id===part.slice(1);
      if(part[0]==='.')return el.className.split(/\s+/).includes(part.slice(1));
      if(part[0]==='['){const m=part.match(/^\[([^\s=]+)(?:=["']?([\s\S]*?)["']?)?\]$/);return m[2]===undefined?el.hasAttribute(m[1]):el.getAttribute(m[1])===unescapeValue(m[2]);}
      if(part===':disabled')return el.disabled;
      if(part===':checked')return el.checked;
      if(part===':focus')return document.activeElement===el;
      if(part[0]===':')throw Error('Unsupported test DOM pseudo: '+part);
      return el.tagName===part.toUpperCase();
    });
  }
  function visible(el){
    for(let n=el;n instanceof Element;n=n.parentElement){
      if(n.hidden||n.style.display==='none'||n.style.visibility==='hidden')return false;
      const p=n.parentElement;
      if(p?.tagName==='DETAILS'&&!p.open&&n!==p.children.find(x=>x.tagName==='SUMMARY'))return false;
    }
    return true;
  }
  class Element extends Node {
    constructor(tag){super();this.tagName=tag.toUpperCase();this.nodeType=1;this.attributes=new Map();this.dataset={};this.listeners=new Map();this.style={};this._value='';this.checked=false;this.disabled=false;this.open=false;this.files=[];this._hidden=false;this.selectionStart=0;this.selectionEnd=0;this.selectionDirection='none';this.className='';this.id='';this.type='';this.tabIndex=['BUTTON','INPUT','SELECT','TEXTAREA','SUMMARY'].includes(this.tagName)?0:-1;
      this.classList={contains:c=>this.className.split(/\s+/).includes(c),add:(...xs)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...xs])].join(' ');},remove:(...xs)=>{this.className=this.className.split(/\s+/).filter(x=>!xs.includes(x)).join(' ');},toggle:(c,force)=>{const on=force??!this.classList.contains(c);on?this.classList.add(c):this.classList.remove(c);return on;}};
    }
    get value(){return this.tagName==='SELECT'&&!this._valueSet?(this.children.find(x=>x.selected)||this.children[0])?.value||'':this._value;}set value(v){this._valueSet=true;this._value=String(v??'');this.selectionStart=this.selectionEnd=this._value.length;this.selectionDirection='none';}
    get open(){return this._open;}set open(v){this._open=!!v;if(this.tagName==='DETAILS'&&!this._open&&this.contains(document._active)&&document._active!==this.children.find(x=>x.tagName==='SUMMARY'))document._active=document._fallback||document.body;}
    get hidden(){return this._hidden;}set hidden(v){this._hidden=!!v;if(this._hidden&&this.contains(document._active))document._active=document._fallback||document.body;}
    setAttribute(k,v){v=String(v);if(k==='id')this.id=v;else if(k==='class')this.className=v;else if(k.startsWith('data-'))this.dataset[dataName(k)]=v;else if(k==='hidden')this.hidden=true;else if(k==='disabled')this.disabled=true;else if(k==='open')this.open=true;else if(k==='tabindex')this.tabIndex=Number(v);else if(k==='type')this.type=v;else if(k==='value')this.value=v;this.attributes.set(k,v);}
    getAttribute(k){if(k==='id')return this.id||null;if(k==='class')return this.className||null;if(k.startsWith('data-'))return this.dataset[dataName(k)]??null;if(k==='hidden')return this.hidden?'':null;if(k==='disabled')return this.disabled?'':null;if(k==='open')return this.open?'':null;return this.attributes.get(k)??null;}
    hasAttribute(k){return this.getAttribute(k)!==null;}
    removeAttribute(k){this.attributes.delete(k);if(k==='hidden')this.hidden=false;if(k==='disabled')this.disabled=false;if(k==='open')this.open=false;}
    querySelectorAll(selector){const sels=selector.split(',').map(s=>s.trim());const out=[];const walk=n=>{for(const c of n.children){if(sels.some(s=>matches(c,s)))out.push(c);walk(c);}};walk(this);return out;}
    querySelector(s){return this.querySelectorAll(s)[0]??null;}
    matches(s){return matches(this,s);}
    closest(s){for(let n=this;n instanceof Element;n=n.parentElement)if(n.matches(s))return n;return null;}
    addEventListener(t,f){const list=this.listeners.get(t)||[];list.push(f);this.listeners.set(t,list);}
    removeEventListener(t,f){this.listeners.set(t,(this.listeners.get(t)||[]).filter(x=>x!==f));}
    emit(t){const e={type:t,target:this,currentTarget:this,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){}};const returns=[];for(const f of this.listeners.get(t)||[])returns.push(f.call(this,e));if(typeof this['on'+t]==='function')returns.push(this['on'+t].call(this,e));return Promise.all(returns);}
    click(){if(!this.disabled)return this.emit('click');}
    focus(){const accepted=!!(this.isConnected&&visible(this)&&!this.disabled&&this.type!=='hidden'&&(['BUTTON','INPUT','SELECT','TEXTAREA','SUMMARY'].includes(this.tagName)||(this.tagName==='A'&&this.getAttribute('href'))||this.tabIndex>=0||this===document.body));document.focusCalls.push({id:this.id,tagName:this.tagName,accepted,changed:accepted&&document.activeElement!==this});if(accepted)document._active=this;}
    blur(){if(document._active===this)document._active=document._fallback||document.body;}
    select(){this.setSelectionRange(0,this.value.length);}
    setSelectionRange(a,b,d='none'){if(!['INPUT','TEXTAREA'].includes(this.tagName))throw Error('Not a text control');this.selectionStart=a;this.selectionEnd=b;this.selectionDirection=d;}
    getClientRects(){return this.isConnected&&visible(this)?[{}]:[];}
  }
  document=new Node();document.nodeType=9;document.ownerDocument=null;document.focusCalls=[];
  document.createElement=t=>new Element(t);document.createTextNode=t=>new Text(String(t));
  document.documentElement=new Element('html');document.append(document.documentElement);
  document.body=new Element('body');document.documentElement.append(document.body);document._fallback=focusFallback==='documentElement'?document.documentElement:document.body;document._active=document._fallback;
  Object.defineProperty(document,'activeElement',{get(){const a=document._active;return a?.isConnected&&visible(a)&&!a.disabled?a:document._fallback;}});
  document.querySelectorAll=s=>document.documentElement.querySelectorAll(s);
  document.querySelector=s=>document.querySelectorAll(s)[0]??null;
  document.getElementById=id=>{const walk=n=>{for(const c of n.children){if(c.id===id)return c;const found=walk(c);if(found)return found;}return null;};return walk(document);};
  const body=html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]||'';
  const stack=[document.body],voidTags=new Set(['input','img','br','hr','meta','link']);
  for(const token of body.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)||[]){
    if(token.startsWith('<!--'))continue;
    if(token.startsWith('</')){stack.pop();continue;}
    if(token.startsWith('<')){
      const m=token.match(/^<([\w-]+)([\s\S]*?)\/?>$/);if(!m)throw Error('Unsupported HTML token');
      const n=document.createElement(m[1]);
      for(const a of m[2].matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g))n.setAttribute(a[1],a[2]??a[3]??a[4]??'');
      stack.at(-1).append(n);if(!voidTags.has(m[1])&&!token.endsWith('/>'))stack.push(n);
    }else stack.at(-1).append(document.createTextNode(token));
  }
  return {document,Element,Node,visible};
}
const modules=await modulesInOrder();
export async function appHarness(lang='zh',options={}){
  const dom=createDOM(modules.html,options),{document}=dom;const events=new Map();
  const ctx=vm.createContext({document,location:{hash:lang==='en'?'#en':'#zh'},window:{addEventListener:(t,f)=>events.set(t,f)},console,TextEncoder,TextDecoder,Blob,Uint8Array,DataView,crypto:webcrypto,atob,btoa,queueMicrotask,setTimeout,clearTimeout,URL,HTMLElement:dom.Element,Element:dom.Element,Node:dom.Node,CSS:{escape:s=>String(s)}});
  // Only raster decoding/file loading boundaries are seams. No image validation claim.
  ctx.Image=class{set src(data){try{const core=vm.runInContext('TeamDefinition',ctx),raw=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0)),meta=core.inspectRaster(raw,data.slice(5,data.indexOf(';')));this.naturalWidth=meta.width;this.naturalHeight=meta.height;queueMicrotask(()=>this.onload?.());}catch(e){queueMicrotask(()=>this.onerror?.(e));}}};
  ctx.FileReader=class{readAsDataURL(file){file.arrayBuffer().then(raw=>{this.result='data:'+file.type+';base64,'+Buffer.from(raw).toString('base64');this.onload?.();},e=>this.onerror?.(e));}};
  for(const {name,code} of modules.scripts)vm.runInContext(code,ctx,{filename:name});
  const id=s=>{const n=document.getElementById(s);assert.ok(n,'Connected #'+s+' must exist');return n;};
  const query=s=>{const n=document.querySelector(s);assert.ok(n,'Connected '+s+' must exist');return n;};
  const activate=async n=>{assert.ok(n.isConnected);n.focus();assert.ok(document.activeElement===n,'Test action must start focused on its actual connected control: '+n.id);await n.click();};
  const change=async(n,value)=>{n.focus();assert.ok(document.activeElement===n,'Change starts focused on control');if(n.type==='checkbox')n.checked=value;else n.value=value;await n.emit('change');};
  const text=async(n,value)=>{n.value=value;await n.emit('input');};
  const preset=()=>JSON.parse(JSON.stringify(vm.runInContext('TeamPreset.initial()',ctx)));
  const pick=async(kind,key)=>{await activate(id('tab-'+kind));await activate(query('[data-key="'+key+'"]'));};
  const toDS=async()=>{await activate(query('[data-host="dsh"]'));await change(id('deepseek-variant'),'dsbot');};
  return {...dom,ctx,events,id,query,activate,change,text,preset,pick,toDS};
}
export function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
export async function settleUntil(predicate){for(let n=0;n<50;n++){if(predicate())return;await new Promise(setImmediate);}assert.ok(predicate(),'Asynchronous UI operation did not settle');}

