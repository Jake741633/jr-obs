import assert from "node:assert/strict";
import test from "node:test";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";
const ai = loadLocalTs(new URL("../lib/aiCommandCentre.ts", import.meta.url));
const learning = loadLocalTs(new URL("../lib/aiLearning.ts", import.meta.url));
const material = { id:"m1", name:"Socket", category:"Accessories", unit:"Each", tradeCost:77, sellPrice:99, supplier:"CEF", stockCode:"CODE", favourite:false, createdAt:"2026-01-01", updatedAt:"2026-01-01" };
const pack = { id:"p1", name:"Domestic socket installation", category:"Domestic", description:"Fit socket", notes:"Making good excluded", internalNotes:"Private benchmark", labourHours:3, labourRate:50, createdAt:"2026-01-01", updatedAt:"2026-01-01", materials:[{id:"pm1",materialId:"m1",description:"Reviewed socket",quantity:3,unitCost:4.123,unitPrice:9.875}] };
const args = overrides => ({notes:"Domestic socket installation",jobType:"Domestic",materials:[material],jobPacks:[pack],documents:[],jobs:[],invoices:[],markupPercent:20,...overrides});
const quote = (id,cost) => ({id,type:"Quote",status:"Accepted",number:id,title:"Domestic socket installation",notes:"Socket",templateType:"Domestic",createdAt:"2026-01-01",updatedAt:"2026-01-01",items:[{id:`line-${id}`,materialId:"m1",category:"Materials",description:"Socket",quantity:2,unitPrice:10,...(cost===undefined?{}:{unitCost:cost})}]});

test("AI pack suggestions preserve reviewed quantities and buying/selling snapshots over library prices",()=>{
  const [result]=ai.suggestMaterials(args());assert.equal(result.unitCost,4.123);assert.equal(result.unitPrice,9.875);assert.equal(result.quantity,3);assert.equal(result.description,"Reviewed socket");assert.equal(result.costBasis,"Saved pack allowance");assert.doesNotMatch(JSON.stringify(result),/Private benchmark/);
});
test("pack selling price is never invented as a missing buying cost",()=>{
  for(const library of [[],[material,{...material}]]) {const [result]=ai.suggestMaterials(args({materials:library,jobPacks:[{...pack,materials:[{...pack.materials[0],unitCost:undefined}]}]}));assert.ok(result);assert.equal(result.unitCost,undefined);assert.equal(result.unitPrice,9.875);assert.equal(result.costBasis,"Not recorded");}
});
test("a legacy pack uses one uniquely linked library cost including explicit zero",()=>{
  const [result]=ai.suggestMaterials(args({materials:[{...material,tradeCost:0}],jobPacks:[{...pack,materials:[{...pack.materials[0],unitCost:undefined}]}]}));assert.equal(result.unitCost,0);assert.equal(result.costBasis,"Materials library");assert.equal(result.unitPrice,9.875);
});
test("invalid saved pack cost stays unknown rather than falling back to a library or selling amount",()=>{
  for(const unitCost of [-1,NaN,Infinity]){const [result]=ai.suggestMaterials(args({jobPacks:[{...pack,materials:[{...pack.materials[0],unitCost}]}]}));assert.equal(result.unitCost,undefined);assert.equal(result.costBasis,"Not recorded");}
});
test("duplicate pack and library identities cannot select arbitrary supplier or pricing records",()=>{
  const fromPack=ai.suggestMaterials(args({materials:[material,{...material,supplier:"OTHER"}]}))[0];assert.equal(fromPack.unitCost,4.123);assert.equal(fromPack.stockCode,"");assert.equal(fromPack.materialId,undefined);
  const ambiguous=ai.suggestMaterials(args({materials:[],jobPacks:[pack,{...pack,name:"Other domestic socket"}]}));assert.equal(ambiguous.length,0);
});
test("blank library identities cannot establish a legacy pack buying cost",()=>{
  const [result]=ai.suggestMaterials(args({materials:[{...material,id:" "}],jobPacks:[{...pack,materials:[{...pack.materials[0],materialId:" ",unitCost:undefined}]}]}));assert.equal(result.unitCost,undefined);assert.equal(result.materialId,undefined);assert.equal(result.costBasis,"Not recorded");
});
test("relevant history remains one coherent suggestion when a pack also matches",()=>{
  const [result]=ai.suggestMaterials(args({documents:[quote("q1",4)]}));assert.equal(result.source,"Previous JR OS jobs");assert.equal(result.quantity,2);assert.equal(result.unitCost,77);assert.equal(result.costBasis,"Materials library");assert.equal(result.evidenceCount,1);
});
test("unusable quantities and selling amounts cannot produce usable AI material lines",()=>{
  for(const patch of [{quantity:Infinity},{quantity:-1},{quantity:0},{unitPrice:NaN},{unitPrice:-1}]){const result=ai.suggestMaterials(args({materials:[],jobPacks:[{...pack,materials:[{...pack.materials[0],...patch}]}]}));assert.equal(result.length,0);}
});
test("historical costs use recorded quote costs only and do not rewrite history from today's library",()=>{
  const patterns=learning.buildMaterialLearningPatterns({documents:[quote("q1",undefined)],jobs:[],invoices:[],materials:[material]});assert.equal(patterns[0].averageUnitCost,undefined);assert.equal(patterns[0].costSamples,0);
  const known=learning.buildMaterialLearningPatterns({documents:[quote("q1",0),quote("q2",4),quote("q3",undefined),quote("q4",NaN)],jobs:[],invoices:[],materials:[material]});assert.equal(known[0].averageUnitCost,2);assert.equal(known[0].costSamples,2);
});
test("unknown history cost remains unknown when neither library nor quote records supply one",()=>{
  const [result]=ai.suggestMaterials(args({materials:[],jobPacks:[],documents:[quote("q1",undefined)]}));assert.equal(result.unitCost,undefined);assert.equal(result.unitPrice,10);assert.equal(result.costBasis,"Not recorded");
  const [free]=ai.suggestMaterials(args({materials:[{...material,tradeCost:0}],jobPacks:[],documents:[quote("q1",4)]}));assert.equal(free.unitCost,0);assert.equal(free.costBasis,"Materials library");
});
test("AI quote draft with missing material costs withholds profitability until reviewed",()=>{
  const draft=ai.buildAiQuoteDraft({...args({materials:[],jobPacks:[{...pack,materials:[{...pack.materials[0],unitCost:undefined}]}]}),labourRates:[],overheads:[],labourSettings:{workingDaysPerYear:220,billableHoursPerDay:7.5,targetNetMargin:25,contingencyPercent:0},quoteSettings:{defaultLabourRateId:"",contingencyPercent:0,materialMarkupPercent:20,travelCost:0,travelPrice:0,parkingCost:0,parkingPrice:0},createId:prefix=>prefix});assert.equal(draft.items[0].unitCost,undefined);assert.equal(draft.profitability,null);
});
