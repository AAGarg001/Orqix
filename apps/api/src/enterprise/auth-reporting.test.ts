import {beforeEach,describe,expect,it} from 'vitest';
import request from 'supertest';
import {Store,type User} from '../store.js';
import {Runner} from '../runner.js';
import {createApp} from '../app.js';
import {hashPassword,newToken,tokenHash} from '../auth.js';
import {Repository} from './repository.js';
import {EnterpriseService} from './service.js';
import {Reports,weeklyPeriod,escapeHtml} from './intelligence.js';
const origin='http://localhost:5173';
describe('active accounts, role portals and report scope',()=>{
 let store:Store,app:ReturnType<typeof createApp>;
 beforeEach(()=>{store=new Store(true);app=createApp(store,new Runner(store));});
 it('rejects inactive login and employee access to admin login',async()=>{await store.createUser({name:'Inactive',email:'inactive@test.example',role:'executive',active:false,passwordHash:await hashPassword('ValidPassword!2026')});await store.createUser({name:'Employee',email:'employee@test.example',role:'executive',active:true,passwordHash:await hashPassword('ValidPassword!2026')});for(const [email,portal] of [['inactive@test.example','user'],['employee@test.example','admin']])expect((await request(app).post('/api/auth/login').set('Origin',origin).send({email,password:'ValidPassword!2026',portal})).status).toBe(401);});
 it('rejects expired sessions on protected routes',async()=>{const u=await store.createUser({name:'User',email:'user@test.example',passwordHash:'x'}),token=newToken();await store.saveSession({id:tokenHash(token),userId:u.id,expiresAt:new Date(Date.now()-1000)});expect((await request(app).get('/api/jobs').set('Cookie',`session=${token}`)).status).toBe(401);});
 it('calculates the previous complete Monday–Sunday period in India',()=>{expect(weeklyPeriod(new Date('2026-11-02T03:30:00Z'))).toEqual({start:'2026-10-26',end:'2026-11-01'});});
 it('escapes untrusted client content for Outlook HTML',()=>{expect(escapeHtml('<img onerror="x">')).toBe('&lt;img onerror=&quot;x&quot;&gt;');});
 it('uses the actual reporting manager and prevents duplicate delivery',async()=>{const admin=await store.createUser({name:'Admin',email:'admin@test.example',passwordHash:'x',role:'super_admin'}),manager=await store.createUser({name:'Raj',email:'raj@test.example',passwordHash:'x',role:'manager'}),employee=await store.createUser({name:'Riya',email:'riya@test.example',passwordHash:'x',role:'executive',reportingManagerId:manager.id});const repo=new Repository(true),s=new EnterpriseService(repo,store),reports=new Reports(s);const preview=await reports.preview(admin,employee.id);expect(preview.recipient).toBe(manager.email);await repo.create('emaildeliverylogs',{deliveryKey:`${manager.id}:${employee.id}:${preview.period.start}`,status:'ACCEPTED'});await expect(reports.send(admin,employee.id)).rejects.toThrow('already attempted');const other=await store.createUser({name:'Other manager',email:'other@test.example',passwordHash:'x',role:'manager'});await expect(reports.preview(other,employee.id)).rejects.toThrow('outside your reporting scope');});
});
