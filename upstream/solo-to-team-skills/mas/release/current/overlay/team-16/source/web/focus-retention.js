'use strict';
// Synchronous DOM replacement only. Capture at redraw time, never before an await.
const FocusRetention=(()=>{
  const keys=['key','member','room','reply','dsSeat','dsGroup','dsAdmin','dsMode'];
  const idle=active=>!active||active===document.body||active===document.documentElement;
  function identity(el){
    if(el.id)return {id:el.id};
    for(const key of keys)if(el.dataset?.[key]!==undefined)return {key,value:el.dataset[key]};
    return null;
  }
  function matching(roots,key){
    if(!key)return null;
    for(const root of roots)for(const el of root.querySelectorAll('[id],[data-key],[data-member],[data-room],[data-reply],[data-ds-seat],[data-ds-group],[data-ds-admin],[data-ds-mode]')){
      if(key.id?el.id===key.id:el.dataset?.[key.key]===key.value)return el;
    }
    return null;
  }
  function selection(el){
    try{
      if(Number.isInteger(el.selectionStart)&&Number.isInteger(el.selectionEnd))
        return [el.selectionStart,el.selectionEnd,el.selectionDirection];
    }catch(_){} // Some native controls do not expose text selection.
    return null;
  }
  function focus(el,range){
    if(!el?.isConnected||el.disabled)return;
    for(let p=el;p;p=p.parentElement)if(p.hidden)return;
    // A rebuilt resume panel may have collapsed. Make its focused descendant visible.
    for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
    el.focus();
    if(range&&typeof el.setSelectionRange==='function'){
      try{el.setSelectionRange(...range);}catch(_){} // File/number controls reject this API.
    }
  }
  function preserve(roots,update,target){
    const active=document.activeElement,inside=active&&roots.some(root=>root?.contains(active));
    const key=inside?identity(active):null,range=inside?selection(active):null;
    const result=update();
    // An intact control, or an explicit new focus set during the redraw, wins.
    if(inside&&!active.isConnected&&idle(document.activeElement)){
      const explicit=typeof target==='function'?target(active):null;
      focus(explicit||matching(roots,key),explicit?null:range);
    }
    return result;
  }
  function moveFromHidden(from,to){
    if(!from)return;
    const active=document.activeElement;
    if(active!==from&&!idle(active))return;
    for(let p=from;p;p=p.parentElement)if(p.hidden){focus(to);return;}
  }
  return {preserve,moveFromHidden};
})();

