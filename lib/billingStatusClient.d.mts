export interface PublicBillingSubscription {plan:'monthly'|'annual';status:string;paidThroughMs:number|null;trialEndsAtMs:number|null;cancelAtPeriodEnd:boolean;reconciledAtMs:number;}
export interface PublicBillingStatus {mode:'test';checkoutAvailable:false;subscription:PublicBillingSubscription|null;}
export type BillingStatusResult={state:'loading'|'unavailable'|'denied'}|{state:'ready';data:PublicBillingStatus};
export function loadOwnerBillingStatus(options:{owner:{userId:string;organisationId:string;role:string;accessToken:string};signal?:AbortSignal;isCurrent:()=>boolean;fetchImpl?:typeof globalThis.fetch}):Promise<BillingStatusResult|null>;
