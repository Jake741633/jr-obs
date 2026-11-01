import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";
const file = new URL("../lib/quoteDraftPricingReview.ts", import.meta.url), api = existsSync(file) ? loadLocalTs(file) : {};
const items = [{ id:"labour",category:"Labour",description:"Install",quantity:2,unitCost:20,unitPrice:75,labourMode:"Hours",labourHours:2 },{ id:"supply",category:"Materials",description:"Supplies",quantity:3,unitCost:4,unitPrice:10 }];
const pricing = { contingencyPercent:10,travelCost:8,travelPrice:20,parkingCost:2,parkingPrice:5,materialMarkupPercent:20,defaultLabourRateId:"" };
const labourSettings = { workingDaysPerYear:220,billableHoursPerDay:7.5,targetNetMargin:25 };
const overheads = [{ id:"overhead",active:true,frequency:"Annual",amount:1650 }];
const vatSettings = { registrationStatus:"VAT registered",defaultRate:20 };
const input = patch => ({items,pricing,labourSettings,overheads,vatSettings,...patch});
const zeroPricing = { ...pricing,contingencyPercent:0,travelCost:0,travelPrice:0,parkingCost:0,parkingPrice:0 };

test("complete quote review reconciles full line allowances, overheads and VAT exactly once",()=>{
 assert.equal(typeof api.reviewQuoteDraftPricing,"function");const result=api.reviewQuoteDraftPricing(input());assert.equal(result.complete,true);assert.deepEqual(Array.from(result.issues),[]);
 assert.deepEqual({...result.totals},{lineSubtotal:180,contingency:18,travelPrice:20,parkingPrice:5,net:223,vatEnabled:true,vatRate:20,vat:44.6,total:267.6});
 assert.equal(result.profitability.overheadCost,2);assert.equal(result.profitability.directCost,62);assert.equal(result.profitability.costPrice,64);assert.equal(result.profitability.sellingPrice,223);assert.equal(result.profitability.expectedProfit,159);
});
test("fractional prices and quantities keep raw calculation precision and all sources unchanged",()=>{
 const source=input({items:[{...items[1],quantity:2.333,unitCost:4.123,unitPrice:9.875}],pricing:zeroPricing}),before=structuredClone(source);Object.freeze(source.items);Object.freeze(source.overheads);
 const r=api.reviewQuoteDraftPricing(source);assert.equal(r.complete,true);assert.ok(Math.abs(r.totals.net-23.038375)<1e-10);assert.ok(Math.abs(r.totals.vat-4.607675)<1e-10);assert.ok(Math.abs(r.totals.total-27.64605)<1e-10);assert.equal(r.profitability.sellingPrice,r.totals.net);assert.deepEqual(source,before);
});
test("fractional-penny contingency uses the authoritative engine order for the displayed component",()=>{
 const r=api.reviewQuoteDraftPricing(input({items:[{...items[1],quantity:1,unitCost:0.1,unitPrice:0.35}],pricing:{...zeroPricing,contingencyPercent:10},overheads:[],vatSettings:{...vatSettings,registrationStatus:"Not registered"}}));
 assert.equal(r.complete,true);assert.equal(r.totals.contingency,0.034999999999999996);assert.equal(r.totals.net,0.38499999999999995);const money=new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"});assert.equal(money.format(r.totals.contingency),"£0.03");assert.equal(money.format(r.totals.total),"£0.38");
});
test("unregistered and pending business settings do not add VAT or reinterpret saved net allowances",()=>{
 for(const registrationStatus of ["Not registered","Registration pending"]){const r=api.reviewQuoteDraftPricing(input({vatSettings:{...vatSettings,registrationStatus,pricesIncludeVat:true}}));assert.equal(r.complete,true);assert.equal(r.totals.vatEnabled,false);assert.equal(r.totals.vat,0);assert.equal(r.totals.net,223);assert.equal(r.totals.total,223);assert.equal(r.totals.vatRate,20);}
 const zero=api.reviewQuoteDraftPricing(input({vatSettings:{...vatSettings,defaultRate:0}}));assert.equal(zero.complete,true);assert.equal(zero.totals.vatEnabled,true);assert.equal(zero.totals.total,223);
});
test("unknown or malformed VAT settings withhold totals rather than defaulting to no VAT",()=>{
 for(const patch of [{registrationStatus:"Unknown"},{registrationStatus:undefined},{defaultRate:NaN},{defaultRate:-1},{defaultRate:100.01},{defaultRate:"20"}]){const r=api.reviewQuoteDraftPricing(input({vatSettings:{...vatSettings,...patch}}));assert.equal(r.complete,false);assert.ok(r.issues.includes("vat"));assert.equal(r.totals,null);assert.equal(r.profitability,null);}
});
test("each unknown, negative or nonfinite financial allowance blocks clean review while explicit zero remains valid",()=>{
 for(const field of ["contingencyPercent","travelCost","travelPrice","parkingCost","parkingPrice"]){
  for(const value of [undefined,NaN,-1,Infinity,"20",1e9+1]){const r=api.reviewQuoteDraftPricing(input({pricing:{...pricing,[field]:value}}));assert.equal(r.complete,false,field);assert.ok(r.issues.includes(field),field);assert.equal(r.totals,null);assert.equal(r.profitability,null);}
  assert.equal(api.reviewQuoteDraftPricing(input({pricing:{...pricing,[field]:0}})).complete,true);
 }
});
test("incomplete, ambiguous and invalid-hour pricing lines withhold totals",()=>{
 for(const rows of [[],[{...items[0],unitCost:undefined}],items.map(row=>({...row,id:"same"})),[{...items[0],labourHours:0}]]){const r=api.reviewQuoteDraftPricing(input({items:rows}));assert.equal(r.complete,false);assert.ok(r.issues.includes("lines"));assert.equal(r.totals,null);assert.equal(r.profitability,null);}
});
test("invalid billable settings and uncertain or duplicated active overheads cannot imply zero overhead",()=>{
 for(const patch of [{workingDaysPerYear:0},{workingDaysPerYear:NaN},{billableHoursPerDay:0},{billableHoursPerDay:-1},{targetNetMargin:NaN},{targetNetMargin:101}]){const r=api.reviewQuoteDraftPricing(input({labourSettings:{...labourSettings,...patch}}));assert.equal(r.complete,false);assert.ok(r.issues.includes("labourSettings"));}
 for(const rows of [[{...overheads[0],active:undefined}],[{...overheads[0],frequency:"Unknown"}],[{...overheads[0],amount:NaN}],[{...overheads[0],amount:-1}],[{...overheads[0],id:""}],[overheads[0],{...overheads[0],active:false}]]){const r=api.reviewQuoteDraftPricing(input({overheads:rows}));assert.equal(r.complete,false);assert.ok(r.issues.includes("overheads"));assert.equal(r.profitability,null);}
});
test("explicitly inactive overheads are ignored and a genuine loss remains a valid result",()=>{
 const r=api.reviewQuoteDraftPricing(input({items:[{...items[1],quantity:1,unitCost:100,unitPrice:1}],pricing:zeroPricing,overheads:[{id:"",active:false,frequency:"Unknown",amount:NaN}]}));
 assert.equal(r.complete,true);assert.equal(r.profitability.expectedProfit,-99);assert.equal(r.profitability.netMargin,-9900);assert.equal(r.profitability.overheadCost,0);assert.equal(r.totals.net,1);assert.equal(r.totals.total,1.2);
});
test("combined extras, VAT and overhead overflow withhold an apparently clean quote",()=>{
 for(const source of [input({pricing:{...pricing,travelPrice:1e9}}),input({items:[{...items[1],quantity:1,unitPrice:1e9}],pricing:zeroPricing}),input({items:[{...items[1],quantity:1,unitPrice:1e9}],pricing:{...zeroPricing,contingencyPercent:1},vatSettings:{...vatSettings,registrationStatus:"Not registered"}}),input({overheads:[{...overheads[0],frequency:"Weekly",amount:1e9}],labourSettings:{...labourSettings,workingDaysPerYear:1,billableHoursPerDay:1}})]){const r=api.reviewQuoteDraftPricing(source);assert.equal(r.complete,false);assert.ok(r.issues.includes("totals"));assert.equal(r.totals,null);assert.equal(r.profitability,null);}
});
