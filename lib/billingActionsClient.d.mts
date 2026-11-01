export type BillingAction='monthly'|'annual'|'portal';
export type BillingActionState='redirecting'|'busy'|'denied'|'conflict'|'review'|'already_subscribed'|'not_started'|'unavailable';
export function createOwnerBillingActions(options:{owner:{userId:string;organisationId:string;role:string;accessToken:string};isCurrent:()=>boolean;navigate:(url:string)=>void;fetchImpl?:typeof globalThis.fetch}):{run:(action:BillingAction)=>Promise<{state:BillingActionState}|null>;cancel:()=>void};
