// Payment measurement is independent of access entitlements. Call this only
// after verifying the raw Stripe webhook signature in cloud/worker.ts.
import {BillingError,stripeRequest,type BillingEnv,type StripeClient,type StripeEvent} from './billing';
import type {Store} from './store';

export type PaymentReceipt={invoice_id:string;user_id:string;subscription_id:string;paid_at:number;amount_paid:number;currency:string};
export interface PaymentStore{
 hasInvoice(invoiceId:string):Promise<boolean>;
 record(receipt:PaymentReceipt,customerId:string):Promise<boolean>;
}
type PaymentStatement={bind(...values:unknown[]):PaymentStatement;first<T>():Promise<T|null>;run():Promise<{success?:boolean;meta?:{changes?:number}}>};
export type PaymentD1={prepare(sql:string):PaymentStatement};

export class D1PaymentStore implements PaymentStore{
 constructor(private db:PaymentD1){}
 async hasInvoice(invoiceId:string){
  return !!await this.db.prepare('SELECT invoice_id FROM payment_receipts WHERE invoice_id=?').bind(invoiceId).first();
 }
 async record(receipt:PaymentReceipt,customerId:string){
  // Recheck customer ownership in the write itself. Duplicate delivery and
  // distinct Stripe events for one invoice can never create a second receipt.
  const result=await this.db.prepare(`INSERT INTO payment_receipts
   (invoice_id,user_id,subscription_id,paid_at,amount_paid,currency)
   SELECT ?,id,?,?,?,? FROM users WHERE id=? AND stripe_customer=?
   ON CONFLICT(invoice_id) DO NOTHING`).bind(receipt.invoice_id,receipt.subscription_id,receipt.paid_at,
    receipt.amount_paid,receipt.currency,receipt.user_id,customerId).run();
  if(result.success===false||typeof result.meta?.changes!=='number')throw pending();
  if(result.meta.changes===1)return true;
  if(await this.hasInvoice(receipt.invoice_id))return false;
  // A concurrent customer reassignment must be resolved on a fresh delivery.
  throw pending();
 }
}

type InvoiceLine={id:string;amount:number;currency?:string;price?:unknown;subscription?:unknown;
 pricing?:{price_details?:{price?:unknown}};parent?:{subscription_item_details?:{subscription?:unknown}};
 discount_amounts?:{amount:number}[]};
type LineList={data:InvoiceLine[];has_more:boolean};
type Invoice={id:string;customer:unknown;status:string;paid?:boolean;amount_paid:number;currency:string;
 subscription?:unknown;parent?:{subscription_details?:{subscription?:unknown}};
 status_transitions?:{paid_at?:number|null};lines?:LineList};

const pending=()=>new BillingError(503,'Payment measurement is temporarily unavailable. Please retry.');
const idOf=(value:unknown):string|undefined=>typeof value==='string'?value:value&&typeof value==='object'&&'id' in value&&typeof value.id==='string'?value.id:undefined;
const positiveInteger=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;

async function invoiceLines(api:StripeClient,invoice:Invoice){
 let page=invoice.lines,after='';
 const rows:InvoiceLine[]=[],seen=new Set<string>();
 // Never silently truncate an invoice before deciding which product was paid.
 for(let count=0;count<20;count++){
  if(!page)page=await api<LineList>('invoices/'+encodeURIComponent(invoice.id)+'/lines',{limit:'100',...(after?{starting_after:after}:{})});
  if(!page||!Array.isArray(page.data)||typeof page.has_more!=='boolean')throw pending();
  for(const line of page.data){
   if(!line||typeof line.id!=='string'||!line.id||seen.has(line.id)||!Number.isSafeInteger(line.amount))throw pending();
   seen.add(line.id);rows.push(line);
  }
  if(!page.has_more)return rows;
  const next=page.data.at(-1)?.id;if(!next||next===after)throw pending();
  after=next;page=undefined;
 }
 throw pending();
}

function isPaidBideLine(line:InvoiceLine,priceId:string,subscriptionId:string,currency:string){
 const price=idOf(line.price)??idOf(line.pricing?.price_details?.price);
 if(price!==priceId)return false;
 const subscription=idOf(line.subscription)??idOf(line.parent?.subscription_item_details?.subscription);
 if(subscription&&subscription!==subscriptionId)return false;
 if(line.currency&&line.currency!==currency)throw pending();
 const discounts=line.discount_amounts??[];
 if(!Array.isArray(discounts)||discounts.some(d=>!d||!Number.isSafeInteger(d.amount)||d.amount<0))throw pending();
 // A fully discounted Bide line alongside another paid product is not a Bide
 // paid conversion. Gross invoice totals remain separate from line attribution.
 return line.amount-discounts.reduce((sum,d)=>sum+d.amount,0)>0;
}

export async function recordPaidInvoice(env:BillingEnv,users:Pick<Store,'userByCustomer'>,payments:PaymentStore,event:StripeEvent,api?:StripeClient):Promise<'ignored'|'duplicate'|'recorded'>{
 if(event.type!=='invoice.paid')return 'ignored';
 try{
  const invoiceId=idOf(event.data.object),customerId=idOf(event.data.object.customer);
  if(!invoiceId||!customerId)throw pending();
  // A webhook's email or user metadata cannot adopt a new customer for metrics.
  const user=await users.userByCustomer(customerId);
  if(!user||user.stripe_customer!==customerId)return 'ignored';
  if(await payments.hasInvoice(invoiceId))return 'duplicate';
  if(!env.STRIPE_SECRET_KEY||!env.STRIPE_PRICE_ID)throw pending();
  const client:StripeClient=api??((path,params,options)=>stripeRequest(env,path,params,options));
  const invoice=await client<Invoice>('invoices/'+encodeURIComponent(invoiceId));
  if(!invoice||invoice.id!==invoiceId||idOf(invoice.customer)!==customerId)throw pending();
  if(invoice.status!=='paid'||invoice.paid===false||!positiveInteger(invoice.amount_paid))return 'ignored';
  const subscriptionId=idOf(invoice.subscription)??idOf(invoice.parent?.subscription_details?.subscription);
  if(!subscriptionId)return 'ignored';
  const paidAt=invoice.status_transitions?.paid_at;
  if(!positiveInteger(paidAt)||!Number.isSafeInteger(paidAt*1000)||typeof invoice.currency!=='string'||!(/^[a-z]{3}$/).test(invoice.currency))throw pending();
  const lines=await invoiceLines(client,invoice);
  if(!lines.some(line=>isPaidBideLine(line,env.STRIPE_PRICE_ID!,subscriptionId,invoice.currency)))return 'ignored';
  return await payments.record({invoice_id:invoice.id,user_id:user.id,subscription_id:subscriptionId,
   paid_at:paidAt*1000,amount_paid:invoice.amount_paid,currency:invoice.currency},customerId)?'recorded':'duplicate';
 }catch(error){
  // Do not acknowledge invoice.paid until its receipt is durable. Other Stripe
  // event types do not read this table, so metrics cannot block entitlement sync.
  if(error instanceof BillingError)throw error;
  throw pending();
 }
}
