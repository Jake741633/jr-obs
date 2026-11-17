import assert from 'node:assert/strict';
import test from 'node:test';
import {privateUploadHarness} from './helpers/private-file-upload-harness.mjs';

const receipt={id:'receipt-1',jobId:'job-1',receiptDataUrl:'data:image/jpeg;base64,eA==',receiptFileName:'receipt.jpg'};

test('receipt confirmation durably stages bytes before returning and reuses an identical queued entry',()=>{
 const h=privateUploadHarness();h.queue('other-file');
 h.api.persistPrivateFileRecordBytes('jr-os-expenses',receipt,h.authorization);
 const before=h.pending(),item=before.find(row=>row.sourceId===receipt.id);
 assert.equal(item.dataUrl,receipt.receiptDataUrl);assert.equal(item.storageKey,'jr-os-expenses');assert.equal(item.authorizationRole,'owner');
 h.blocked.add(h.api.PRIVATE_FILE_UPLOAD_QUEUE_KEY);
 assert.doesNotThrow(()=>h.api.persistPrivateFileRecordBytes('jr-os-expenses',receipt,h.authorization));assert.deepEqual(h.pending(),before);
});

test('private queue quota reaches the save caller without replacing prior bytes and permits stable retry',()=>{
 const h=privateUploadHarness();h.queue('other-file');const before=h.pending();h.blocked.add(h.api.PRIVATE_FILE_UPLOAD_QUEUE_KEY);
 assert.throws(()=>h.api.persistPrivateFileRecordBytes('jr-os-expenses',receipt,h.authorization),/quota/);assert.deepEqual(h.pending(),before);
 h.blocked.clear();h.api.persistPrivateFileRecordBytes('jr-os-expenses',receipt,h.authorization);assert.equal(h.pending().length,2);
});

test('changed receipt bytes replace only their exact current owner queue identity',()=>{
 const h=privateUploadHarness();h.api.persistPrivateFileRecordBytes('jr-os-expenses',receipt,h.authorization);h.queue('receipt-1',{userId:'user-2',storageKey:'jr-os-expenses'});
 const changed={...receipt,receiptDataUrl:'data:image/jpeg;base64,bmV3'};h.api.persistPrivateFileRecordBytes('jr-os-expenses',changed,h.authorization);
 assert.equal(h.pending().length,2);assert.equal(h.pending().find(row=>row.userId==='user-1').dataUrl,changed.receiptDataUrl);assert.equal(h.pending().find(row=>row.userId==='user-2').dataUrl,'data:image/jpeg;base64,b2xk');
});

test('receipt confirmation refuses retired authorization and invalid files before queue mutation',()=>{
 const h=privateUploadHarness();h.queue('other-file');const before=h.pending();h.active({...h.authorization,userId:'user-2'});
 assert.throws(()=>h.api.persistPrivateFileRecordBytes('jr-os-expenses',receipt,h.authorization),/account|owner|authorization/i);assert.deepEqual(h.pending(),before);
 h.active(h.authorization);assert.throws(()=>h.api.persistPrivateFileRecordBytes('jr-os-expenses',{...receipt,receiptDataUrl:'data:application/x-msdownload;base64,eA==',receiptFileName:'malware.exe'},h.authorization));assert.deepEqual(h.pending(),before);
});

test('records without new inline bytes need no queue write',()=>{
 const h=privateUploadHarness();h.blocked.add(h.api.PRIVATE_FILE_UPLOAD_QUEUE_KEY);
 assert.doesNotThrow(()=>h.api.persistPrivateFileRecordBytes('jr-os-expenses',{id:'receipt-1',receiptFileName:'receipt.jpg',privateStoragePath:'org-1/unassigned/receipt-1/receipt.jpg'},h.authorization));assert.equal(h.pending().length,0);
});

for(const storageKey of ['jr-os-expenses','jr-os-job-documents']) test(`${storageKey} cannot acknowledge inline bytes without a filename`,()=>{
 const h=privateUploadHarness();h.queue('other-file');const before=h.pending();
 const record=storageKey==='jr-os-expenses'?{id:'record-1',receiptDataUrl:receipt.receiptDataUrl}:{id:'record-1',dataUrl:receipt.receiptDataUrl};
 assert.throws(()=>h.api.persistPrivateFileRecordBytes(storageKey,record,h.authorization),/file.*name|filename/i);assert.deepEqual(h.pending(),before);
});

test('standalone byte confirmation rejects survey collections before queue mutation',()=>{
 const h=privateUploadHarness();h.queue('other-file');const before=h.pending();
 assert.throws(()=>h.api.persistPrivateFileRecordBytes('jr-os-surveys',{id:'survey-1',photos:[{id:'p',dataUrl:receipt.receiptDataUrl,fileName:'one.jpg'},{id:'p',dataUrl:'data:image/jpeg;base64,bmV3',fileName:'two.jpg'}]},h.authorization),/support|standalone/i);assert.deepEqual(h.pending(),before);
});

test('standalone job-document confirmation retains complete bytes and metadata in its scoped queue',()=>{
 const h=privateUploadHarness();const file={id:'document-1',jobId:'job-1',fileName:'document.jpg',dataUrl:receipt.receiptDataUrl,mimeType:'image/jpeg'};
 h.api.persistPrivateFileRecordBytes('jr-os-job-documents',file,h.authorization);const queued=h.pending()[0];
 assert.equal(queued.sourceId,file.id);assert.equal(queued.storageKey,'jr-os-job-documents');assert.equal(queued.dataUrl,file.dataUrl);assert.equal(queued.fileName,file.fileName);assert.equal(queued.objectPath,h.api.privateObjectPath(h.authorization.organisationId,file.jobId,file.id,file.fileName));
});
