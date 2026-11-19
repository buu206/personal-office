import test from 'node:test';
import assert from 'node:assert/strict';
import {appHarness,createDOM,deferred,settleUntil} from './focus-dom-helper.mjs';

test('DOM seam models detach, connected ID lookup and hidden/disabled focus eligibility',()=>{
  const {document:d}=createDOM('<body><section id="box"><button id="x">go</button></section><button id="outside">out</button></body>');
  const box=d.getElementById('box'),old=d.getElementById('x');old.focus();assert.equal(d.activeElement,old);
  box.replaceChildren();assert.equal(old.isConnected,false);assert.equal(old.parentNode,null);assert.equal(d.getElementById('x'),null);assert.equal(d.activeElement,d.body);
  old.focus();assert.equal(d.activeElement,d.body,'Detached references cannot restore focus');
  const fresh=d.createElement('button');fresh.id='x';box.append(fresh);fresh.focus();assert.equal(d.activeElement,fresh);
  box.hidden=true;assert.equal(d.activeElement,d.body);fresh.focus();assert.equal(d.activeElement,d.body);
  box.hidden=false;fresh.disabled=true;fresh.focus();assert.equal(d.activeElement,d.body);
  fresh.disabled=false;fresh.focus();assert.equal(d.activeElement,fresh);
});
for(const [kind,key] of [['role','seat-intelligence'],['group','group-advisers']]){
 test('real app '+kind+' pick preserves keyboard focus on the same stable data-key',async()=>{
  const ui=await appHarness();await ui.activate(ui.id('tab-'+kind));
  const before=ui.query('[data-key="'+key+'"]');await ui.activate(before);
  const after=ui.query('[data-key="'+key+'"]');
  assert.equal(after.getAttribute('aria-current'),'true','Actual selection handler ran');
  assert.ok(ui.document.activeElement===after,'Focus belongs on the current pick, not body after replacement; actual='+ui.document.activeElement.tagName);
 });
}


function focused(ui,node,message){
 assert.ok(ui.document.activeElement===node,message+'; active='+ui.document.activeElement.tagName+'#'+ui.document.activeElement.id);
 assert.ok(node.isConnected,'Expected focus target is still connected');
}
async function pendingImport(ui,data){
 await ui.text(ui.id('team-name'),'Existing unsaved team');
 const raw=JSON.stringify(data),input=ui.id('document-file');
 input.files=[{name:'focus-team.json',size:Buffer.byteLength(raw),text:async()=>raw}];
 await input.emit('change');await settleUntil(()=>!ui.id('import-banner').hidden);
}
function deferredPortrait(ui){
 const avatar=ui.preset().roles[0].avatar,bytes=Buffer.from(avatar.data.split(',')[1],'base64'),gate=deferred();
 return {gate,file:{name:'portrait.png',type:avatar.mime,size:bytes.length,arrayBuffer:()=>gate.promise},bytes};
}
async function startPortrait(ui){
 const pending=deferredPortrait(ui);await ui.activate(ui.id('choose-avatar'));
 const input=ui.id('avatar-file');input.files=[pending.file];await input.emit('change');
 assert.equal(ui.id('export').disabled,true,'Actual async avatar handler is pending');
 return pending;
}
async function finishPortrait(ui,pending){pending.gate.resolve(pending.bytes);await settleUntil(()=>!ui.id('export').disabled);}
async function startReceipts(ui){
 const input=ui.id('ds-receipts');input.closest('details').open=true;input.focus();
 focused(ui,input,'The visible receipt file input starts focused');
 const gate=deferred();input.files=[{name:'receipts.json',size:2,text:()=>gate.promise}];
 const completion=input.emit('change');return {gate,completion};
}

