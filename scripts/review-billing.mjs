import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createBillingReviewOperator} from '../lib/server/billingReviewOperator.mjs';

const invalid=()=>{throw Error('billing_review_invalid_request');};
const values=['--organisation','--customer','--version','--resolution-id','--operator-reference','--note'];
function parse(args){
 if(!Array.isArray(args)||args.some(arg=>typeof arg!=='string'))invalid();
 if(args.length===1&&args[0]==='--help')return {help:true};
 const flags=new Map();
 for(let i=0;i<args.length;i++){
  const flag=args[i];if(flags.has(flag))invalid();
  if(flag==='--resolve'){flags.set(flag,true);continue;}
  if(!values.includes(flag)||!args[i+1]||args[i+1].startsWith('--'))invalid();flags.set(flag,args[++i]);
 }
 if(!flags.has('--resolve')){if(flags.size!==1||!flags.has('--organisation'))invalid();return {organisationId:flags.get('--organisation')};}
 if(flags.size!==values.length+1||!values.every(flag=>flags.has(flag))||!/^(0|[1-9][0-9]{0,9})$/.test(flags.get('--version')))invalid();
 return {decision:{organisationId:flags.get('--organisation'),customerId:flags.get('--customer'),expectedVersion:Number(flags.get('--version')),resolutionId:flags.get('--resolution-id'),operatorReference:flags.get('--operator-reference'),note:flags.get('--note')}};
}
export async function runBillingReviewCommand({args=process.argv.slice(2),env=process.env,fetchImpl=globalThis.fetch,write=line=>process.stdout.write(line)}={}){
 try{
  const request=parse(args);
  if(request.help){write(JSON.stringify({usage:'node scripts/review-billing.mjs --organisation UUID; resolve additionally requires --resolve --customer cus_ID --version N --resolution-id UUID --operator-reference CASE --note NOTE and private JR_OS_BILLING_REVIEW_RESOLUTION_ENABLED=true'})+'\n');return 0;}
  const operator=createBillingReviewOperator({env,fetchImpl});
  const result=request.decision?await operator.resolve(request.decision):await operator.inspect(request.organisationId);
  write(JSON.stringify(result)+'\n');return !request.decision||['cleared','already_recorded'].includes(result.state)?0:1;
 }catch(error){
  const code=['billing_review_invalid_request','billing_review_disabled'].includes(error?.message)?error.message:'billing_review_unavailable';write(JSON.stringify({code})+'\n');return 2;
 }
}
const entrypoint=process.argv[1]?pathToFileURL(resolve(process.argv[1])).href:null;
if(entrypoint===import.meta.url)process.exitCode=await runBillingReviewCommand();
