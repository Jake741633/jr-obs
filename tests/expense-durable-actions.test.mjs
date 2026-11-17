import assert from 'node:assert/strict';
import test from 'node:test';
import {expensePageHarness,savedExpense,text,nodes} from './helpers/expense-page-harness.mjs';
const event={preventDefault(){}};

for(const mode of ['cloud','local'])test(`expense ${mode} save catches actual storage failure and retains draft and receipt for one stable retry`,async()=>{
 const h=await expensePageHarness({mode});h.fill();h.receipt().finish();h.render();const before=h.raw();h.blocked.add(mode==='cloud'?h.queueKey:h.key);
 h.submit();assert.doesNotThrow(()=>h.render(),'storage failure must be caught by the actual save handler');
 assert.ok(h.form(),'the expense draft must stay open');assert.equal(h.field('Supplier').props.value,'TLC');assert.match(text(h.render()),/Attached: receipt.jpg/);assert.match(text(h.render()),/could not be confirmed|not saved/i);assert.doesNotMatch(text(h.render()),/Expense saved\.|private fixture detail/);assert.equal(h.raw(),before);
 const id=h.attempts[0].args[0].id;h.advance();h.blocked.clear();h.submit();h.render();assert.equal(h.form(),undefined);assert.equal(JSON.parse(h.raw()).length,1);assert.equal(JSON.parse(h.raw())[0].id,id);assert.equal(h.attempts[1].args[0].id,id);
 if(mode==='cloud'){assert.equal(h.queue().length,1);assert.equal(h.queue()[0].payload.receiptDataUrl,undefined);assert.equal(h.privateQueue().length,1);assert.equal(h.privateQueue()[0].dataUrl,'data:image/jpeg;base64,eA==');}
 else {assert.equal(JSON.parse(h.raw())[0].receiptDataUrl,'data:image/jpeg;base64,eA==');assert.equal(h.privateQueue().length,0);}
 h.unmount();
});

for(const operation of ['status','delete'])test(`expense ${operation} failure leaves the actual durable record unchanged and permits retry`,async()=>{
 const h=await expensePageHarness({initial:[savedExpense()]});h.blocked.add(h.queueKey);
 const act=()=>operation==='status'?h.register().props.onChange({target:{value:'Reconciled'}}):h.button('Delete expense').props.onClick();
 act();assert.doesNotThrow(()=>h.render());assert.equal(JSON.parse(h.raw())[0].status,'Ready');assert.match(text(h.render()),/could not be confirmed|not saved/i);
 h.blocked.clear();act();h.render();assert.equal(JSON.parse(h.raw()).length,operation==='delete'?0:1);if(operation==='status')assert.equal(JSON.parse(h.raw())[0].status,'Reconciled');assert.equal(h.queue().length,1);h.unmount();
});

test('a create whose acknowledgement was lost recovers exactly once without generating another expense',async()=>{
 const h=await expensePageHarness();h.fill();h.receipt().finish();h.render();h.lostAcks.add('createItem');h.submit();h.render();assert.ok(h.form());const saved=JSON.parse(h.raw())[0];h.advance();h.submit();h.render();assert.equal(h.form(),undefined);assert.equal(JSON.parse(h.raw()).length,1);assert.equal(JSON.parse(h.raw())[0].id,saved.id);assert.equal(h.attempts.filter(item=>item.name==='createItem').length,1);assert.equal(h.queue().length,1);h.unmount();
});

test('uncertain creation cannot acknowledge a saved record after the retained draft changes',async()=>{
 const h=await expensePageHarness();h.fill();h.lostAcks.add('createItem');h.submit();h.render();assert.ok(h.form());h.field('Description','Changed expense');h.submit();h.render();assert.ok(h.form());assert.equal(JSON.parse(h.raw())[0].description,'Socket supplies');assert.match(text(h.render()),/review|could not be confirmed/i);h.unmount();
});

test('retained submit callbacks cannot save a newer draft or repeat a completed creation',async()=>{
 const h=await expensePageHarness();h.fill();const old=h.form().props.onSubmit;h.field('Description','Newer draft');old(event);assert.ok(h.form(),'a retained submit must not clear the newer draft');assert.equal(h.attempts.length,0);h.submit();h.render();const count=h.attempts.length;old(event);assert.equal(h.attempts.length,count);assert.equal(JSON.parse(h.raw()).length,1);h.unmount();
});

