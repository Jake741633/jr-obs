import test from 'node:test';
import assert from 'node:assert/strict';
import {privateUploadHarness,settleUploads} from './helpers/private-file-upload-harness.mjs';

test('finishing one private upload retains a file appended while it awaited I/O',async()=>{
 const h=privateUploadHarness();let finish;h.upload(()=>new Promise(resolve=>{finish=resolve;}));h.queue('first');
 const work=h.flush();await settleUploads();h.queue('second');finish();await work;
 assert.deepEqual(h.pending().map(item=>item.sourceId),['second']);assert.deepEqual(h.confirmations,['first']);assert.equal(h.uploads.length,1);
});
for(const fails of [false,true])test('a '+(fails?'failed':'successful')+' old upload cannot erase or confirm replacement bytes with the same timestamp',async()=>{
 const h=privateUploadHarness();let finish;h.upload(()=>new Promise((resolve,reject)=>{finish=()=>fails?reject(Error('fixture upload failed')):resolve();}));const old=h.queue('photo');
 const work=h.flush();await settleUploads();const replacement=h.queue('photo',{dataUrl:'data:image/jpeg;base64,bmV3'});assert.equal(old.updatedAt,replacement.updatedAt);
 finish();await work;assert.equal(h.pending().length,1);assert.equal(h.pending()[0].dataUrl,'data:image/jpeg;base64,bmV3');assert.equal(h.pending()[0].state,'Pending');assert.deepEqual(h.confirmations,[]);
});
test('an in-flight failed upload cannot resurrect an entry removed from the queue',async()=>{
 const h=privateUploadHarness();let fail;h.upload(()=>new Promise((resolve,reject)=>{fail=reject;}));h.queue('removed');const work=h.flush();await settleUploads();h.replace([]);fail(Error('fixture'));await work;assert.deepEqual(h.pending(),[]);
});
test('different collection flushes merge into the latest queue without resurrecting completed files',async()=>{
 const h=privateUploadHarness(),finishes=new Map();h.upload(path=>new Promise(resolve=>finishes.set(path,resolve)));
 h.queue('document');h.queue('survey',{storageKey:'jr-os-surveys'});const docs=h.flush(),surveys=h.flush('jr-os-surveys');await settleUploads();h.queue('new-receipt',{storageKey:'jr-os-expenses'});
 for(const finish of finishes.values())finish();await Promise.all([docs,surveys]);assert.deepEqual(h.pending().map(item=>item.sourceId),['new-receipt']);assert.deepEqual([...h.confirmations].sort(),['document','survey']);
});
test('overlapping same-collection flushes serialize replay and process later additions once',async()=>{
 const h=privateUploadHarness(),finishes=[];h.upload(()=>new Promise(resolve=>finishes.push(resolve)));h.queue('first');const first=h.flush();await settleUploads();h.queue('second');const second=h.flush();await settleUploads();
 let earlyCount=h.uploads.length;finishes.splice(0).forEach(finish=>finish());await settleUploads();finishes.splice(0).forEach(finish=>finish());await Promise.all([first,second]);
 assert.equal(earlyCount,1);assert.equal(h.uploads.length,2);assert.deepEqual([...h.confirmations].sort(),['first','second']);assert.deepEqual(h.pending(),[]);
});
test('authorization retirement preserves queued bytes and never confirms old-owner upload work',async()=>{
 const h=privateUploadHarness();let finish;h.upload(()=>new Promise(resolve=>{finish=resolve;}));h.queue('first');const work=h.flush();await settleUploads();
 h.queue('another-user',{userId:'user-2'});h.active({...h.authorization,userId:'user-2'});finish();await work;
 assert.deepEqual(h.pending().map(item=>item.sourceId).sort(),['another-user','first']);assert.deepEqual(h.confirmations,[]);
});
test('a confirmation callback can append another upload without that file being erased',async()=>{
 const h=privateUploadHarness();h.queue('first');await h.flush('jr-os-job-documents',()=>h.queue('second'));assert.deepEqual(h.pending().map(item=>item.sourceId),['second']);
});
