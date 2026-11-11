import { randomBytes } from 'node:crypto';
import { hashPassword, tokenHash } from '../auth.js';
import type { Job, User } from '../store.js';
import { can, requirePermission } from '../enterprise/permissions.js';
import { EnterpriseService, failure } from '../enterprise/service.js';
import { Repository, type RecordDoc } from '../enterprise/repository.js';

export const clientRoles=['client_owner','client_admin','client_operator','client_viewer','client_approver'] as const;
export type ClientRole=typeof clientRoles[number];
export type Context={user:User;tenant:RecordDoc;member:RecordDoc};
export const serviceKeys=['extraction','upload','deletion','reconciliation','ai','managed','analytics','audit'] as const;
export type ServiceKey=typeof serviceKeys[number];
export const catalog=serviceKeys.map(key=>({key,name:({extraction:'ExtractBot',upload:'UploadBot',deletion:'DeleteBot',reconciliation:'Reconciliation',ai:'AI Assistant',managed:'Managed Operations',analytics:'Advanced Analytics',audit:'Audit Reports'})[key],unit:({extraction:'runs',upload:'requests',deletion:'approved requests',reconciliation:'reviews',ai:'messages',managed:'requests',analytics:'access',audit:'access'})[key],execution:key==='ai'?'scoped_guidance':key==='analytics'||key==='audit'?'workspace':'managed_review',portalSupport:'Plastic EPR automation only; other portal accounts can be tracked without claiming BOT support.'}));
export function addMonths(date:Date,months:number){const d=new Date(date),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,end));return d;}
export function priceTerm(base:number,months:number,discountBps:number){if(![1,12,36].includes(months)||![base,discountBps].every(Number.isSafeInteger)||base<0||discountBps<0||discountBps>10000)failure('Invalid pricing definition.',400);const gross=base*months;if(!Number.isSafeInteger(gross))failure('Price exceeds safe bounds.',400);const discount=Number((BigInt(gross)*BigInt(discountBps)+5000n)/10000n);return {gross,discount,subtotal:gross-discount,currency:'INR',months};}
export class ClientService {
  constructor(public enterprise:EnterpriseService){}
  get repo(){return this.enterprise.repo;} get store(){return this.enterprise.store;}
  async context(user:User,tenantId?:string):Promise<Context>{
    if(user.accountKind!=='client'||user.active===false)failure('Client workspace access required.',403);
    const memberships=await this.repo.list('organizationmembers',{userId:user.id,status:'ACTIVE'});
    const member=tenantId?memberships.find(m=>m.tenantId===tenantId):memberships.length===1?memberships[0]:null;
    if(!member)failure(memberships.length?'Select an authorized organization.':'No active organization membership.',409);
    const tenant=await this.repo.get('organizations',String(member.tenantId));
    if(!tenant||tenant.status==='SUSPENDED')failure('Organization is unavailable or suspended.',403);
    return {user,tenant,member};
  }
  allow(c:Context,action:'manage'|'operate'|'approve'|'billing'|'write'){
    const role=String(c.member.role),allowed=action==='manage'?['client_owner','client_admin']:action==='billing'?['client_owner','client_admin']:action==='approve'?['client_owner','client_admin','client_approver']:action==='operate'?['client_owner','client_admin','client_operator']:['client_owner','client_admin','client_operator','client_approver'];
    if(!allowed.includes(role))failure('Your organization role does not permit this action.',403);
  }
  async owned(c:Context,kind:string,id:string,repo=this.repo){const record=await repo.get(kind,id);if(!record||record.tenantId!==c.tenant.id)failure('Record not found.',404);return record;}
  async event(c:Context,action:string,targetId:string,details:Record<string,unknown>={},repo=this.repo){return repo.create('clientactivity',{tenantId:c.tenant.id,actorId:c.user.id,actorName:c.user.name,action,targetId,details});}
  async invite(actor:User,tenantId:string,input:{name:string;email:string;role:ClientRole},initialOwner=false){
    const tenant=await this.repo.get('organizations',tenantId);if(!tenant)failure('Organization not found.',404);
    let user=await this.store.userByEmail(input.email),setupLink:string|null=null;
    if(user&&user.accountKind!=='client')failure('Staff identities cannot be converted to client memberships.');
    if((await this.repo.list('organizationmembers',{tenantId})).some(m=>m.userId===user?.id))failure('This membership already exists.');
    if(!user){user=await this.store.createUser({name:input.name,email:input.email,accountKind:'client',emailVerified:false,active:true,passwordHash:await hashPassword(randomBytes(32).toString('hex')),createdBy:actor.id});const token=randomBytes(32).toString('hex');await this.repo.create('setuptokens',{userId:user.id,tokenHash:tokenHash(token),expiresAt:new Date(Date.now()+86400000).toISOString(),used:false});setupLink='/setup-password?token='+token+'&portal=client';}
    const member=await this.repo.transaction(async repo=>{const organization=await repo.get('organizations',tenantId);if(!organization)failure('Organization not found.',404);const existing=await repo.list('organizationmembers',{tenantId});if(!initialOwner){const sub=await this.subscription({tenant:organization} as Context,repo);if(!sub||existing.length>=Number((sub.limits as any).members))failure('Member allowance is unavailable.',403);}else if(existing.length)failure('Initial owner already exists.');await repo.update('organizations',organization.id,organization.version,{membershipRevision:Number(organization.membershipRevision??0)+1});return repo.create('organizationmembers',{tenantId,userId:user!.id,name:input.name,email:input.email,role:input.role,status:'ACTIVE',createdBy:actor.id});});
    await this.enterprise.audit(actor,'organization.member_invited',member.id,{tenantId,role:input.role});return {member,setupLink,delivery:'LINK_ONLY'};
  }
  async createOrganization(actor:User,input:{name:string;code:string;ownerName:string;ownerEmail:string;clientId?:string}){
    requirePermission(actor,'clients.allocate');
    if((await this.repo.list('organizations')).some(o=>o.code===input.code))failure('Organization code already exists.');
    if(input.clientId){if(!await this.repo.get('clients',input.clientId))failure('Client not found.',404);if((await this.repo.list('tenantclients',{clientId:input.clientId})).length)failure('Client already belongs to an organization.');}
    const existing=await this.store.userByEmail(input.ownerEmail);if(existing&&existing.accountKind!=='client')failure('Owner email belongs to an internal staff account.');
    const tenant=await this.repo.create('organizations',{name:input.name,code:input.code,status:'ONBOARDING',commercialModel:'HYBRID',createdBy:actor.id});
    if(input.clientId)await this.repo.create('tenantclients',{tenantId:tenant.id,clientId:input.clientId});
    const invitation=await this.invite(actor,tenant.id,{name:input.ownerName,email:input.ownerEmail,role:'client_owner'},true);
    await this.enterprise.audit(actor,'organization.created',tenant.id);return {tenant,...invitation};
  }
  async subscription(c:Context,repo=this.repo){const now=Date.now();return (await repo.list('subscriptions',{tenantId:c.tenant.id})).find(s=>s.status==='ACTIVE'&&Date.parse(String(s.startsAt))<=now&&Date.parse(String(s.endsAt))>now)??null;}
  async entitlement(c:Context,service:string,repo=this.repo){const sub=await this.subscription(c,repo);if(c.tenant.status!=='ACTIVE'||!sub||!(sub.services as string[]).includes(service))failure('An active organization and service subscription are required.',403);return sub;}
  period(sub:RecordDoc,now=new Date()){let start=new Date(String(sub.startsAt));let next=addMonths(start,1);while(next<=now){start=next;next=addMonths(start,1);}return {start:start.toISOString(),end:next.toISOString()};}
  async reserve(c:Context,service:ServiceKey,key:string,repo:Repository){
    const sub=await this.entitlement(c,service,repo),limit=Number((sub.limits as any)[service]??0),period=this.period(sub);
    let bucket=(await repo.list('usagebuckets',{tenantId:c.tenant.id,subscriptionId:sub.id,service,periodStart:period.start}))[0];
    if(!bucket)bucket=await repo.create('usagebuckets',{tenantId:c.tenant.id,subscriptionId:sub.id,service,periodStart:period.start,periodEnd:period.end,used:0,reserved:0});
    if(Number(bucket.used)+Number(bucket.reserved)>=limit)failure('Monthly service allowance is exhausted.',403);
    await repo.update('usagebuckets',bucket.id,bucket.version,{reserved:Number(bucket.reserved)+1});
    return repo.create('usageledger',{tenantId:c.tenant.id,subscriptionId:sub.id,bucketId:bucket.id,service,idempotencyKey:key,state:'RESERVED',units:1,actorId:c.user.id,policy:'Reserve on request; charge only confirmed successful completion. Failed/cancelled requests release the reservation.'});
  }
  async settle(ledger:RecordDoc,success:boolean,repo=this.repo){if(ledger.state!=='RESERVED')return;const bucket=await repo.get('usagebuckets',String(ledger.bucketId));if(!bucket)failure('Usage bucket missing.');await repo.update('usagebuckets',bucket.id,bucket.version,{reserved:Math.max(0,Number(bucket.reserved)-1),used:Number(bucket.used)+(success?1:0)});await repo.update('usageledger',ledger.id,ledger.version,{state:success?'CONSUMED':'RELEASED'});}
  async grantContract(actor:User,tenantId:string,plan:RecordDoc,months:number,reference:string){
    requirePermission(actor,'settings.manage');const tenant=await this.repo.get('organizations',tenantId);if(!tenant)failure('Organization not found.',404);
    if(![1,12,36].includes(months))failure('Invalid contract term.',400);
    if((await this.repo.list('subscriptions',{tenantId})).some(s=>s.status==='ACTIVE'&&Date.parse(String(s.endsAt))>Date.now()))failure('An active subscription already exists. Review renewal policy first.');
    const start=new Date();const sub=await this.repo.transaction(async repo=>{const fresh=await repo.get('organizations',tenant.id);if(!fresh)failure('Organization not found.',404);if((await repo.list('subscriptions',{tenantId})).some(s=>s.status==='ACTIVE'&&Date.parse(String(s.endsAt))>Date.now()))failure('Active access already exists.');await repo.update('organizations',fresh.id,fresh.version,{status:'ACTIVE'});return repo.create('subscriptions',{tenantId,planVersionId:plan.id,planName:plan.name,services:plan.services,limits:plan.limits,startsAt:start.toISOString(),endsAt:addMonths(start,months).toISOString(),months,status:'ACTIVE',source:'MANUAL_CONTRACT',reference,paid:false,autoRenew:false,billingFrequency:'CONTRACTUAL',createdBy:actor.id});});
    await this.enterprise.audit(actor,'subscription.contract_granted',sub.id,{tenantId,reference});return sub;
  }
  async createAccount(c:Context,input:{name:string;portalType:string;registrationType:string}){this.allow(c,'manage');return this.repo.transaction(async repo=>{const tenant=await repo.get('organizations',c.tenant.id),sub=await this.subscription(c,repo),accounts=await repo.list('portalaccounts',{tenantId:c.tenant.id});if(!tenant||tenant.status!=='ACTIVE'||!sub||accounts.length>=Number((sub.limits as any).accounts))failure('An active plan with an available account slot is required.',403);await repo.update('organizations',tenant.id,tenant.version,{accountRevision:Number(tenant.accountRevision??0)+1});const account=await repo.create('portalaccounts',{tenantId:c.tenant.id,...input,status:'OWNERSHIP_PENDING',createdBy:c.user.id});await this.event(c,'account.created',account.id,{},repo);return account;});}
  async createRegistration(c:Context,input:{accountId:string;cpcbId:string;financialYear:string}){this.allow(c,'manage');await this.owned(c,'portalaccounts',input.accountId);if(Number(input.financialYear.slice(5))!==(Number(input.financialYear.slice(0,4))+1)%100)failure('Financial year must be consecutive (YYYY-YY).',400);return this.repo.transaction(async repo=>{const tenant=await repo.get('organizations',c.tenant.id),sub=await this.subscription(c,repo),all=await repo.list('clientregistrations',{tenantId:c.tenant.id});if(!tenant||tenant.status!=='ACTIVE'||!sub||all.length>=Number((sub.limits as any).registrations))failure('Registration allowance is unavailable.',403);if(all.some(r=>r.cpcbId===input.cpcbId))failure('This registration already exists.');await repo.update('organizations',tenant.id,tenant.version,{registrationRevision:Number(tenant.registrationRevision??0)+1});const registration=await repo.create('clientregistrations',{tenantId:c.tenant.id,...input,verification:'PENDING',createdBy:c.user.id});await this.event(c,'registration.created',registration.id,{},repo);return registration;});}
  async internalAssignments(c:Context){const links=await this.repo.list('tenantclients',{tenantId:c.tenant.id});const rows=(await Promise.all(links.map(l=>this.repo.list('clientassignments',{clientId:l.clientId})))).flat();return rows;}
  async dashboard(c:Context){
    const [nativeAccounts,nativeIds,assignments,sub]=await Promise.all([this.repo.list('portalaccounts',{tenantId:c.tenant.id}),this.repo.list('clientregistrations',{tenantId:c.tenant.id}),this.internalAssignments(c),this.subscription(c)]);
    const workflows=await Promise.all(assignments.map(a=>this.repo.list('financialyearworkflows',{assignmentId:a.id})));
    const rows=await Promise.all(assignments.map(async(a,i)=>{const account=await this.repo.get('cpcbaccounts',String(a.accountId)),client=await this.repo.get('clients',String(a.clientId)),w=workflows[i][0];return {id:a.id,accountName:client?.name,cpcbId:account?.cpcbId,financialYear:a.financialYear,dueDate:a.dueDate,status:w?.businessStatus??'Not Started',workflow:w?{stage:w.stage,extraction:w.extraction,validation:w.validation,upload:w.upload,reconciliation:w.reconciliation,businessStatus:w.businessStatus,evidenceVersion:w.evidenceVersion}:null,updatedAt:w?.updatedAt??a.updatedAt};}));
    for(const registration of nativeIds){if(!rows.some(r=>r.cpcbId===registration.cpcbId&&r.financialYear===registration.financialYear))rows.push({id:registration.id,accountName:nativeAccounts.find(a=>a.id===registration.accountId)?.name,cpcbId:registration.cpcbId,financialYear:registration.financialYear,dueDate:null,status:'Not Started',workflow:null,updatedAt:registration.updatedAt} as any);}
    const approvals=await this.repo.list('clientapprovals',{tenantId:c.tenant.id});
    const progress=(w:any)=>!w?0:w.businessStatus==='Completed'?100:Math.round([true,w.extraction==='COMPLETED',w.validation==='APPROVED',w.upload==='VERIFIED',w.reconciliation==='APPROVED'].filter(Boolean).length/6*100);
    return {organization:{id:c.tenant.id,name:c.tenant.name,status:c.tenant.status},accounts:nativeAccounts,registrations:nativeIds,workflows:rows.map(r=>({...r,progress:progress(r.workflow)})),subscription:sub,metrics:{accounts:nativeAccounts.length+(await this.repo.list('tenantclients',{tenantId:c.tenant.id})).length,cpcbIds:new Set([...nativeIds.map(r=>r.cpcbId),...rows.map(r=>r.cpcbId)]).size,completed:rows.filter(r=>r.status==='Completed').length,inProcess:rows.filter(r=>r.status==='Pending').length,pending:rows.filter(r=>r.status==='Not Started').length,openApprovals:approvals.filter(a=>a.status==='PENDING').length},activity:(await this.repo.list('clientactivity',{tenantId:c.tenant.id})).slice(0,15),spocs:await this.repo.list('spocassignments',{tenantId:c.tenant.id})};
  }
  async requestService(c:Context,input:{service:ServiceKey;registrationId:string;description:string;idempotencyKey:string;documentIds?:string[]}){
    this.allow(c,'operate');if(!['extraction','upload','deletion','reconciliation','managed'].includes(input.service))failure('Use the service-specific workspace action.',400);
    const registration=await this.owned(c,'clientregistrations',input.registrationId);
    for(const id of input.documentIds??[])await this.owned(c,'clientdocuments',id);
    if(registration.verification!=='VERIFIED')failure('CPCB account ownership must be verified by management first.',403);
    const account=await this.owned(c,'portalaccounts',String(registration.accountId));if(account.portalType!=='plastic')failure('The supplied Python BOTs support Plastic EPR only. Other portals require an approved integration.',403);
    return this.repo.transaction(async repo=>{const old=(await repo.list('servicerequests',{tenantId:c.tenant.id,idempotencyKey:input.idempotencyKey}))[0];if(old)return old;const usage=await this.reserve(c,input.service,input.idempotencyKey,repo);const request=await repo.create('servicerequests',{tenantId:c.tenant.id,...input,usageId:usage.id,status:'REQUESTED',requestedBy:c.user.id,executionModel:'MANAGED',message:'Awaiting an assigned internal operator. No BOT has been executed by this request.'});await this.event(c,'service.requested',request.id,{service:input.service},repo);return request;});
  }
  async reconcileRequest(actor:User,id:string,jobId:string){requirePermission(actor,'clients.allocate');const request=await this.repo.get('servicerequests',id);if(!request)failure('Request not found.',404);const context={tenant:{id:request.tenantId}} as Context;const assignments=await this.internalAssignments(context),job=await this.store.job(jobId);if(!job||!assignments.some(a=>a.id===job.assignmentId))failure('Job is outside this organization.',403);const registration=await this.repo.get('clientregistrations',String(request.registrationId));const assignment=assignments.find(a=>a.id===job.assignmentId);const source=assignment?await this.repo.get('cpcbaccounts',String(assignment.accountId)):null;if(!registration||source?.cpcbId!==registration.cpcbId)failure('Job belongs to another CPCB registration.',403);const expected=request.service==='extraction'?'extract':request.service==='upload'?'upload':request.service==='deletion'?'delete':null;if(!expected||job.kind!==expected)failure('This request requires explicit operational review; the job type does not match.');
    if(assignment?.financialYear!==registration.financialYear)failure('Job belongs to a different financial year.',403);
    if(request.jobId&&request.jobId!==job.id)failure('A request cannot be rebound to another job. Create a reviewed retry request.');
    const linked=await this.repo.list('servicerequests',{jobId:job.id});if(linked.some(r=>r.id!==id))failure('This BOT job is already linked to another service request.');
    await this.repo.update('servicerequests',request.id,request.version,{jobId:job.id});
    const result=await this.syncRequest(id,job);await this.enterprise.audit(actor,'client.service_job_linked',id,{tenantId:request.tenantId,jobId});return result;
  }
  async onJob(job:Job){for(const request of await this.repo.list('servicerequests',{jobId:job.id}))await this.syncRequest(request.id,job);}
  private async syncRequest(id:string,job:Job){
    return this.repo.transaction(async repo=>{
      const request=await repo.get('servicerequests',id);if(!request||request.jobId!==job.id)failure('Linked service request not found.');
      if(['COMPLETED','FAILED'].includes(String(request.status)))return request;
      const ledger=await repo.get('usageledger',String(request.usageId));let status='IN_PROCESS';
      const workflow=(await repo.list('financialyearworkflows',{assignmentId:job.assignmentId}))[0];
      const deletionVerified=request.service==='deletion'&&(await repo.list('deletionrequests',{jobId:job.id,status:'VERIFIED'})).length>0;
      if(['failed','cancelled'].includes(job.status)){status='FAILED';if(ledger)await this.settle(ledger,false,repo);}
      else if(deletionVerified||(job.status==='completed'&&(request.service==='extraction'||(request.service==='upload'&&workflow?.upload==='VERIFIED')))){status='COMPLETED';if(ledger)await this.settle(ledger,true,repo);}
      else if(['completed','partial'].includes(job.status))status='REQUIRES_VERIFICATION';
      const updated=await repo.update('servicerequests',id,request.version,{status,jobStatus:job.status,jobStage:job.stage});
      if(status!==request.status)await repo.create('clientactivity',{tenantId:request.tenantId,actorName:'Linked automation job',action:'service.'+status.toLowerCase(),targetId:id,details:{jobId:job.id}});
      return updated;
    });
  }
}