for(const operation of ['status','delete'])test(`retained expense ${operation} callbacks cannot change a concurrently edited same-id record`,async()=>{
 const h=await expensePageHarness({initial:[savedExpense()]});const callback=operation==='status'?h.register().props.onChange:h.button('Delete expense').props.onClick;
 h.externalUpdate('expense-existing',item=>({...item,notes:'Another edit'}));h.render();const count=h.attempts.length;
 if(operation==='status')callback({target:{value:'Reconciled'}});else callback();h.render();assert.equal(JSON.parse(h.raw()).length,1,'the current expense must remain available');assert.equal(JSON.parse(h.raw())[0].notes,'Another edit');assert.equal(JSON.parse(h.raw())[0].status,'Ready');assert.ok(h.attempts.length<=count+1);h.unmount();
});

test('duplicate expense identities never permit status updates or deletion',async()=>{
 const h=await expensePageHarness({initial:[savedExpense(),savedExpense({supplier:'Other supplier'})]});h.register().props.onChange({target:{value:'Reconciled'}});h.button('Delete expense').props.onClick();h.render();assert.equal(JSON.parse(h.raw()).length,2);assert.ok(JSON.parse(h.raw()).every(item=>item.status==='Ready'));assert.equal(h.queue().length,0);h.unmount();
});

test('receipt completion belongs to the newest selection and preserves current typed fields',async()=>{
 const h=await expensePageHarness();h.fill();const old=h.receipt('old.jpg'),current=h.receipt('new.jpg');h.field('Description','Latest description');current.finish('data:image/jpeg;base64,bmV3');old.finish('data:image/jpeg;base64,b2xk');h.render();assert.match(text(h.render()),/Attached: new.jpg/);assert.doesNotMatch(text(h.render()),/old.jpg attached/);h.submit();h.render();assert.equal(JSON.parse(h.raw())[0].description,'Latest description');assert.equal(h.privateQueue()[0].fileName,'new.jpg');assert.equal(h.privateQueue()[0].dataUrl,'data:image/jpeg;base64,bmV3');h.unmount();
});

test('a pending receipt cannot be silently omitted by a save and a read error keeps the draft usable',async()=>{
 const h=await expensePageHarness();h.fill();const reader=h.receipt();h.submit();h.render();assert.ok(h.form());assert.equal(h.attempts.length,0);reader.fail();h.render();assert.match(text(h.render()),/receipt.*could not be read|could not read.*receipt/i);assert.ok(h.form());h.receipt('replacement.jpg').finish();h.submit();h.render();assert.equal(JSON.parse(h.raw()).length,1);h.unmount();
});

test('receipt callbacks from a closed form cannot hydrate a reopened draft',async()=>{
 const h=await expensePageHarness();h.fill();const reader=h.receipt();h.click('Add expense');h.click('Add expense');reader.finish();assert.doesNotMatch(text(h.render()),/Attached: receipt.jpg/);h.unmount();
});

test('a retained form toggle cannot close a newer draft or cancel its selected receipt',async()=>{
 const h=await expensePageHarness();h.fill();const toggle=h.button('Add expense').props.onClick;h.field('Description','Newer draft');const reader=h.receipt('current.jpg');toggle();reader.finish();assert.ok(h.form(),'a stale toggle must leave the current draft open');assert.match(text(h.render()),/Attached: current.jpg/);h.unmount();
});

test('retired account and unmounted expense callbacks perform no writes or receipt state updates',async()=>{
 for(const retirement of ['account','unmount']){const h=await expensePageHarness();h.fill();const submit=h.form().props.onSubmit,reader=h.receipt();if(retirement==='account'){await h.account();assert.equal(h.form(),undefined);}else h.unmount();const before=new Map(h.values),late=h.lateStateWrites();submit(event);reader.finish();assert.deepEqual(h.values,before);assert.equal(h.attempts.length,0);assert.equal(h.lateStateWrites(),late);if(retirement==='account')assert.equal(h.form(),undefined);}
});

for(const operation of ['status','delete'])test(`an uncertain ${operation} acknowledgement can be retried once without another durable write`,async()=>{
 const h=await expensePageHarness({initial:[savedExpense()]});const callback=operation==='status'?h.register().props.onChange:h.button('Delete expense').props.onClick;
 const act=()=>operation==='status'?callback({target:{value:'Reconciled'}}):callback();h.lostAcks.add(operation==='status'?'updateItem':'removeItem');act();h.render();const count=h.queue().length;h.advance();act();h.render();assert.equal(h.queue().length,count);assert.equal(JSON.parse(h.raw()).length,operation==='delete'?0:1);assert.doesNotMatch(text(h.render()),/could not be confirmed/);const attempts=h.attempts.length;act();assert.equal(h.attempts.length,attempts);h.unmount();
});

test('a same-id record changed inside the mutation cannot be overwritten by a retained status or delete action',async()=>{
 for(const operation of ['status','delete']){const h=await expensePageHarness({initial:[savedExpense()]});h.beforeMutation(()=>{h.externalUpdate('expense-existing',item=>({...item,supplier:'Another supplier'}));});if(operation==='status')h.register().props.onChange({target:{value:'Reconciled'}});else h.button('Delete expense').props.onClick();h.render();assert.equal(JSON.parse(h.raw())[0].supplier,'Another supplier');assert.equal(JSON.parse(h.raw())[0].status,'Ready');h.unmount();}
});

