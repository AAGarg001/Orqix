import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { config } from "../config.js";
import { PrivateFiles } from "./files.js";

// Run against an isolated real database; never use the application's Atlas URI.
describe.runIf(!!process.env.MONGOD_BINARY)("MongoDB private files", () => {
  let processHandle: ChildProcess;
  let directory: string;
  const originalStorage = config.PRIVATE_FILE_STORAGE;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "orqix-gridfs-test-"));
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    processHandle = spawn(process.env.MONGOD_BINARY!, ["--dbpath", directory, "--bind_ip", "127.0.0.1", "--port", String(port)], {
      windowsHide: true,
      stdio: "ignore",
    });
    let launchError: Error | undefined;
    processHandle.on("error", (error) => { launchError = error; });
    await mongoose.connect(`mongodb://127.0.0.1:${port}/orqix_gridfs_test`, { serverSelectionTimeoutMS: 20000 });
    if (launchError) throw launchError;
    config.PRIVATE_FILE_STORAGE = "mongodb";
  }, 30000);

  afterAll(async () => {
    config.PRIVATE_FILE_STORAGE = originalStorage;
    await mongoose.disconnect();
    if (processHandle && processHandle.exitCode === null) {
      await new Promise<void>((resolve) => {
        processHandle.once("exit", () => resolve());
        processHandle.kill();
      });
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("persists files larger than a MongoDB document across storage instances, then deletes chunks", async () => {
    const buffer = randomBytes(17 * 1024 * 1024);
    const file = await new PrivateFiles().put(buffer, "evidence.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(file.storage).toBe("mongodb");
    expect(file.size).toBe(buffer.length);
    expect((await new PrivateFiles().get(file)).equals(buffer)).toBe(true);
    const db = mongoose.connection.db!;
    expect(await db.collection("orqix_private_files.chunks").countDocuments()).toBeGreaterThan(1);
    await new PrivateFiles().delete(file);
    expect(await db.collection("orqix_private_files.files").countDocuments()).toBe(0);
    expect(await db.collection("orqix_private_files.chunks").countDocuments()).toBe(0);
    await expect(new PrivateFiles().get(file)).rejects.toThrow();
    await expect(new PrivateFiles().delete(file)).resolves.toBeUndefined();
  });

  it("rejects invalid keys before accessing storage", async () => {
    await expect(new PrivateFiles().get({ key: "../private" , storage: "mongodb" })).rejects.toThrow("Invalid private file key");
    await expect(new PrivateFiles().delete({ key: "../private", storage: "mongodb" })).rejects.toThrow("Invalid private file key");
  });
});
