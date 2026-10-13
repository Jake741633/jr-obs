import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const nodes=t=>Array.isArray(t)?t.flatMap(nodes):t&&typeof t==="object"?[t,...nodes(t.props?.children)]:[];
test("starter library delegates imports to guarded catalogue with one identity snapshot",()=>{
  const materials={items:[],isReady:true},packs={items:[],isReady:true},identity={mode:"local",isReady:true,identity:null};let identityReads=0;
  const deps={"react/jsx-runtime":{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},"next/link":{default:"Link"},"lucide-react":new Proxy({},{get:(_,key)=>String(key)}),"../../components/ui/Card":{Card:"Card"},"../../components/ui/Button":{Button:"Button"},"../../components/ui/PageHeader":{PageHeader:"Header"},"../../components/catalogue/StarterCatalogue":{StarterCatalogue:"Catalogue"},"../../lib/cloud/coreBusinessCollections":{useMaterialsCollection:()=>materials,useJobPacksCollection:()=>packs},"../../lib/cloud/useCloudIdentity":{useCloudIdentity:()=>{identityReads++;return identity;}},"../../lib/starterData":{starterMaterials:[],starterJobPacks:[]},"../../lib/storage":{useLocalStorageCollection:key=>key.includes("materials")?materials:packs}};
  const mod={exports:{}};const raw=readFileSync(new URL("../app/starter-library/page.tsx",import.meta.url),"utf8");vm.runInNewContext(ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,require:key=>{assert.ok(key in deps,key);return deps[key];}});
  const view=mod.exports.default(),catalogue=nodes(view).find(n=>n.type==="Catalogue");assert.ok(catalogue);assert.equal(catalogue.props.materials,materials);assert.equal(catalogue.props.packs,packs);assert.equal(catalogue.props.identityState,identity);assert.equal(identityReads,1);assert.ok(nodes(view).some(n=>n.type==="Link"&&n.props.href==="/materials"));assert.ok(nodes(view).some(n=>n.type==="Link"&&n.props.href==="/job-packs"));
});