test('invalid amounts never reach durable expense creation',async()=>{
 const h=await expensePageHarness();h.fill();for(const value of ['-1','Infinity','NaN']){h.field('Net amount (£)',value);h.submit();assert.ok(h.form());assert.equal(h.attempts.length,0);}h.unmount();
});

test('private receipt queue failure retains bytes and the same metadata identity until both stages are durable',async()=>{
 const h=await expensePageHarness();h.fill();h.receipt().finish();h.render();h.blocked.add('jr-os-private-file-upload-queue');
 h.submit();assert.doesNotThrow(()=>h.render(),'receipt queue quota must remain a caught page failure');assert.ok(h.form());assert.match(text(h.render()),/Attached: receipt.jpg/);assert.match(text(h.render()),/could not be confirmed/);assert.doesNotMatch(text(h.render()),/Expense saved on this device/);const id=JSON.parse(h.raw())[0].id;assert.equal(JSON.parse(h.raw())[0].receiptDataUrl,undefined);assert.equal(h.privateQueue().length,0);
 h.blocked.clear();h.advance();h.submit();h.render();assert.equal(h.form(),undefined);assert.equal(JSON.parse(h.raw()).length,1);assert.equal(JSON.parse(h.raw())[0].id,id);assert.equal(h.attempts.filter(item=>item.name==='createItem').length,1);assert.equal(h.privateQueue().length,1);assert.equal(h.privateQueue()[0].sourceId,id);assert.equal(h.privateQueue()[0].dataUrl,'data:image/jpeg;base64,eA==');h.unmount();
});

test('metadata failure does not create or replace prior queued private receipt bytes',async()=>{
 const h=await expensePageHarness();h.fill();h.receipt('saved.jpg').finish();h.submit();h.render();const previous=h.privateQueue();
 h.fill();h.receipt('unsaved.jpg').finish('data:image/jpeg;base64,bmV3');h.render();h.blocked.add(h.queueKey);h.submit();h.render();assert.ok(h.form());assert.deepEqual(h.privateQueue(),previous);assert.equal(JSON.parse(h.raw()).length,1);h.unmount();
});

for(const operation of ['status','delete'])test(`a downloaded receipt preview does not block unchanged expense ${operation}`,async()=>{
 const h=await expensePageHarness({initial:[savedExpense({privateStoragePath:'org-expenses/jobs/general/expense-existing/receipt.jpg',privateFileId:'file-a',receiptFileName:'receipt.jpg'})]});await h.settled();assert.ok(h.current().items[0].signedDownloadUrl,'the real private bridge must hydrate a download URL');
 if(operation==='status')h.register().props.onChange({target:{value:'Reconciled'}});else h.button('Delete expense').props.onClick();h.render();assert.equal(JSON.parse(h.raw()).length,operation==='delete'?0:1);if(operation==='status')assert.equal(JSON.parse(h.raw())[0].status,'Reconciled');assert.doesNotMatch(text(h.render()),/could not be confirmed/);h.unmount();
});

test('ignoring preview URLs still rejects a changed persisted receipt binding',async()=>{
 const h=await expensePageHarness({initial:[savedExpense({privateStoragePath:'org-expenses/jobs/general/expense-existing/receipt.jpg',privateFileId:'file-a',receiptFileName:'receipt.jpg'})]});await h.settled();const callback=h.register().props.onChange;
 h.externalUpdate('expense-existing',item=>({...item,privateFileId:'file-b'}));await h.settled();callback({target:{value:'Reconciled'}});h.render();assert.equal(JSON.parse(h.raw())[0].privateFileId,'file-b');assert.equal(JSON.parse(h.raw())[0].status,'Ready');h.unmount();
});

test('metadata-only acknowledgement never accepts changed receipt bytes with the same filename',async()=>{
 const h=await expensePageHarness();h.fill();h.receipt().finish();h.render();h.blocked.add('jr-os-private-file-upload-queue');h.submit();h.render();assert.ok(h.form());const id=JSON.parse(h.raw())[0].id;
 h.blocked.clear();h.receipt().finish('data:image/jpeg;base64,bmV3');h.render();h.submit();h.render();assert.ok(h.form());assert.match(text(h.render()),/could not be confirmed/);assert.equal(h.privateQueue().length,0);assert.equal(JSON.parse(h.raw())[0].id,id);assert.equal(h.attempts.filter(item=>item.name==='createItem').length,1);h.unmount();
});

