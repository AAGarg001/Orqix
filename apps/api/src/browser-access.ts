import { randomBytes, createHash } from "node:crypto";
import type { Server } from "node:http";
import type { Duplex } from "node:stream";
import cookieParser from "cookie-parser";
import type { Request, Response } from "express";
import httpProxy from "http-proxy";
import { config } from "./config.js";
import { allowedOrigin } from "./origin.js";
import { requestUser } from "./auth.js";
import type { Store, User } from "./store.js";
import type { Runner } from "./runner.js";
import { requirePermission } from "./enterprise/permissions.js";

type Claim = { userId: string; jobId: string; sessionHash: string; expires: number };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export class BrowserTickets {
  private claims = new Map<string, Claim>();
  issue(userId: string, jobId: string, sessionHash: string) {
    for (const [key, claim] of this.claims)
      if (claim.expires <= Date.now() || claim.jobId === jobId) this.claims.delete(key);
    if (this.claims.size >= 1000) throw Object.assign(new Error("Browser capacity unavailable."), { status: 503 });
    const ticket = randomBytes(32).toString("hex");
    this.claims.set(hash(ticket), { userId, jobId, sessionHash, expires: Date.now() + 45000 });
    return ticket;
  }
  consume(ticket: string, jobId: string) {
    const key = hash(ticket), claim = this.claims.get(key);
    this.claims.delete(key);
    return claim && claim.expires > Date.now() && claim.jobId === jobId ? claim : null;
  }
}

export function installBrowserProxy(server: Server, store: Store, runner: Runner, tickets: BrowserTickets,
  assignment: (user: User, id: string) => Promise<unknown>) {
  const proxy = httpProxy.createProxyServer({ ws: true });
  const sockets = new Map<string, Set<Duplex>>();
  runner.onBrowserLock = id => { for (const socket of sockets.get(id) ?? []) socket.destroy(); };
  proxy.on("error", (_error, _req, socket) => { if ("destroy" in socket) socket.destroy(); });
  server.on("upgrade", (req, socket, head) => {
    void (async () => {
      socket.on("error", () => {});
      if (!allowedOrigin(req.headers.origin) || config.WORKER_RUNTIME === "local") return socket.destroy();
      const url = new URL(req.url ?? "/", "http://localhost");
      const match = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})\/browser$/);
      if (!match) return socket.destroy();
      const id = match[1], ticket = url.searchParams.get("ticket");
      let user: User | null, sessionHash: string | undefined;
      if (ticket) {
        const claim = tickets.consume(ticket, id);
        if (!claim) return socket.destroy();
        sessionHash = claim.sessionHash;
        const session = await store.session(sessionHash);
        if (!session || session.userId !== claim.userId || new Date(session.expiresAt).getTime() <= Date.now()) return socket.destroy();
        user = await store.user(claim.userId);
      } else {
        // Existing same-origin Docker deployments retain cookie authentication.
        if (config.WORKER_RUNTIME !== "docker") return socket.destroy();
        await new Promise<void>((resolve, reject) => cookieParser()(req as Request, {} as Response, error => error ? reject(error) : resolve()));
        user = await requestUser(req as Request, store);
      }
      const authorized = async () => {
        if (!user || user.active === false) return false;
        const current = await store.user(user.id), job = await store.job(id);
        if (!current || current.active === false || !job || job.userId !== current.id || !["awaiting_otp", "ready"].includes(job.status) || !runner.browserBase(id)) return false;
        if (sessionHash) {
          const session = await store.session(sessionHash);
          if (!session || session.userId !== current.id || new Date(session.expiresAt).getTime() <= Date.now()) return false;
        } else if (!await requestUser(req as Request, store)) return false;
        if (job.assignmentId) await assignment(current, job.assignmentId);
        requirePermission(current, job.kind === "upload" ? "bot.upload.execute" : job.kind === "delete" ? "bot.delete.request" : "bot.extract.execute");
        return true;
      };
      if (!await authorized()) return socket.destroy();
      const group = sockets.get(id) ?? new Set<Duplex>();
      sockets.set(id, group); group.add(socket);
      req.url = "/websockify"; // Never forward the login ticket to the worker.
      proxy.ws(req, socket, head, { target: runner.browserBase(id)! });
      const timer = setInterval(() => { void authorized().then(ok => { if (!ok) socket.destroy(); }).catch(() => socket.destroy()); }, 1000);
      timer.unref();
      socket.on("close", () => { clearInterval(timer); group.delete(socket); if (!group.size) sockets.delete(id); });
    })().catch(() => socket.destroy());
  });
}
