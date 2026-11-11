// Isolated automated-test harness. Never imported by index.ts or production.
import http from 'node:http';
import { Store,type Job } from './store.js';
import { Runner } from './runner.js';
import { createApp } from './app.js';
import { hashPassword } from './auth.js';
if(process.env.NODE_ENV!=='test'||process.env.METADATA_STORE!=='memory')throw new Error('Test harness is restricted to NODE_ENV=test and in-memory data.');
const store=new Store(true);
await store.createUser({name:'Test Administrator',email:'admin@orqix.test',passwordHash:await hashPassword('OrqixTest!2026Secure'),role:'super_admin',active:true,username:'test.admin'});
class TestPortalRunner extends Runner {
 private sessions=new Set<string>();
 private modes=new Map<string,Set<string>>();
 async reserve(job:Job){await store.saveJob({...job,status:'awaiting_otp',stage:'Test portal adapter awaiting manual login'});}
 async login(id:string,_credentials:{userId:string;password:string}){this.sessions.add(id);await this.update(id,{stage:'Test portal login controls ready'});}
 async verify(id:string){if(!this.sessions.has(id))throw Object.assign(new Error('Complete OTP login in the browser first'),{status:409});await this.update(id,{status:'ready',stage:'Test portal session verified'});}
 async run(id:string){const job=await store.job(id);const modes=this.modes.get(id)??new Set<string>();modes.add(job!.mode);this.modes.set(id,modes);await this.update(id,{status:'running',stage:'Test adapter extraction'});await this.update(id,{status:'completed',artifact:modes.has('all')&&modes.has('available'),stage:'Test extraction done',sections:[],records:1});}
 async destroy(_id:string){}
 async shutdown(){}
}
const app=createApp(store,new TestPortalRunner(store));
const server=http.createServer(app);server.listen(Number(process.env.PORT??4100),'127.0.0.1',()=>console.log('Isolated test API ready'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
