import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { Store, type Job } from "./store.js";
import { Runner } from "./runner.js";
import { createApp } from "./app.js";
import { tokenHash } from "./auth.js";
import { config } from "./config.js";

const original = config.WORKER_RUNTIME, origin = "http://localhost:5173";
let store: Store, runner: Runner, app: ReturnType<typeof createApp>, job: Job;
beforeEach(async () => {
  config.WORKER_RUNTIME = "hosted";
  store = new Store(true); runner = new Runner(store); app = createApp(store, runner);
  const user = await store.createUser({ email: "browser@test.example", name: "Operator", passwordHash: "test", role: "super_admin", active: true });
  await store.saveSession({ id: tokenHash("browser-session"), userId: user.id, expiresAt: new Date(Date.now() + 60000) });
  job = { id: randomUUID(), userId: user.id, name: "Native browser", mode: "all", status: "awaiting_otp", stage: "Ready", artifact: false, records: 0, sections: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await store.saveJob(job);
  vi.spyOn(runner, "call").mockImplementation(async (_id, endpoint) => endpoint === "/browser/frame" ? new Response(new Uint8Array([137, 80, 78, 71])) : new Response(JSON.stringify({ ok: true })));
});
afterEach(() => { config.WORKER_RUNTIME = original; vi.restoreAllMocks(); });
it("preserves a temporary no-frame response without sending an empty PNG", async () => {
  vi.mocked(runner.call).mockResolvedValueOnce(new Response(null, { status: 204 }));
  const response = await request(app).get(`/api/jobs/${job.id}/browser/frame`).set("Cookie", "session=browser-session");
  expect(response.status).toBe(204);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.headers["content-type"]).toBeUndefined();
});
it("requires a current session, preserves private frames and rejects other job owners", async () => {
  expect((await request(app).get(`/api/jobs/${job.id}/browser/frame`)).status).toBe(401);
  const response = await request(app).get(`/api/jobs/${job.id}/browser/frame`).set("Cookie", "session=browser-session");
  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.headers["content-type"]).toContain("image/png");
  await store.saveJob({ ...job, userId: randomUUID() });
  expect((await request(app).get(`/api/jobs/${job.id}/browser/frame`).set("Cookie", "session=browser-session")).status).toBe(404);
});
it("validates browser input and rejects cross-origin requests", async () => {
  const url = `/api/jobs/${job.id}/browser/input`;
  expect((await request(app).post(url).set("Cookie", "session=browser-session").set("Origin", origin).send({ action: "text", text: "123456" })).status).toBe(200);
  expect(runner.call).toHaveBeenCalledWith(job.id, "/browser/input", { action: "text", text: "123456" });
  expect((await request(app).post(url).set("Cookie", "session=browser-session").set("Origin", "https://evil.example").send({ action: "text", text: "x" })).status).toBe(403);
  expect((await request(app).post(url).set("Cookie", "session=browser-session").set("Origin", origin).send({ action: "click", x: 99999, y: 0 })).status).toBe(400);
});
it("locks browser viewing and controls while extraction runs, and revokes access on logout", async () => {
  await store.saveJob({ ...job, status: "running" });
  expect((await request(app).get(`/api/jobs/${job.id}/browser/frame`).set("Cookie", "session=browser-session")).status).toBe(409);
  expect(runner.call).not.toHaveBeenCalled();
  await store.deleteSession(tokenHash("browser-session"));
  expect((await request(app).get(`/api/jobs/${job.id}/browser/frame`).set("Cookie", "session=browser-session")).status).toBe(401);
});
