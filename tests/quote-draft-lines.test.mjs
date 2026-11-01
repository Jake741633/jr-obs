import assert from "node:assert/strict";
import test from "node:test";
import {existsSync} from "node:fs";
import {loadLocalTs} from "./helpers/load-local-ts.mjs";
const path=new URL("../lib/quoteDraftLines.ts",import.meta.url), api=existsSync(path)?loadLocalTs(path):{};
const line=(patch={})=>({id:"line-1",description:"Socket",category:"Materials",quantity:2,unitCost:4.123,unitPrice:9.875,...patch});
const material={id:"m1",name:"Double socket",unit:"Each",tradeCost:4.123,sellPrice:9.875,supplier:"Wholesaler",stockCode:"001234",notes:"Private buying note"};
test("line review reports missing fields and preserves explicit zero rather than inventing free allowances",()=>{
 assert.equal(typeof api.reviewQuoteDraftLines,"function");
 const r=api.reviewQuoteDraftLines([line({description:" ",unitCost:undefined,unitPrice:NaN})]);assert.equal(r.complete,false);assert.equal(r.needsReviewCount,1);
 for(const field of ["description","unitCost","unitPrice"])assert.ok(r.lines[0].fields.includes(field));
 assert.equal(r.lines[0].sellingAmount,undefined);assert.equal(r.lines[0].buyingAmount,undefined);
 assert.equal(api.reviewQuoteDraftLines([line({unitCost:0,unitPrice:0})]).complete,true);
});
test("line totals retain calculation precision and invalid/overflowing amounts stay reviewable",()=>{
 const r=api.reviewQuoteDraftLines([line()]);assert.equal(r.lines[0].sellingAmount,19.75);assert.equal(r.lines[0].buyingAmount,8.246);
 for(const patch of [{quantity:0},{quantity:-1},{quantity:Infinity},{unitCost:NaN},{unitPrice:Infinity},{quantity:1e9,unitCost:1e9,unitPrice:1e9}])assert.equal(api.reviewQuoteDraftLines([line(patch)]).complete,false);
 assert.equal(api.reviewQuoteDraftLines([]).complete,false);
});
test("ambiguous line identities cannot be edited or saved",()=>{
 for(const rows of [[line({id:""})],[line(),line({description:"Different material"})]]){
  const r=api.reviewQuoteDraftLines(rows);assert.equal(r.complete,false);assert.ok(r.lines.every(row=>!row.editable&&row.fields.includes("identity")));
 }
});
test("combined overflowing totals keep every contributing line in review",()=>{
 const r=api.reviewQuoteDraftLines([line({quantity:1,unitCost:7e8,unitPrice:7e8}),line({id:"line-2",quantity:1,unitCost:7e8,unitPrice:7e8})]);
 assert.equal(r.complete,false);assert.equal(r.needsReviewCount,2);assert.ok(r.lines.every(row=>row.fields.includes("amount")));
});
test("hourly quantity edits and clearing/repairing it keep overhead time aligned without changing rates",()=>{
 assert.equal(typeof api.editQuoteDraftLine,"function");const original=line({category:"Labour",labourMode:"Hours",labourHours:2,quantity:2,unitCost:20,unitPrice:75});
 const changed=api.editQuoteDraftLine(original,{quantity:5});assert.equal(changed.labourHours,5);assert.equal(changed.unitCost,20);assert.equal(changed.unitPrice,75);assert.equal(original.labourHours,2);
 const blank=api.editQuoteDraftLine(changed,{quantity:0});assert.equal(api.reviewQuoteDraftLines([blank]).complete,false);
 const repaired=api.editQuoteDraftLine(blank,{quantity:3.5});assert.equal(repaired.labourHours,3.5);assert.equal(api.reviewQuoteDraftLines([repaired]).complete,true);
});
test("day and call-out billing quantities keep a separately reviewed time allowance",()=>{
 for(const mode of ["Days","Half days","Call-outs"]){
  const original=line({category:"Labour",labourMode:mode,labourHours:12,quantity:2});const changed=api.editQuoteDraftLine(original,{quantity:3});assert.equal(changed.labourHours,12);
  for(const hours of [undefined,0,-1,Infinity])assert.equal(api.reviewQuoteDraftLines([api.editQuoteDraftLine(changed,{labourHours:hours})]).complete,false);
  assert.equal(api.reviewQuoteDraftLines([api.editQuoteDraftLine(changed,{labourHours:15})]).complete,true);
 }
 const mismatch=line({category:"Labour",labourMode:"Hours",quantity:5,labourHours:2});assert.equal(api.reviewQuoteDraftLines([mismatch]).complete,false);
});
test("saved material additions copy exact prices and preferred product references without mutating the source",()=>{
 assert.equal(typeof api.materialQuoteDraftLine,"function");const before=structuredClone(material),r=api.materialQuoteDraftLine(material,"new-line");
 assert.equal(r.line.id,"new-line");assert.equal(r.line.materialId,"m1");assert.equal(r.line.quantity,1);assert.equal(r.line.unitCost,4.123);assert.equal(r.line.unitPrice,9.875);
 assert.equal(r.line.supplier,"Wholesaler");assert.equal(r.line.stockCode,"001234");assert.match(r.line.description,/Double socket/);assert.match(r.line.description,/Each/);
 assert.doesNotMatch(JSON.stringify(r),/Private buying note/);assert.deepEqual(material,before);
});
test("manual material allowances and invalid source prices require review before saving",()=>{
 const blank=api.materialQuoteDraftLine(null,"new-line");assert.equal(blank.line.description,"");assert.equal(blank.line.unitCost,undefined);assert.ok(Number.isNaN(blank.line.unitPrice));assert.equal(api.reviewQuoteDraftLines([blank.line]).complete,false);
 const source=api.materialQuoteDraftLine({...material,tradeCost:undefined,sellPrice:NaN},"another");assert.equal(source.line.unitCost,undefined);assert.ok(Number.isNaN(source.line.unitPrice));
 assert.throws(()=>api.materialQuoteDraftLine({...material,name:" "},"new"),/name|description/i);assert.throws(()=>api.materialQuoteDraftLine(material,""),/identity|id/i);
});
test("material additions copy only string product references and never malformed nested metadata",()=>{
 const r=api.materialQuoteDraftLine({...material,unit:{private:"unit"},supplier:{private:"supplier"},stockCode:123},"new");
 assert.equal(r.line.supplier,undefined);assert.equal(r.line.stockCode,undefined);assert.doesNotMatch(r.line.description,/object Object/);assert.doesNotMatch(JSON.stringify(r),/private/);
});
