import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { Store, type Job } from "./store.js";
import { Runner } from "./runner.js";

it("counts retained hosted browser sessions toward capacity until explicit cleanup", async () => {
  const original = config.WORKER_RUNTIME;
  config.WORKER_RUNTIME = "hosted";
  const store = new Store(true), runner = new Runner(store);
  const boot = vi.spyOn(runner as unknown as { boot(id: string): Promise<void> }, "boot").mockResolvedValue();
  const job = (): Job => ({ id: randomUUID(), userId: randomUUID(), name: "Capacity test", mode: "all", status: "starting", stage: "Starting", records: 0, sections: [], artifact: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  try {
    const first = job(), second = job();
    await runner.reserve(first);
    await runner.update(first.id, { status: "completed", artifact: true });
    await expect(runner.reserve(second)).rejects.toMatchObject({ status: 503 });
    expect(boot).toHaveBeenCalledTimes(1);
    await runner.deleteArtifact(first.id);
    await expect(runner.reserve(second)).resolves.toBeUndefined();
  } finally {
    await runner.shutdown();
    config.WORKER_RUNTIME = original;
    vi.restoreAllMocks();
  }
});
