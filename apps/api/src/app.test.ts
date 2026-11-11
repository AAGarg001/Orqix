import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Store, type Job } from "./store.js";
import { Runner } from "./runner.js";
import { createApp } from "./app.js";
const origin = "http://localhost:5173";
describe("real-worker API boundary", () => {
  let store: Store, runner: Runner, app: ReturnType<typeof createApp>;
  beforeEach(() => {
    store = new Store(true);
    runner = new Runner(store);
    // HTTP unit tests stub external execution only. Runtime has no fake-data mode.
    vi.spyOn(
      runner as unknown as { boot: (id: string) => Promise<void> },
      "boot",
    ).mockImplementation(async (id) => {
      await runner.update(id, {
        status: "awaiting_otp",
        stage: "Test transport ready",
      });
    });
    vi.spyOn(runner, "call").mockImplementation(async (_id, endpoint) => {
      if (endpoint === "/artifact")
        return new Response(new Uint8Array([80, 75, 3, 4]));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    });
    app = createApp(store, runner);
  });
  afterEach(async () => {
    await runner.shutdown();
    vi.restoreAllMocks();
  });
  async function account(email = "operator@example.com") {
    const agent = request.agent(app);
    expect(
      (
        await agent
          .post("/api/auth/register")
          .set("Origin", origin)
          .send({ name: "Operator", email, password: "a-strong-password-123" })
      ).status,
    ).toBe(200);
    return agent;
  }
  async function job(agent: ReturnType<typeof request.agent>) {
    const r = await agent
      .post("/api/jobs")
      .set("Origin", origin)
      .send({ name: "CPCB extraction", mode: "available" });
    expect(r.status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 10));
    return r.body.job.id as string;
  }
  it("returns a guest session but protects jobs", async () => {
    expect((await request(app).get("/api/me")).body.user).toBeNull();
    expect((await request(app).get("/api/jobs")).status).toBe(401);
  });
  it("accepts loopback alias and rejects unrelated origins", async () => {
    const agent = await account();
    expect(
      (
        await agent
          .post("/api/auth/login")
          .set("Origin", "http://127.0.0.1:5173")
          .send({
            email: "operator@example.com",
            password: "a-strong-password-123",
          })
      ).status,
    ).toBe(200);
    expect(
      (
        await agent
          .post("/api/auth/logout")
          .set("Origin", "https://evil.example")
          .send({})
      ).status,
    ).toBe(403);
  });
  it("isolates jobs and portal actions between owners", async () => {
    const a = await account(),
      b = await account("other@example.com"),
      id = await job(a);
    expect((await b.get(`/api/jobs/${id}`)).status).toBe(404);
    expect(
      (await b.post(`/api/jobs/${id}/open`).set("Origin", origin).send({}))
        .status,
    ).toBe(404);
    expect((await b.get("/api/jobs")).body.jobs).toEqual([]);
  });
  it("opens CPCB through the worker and never stores portal credentials", async () => {
    const agent = await account(),
      id = await job(agent);
    expect(
      (await agent.post(`/api/jobs/${id}/open`).set("Origin", origin).send({}))
        .status,
    ).toBe(200);
    expect(runner.call).toHaveBeenCalledWith(id, "/open", {});
    await agent
      .post(`/api/jobs/${id}/login`)
      .set("Origin", origin)
      .send({ userId: "portal-user", password: "portal-secret" });
    expect(runner.call).toHaveBeenCalledWith(id, "/login", {
      userId: "portal-user",
      password: "portal-secret",
    });
    expect(JSON.stringify(await store.job(id))).not.toContain("portal-secret");
  });
  it("requires verification before real run and rejects duplicate Run", async () => {
    const agent = await account(),
      id = await job(agent);
    expect(
      (await agent.post(`/api/jobs/${id}/run`).set("Origin", origin).send({}))
        .status,
    ).toBe(409);
    await agent.post(`/api/jobs/${id}/verify`).set("Origin", origin).send({});
    const results = await Promise.all([
      agent.post(`/api/jobs/${id}/run`).set("Origin", origin).send({}),
      agent.post(`/api/jobs/${id}/run`).set("Origin", origin).send({}),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(runner.call).toHaveBeenCalledWith(id, "/run", { mode: "available" });
  });
  it("propagates verification failure without pretending login succeeded", async () => {
    const agent = await account(),
      id = await job(agent);
    vi.mocked(runner.call).mockRejectedValueOnce(
      Object.assign(new Error("Complete CPCB OTP login first."), {
        status: 409,
      }),
    );
    expect(
      (
        await agent
          .post(`/api/jobs/${id}/verify`)
          .set("Origin", origin)
          .send({})
      ).status,
    ).toBe(409);
    expect((await store.job(id))?.status).toBe("awaiting_otp");
  });
  it("enforces capacity and prevents cancelled sessions running", async () => {
    const agent = await account(),
      id = await job(agent);
    await job(agent);
    expect(
      (
        await agent
          .post("/api/jobs")
          .set("Origin", origin)
          .send({ name: "Third extraction", mode: "all" })
      ).status,
    ).toBe(429);
    await agent.post(`/api/jobs/${id}/cancel`).set("Origin", origin).send({});
    expect(
      (await agent.post(`/api/jobs/${id}/run`).set("Origin", origin).send({}))
        .status,
    ).toBe(409);
  });
  it("requires an actual ready artifact and invalidates it on deletion", async () => {
    const agent = await account(),
      id = await job(agent);
    expect((await agent.get(`/api/jobs/${id}/download`)).status).toBe(410);
    await runner.update(id, {
      status: "completed",
      artifact: true,
      downloadName: 'Test Entity_PIBO_2026-11-03_12-30-15.xlsx',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    const download = await agent.get(`/api/jobs/${id}/download`);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('Test Entity_PIBO_2026-11-03_12-30-15.xlsx');
    await vi.waitFor(()=>expect(runner.call).toHaveBeenCalledWith(id,'/artifact/consume',{downloadName:'Test Entity_PIBO_2026-11-03_12-30-15.xlsx'}));
    await vi.waitFor(async()=>expect((await store.job(id))?.artifact).toBe(false));
    await agent.delete(`/api/jobs/${id}/artifact`).set("Origin", origin);
    expect((await agent.get(`/api/jobs/${id}/download`)).status).toBe(410);
  });
  it("invalidates authentication on logout", async () => {
    const agent = await account();
    await agent.post("/api/auth/logout").set("Origin", origin).send({});
    expect((await agent.get("/api/jobs")).status).toBe(401);
  });
});
