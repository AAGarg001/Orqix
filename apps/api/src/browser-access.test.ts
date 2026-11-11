import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { BrowserTickets, installBrowserProxy } from "./browser-access.js";
import { Store, type Job } from "./store.js";
import { Runner } from "./runner.js";
import { createApp } from "./app.js";
import { tokenHash } from "./auth.js";
import { config } from "./config.js";

describe("single-use browser tickets", () => {
  afterEach(() => vi.useRealTimers());
  it("binds tickets to a job, expires them and rejects replay", () => {
    vi.useFakeTimers();
    const tickets = new BrowserTickets();
    const ticket = tickets.issue("user", "job", "session-hash");
    expect(tickets.consume(ticket, "job")).toMatchObject({ userId: "user", sessionHash: "session-hash" });
    expect(tickets.consume(ticket, "job")).toBeNull();
    const wrong = tickets.issue("user", "job", "session-hash");
    expect(tickets.consume(wrong, "other-job")).toBeNull();
    const expired = tickets.issue("user", "job", "session-hash");
    vi.advanceTimersByTime(45001);
    expect(tickets.consume(expired, "job")).toBeNull();
  });
});

describe("hosted browser authentication", () => {
  const originalRuntime = config.WORKER_RUNTIME;
  const originalOrigin = config.BROWSER_PUBLIC_ORIGIN;
  const origin = "http://localhost:5173", rawSession = "browser-test-session";
  let store: Store, runner: Runner, app: ReturnType<typeof createApp>, server: Server, upstream: Server;
  let id: string, port: number;
  const sockets = new Set<Duplex>();
  beforeEach(async () => {
    config.WORKER_RUNTIME = "hosted";
    config.BROWSER_PUBLIC_ORIGIN = "https://api.example.test";
    store = new Store(true); runner = new Runner(store); app = createApp(store, runner);
    const user = await store.createUser({ email: "browser@test.example", name: "Browser operator", passwordHash: "test", role: "super_admin", active: true });
    await store.saveSession({ id: tokenHash(rawSession), userId: user.id, expiresAt: new Date(Date.now() + 60000) });
    id = randomUUID();
    const now = new Date().toISOString();
    await store.saveJob({ id, userId: user.id, name: "Browser test", mode: "all", status: "awaiting_otp", stage: "Ready", artifact: false, records: 0, sections: [], createdAt: now, updatedAt: now });
    upstream = createServer();
    upstream.on("upgrade", (_req, socket) => {
      sockets.add(socket);
      socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
    });
    await new Promise<void>(resolve => upstream.listen(0, "127.0.0.1", resolve));
    vi.spyOn(runner, "browserBase").mockReturnValue(`http://127.0.0.1:${(upstream.address() as { port: number }).port}`);
    server = createServer(app);
    installBrowserProxy(server, store, runner, app.locals.browserTickets, async () => {});
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  });
  afterEach(async () => {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => upstream.close(() => resolve()))]);
    config.WORKER_RUNTIME = originalRuntime; config.BROWSER_PUBLIC_ORIGIN = originalOrigin;
    vi.restoreAllMocks();
  });
  const ticket = async () => {
    const response = await request(app).post(`/api/jobs/${id}/browser-ticket`).set("Origin", origin).set("Cookie", `session=${rawSession}`).send({});
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const url = new URL(response.body.websocketUrl);
    expect(url.origin).toBe("wss://api.example.test");
    return url.search;
  };
  const connect = (query: string, requestOrigin = origin) => new Promise<Duplex | null>((resolve) => {
    const req = httpRequest({ host: "127.0.0.1", port, path: `/api/jobs/${id}/browser${query}`, headers: {
      Origin: requestOrigin, Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", "Sec-WebSocket-Version": "13",
    } });
    req.on("upgrade", (_res, socket) => { sockets.add(socket); resolve(socket); });
    req.on("error", () => resolve(null));
    req.on("response", res => { res.resume(); resolve(null); });
    req.end();
  });
  it("rejects anonymous requests and other owners", async () => {
    expect((await request(app).post(`/api/jobs/${id}/browser-ticket`).set("Origin", origin).send({})).status).toBe(401);
    const other = await store.createUser({ email: "other@test.example", name: "Other", passwordHash: "test" });
    await store.saveSession({ id: tokenHash("other-session"), userId: other.id, expiresAt: new Date(Date.now() + 60000) });
    expect((await request(app).post(`/api/jobs/${id}/browser-ticket`).set("Origin", origin).set("Cookie", "session=other-session").send({})).status).toBe(404);
  });
  it("authenticates direct cross-host sockets without third-party cookies and rejects replay", async () => {
    const query = await ticket();
    expect(await connect(query)).not.toBeNull();
    expect(await connect(query)).toBeNull();
  });
  it("rejects foreign origins and revoked sessions", async () => {
    expect(await connect(await ticket(), "https://evil.example")).toBeNull();
    const query = await ticket();
    await store.deleteSession(tokenHash(rawSession));
    expect(await connect(query)).toBeNull();
  });
  it("disconnects established browser access after logout and rejects control during extraction", async () => {
    const socket = await connect(await ticket());
    expect(socket).not.toBeNull();
    const closed = new Promise<void>(resolve => socket!.on("close", () => resolve()));
    await store.deleteSession(tokenHash(rawSession));
    await closed;
    const job = (await store.job(id)) as Job;
    await store.saveJob({ ...job, status: "running" });
    expect(await connect("?ticket=invalid")).toBeNull();
  });
  it("rejects a valid ticket if automation starts before the browser connects", async () => {
    const query = await ticket(), job = (await store.job(id)) as Job;
    await store.saveJob({ ...job, status: "running" });
    expect(await connect(query)).toBeNull();
    expect((await request(app).post(`/api/jobs/${id}/browser-ticket`).set("Origin", origin).set("Cookie", `session=${rawSession}`).send({})).status).toBe(409);
  });
});
