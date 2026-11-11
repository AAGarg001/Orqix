import { z } from "zod";
const bool = (fallback: string) =>
  z
    .enum(["true", "false"])
    .default(fallback as "true" | "false")
    .transform((v) => v === "true");
export const config = z
  .object({
    WORKER_RUNTIME: z.enum(["local", "docker"]).default("local"),
    METADATA_STORE: z.enum(["memory", "mongodb"]).default(process.env.NODE_ENV==='test'?"memory":"mongodb"),
    PYTHON_EXECUTABLE: z
      .string()
      .default(
        process.platform === "win32"
          ? ".venv/Scripts/python.exe"
          : ".venv/bin/python",
      ),
    PORT: z.coerce.number().default(4000),
    PUBLIC_ORIGIN: z.string().url().default("http://localhost:5173"),
    MONGODB_URI: z.string().optional(),
    LOCAL_PRIVATE_DIRECTORY:z.string().default('runtime/private-files'),
    ENFORCE_ASSIGNMENTS: bool("true"),
    SPACES_BUCKET: z.string().optional(),
    SPACES_REGION: z.string().default("blr1"),
    SPACES_ENDPOINT: z.string().url().optional(),
    SPACES_ACCESS_KEY: z.string().optional(),
    SPACES_SECRET_KEY: z.string().optional(),
    REDIS_URL: z.string().optional(),
    AI_MODEL: z.string().optional(),
    AI_GATEWAY_API_KEY: z.string().optional(),
    GRAPH_TENANT_ID: z.string().optional(),
    GRAPH_CLIENT_ID: z.string().optional(),
    GRAPH_CLIENT_SECRET: z.string().optional(),
    GRAPH_SENDER: z.string().optional(),
    MAX_CONCURRENT_JOBS: z.coerce.number().int().min(1).default(4),
    MAX_JOBS_PER_USER: z.coerce.number().int().min(1).default(2),
    ARTIFACT_TTL_MINUTES: z.coerce.number().min(1).default(60),
    JOB_TIMEOUT_MINUTES: z.coerce.number().min(1).default(120),
    SESSION_HOURS: z.coerce.number().min(1).default(12),
    COOKIE_SECURE: bool("false"),
    REGISTRATION_ENABLED: bool(process.env.NODE_ENV==='test'?"true":"false"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
    WORKER_IMAGE: z.string().default("cpcb-worker:local"),
    WORKER_NETWORK: z.string().default("cpcb-workers"),
  })
  .parse(process.env);
if (
  config.METADATA_STORE === "mongodb" &&
  (!config.MONGODB_URI || config.MONGODB_URI.includes("USERNAME:PASSWORD"))
) {
  throw new Error(
    "MongoDB metadata store requires a valid MONGODB_URI in .env.",
  );
}
if(process.env.NODE_ENV==='production'&&(config.METADATA_STORE!=='mongodb'||!config.COOKIE_SECURE||!config.PUBLIC_ORIGIN.startsWith('https://')||!config.SPACES_BUCKET||!config.SPACES_ACCESS_KEY||!config.SPACES_SECRET_KEY))throw new Error('Production requires MongoDB, HTTPS secure cookies and private Spaces credentials.');
