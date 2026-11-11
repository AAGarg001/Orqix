import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import httpProxy from "http-proxy";
import cookieParser from "cookie-parser";
import type { Request } from "express";
import { config } from "./config.js";
import { Store } from "./store.js";
import { Runner } from "./runner.js";
import { createApp } from "./app.js";
import { requestUser } from "./auth.js";
import { allowedOrigin } from "./origin.js";
import { startReportScheduler } from "./enterprise/intelligence.js";
const store = new Store(config.METADATA_STORE === "memory");
if(store.memory&&process.env.NODE_ENV!=='test')throw new Error('ORQIX application records require MongoDB. Memory storage is restricted to isolated automated tests.');
await store.connect(config.MONGODB_URI);
const runner = new Runner(store);
await runner.recover();
const app = createApp(store, runner);
await app.locals.enterprise.repo.initialize();
const reportsScheduler = await startReportScheduler(app.locals.enterprise);
const webDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../web/dist",
);
app.use(express.static(webDist, { index: false }));
app.get("/{*path}", (req, res) => {
  if (req.path.startsWith("/api/")) {
    res.sendStatus(404);
    return;
  }
  res.sendFile(path.join(webDist, "index.html"));
});
const server = http.createServer(app);
const proxy = httpProxy.createProxyServer({ ws: true });
proxy.on("error", (_error, _req, socket) => {
  if ("destroy" in socket) socket.destroy();
});
server.on("upgrade", (req, socket, head) => {
  void (async () => {
    if (!allowedOrigin(req.headers.origin)) {
      socket.destroy();
      return;
    }
    const match = req.url?.match(/^\/api\/jobs\/([a-f0-9-]{36})\/browser$/);
    if (!match || config.WORKER_RUNTIME !== "docker") {
      socket.destroy();
      return;
    }
    const request = req as Request;
    await new Promise<void>((resolve, reject) =>
      cookieParser()(request, {} as express.Response, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    const user = await requestUser(request, store),
      job = await store.job(match[1]);
    const base = runner.base(match[1]);
    if (
      !user ||
      !job ||
      job.userId !== user.id ||
      !base ||
      !["awaiting_otp", "ready", "running"].includes(job.status)
    ) {
      socket.destroy();
      return;
    }
    req.url = "/websockify";
    if(job.assignmentId)await app.locals.enterprise.assignment(user,job.assignmentId,true);
    proxy.ws(req, socket, head, { target: base.replace(":8000", ":6080") });
    const timer = setInterval(() => {
      void (async () => {
        const current = await requestUser(request, store);
        const freshJob = await store.job(job.id);
        if (
          !current ||
          !freshJob ||
          !["awaiting_otp", "ready", "running"].includes(freshJob.status)
        )
          socket.destroy();
      })().catch(() => socket.destroy());
    }, 5000);
    socket.on("close", () => clearInterval(timer));
  })().catch(() => socket.destroy());
});
let ticking = false;
const timer = setInterval(() => {
  if (ticking) return;
  ticking = true;
  void runner
    .tick()
    .catch(() => console.error("Worker maintenance failed."))
    .finally(() => {
      ticking = false;
    });
}, 2000);
const axisTimer=setInterval(()=>{void app.locals.axis.sweep().catch(()=>console.error('Axis retention cleanup failed.'));},60000);
axisTimer.unref();
server.listen(config.PORT, "0.0.0.0", () =>
  console.log(
    `CPCB API listening on port ${config.PORT}; actual ${config.WORKER_RUNTIME} Selenium workers`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    clearInterval(axisTimer);
    void Promise.all([runner.shutdown(), reportsScheduler?.close()]).finally(
      () => server.close(() => process.exit(0)),
    );
    setTimeout(() => process.exit(0), 5000).unref();
  });
