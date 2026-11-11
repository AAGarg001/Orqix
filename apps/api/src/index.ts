import http from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "./config.js";
import { Store } from "./store.js";
import { Runner } from "./runner.js";
import { createApp } from "./app.js";
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
if (existsSync(path.join(webDist, "index.html"))) {
  app.use(express.static(webDist, { index: false }));
  app.get("/{*path}", (req, res) => {
    if (req.path.startsWith("/api/")) { res.sendStatus(404); return; }
    res.sendFile(path.join(webDist, "index.html"));
  });
} else {
  // Vercel serves the frontend independently in the Render deployment.
  app.get("/", (_req, res) => res.json({ service: "ORQIX API", health: "/api/health" }));
}
const server = http.createServer(app);
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
    setTimeout(() => process.exit(0), 8000).unref();
  });