const receiptLink=h=>nodes(h.render()).find(node=>node.type==='a'&&text(node)==='Open attached receipt');
test('a saved queued receipt stays available in the register and after a fresh metadata-only load',async()=>{
 const h=await expensePageHarness();h.fill();h.receipt().finish();h.submit();h.render();assert.equal(receiptLink(h)?.props.href,'data:image/jpeg;base64,eA==');assert.match(text(h.render()),/0 missing receipts/);assert.doesNotMatch(text(h.render()),/Receipt missing/);assert.equal(JSON.parse(h.raw())[0].receiptDataUrl,undefined);assert.equal(h.queue()[0].payload.receiptDataUrl,undefined);
 const initial=JSON.parse(h.raw()),initialPrivateQueue=h.privateQueue();h.unmount();const fresh=await expensePageHarness({initial,initialPrivateQueue});assert.equal(receiptLink(fresh)?.props.href,'data:image/jpeg;base64,eA==');assert.match(text(fresh.render()),/0 missing receipts/);fresh.unmount();
});

test('queue failure shows no receipt preview and exact metadata retry restores it without a second create',async()=>{
 const h=await expensePageHarness();h.fill();h.receipt().finish();h.render();h.blocked.add('jr-os-private-file-upload-queue');h.submit();h.render();assert.equal(receiptLink(h),undefined);assert.match(text(h.render()),/1 missing receipts/);h.blocked.clear();h.submit();h.render();assert.equal(receiptLink(h)?.props.href,'data:image/jpeg;base64,eA==');assert.match(text(h.render()),/0 missing receipts/);assert.equal(h.attempts.filter(item=>item.name==='createItem').length,1);h.unmount();
});

test('a queue notification refreshes a mounted metadata-only receipt projection',async()=>{
 const h=await expensePageHarness();h.fill();h.receipt().finish();h.submit();h.render();const initial=JSON.parse(h.raw()),queued=h.privateQueue();h.unmount();const mounted=await expensePageHarness({initial,initialPrivateQueue:[]});assert.equal(receiptLink(mounted),undefined);mounted.values.set('jr-os-private-file-upload-queue',JSON.stringify(queued));const before=mounted.stateChanges();mounted.queueChanged();assert.ok(mounted.stateChanges()>before,'the queue notification must request a new render');assert.equal(receiptLink(mounted)?.props.href,queued[0].dataUrl);mounted.unmount();
});

test('queued receipts are never projected into another role, account or organisation with the same expense identity',async()=>{
 const h=await expensePageHarness();h.fill();h.receipt().finish();h.submit();h.render();const initial=JSON.parse(h.raw()),initialPrivateQueue=h.privateQueue();h.unmount();
 for(const identityPatch of [{role:'admin'},{userId:'another-owner'},{organisationId:'another-org'}]){const foreign=await expensePageHarness({initial,initialPrivateQueue,identityPatch});assert.equal(receiptLink(foreign),undefined);assert.match(text(foreign.render()),/1 missing receipts/);foreign.unmount();}
});

test('queued receipt previews require exact filename, source, storage, job and customer binding',async()=>{
 const h=await expensePageHarness();h.fill();h.receipt().finish();h.submit();h.render();const initial=JSON.parse(h.raw()),queued=h.privateQueue()[0];h.unmount();
 for(const patch of [{fileName:'other.jpg'},{sourceId:'other-expense'},{storageKey:'jr-os-job-documents'},{jobSourceId:'other-job'},{customerSourceId:'other-customer'},{objectPath:'other-org/unassigned/expense_1/receipt.jpg'}]){const mismatch=await expensePageHarness({initial,initialPrivateQueue:[{...queued,...patch}]});assert.equal(receiptLink(mismatch),undefined);assert.match(text(mismatch.render()),/1 missing receipts/);mismatch.unmount();}
});

test('bound receipts awaiting download remain present and stale queue listeners cannot update retired owners',async()=>{
 const h=await expensePageHarness({initial:[savedExpense({privateStoragePath:'org-expenses/jobs/general/expense-existing/receipt.jpg',privateFileId:'file-a',receiptFileName:'receipt.jpg'})],holdDownload:true});assert.equal(receiptLink(h),undefined);assert.match(text(h.render()),/0 missing receipts/);assert.match(text(h.render()),/receipt.*download|download.*receipt/i);
 const listeners=h.queueListeners();assert.ok(listeners.length);await h.account({role:'admin'});const before=h.stateChanges();listeners.forEach(fn=>fn({type:'jr-os-private-file-queue-changed'}));assert.equal(h.stateChanges(),before);const current=h.queueListeners();h.unmount();const late=h.lateStateWrites();current.forEach(fn=>fn({type:'jr-os-private-file-queue-changed'}));assert.equal(h.lateStateWrites(),late);
});
