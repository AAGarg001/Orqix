import { spawn, execFile, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { mkdir, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from 'node:os';
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { active, type Job, type Store } from "./store.js";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
type Execution = {
  process?: ChildProcess;
  base?: string;
  token: string;
  directory?: string;
  born: number;
  cancelled?: boolean;
  polling?: boolean;
  heartbeatAt?: number;
};
async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Could not allocate worker port.");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}
export class Runner {
  onJobState?: (job: Job) => Promise<void>;
  private executions = new Map<string, Execution>();
  private locked = false;
  private runningClaims = new Set<string>();
  constructor(private store: Store) {}
  async reserve(job: Job) {
    if (this.locked)
      throw Object.assign(
        new Error("Capacity is being allocated. Please retry."),
        { status: 503 },
      );
    this.locked = true;
    try {
      if (config.WORKER_RUNTIME === "hosted" && this.executions.size >= 1)
        throw Object.assign(new Error("Close the existing browser session or clear its temporary files before starting another."), { status: 503 });
      const jobs = await this.store.pending();
      if (
        jobs.filter((j) => active(j.status)).length >=
        (config.WORKER_RUNTIME === "hosted" ? 1 : config.MAX_CONCURRENT_JOBS)
      )
        throw Object.assign(new Error("All execution slots are in use."), {
          status: 503,
        });
      if (
        jobs.filter((j) => j.userId === job.userId && active(j.status))
          .length >= config.MAX_JOBS_PER_USER
      )
        throw Object.assign(
          new Error("Your active-job limit has been reached."),
          { status: 429 },
        );
      await this.store.saveJob(job);
      this.executions.set(job.id, {
        born: Date.now(),
        token: randomBytes(32).toString("hex"),
      });
    } finally {
      this.locked = false;
    }
    void this.boot(job.id);
  }
  async update(id: string, patch: Partial<Job>) {
    const job = await this.store.job(id);
    if (job) {
      await this.store.saveJob({
        ...job,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      if ((patch.status && patch.status !== job.status) || patch.events)
        await this.onJobState?.({ ...job, ...patch });
    }
  }
  private async boot(id: string) {
    const execution = this.executions.get(id)!;
    try {
      {
        const port = await freePort();
        execution.directory = await mkdtemp(path.join(tmpdir(), 'orqix-worker-'));
        await mkdir(execution.directory, { recursive: true });
        if (execution.cancelled) return;
        const python =
          path.isAbsolute(config.PYTHON_EXECUTABLE) ||
          !/[\\/]/.test(config.PYTHON_EXECUTABLE)
            ? config.PYTHON_EXECUTABLE
            : path.resolve(root, config.PYTHON_EXECUTABLE);
        execution.process = spawn(
          python,
          [
            "-m",
            "uvicorn",
            "app:app",
            "--host",
            "127.0.0.1",
            "--port",
            String(port),
            "--no-access-log",
          ],
          {
            cwd: path.join(root, "workers"),
            windowsHide: true,
            detached: process.platform !== "win32",
            stdio: "ignore",
            env: {
              // Hosted worker processes do not need database, payment, storage
              // or mail credentials from the API environment.
              ...(config.WORKER_RUNTIME === "hosted" ? {
                PATH: process.env.PATH, LANG: "C.UTF-8", TZ: "UTC",
                LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH,
                CHROME_BINARY: process.env.CHROME_BINARY, CHROMEDRIVER_PATH: process.env.CHROMEDRIVER_PATH,
              } : process.env),
              WORKER_TOKEN: execution.token,
              WORKER_RUNTIME: config.WORKER_RUNTIME,
              WORKER_WATCHDOG: "true",
              WORK_DIR: execution.directory,
              LEGACY_SCRIPT: path.join(
                root,
                "commonportalscraper separate Available.py",
              ),
              OPERATIONS_SCRIPT: path.join(
                root,
                "commonportalpwpscraper 2.1.py",
              ),
              PYTHONUNBUFFERED: "1",
            },
          },
        );
        execution.process.on("error", () => {});
        execution.base = `http://127.0.0.1:${port}`;
      }
      let healthy = false;
      for (let n = 0; n < (config.WORKER_RUNTIME === "hosted" ? 180 : 45); n++) {
        if (execution.cancelled) return;
        if (
          execution.process &&
          (execution.process.exitCode !== null || !execution.process.pid)
        )
          throw new Error("Python worker exited.");
        try {
          await this.call(id, "/health");
          healthy = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      if (!healthy) throw new Error("Worker did not become ready.");
      if (execution.cancelled) return;
      await this.update(id, {
        status: "awaiting_otp",
        stage:
          config.WORKER_RUNTIME === "local"
            ? "Enter CPCB credentials. Open portal login launches real Chrome on this computer."
            : "Enter CPCB credentials to open your isolated portal browser.",
      });
    } catch {
      if (!execution.cancelled)
        await this.update(id, {
          status: "failed",
          stage: "Worker could not start.",
          error:
            config.WORKER_RUNTIME === "local"
              ? "Check PYTHON_EXECUTABLE and install workers/requirements.txt into that Python environment."
              : config.WORKER_RUNTIME === "hosted"
                ? "Cloud browser could not start. Check the native runtime, Python/browser dependencies and available server memory."
                : "Check Python and browser dependencies on the server.",
        });
      await this.destroy(id);
    }
  }
  async call(id: string, endpoint: string, body?: unknown) {
    const execution = this.executions.get(id);
    if (!execution?.base)
      throw Object.assign(new Error("Worker is not ready."), { status: 409 });
    const response = await fetch(execution.base + endpoint, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${execution.token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(endpoint === "/health" ? 2000 : 150000),
    });
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as {
        detail?: string;
      };
      throw Object.assign(
        new Error(
          result.detail ??
            "Worker operation failed. Check portal session and browser.",
        ),
        { status: response.status === 409 ? 409 : 502 },
      );
    }
    return response;
  }
  async login(id: string, credentials: { userId: string; password: string }) {
    await this.call(id, "/login", credentials);
    await this.update(id, {
      stage:
        "CPCB portal opened. Enter the client OTP in the browser, click portal Login, then Verify completed OTP login.",
    });
  }
  async openPortal(id: string) {
    return (await this.call(id, "/open", {})).json();
  }
  async sendFile(id: string, name: string, buffer: Buffer) {
    const execution = this.executions.get(id);
    if (!execution?.base)
      throw Object.assign(new Error("Worker is not ready."), { status: 409 });
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)]), name);
    const r = await fetch(execution.base + "/ops/file", {
      method: "POST",
      headers: { Authorization: `Bearer ${execution.token}` },
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok)
      throw Object.assign(
        new Error(
          "Worker rejected the file. Check file size/name and current state.",
        ),
        { status: 400 },
      );
    return r.json();
  }
  async verify(id: string,expectedApplicationId?:string) {
    const result=await(await this.call(id, "/verify", {})).json() as {applicationId?:string;entity?:Record<string,string>};
    if(expectedApplicationId&&result.applicationId!==expectedApplicationId)throw Object.assign(new Error('Logged-in application identity does not match the selected CPCB account. No automation was started.'),{status:409});
    await this.update(id, {
      status: "ready",
      stage:
        `CPCB login verified${result.entity?.['Entity Name']?': '+result.entity['Entity Name']:''}${result.applicationId?' · Application ID '+result.applicationId:''}. Ready for authorized automation.`,
    });
  }
  async run(id: string) {
    if (this.runningClaims.has(id))
      throw Object.assign(new Error("Extraction is already starting."), {
        status: 409,
      });
    this.runningClaims.add(id);
    try {
      const job = await this.store.job(id);
      if (!job || job.status !== "ready")
        throw Object.assign(
          new Error("Complete CPCB OTP login and verify the session first."),
          { status: 409 },
        );
      await this.update(id, {
        status: "running",
        stage: "Starting actual CPCB extraction…",
      });
      try {
        await this.call(id, "/run", { mode: job.mode });
      } catch (error) {
        await this.update(id, {
          status: "failed",
          stage: "Extraction could not start.",
        });
        await this.destroy(id);
        throw error;
      }
    } finally {
      this.runningClaims.delete(id);
    }
  }
  async tick() {
    for (const [id, execution] of this.executions) {
      const job = await this.store.job(id);
      if (!job) continue;
      if (job.expiresAt && Date.parse(job.expiresAt) <= Date.now()) {
        await this.destroy(id);
        await this.update(id, {
          artifact: false,
          stage: "Temporary files deleted after retention period.",
        });
        continue;
      }
      if (
        active(job.status) &&
        Date.now() - execution.born > config.JOB_TIMEOUT_MINUTES * 60000
      ) {
        await this.cancel(
          id,
          "Session timed out. Temporary browser and files deleted.",
        );
        continue;
      }
      if (
        job.status !== "starting" &&
        job.status !== "running" &&
        Date.now() - (execution.heartbeatAt ?? 0) > 15000
      ) {
        try {
          await this.call(id, "/health");
          execution.heartbeatAt = Date.now();
        } catch {
          if (!execution.cancelled)
            await this.update(id, {
              status: active(job.status) ? "failed" : job.status,
              artifact: false,
              stage: "CPCB worker closed. Start a new session.",
            });
          await this.destroy(id);
        }
      }
      if (job.status !== "running" || execution.polling) continue;
      execution.polling = true;
      try {
        const result = (await (await this.call(id, "/status")).json()) as {
          status: "running" | "completed" | "partial" | "failed";
          stage: string;
          records: number;
          sections: Job["sections"];
          artifact?: boolean;
          downloadName?: string;
        };
        if ((await this.store.job(id))?.status === "cancelled") continue;
        if (result.status === "completed" || result.status === "partial")
          await this.update(id, {
            ...result,
            artifact: result.artifact ?? true,
            stage:
              result.artifact === false ? result.stage : result.status === "partial"
                ? "Excel ready with incomplete sections. Review Errors and Skipped."
                : "Actual CPCB Excel is ready to download.",
            expiresAt: new Date(
              Date.now() + config.ARTIFACT_TTL_MINUTES * 60000,
            ).toISOString(),
          });
        else {
          await this.update(id, result);
          if (result.status === "failed") await this.destroy(id);
        }
      } catch {
        if (!execution.cancelled)
          await this.update(id, {
            status: "failed",
            stage: "Python worker connection lost. Start a new job to retry.",
          });
        await this.destroy(id);
      } finally {
        execution.polling = false;
      }
    }
  }
  base(id: string) {
    return this.executions.get(id)?.base;
  }
  occupiedSessions() { return this.executions.size; }
  async artifact(id: string): Promise<Buffer> {
    return Buffer.from(await (await this.call(id, "/artifact")).arrayBuffer());
  }
  async destroy(id: string) {
    const execution = this.executions.get(id);
    if (!execution) return;
    execution.cancelled = true;
    if (
      execution.process?.pid &&
      execution.process.exitCode === null &&
      !execution.process.killed
    ) {
      if (process.platform === "win32")
        await new Promise<void>((resolve) =>
          execFile(
            "taskkill",
            ["/PID", String(execution.process!.pid), "/T", "/F"],
            { windowsHide: true },
            () => resolve(),
          ),
        );
      else {
        try {
          process.kill(-execution.process.pid, "SIGTERM");
        } catch {}
        await new Promise<void>((resolve) => {
          const child = execution.process!;
          if (child.exitCode !== null) return resolve();
          const timer = setTimeout(() => {
            try { process.kill(-child.pid!, "SIGKILL"); } catch {}
            resolve();
          }, 5000);
          child.once("exit", () => { clearTimeout(timer); resolve(); });
        });
      }
    }
    if (
      execution.directory &&
      ((path.resolve(execution.directory).startsWith(path.join(root, "runtime", "jobs") + path.sep)) ||
        (path.dirname(path.resolve(execution.directory)) === path.resolve(tmpdir()) && path.basename(execution.directory).startsWith('orqix-worker-')))
    )
      await rm(execution.directory, {
        recursive: true,
        force: true,
        maxRetries: 4,
        retryDelay: 500,
      });
    this.executions.delete(id);
  }
  async cancel(
    id: string,
    stage = "Cancelled. Browser and temporary files deleted.",
  ) {
    await this.update(id, { status: "cancelled", stage, artifact: false });
    await this.destroy(id);
  }
  async deleteArtifact(id: string) {
    await this.destroy(id);
    await this.update(id, {
      artifact: false,
      stage: "Temporary files deleted by user.",
    });
  }
  async shutdown() {
    for (const id of [...this.executions.keys()])
      await this.cancel(id, "Backend stopped. Temporary session cleared.");
  }
  async recover() {
    await this.store.finishOrphanedRuns();
    for (const j of await this.store.pending())
      await this.update(j.id, {
        status: active(j.status) ? "failed" : j.status,
        artifact: false,
        stage: "Backend restarted. Start a new CPCB session.",
      });
  }
}
