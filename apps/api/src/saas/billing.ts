import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import {taxInvoicePdf} from '../pdf/documents.js';
import { failure } from '../enterprise/service.js';
import type { Context } from './service.js';
import { ClientService, priceTerm, addMonths } from './service.js';
import type { RecordDoc } from '../enterprise/repository.js';

export function validHmac(message:string|Buffer,signature:string,secret:string){if(!/^[a-f0-9]{64}$/i.test(signature))return false;return timingSafeEqual(Buffer.from(signature,'hex'),createHmac('sha256',secret).update(message).digest());}
export interface PaymentGateway {configured:boolean;keyId:string;createOrder(amount:number,receipt:string):Promise<{id:string}>;payment(id:string):Promise<{id:string;order_id:string;amount:number;currency:string;status:string}>;}
export class RazorpayGateway implements PaymentGateway {
  keyId=process.env.RAZORPAY_KEY_ID??''; private secret=process.env.RAZORPAY_KEY_SECRET??'';
  get configured(){return !!this.keyId&&!!this.secret;}
  async call(path:string,body?:unknown){if(!this.configured)failure('Payment provider is not configured. No payment was taken.',503);const response=await fetch('https://api.razorpay.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(this.keyId+':'+this.secret).toString('base64'),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});if(!response.ok)failure('Payment provider did not confirm this operation. Check payment records before retrying.',502);return response.json() as Promise<any>;}
  createOrder(amount:number,receipt:string){return this.call('orders',{amount,currency:'INR',receipt});}
  payment(id:string){return this.call('payments/'+encodeURIComponent(id));}
}
export function calculateTax(subtotal:number,lines:{name:string;basisPoints:number}[]){let total=0;const taxes=lines.map(line=>{if(!Number.isSafeInteger(line.basisPoints)||line.basisPoints<0||line.basisPoints>10000)failure('Invalid reviewed tax policy.');const amount=Number((BigInt(subtotal)*BigInt(line.basisPoints)+5000n)/10000n);total+=amount;return {...line,amount};});return {taxes,tax:total,total:subtotal+total};}
export class BillingService {
  constructor(public clients:ClientService,public gateway:PaymentGateway=new RazorpayGateway()){}
  get repo(){return this.clients.repo;}
  async quote(c:Context,planId:string,months:number){
    this.clients.allow(c,'billing');const plan=await this.repo.get('planversions',planId);if(!plan||!plan.active)failure('Published plan version not found.',404);
    const discount=months===12?Number(plan.yearlyDiscountBps):months===36?Number(plan.threeYearDiscountBps):0;
    const base=priceTerm(Number(plan.monthlyPaise),months,discount);
    const profile=(await this.repo.list('billingprofiles',{tenantId:c.tenant.id}))[0];
    const seller=(await this.repo.list('settings',{key:'saas-seller'}))[0];
    const ready=profile?.taxVerified===true&&seller?.reviewed===true;
    const sandbox=this.gateway instanceof RazorpayGateway&&this.gateway.keyId.startsWith('rzp_test_');
    return {plan,pricing:base,billing:profile??null,seller:seller??null,tax:ready?calculateTax(base.subtotal,profile.taxLines as any[]):null,checkoutReady:ready&&this.gateway.configured&&!sandbox,blockers:[...(!this.gateway.configured?['Payment gateway credentials are not configured.']:[]),...(sandbox?['Use the Razorpay Test Purchase section for sandbox purchases; test payments cannot activate live subscriptions.']:[]),...(!ready?['Seller details and customer tax treatment require finance review.']:[])],term:'Upfront prepaid. Automatic renewal is not enabled.',termsVersion:'orqix-prepaid-v1'};
  }
  async order(c:Context,planId:string,months:number,key:string){
    this.clients.allow(c,'billing');const old=(await this.repo.list('orders',{tenantId:c.tenant.id,idempotencyKey:key}))[0];if(old)return this.checkoutResult(old);
    const quote=await this.quote(c,planId,months);if(!quote.checkoutReady||!quote.tax)failure(quote.blockers.join(' '),503);
    if(await this.clients.subscription(c))failure('An active subscription exists. An upgrade/renewal policy must be reviewed first.');
    const order=await this.repo.create('orders',{tenantId:c.tenant.id,idempotencyKey:key,status:'CREATING',amount:quote.tax.total,currency:'INR',planSnapshot:quote.plan,pricingSnapshot:quote.pricing,taxSnapshot:quote.tax,sellerSnapshot:quote.seller,billingSnapshot:quote.billing,termsVersion:quote.termsVersion,acceptedBy:c.user.id,months});
    try{const provider=await this.gateway.createOrder(Number(order.amount),order.id);const updated=await this.repo.update('orders',order.id,order.version,{providerOrderId:provider.id,status:'PENDING'});await this.clients.event(c,'billing.order_created',order.id,{amount:order.amount});return this.checkoutResult(updated);}catch(e){await this.repo.update('orders',order.id,order.version,{status:'REQUIRES_VERIFICATION'});throw e;}
  }
  checkoutResult(order:RecordDoc){return {order,keyId:this.gateway.keyId,providerOrderId:order.providerOrderId,amount:order.amount,currency:'INR',configured:this.gateway.configured};}
  async verify(c:Context,id:string,paymentId:string,signature:string){
    this.clients.allow(c,'billing');const order=await this.clients.owned(c,'orders',id);
    const secret=process.env.RAZORPAY_KEY_SECRET;if(!secret||!validHmac(String(order.providerOrderId)+'|'+paymentId,signature,secret))failure('Payment signature could not be verified.',400);
    const payment=await this.gateway.payment(paymentId);return this.capture(order,payment);
  }
  async capture(order:RecordDoc,payment:{id:string;order_id:string;amount:number;currency:string;status:string}){
    if(this.gateway instanceof RazorpayGateway&&this.gateway.keyId.startsWith('rzp_test_'))failure('Test payments cannot activate a live subscription or tax invoice. Use the test purchase flow.',409);
    if(payment.status!=='captured'||payment.order_id!==order.providerOrderId||payment.amount!==order.amount||payment.currency!=='INR')failure('Captured payment amount, currency or order could not be verified.',409);
    return this.repo.transaction(async repo=>{
      const current=await repo.get('orders',order.id);if(!current)failure('Order not found.',404);
      if(current.status==='PAID')return {order:current,subscription:(await repo.list('subscriptions',{orderId:current.id}))[0],invoice:(await repo.list('invoices',{orderId:current.id}))[0]};
      if(!['PENDING','REQUIRES_VERIFICATION'].includes(String(current.status)))failure('Order is not eligible for activation.');
      if((await repo.list('subscriptions',{tenantId:current.tenantId})).some(s=>s.status==='ACTIVE'&&Date.parse(String(s.endsAt))>Date.now()))failure('An active subscription appeared. Payment requires manual reconciliation; no duplicate access was granted.');
      const plan=current.planSnapshot as any,start=new Date(),tenant=await repo.get('organizations',String(current.tenantId));if(!tenant||tenant.status==='SUSPENDED')failure('Organization needs manual review before activation.');
      await repo.create('payments',{tenantId:current.tenantId,orderId:current.id,providerPaymentId:payment.id,amount:payment.amount,currency:'INR',status:'CAPTURED'});
      const subscription=await repo.create('subscriptions',{tenantId:current.tenantId,orderId:current.id,planVersionId:plan.id,planName:plan.name,services:plan.services,limits:plan.limits,startsAt:start.toISOString(),endsAt:addMonths(start,Number(current.months)).toISOString(),months:current.months,paidThrough:addMonths(start,Number(current.months)).toISOString(),status:'ACTIVE',source:'RAZORPAY_CAPTURED',paid:true,autoRenew:false,billingFrequency:'UPFRONT',acceptedTerms:current.termsVersion});
      const scope=this.clients.enterprise.currentFinancialYear(start);let counter=(await repo.list('invoicecounters',{scope}))[0];if(!counter)counter=await repo.create('invoicecounters',{scope,sequence:0});const sequence=Number(counter.sequence)+1;await repo.update('invoicecounters',counter.id,counter.version,{sequence});
      const invoice=await repo.create('invoices',{tenantId:current.tenantId,orderId:current.id,subscriptionId:subscription.id,number:`ORQ/${scope}/${String(sequence).padStart(6,'0')}`,status:'ISSUED',issuedAt:start.toISOString(),providerPaymentId:payment.id,amount:current.amount,currency:'INR',billingSnapshot:current.billingSnapshot,sellerSnapshot:current.sellerSnapshot,taxSnapshot:current.taxSnapshot,pricingSnapshot:current.pricingSnapshot,planSnapshot:current.planSnapshot,trigger:'FINANCE_APPROVED_PAYMENT_CAPTURE',termsVersion:current.termsVersion});
      const paid=await repo.update('orders',current.id,current.version,{status:'PAID',paymentId:payment.id,paidAt:start.toISOString()});await repo.update('organizations',tenant.id,tenant.version,{status:'ACTIVE'});await repo.create('clientactivity',{tenantId:current.tenantId,action:'subscription.activated',targetId:subscription.id,actorName:'Verified payment provider',details:{orderId:current.id,invoiceId:invoice.id}});return {order:paid,subscription,invoice};
    });
  }
  async webhook(raw:Buffer,signature:string,eventId?:string){
    const secret=process.env.RAZORPAY_WEBHOOK_SECRET;if(!secret)failure('Payment webhooks are not configured.',503);if(!validHmac(raw,signature,secret))failure('Invalid webhook signature.',400);
    const payload=JSON.parse(raw.toString()),key=eventId??createHash('sha256').update(raw).digest('hex');
    let event=(await this.repo.list('webhookevents',{eventId:key}))[0];if(event?.status==='PROCESSED')return {duplicate:true};
    if(!event)event=await this.repo.create('webhookevents',{eventId:key,event:payload.event,status:'RECEIVED',payloadHash:createHash('sha256').update(raw).digest('hex')});
    if(payload.event==='payment.captured'){
      const payment=payload.payload?.payment?.entity;const order=(await this.repo.list('orders',{providerOrderId:payment?.order_id}))[0];if(!order)failure('Payment order is not registered; review this event.',409);
      await this.capture(order,payment);
    }
    await this.repo.update('webhookevents',event.id,event.version,{status:'PROCESSED'});return {ok:true};
  }
  async invoicePdf(invoice:RecordDoc, logo?:Buffer){
    return taxInvoicePdf(invoice,logo);
  }
}