test('DOM seam rejects closed-details focus, preserves text selection, and can use documentElement as no-focus fallback',()=>{
 const {document:d}=createDOM('<body><details id="details"><summary>More</summary><input id="inside"></details></body>',{focusFallback:'documentElement'});
 const el=d.getElementById('inside');el.focus();assert.ok(d.activeElement===d.documentElement);
 d.getElementById('details').open=true;el.value='abcdef';el.focus();el.setSelectionRange(1,4,'backward');
 assert.deepEqual([el.selectionStart,el.selectionEnd,el.selectionDirection],[1,4,'backward']);
 d.getElementById('details').replaceChildren();assert.ok(d.activeElement===d.documentElement);
});
test('real app English pick also restores when focus falls back to documentElement',async()=>{
 const ui=await appHarness('en',{focusFallback:'documentElement'});
 const key='seat-review-assistant';await ui.activate(ui.query('[data-key="'+key+'"]'));
 focused(ui,ui.query('[data-key="'+key+'"]'),'English selection retains its role key');
});
test('programmatic redraw must not steal focus from an outside text field',async()=>{
 const ui=await appHarness(),outside=ui.id('team-name');outside.focus();outside.setSelectionRange(0,2,'forward');
 await ui.query('[data-key="seat-intelligence"]').click();
 focused(ui,outside,'A pick event without focus must not focus a replacement pick');
 assert.deepEqual([outside.selectionStart,outside.selectionEnd,outside.selectionDirection],[0,2,'forward']);
});
for(const [kind,key,target] of [['role','seat-intelligence','seat-chief'],['group','group-advisers','group-operations']]){
 test('real app deleting '+kind+' focuses the remaining selected pick rather than another delete button',async()=>{
  const ui=await appHarness();await ui.pick(kind,key);await ui.activate(ui.id('delete-item'));
  assert.equal(ui.document.querySelector('[data-key="'+key+'"]'),null,'Actual deletion happened');
  const next=ui.query('[data-key="'+target+'"]');assert.equal(next.getAttribute('aria-current'),'true');
  focused(ui,next,'Deletion should leave focus on the retained selection');
 });
 test('real app undoing '+kind+' deletion focuses the restored object',async()=>{
  const ui=await appHarness();await ui.pick(kind,key);await ui.id('delete-item').click();
  await ui.activate(ui.id('undo-delete'));assert.equal(ui.document.getElementById('undo-delete'),null);
  const restored=ui.query('[data-key="'+key+'"]');assert.equal(restored.getAttribute('aria-current'),'true');
  focused(ui,restored,'Undo should return to the restored object');
 });
}
test('protected workflow role rejects deletion without moving the original button focus',async()=>{
 const ui=await appHarness(),button=ui.id('delete-item');await ui.activate(button);
 assert.ok(ui.query('[data-key="seat-chief"]'));assert.ok(button.isConnected);
 assert.match(ui.id('status').textContent,/交接/);focused(ui,button,'Rejected deletion must leave focus alone');
});
test('deleting the last group leaves focus on Add group',async()=>{
 const ui=await appHarness(),data=ui.preset();data.groups=[data.groups[0]];data.roles.forEach(r=>r.avatar=null);
 await pendingImport(ui,data);await ui.activate(ui.id('apply-import'));await ui.pick('group','group-operations');
 await ui.activate(ui.id('delete-item'));assert.equal(ui.document.querySelector('[data-key="group-operations"]'),null);
 focused(ui,ui.id('add-item'),'Empty group list must have a usable focus destination');
});
test('removing an avatar focuses the replacement Choose avatar control',async()=>{
 const ui=await appHarness();await ui.activate(ui.id('remove-avatar'));
 assert.equal(ui.document.getElementById('remove-avatar'),null);focused(ui,ui.id('choose-avatar'),'Removed action must hand off focus to Choose avatar');
});
for(const action of ['apply','cancel']){
 test('import '+action+' hides the confirmation panel and focuses a persistent entry',async()=>{
  const ui=await appHarness(),data=ui.preset();data.name='New imported team';data.roles.forEach(r=>r.avatar=null);
  await pendingImport(ui,data);await ui.activate(ui.id(action==='apply'?'apply-import':'cancel-import'));
  assert.equal(ui.id('import-banner').hidden,true);
  assert.equal(ui.id('team-name').value,action==='apply'?'New imported team':'Existing unsaved team');
  focused(ui,ui.id(action==='apply'?'team-name':'import'),'Hidden confirmation controls must not retain focus');
 });
}
test('DeepSeek variant change preserves the same select and chosen value',async()=>{
 const ui=await appHarness();await ui.activate(ui.query('[data-host="dsh"]'));await ui.change(ui.id('deepseek-variant'),'dsbot');
 assert.equal(ui.id('deepseek-variant').value,'dsbot');assert.ok(ui.id('ds-batch'));
 focused(ui,ui.id('deepseek-variant'),'Switching DeepSeek setup keeps the stable select');
});
for(const [attribute,value] of [['ds-seat',false],['ds-group','native'],['ds-admin','seat-chief'],['ds-mode','everyone']]){
 test('DS Bot '+attribute+' event preserves that exact stable control',async()=>{
  const ui=await appHarness();await ui.toDS();const key=attribute==='ds-seat'?'seat-intelligence':'group-operations';
  if(['ds-admin','ds-mode'].includes(attribute))await ui.change(ui.query('[data-ds-group="group-operations"]'),'native');
  const selector='[data-'+attribute+'="'+key+'"]';await ui.change(ui.query(selector),value);
  const after=ui.query(selector);assert.equal(attribute==='ds-seat'?after.checked:after.value,value);
  focused(ui,after,'Do not substitute a different group control or page body');
 });
}
test('async avatar completion restores Choose avatar if that is still the current control',async()=>{
 const ui=await appHarness(),pending=await startPortrait(ui);await finishPortrait(ui,pending);
 assert.ok(ui.id('remove-avatar'));focused(ui,ui.id('choose-avatar'),'Avatar completion should preserve current control');
});
test('async avatar completion restores edited text and its exact selection, not the old upload trigger',async()=>{
 const ui=await appHarness(),pending=await startPortrait(ui),area=ui.id('item-description');
 await ui.text(area,'Edited while upload is pending');area.focus();area.setSelectionRange(2,12,'backward');
 await finishPortrait(ui,pending);const after=ui.id('item-description');
 assert.equal(after.value,'Edited while upload is pending');focused(ui,after,'Only current replacement target should regain focus');
 assert.deepEqual([after.selectionStart,after.selectionEnd,after.selectionDirection],[2,12,'backward']);
});
test('async avatar completion leaves an outside focused input and selection alone',async()=>{
 const ui=await appHarness(),pending=await startPortrait(ui),outside=ui.id('team-name');
 outside.focus();outside.setSelectionRange(1,3,'forward');await finishPortrait(ui,pending);
 focused(ui,outside,'Late image result must not steal outside focus');
 assert.deepEqual([outside.selectionStart,outside.selectionEnd,outside.selectionDirection],[1,3,'forward']);
});
test('async DS receipts completion restores current textarea selection',async()=>{
 const ui=await appHarness();await ui.toDS();const pending=await startReceipts(ui),area=ui.id('ds-known');
 await ui.text(area,'known-conflicting-name');area.focus();area.setSelectionRange(1,9,'backward');
 pending.gate.resolve('{}');await pending.completion;
 const after=ui.id('ds-known');assert.equal(after.value,'known-conflicting-name');
 focused(ui,after,'Receipt completion restores the current text control');
 assert.deepEqual([after.selectionStart,after.selectionEnd,after.selectionDirection],[1,9,'backward']);
});
test('async DS receipts completion does not steal an outside focus',async()=>{
 const ui=await appHarness();await ui.toDS();const pending=await startReceipts(ui),outside=ui.id('team-name');
 outside.focus();outside.setSelectionRange(0,2,'backward');pending.gate.resolve('{}');await pending.completion;
 focused(ui,outside,'Late receipts must not refocus their old input');
 assert.deepEqual([outside.selectionStart,outside.selectionEnd,outside.selectionDirection],[0,2,'backward']);
});
test('clearing DS receipts opens details if necessary and focuses the new file input',async()=>{
 const ui=await appHarness();await ui.toDS();const pending=await startReceipts(ui);pending.gate.resolve('{}');await pending.completion;
 const clear=ui.id('ds-receipts').closest('details').querySelectorAll('button').find(n=>n.textContent==='清除续办记录');assert.ok(clear);
 await ui.activate(clear);const file=ui.id('ds-receipts');
 assert.equal(file.closest('details').open,true,'The explicit target must be visible after clearing the journal');
 focused(ui,file,'Removed clear button hands off to the actual file control');
});

for(const kind of ['role','group']){
 test('adding '+kind+' makes one focus handoff to its fully selected name field',async()=>{
  const ui=await appHarness();await ui.activate(ui.id('tab-'+kind));
  const trigger=ui.id('add-item');trigger.focus();focused(ui,trigger,'Keyboard Add control starts focused');
  ui.document.focusCalls.length=0;
  await trigger.click();
  const input=ui.id('item-name');focused(ui,input,'New item name is the explicit destination');
  assert.deepEqual(ui.document.focusCalls.map(call=>call.id),['item-name'],'No intermediate replacement Add button focus before the name field');
  assert.deepEqual([input.selectionStart,input.selectionEnd],[0,input.value.length],'New item name remains fully selected');
 });
}
