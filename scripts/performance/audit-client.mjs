import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import mongoose from 'mongoose';
import {chromium} from '@playwright/test';
const phase=process.argv[2]??'before',origin='http://127.0.0.1:5173';
const credentials=JSON.parse(readFileSync(0,'utf8'));const out={phase,recordedAt:new Date().toISOString(),api:[],browser:{},mongo:[]};
const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({...credentials,portal:'client'}),signal:AbortSignal.timeout(30000)});if(!login.ok)throw Error('Login HTTP '+login.status);
const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
for(const query of ['', '?category=Category%20I','?category=Category%20II','?page=2','?fy=2025-26','?supplier=UFLEX%20LIMITED','?q=CR','']){
 const start=performance.now();const r=await fetch(origin+'/api/client/axis'+query,{headers:{cookie},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Axis HTTP '+r.status);const raw=await r.text(),data=JSON.parse(raw);
 const {asOf,publishedAt,...rest}=data;
 out.api.push({query,ms:Math.round(performance.now()-start),bytes:Buffer.byteLength(raw),records:data.certificateTotal,metrics:data.metrics,digest:createHash('sha256').update(JSON.stringify(rest)).digest('hex')});
 if(!out.tenant)out.tenant=data.datasets?.[0]?.tenantId;
}
const cachedStart=performance.now();const cached=await fetch(origin+'/api/client/axis',{headers:{cookie}});await cached.arrayBuffer();out.cachedRequestMs=Math.round(performance.now()-cachedStart);
await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:15000});const db=mongoose.connection.db;
const user=await db.collection('users').findOne({email:credentials.email},{projection:{id:1}});
const member=await db.collection('organizationmembers').findOne({userId:user.id,status:'ACTIVE'});const tenantId=member.tenantId;
const dataset=await db.collection('axisdatasets').findOne({tenantId,status:'PUBLISHED'});
for(const [collection,filter,sort] of [['axisdatasets',{tenantId},{createdAt:-1}],['axisdatasets',{tenantId,status:'PUBLISHED'},{createdAt:-1}],['axischunks',{datasetId:dataset.id},{createdAt:-1}],['portalaccounts',{tenantId},{createdAt:-1}],['clientregistrations',{tenantId},{createdAt:-1}],['organizationmembers',{userId:user.id,status:'ACTIVE'},{createdAt:-1}]]){
 const explain=await db.collection(collection).find(filter).sort(sort).limit(5000).explain('executionStats');const s=explain.executionStats;
 out.mongo.push({collection,query:collection==='axisdatasets'&&filter.status?'published':collection,executionMs:s.executionTimeMillis,docsExamined:s.totalDocsExamined,keysExamined:s.totalKeysExamined,returned:s.nReturned,plan:explain.queryPlanner.winningPlan,indexes:(await db.collection(collection).indexes()).map(x=>({name:x.name,key:x.key}))});
}
delete out.tenant;await mongoose.disconnect();
const browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:900}});await ctx.addCookies(cookie.split('; ').map(c=>{const i=c.indexOf('=');return{name:c.slice(0,i),value:c.slice(i+1),url:origin}}));
const page=await ctx.newPage();const requests=[];const failures=[];page.on('requestfailed',r=>{if(r.url().includes('/api/'))failures.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText})});page.on('request',r=>{if(r.url().includes('/api/'))requests.push(new URL(r.url()).pathname+new URL(r.url()).search)});
await page.addInitScript(()=>{window.__longTasks=[];new PerformanceObserver(list=>{for(const e of list.getEntries())window.__longTasks.push({duration:e.duration,start:e.startTime})}).observe({type:'longtask',buffered:true})});
const session=await ctx.newCDPSession(page);await session.send('Performance.enable');
const start=performance.now();await page.goto(origin+'/client/dashboard');await page.locator('.ab-metric').first().waitFor();await page.waitForFunction(()=>document.querySelector('.ab-metric strong')?.textContent?.trim()!=='—');
out.browser.initialReadyMs=Math.round(performance.now()-start);await page.waitForTimeout(1200);out.browser.initialRequests=[...requests];out.browser.longTasks=await page.evaluate(()=>window.__longTasks);
await page.goto(origin+'/client/certificates');await page.getByRole('combobox',{name:'Category',exact:true}).waitFor();const mark=requests.length;const f=performance.now();const changed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/client/axis'&&new URL(r.url()).searchParams.get('category')==='Category I');await page.getByRole('combobox',{name:'Category',exact:true}).selectOption('Category I');await changed;await page.waitForFunction(()=>document.querySelector('.ab-page')?.getAttribute('aria-busy')==='false');out.browser.filterReadyMs=Math.round(performance.now()-f);out.browser.filterRequests=requests.slice(mark);
out.browser.failedRequests=failures;out.browser.renderMetrics=(await session.send('Performance.getMetrics')).metrics.filter(x=>['TaskDuration','ScriptDuration','RecalcStyleCount','LayoutCount'].includes(x.name));await browser.close();
writeFileSync(`artifacts/performance/${phase}.json`,JSON.stringify(out,null,2));console.log(JSON.stringify({phase,api:out.api.map(x=>({query:x.query,ms:x.ms,bytes:x.bytes})),cachedRequestMs:out.cachedRequestMs,browser:out.browser,mongo:out.mongo.map(x=>({collection:x.collection,query:x.query,executionMs:x.executionMs,docsExamined:x.docsExamined,keysExamined:x.keysExamined,returned:x.returned}))},null,2));
