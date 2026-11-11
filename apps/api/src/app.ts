import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { config } from "./config.js";
import { allowedOrigin } from "./origin.js";
import { BrowserTickets } from "./browser-access.js";
import {
  hashPassword,
  checkPassword,
  newToken,
  tokenHash,
  requestUser,
} from "./auth.js";
import { active, type Job, type Store } from "./store.js";
import type { Runner } from "./runner.js";
import { EnterpriseService, failure } from "./enterprise/service.js";
import { Repository } from "./enterprise/repository.js";
import { PrivateFiles } from './enterprise/files.js';
import pino from 'pino';
import { enterpriseRouter } from "./enterprise/router.js";
import { ClientService } from './saas/service.js';
import { BillingService } from './saas/billing.js';
import { clientRouter, saasAdminRouter } from './saas/router.js';
import {axisInternalRouter} from './axis/router.js';
import {AxisService} from './axis/service.js';
import {
  can,
  publicUser,
  requirePermission,
} from "./enterprise/permissions.js";
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(10).max(128),
});
export function createApp(store: Store, runner: Runner) {
  const downloadCleanup = new Set<string>();
  const app = express();
  const browserTickets = new BrowserTickets();
  app.locals.browserTickets = browserTickets;
  const service = new EnterpriseService(new Repository(store.memory), store);
  app.locals.enterprise = service;
  const clients=new ClientService(service), billing=new BillingService(clients);
  app.locals.clients=clients;app.locals.billing=billing;app.locals.axis=new AxisService(clients);
  const roleCache=new Map<string,{expires:number;permissions:string[]|null}>();
  store.roleResolver=async role=>{const cached=roleCache.get(role);if(cached&&cached.expires>Date.now())return cached.permissions;const record=(await service.repo.list('roles',{roleKey:role}))[0];const permissions=record?(record.permissions as string[]):null;roleCache.set(role,{expires:Date.now()+5000,permissions});return permissions;};
  app.locals.clearRoleCache=()=>roleCache.clear();
  const privateFiles=new PrivateFiles();
  runner.onJobState = async job => {
    await service.onJob(job);
    await clients.onJob(job);
    if(job.kind==='upload'||job.kind==='delete') if(job.events?.length){const stored=await service.repo.list('botjobevents',{jobId:job.id});const last=Math.max(0,...stored.map(e=>Number(e.sequence)));for(const event of job.events.filter(e=>e.sequence>last))await service.repo.create('botjobevents',{jobId:job.id,assignmentId:job.assignmentId,ownerId:job.userId,...event});}
    if(job.kind==='upload'&&job.artifact&&job.assignmentId&&['completed','partial'].includes(job.status)){const stored=await privateFiles.put(await runner.artifact(job.id),`ORQIX_${job.kind}_${job.id.slice(0,8)}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');await service.repo.create('filerecords',{...stored,jobId:job.id,assignmentId:job.assignmentId,ownerId:job.userId,purpose:'bot-output'});}
  };
  const logger=pino({level:process.env.LOG_LEVEL??'info',redact:['password','authorization','cookie','token']});
  app.disable("x-powered-by");
  if (config.TRUST_PROXY_HOPS) app.set("trust proxy", config.TRUST_PROXY_HOPS);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.post('/api/billing/razorpay/webhook',express.raw({type:'application/json',limit:'256kb'}),async(req,res)=>{res.json(await billing.webhook(req.body,req.get('X-Razorpay-Signature')??'',req.get('X-Razorpay-Event-Id')));});
  app.use(express.json({ limit: "256kb" }), cookieParser());
  app.use((req,res,next)=>{res.on('finish',()=>{if(process.env.NODE_ENV!=='test')logger.info({method:req.method,path:req.path,status:res.statusCode,actorId:res.locals.user?.id},'request');});next();});
  // Coarse edge protection; authenticated limits below are per user so operators
  // sharing one office NAT do not accidentally rate-limit each other.
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 10000,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use((req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !allowedOrigin(req.get("Origin"))
    ) {
      res.status(403).json({ error: "Request origin is not allowed." });
      return;
    }
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.status(store.healthy() ? 200 : 503).json({
      ok: store.healthy(),
      workerRuntime: config.WORKER_RUNTIME,
      metadataStore: config.METADATA_STORE,
    }),
  );
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 150,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const cookieOptions = {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: "strict" as const,
    path: "/",
  };
  app.post("/api/auth/setup-password", authLimit, async (req, res) => {
    const input = z
      .object({
        token: z.string().min(32).max(128),
        password: z.string().min(14).max(128),
      })
      .parse(req.body);
    await service.setupPassword(input.token, input.password);
    res.json({ ok: true });
  });
  app.post("/api/auth/:action", authLimit, async (req, res) => {
    const action = z.string().parse(req.params.action);
    if (action === "logout") {
      const token = req.cookies.session;
      if (token) await store.deleteSession(tokenHash(token));
      res.clearCookie("session", cookieOptions).json({ ok: true });
      return;
    }
    if (!["login", "register"].includes(action)) {
      res.sendStatus(404);
      return;
    }
    const input = credentials.parse(req.body);
    let user;
    if (action === "register") {
      if (!config.REGISTRATION_ENABLED) {
        res.status(403).json({
          error:
            "Account registration is disabled. Contact your administrator.",
        });
        return;
      }
      const name = z.string().trim().min(2).max(80).parse(req.body.name);
      user = await store.createUser({
        name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
      });
    } else {
      user = await store.userByEmail(input.email);
      // A dummy hash keeps missing-user responses on the same expensive path.
      const valid = await checkPassword(
        input.password,
        user?.passwordHash ??
          "00000000000000000000000000000000:" + "00".repeat(64),
      );
      if (
        !user ||
        !valid ||
        user.active === false ||
        (user.accountKind==='client' && req.body.portal!=='client') ||
        (user.accountKind!=='client' && req.body.portal==='client') ||
        (req.body.portal === "admin" && !can(user, "users.create"))
      ) {
        res.status(401).json({ error: "Email or password is incorrect." });
        return;
      }
    }
    const token = newToken();
    const maxAge = req.body.remember==='on'?30*86400000:config.SESSION_HOURS * 3600000;
    await store.saveSession({
      id: tokenHash(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + maxAge),
    });
    await service.audit(user,'auth.login',user.id,{portal:req.body.portal??'user'});
    res.cookie("session", token, { ...cookieOptions, maxAge }).json({
      user: publicUser(user),
      workerRuntime: config.WORKER_RUNTIME,
      metadataStore: config.METADATA_STORE,
    });
  });
  app.get("/api/me", async (req, res) => {
    const user = await requestUser(req, store);
    res.json({
      user: user ? publicUser(user) : null,
      workerRuntime: config.WORKER_RUNTIME,
      metadataStore: config.METADATA_STORE,
      retentionMinutes: config.ARTIFACT_TTL_MINUTES,
      maxJobsPerUser: config.MAX_JOBS_PER_USER,
    });
  });
  app.use("/api", async (req, res, next) => {
    const user = await requestUser(req, store, session => {res.locals.authenticatedSession=session;});
    if (!user) {
      res.status(401).json({ error: "Please sign in to continue." });
      return;
    }
    res.locals.user = user;
    if(user.accountKind==='client'&&!req.path.startsWith('/client/')&&req.path!=='/profile/password'){
      res.status(403).json({error:'Client identities cannot access internal workspace endpoints.'});return;
    }
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      // Screenshot/viewport sweeps reuse one administrator in the isolated
      // in-memory harness. Real deployments retain the per-user budget.
      limit: process.env.NODE_ENV === "test" && store.memory ? 10000 : 240,
      keyGenerator: (_req, res) => res.locals.user.id as string,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use('/api/client',clientRouter(clients,billing));
  app.use('/api/axis',axisInternalRouter(clients));
  app.use('/api/saas',saasAdminRouter(clients,billing));
  app.use("/api/platform", enterpriseRouter(service, runner));
  app.post('/api/profile/password',async(req,res)=>{const input=z.object({currentPassword:z.string(),password:z.string().min(14).max(128)}).parse(req.body);if(!await checkPassword(input.currentPassword,res.locals.user.passwordHash))failure('Current password is incorrect.',400);await store.updateUser(res.locals.user.id,{passwordHash:await hashPassword(input.password)});await store.deleteUserSessions(res.locals.user.id);await service.audit(res.locals.user,'profile.password_changed',res.locals.user.id);res.clearCookie('session',cookieOptions).json({ok:true});});
  app.get('/api/extraction-history', async (_req,res)=>res.json({runs:await store.extractionHistory(res.locals.user.id)}));
  app.get("/api/jobs", async (_req, res) => {const jobs=await store.list(res.locals.user.id),allowed=config.ENFORCE_ASSIGNMENTS?new Set((await service.assignments(res.locals.user)).map(a=>a.id)):null;res.json({jobs:allowed?jobs.filter(j=>allowed.has(j.assignmentId??'')):jobs});});
  app.get("/api/capacity", async (_req, res) => {
    const jobs = await store.pending();
    res.json({
      active: jobs.filter((j) => active(j.status)).length,
      total: config.WORKER_RUNTIME === "hosted" ? 1 : config.MAX_CONCURRENT_JOBS,
    });
  });
  app.get("/api/events", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const sessionToken = req.cookies.session as string;
    const timer = setInterval(() => {
      void (async () => {
        const session = await store.session(tokenHash(sessionToken));
        if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
          res.end();
          return;
        }
        res.write(`event: refresh\ndata: ${Date.now()}\n\n`);
      })().catch(() => res.end());
    }, 2000);
    res.write("event: refresh\ndata: connected\n\n");
    req.on("close", () => clearInterval(timer));
  });
  app.post("/api/jobs", async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(80),
        mode: z.enum(["all", "available", "combined"]),
        assignmentId: z.uuid().optional(),
        kind: z.enum(["extract", "upload", "delete"]).default("extract"),
      })
      .parse(req.body);
    const now = new Date().toISOString();
    const permission =
      input.kind === "upload"
        ? "bot.upload.execute"
        : input.kind === "delete"
          ? "bot.delete.request"
          : "bot.extract.execute";
    requirePermission(res.locals.user, permission);
    if (config.ENFORCE_ASSIGNMENTS && !input.assignmentId)
      failure(
        "Select an authorized client/CPCB assignment before starting.",
        400,
      );
    let accountId: string | undefined;
    if (input.assignmentId) {
      const a = await service.assignment(
        res.locals.user,
        input.assignmentId,
        true,
      );
      accountId = String(a.accountId);
      const account = await service.repo.get("cpcbaccounts", accountId);
      if (!account || account.active === false)
        failure("CPCB account is inactive.");
      if(input.kind!=='extract'&&!account.applicationId)failure('Admin must configure the expected portal Application ID for this CPCB account before upload/deletion.');
    }
    const job: Job = {
      ...input,
      accountId,
      id: randomUUID(),
      userId: res.locals.user.id,
      status: "starting",
      stage: "Allocating an isolated browser…",
      records: 0,
      sections: [],
      createdAt: now,
      updatedAt: now,
      artifact: false,
    };
    await runner.reserve(job);
    if(input.kind === 'upload' || input.kind === 'delete') await service.audit(res.locals.user, "bot.session_created", job.id, {
      assignmentId: input.assignmentId ?? null,
      kind: input.kind,
    });
    res.status(201).json({ job });
  });
  app.use("/api/jobs/:id", async (req, res, next) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: "Job not found." });
      return;
    }
    const job = await store.job(id.data);
    if (!job || job.userId !== res.locals.user.id) {
      res.status(404).json({ error: "Job not found." });
      return;
    }
    if(job.assignmentId)await service.assignment(res.locals.user,job.assignmentId,true);
    res.locals.job = job;
    next();
  });
  app.get("/api/jobs/:id", (_req, res) => res.json({ job: res.locals.job }));
  app.post("/api/jobs/:id/browser-ticket", (req, res) => {
    const job: Job = res.locals.job;
    requirePermission(res.locals.user, job.kind === "upload" ? "bot.upload.execute" : job.kind === "delete" ? "bot.delete.request" : "bot.extract.execute");
    if (config.WORKER_RUNTIME === "local" || !["awaiting_otp", "ready"].includes(job.status) || !runner.browserBase(job.id))
      return res.status(409).json({ error: "Browser controls are available only while completing portal login." });
    const ticket = browserTickets.issue(res.locals.user.id, job.id, tokenHash(req.cookies.session));
    const base = new URL(config.BROWSER_PUBLIC_ORIGIN ?? config.PUBLIC_ORIGIN);
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    base.pathname = `/api/jobs/${job.id}/browser`;
    base.search = new URLSearchParams({ ticket }).toString();
    res.set("Cache-Control", "no-store").json({ websocketUrl: base.toString() });
  });
  app.post("/api/jobs/:id/open", async (_req, res) => {
    if (res.locals.job.status !== "awaiting_otp") {
      res.status(409).json({ error: "This job is not awaiting CPCB login." });
      return;
    }
    res.json(await runner.openPortal(res.locals.job.id));
  });
  app.post("/api/jobs/:id/login", async (req, res) => {
    const job: Job = res.locals.job;
    if (job.status !== "awaiting_otp") {
      res.status(409).json({ error: "This job is not awaiting login." });
      return;
    }
    const input = z
      .object({
        userId: z.string().min(1).max(128),
        password: z.string().min(1).max(256),
      })
      .parse(req.body);
    if (job.accountId) {
      const account = await service.repo.get("cpcbaccounts", job.accountId);
      if (!account || account.cpcbId !== input.userId)
        failure("Credentials must match the selected CPCB account.", 403);
    }
    await runner.login(job.id, input);
    res.json({ ok: true });
  });
  app.post("/api/jobs/:id/verify", async (_req, res) => {
    const job: Job = res.locals.job;
    if (job.status !== "awaiting_otp") {
      res.status(409).json({ error: "This job is not awaiting verification." });
      return;
    }
    const account=job.accountId?await service.repo.get('cpcbaccounts',job.accountId):null;
    await runner.verify(job.id,account?.applicationId?String(account.applicationId):undefined);
    res.json({ ok: true });
  });
  app.post("/api/jobs/:id/run", async (_req, res) => {
    if(downloadCleanup.has(res.locals.job.id)) failure('Download cleanup is finishing. Try again shortly.');
    requirePermission(res.locals.user, "bot.extract.execute");
    if (res.locals.job.kind === "upload" || res.locals.job.kind === "delete")
      failure("Use the authorized upload/deletion action.", 400);
    await runner.run(res.locals.job.id);
    res.json({ ok: true });
  });
  app.post("/api/jobs/:id/mode", async (req, res) => {
    if(downloadCleanup.has(res.locals.job.id)) failure('Download cleanup is finishing. Try again shortly.');
    requirePermission(res.locals.user, "bot.extract.execute");
    const input = z
      .object({ mode: z.enum(["all", "available"]) })
      .parse(req.body);
    const job = res.locals.job as Job;
    if (!["ready", "completed", "partial"].includes(job.status))
      failure("Complete portal login first.");
    await runner.update(job.id, {
      mode: input.mode,
      status: "ready",
      artifact: false,
    });
    res.json({ ok: true });
  });
  app.post("/api/jobs/:id/cancel", async (_req, res) => {
    if (!active(res.locals.job.status)) {
      res.status(409).json({ error: "This job has already ended." });
      return;
    }
    await runner.cancel(res.locals.job.id);
    res.json({ ok: true });
  });
  app.delete("/api/jobs/:id/artifact", async (_req, res) => {
    if (active(res.locals.job.status)) {
      res
        .status(409)
        .json({ error: "Cancel the job before deleting its files." });
      return;
    }
    await runner.deleteArtifact(res.locals.job.id);
    res.json({ ok: true });
  });
  app.get('/api/jobs/:id/preview',async(req,res)=>{if(!res.locals.job.artifact)failure('Workbook is not available.',410);const sheet=z.string().max(31).optional().parse(req.query.sheet);res.json(await(await runner.call(res.locals.job.id,'/preview'+(sheet?'?sheet='+encodeURIComponent(sheet):''))).json());});
  app.get("/api/jobs/:id/download", async (_req, res) => {
    const job: Job = res.locals.job;
    if(downloadCleanup.has(job.id)) failure('Download already in progress.');
    if (
      !job.artifact ||
      !job.expiresAt ||
      Date.parse(job.expiresAt) <= Date.now()
    ) {
      res
        .status(410)
        .json({ error: "This temporary Excel file is no longer available." });
      return;
    }
    downloadCleanup.add(job.id);
    let buffer: Buffer;
    try { buffer = await runner.artifact(job.id); }
    catch(error) {downloadCleanup.delete(job.id);throw error;}
    res.once('close',()=>{if(!res.writableFinished)downloadCleanup.delete(job.id);});
    if (job.kind !== 'upload' && job.kind !== 'delete' && job.downloadName) {
      res.once('finish', () => {
        void (async () => {
          for(let attempt=0;;attempt++) {
            try { await runner.call(job.id, '/artifact/consume', {downloadName: job.downloadName}); break; }
            catch(error) {if(attempt>=2)throw error;await new Promise(resolve=>setTimeout(resolve,500));}
          }
          for (const file of await service.repo.list('filerecords', {jobId:job.id, purpose:'bot-output'})) {
            await privateFiles.delete({key:String(file.key),storage:file.storage});
            await service.repo.update('filerecords',file.id,file.version,{deletedAt:new Date().toISOString(),size:0});
          }
          await runner.update(job.id,{artifact:false,stage:'Download delivered. Backend Excel deleted. Run again to rebuild both extractions.'});
        })().catch(async error=>{logger.error({jobId:job.id,error: error instanceof Error ? error.message : 'Cleanup failed'},'Post-download cleanup failed');await runner.destroy(job.id);await runner.update(job.id,{artifact:false,status:'failed',stage:'Cleanup required session shutdown. Open a new login to run again.'});}).finally(()=>downloadCleanup.delete(job.id));
      });
    } else res.once('finish',()=>downloadCleanup.delete(job.id));
    res
      .set({
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Cache-Control": "no-store",
      })
      .attachment((job.downloadName ?? `CPCB_${job.id.slice(0, 8)}.xlsx`).replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_'))
      .send(buffer);
  });
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
        return;
      }
      const e = error as { status?: number; code?: number; message?: string };
      const status = e.code === 11000 ? 409 : (e.status ?? 500);
      res.status(status).json({
        error:
          status >= 500
            ? status === 503
              ? e.message
              : "Service operation failed. Check server health or retry."
            : (e.message ?? "Request failed."),
      });
    },
  );
  return app;
}
