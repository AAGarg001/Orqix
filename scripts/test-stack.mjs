import {tmpdir} from 'node:os';
import {rmSync} from 'node:fs';
import {spawn,execFile} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const env={...process.env,NODE_ENV:'test',METADATA_STORE:'memory',ENFORCE_ASSIGNMENTS:'true',REGISTRATION_ENABLED:'false',PORT:'4100',PUBLIC_ORIGIN:'http://localhost:5175',WEB_PORT:'5175',API_PROXY:'http://127.0.0.1:4100',LOCAL_PRIVATE_DIRECTORY:path.join(tmpdir(),'orqix-e2e-'+randomUUID()),REDIS_URL:'',RAZORPAY_KEY_ID:'',RAZORPAY_KEY_SECRET:'',RAZORPAY_WEBHOOK_SECRET:''};
const children=[spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','apps/api/src/test-server.ts'],{env,stdio:'inherit',windowsHide:true}),spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1'],{env,cwd:path.resolve('apps/web'),stdio:'inherit',windowsHide:true})];
let stopped=false;function stop(){if(stopped)return;stopped=true;for(const child of children){if(!child.pid)continue;if(process.platform==='win32')execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{});else child.kill('SIGTERM');}setTimeout(()=>{rmSync(env.LOCAL_PRIVATE_DIRECTORY,{recursive:true,force:true});process.exit(0);},1000);}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);for(const c of children)c.on('exit',stop);
