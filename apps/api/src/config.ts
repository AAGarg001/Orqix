import { z } from "zod";
const bool = (fallback: string) =>
  z
    .enum(["true", "false"])
    .default(fallback as "true" | "false")
    .transform((v) => v === "true");
export const config = z
  .object({
    WORKER_RUNTIME: z.enum(["local", "docker", "hosted"]).default("local"),
    BROWSER_PUBLIC_ORIGIN: z.string().url().optional(),
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
    PRIVATE_FILE_STORAGE: z.enum(["mongodb", "spaces", "cloudinary", "local"]).default(
      process.env.SPACES_BUCKET?.trim() ? "spaces" : process.env.NODE_ENV === "test" ? "local" : "mongodb",
    ),
    ENFORCE_ASSIGNMENTS: bool("true"),
    CLOUDINARY_CLOUD_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
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
if (process.env.NODE_ENV === "production") {
  const problems: string[] = [];
  if (config.METADATA_STORE !== "mongodb") problems.push("METADATA_STORE must be mongodb");
  if (!config.COOKIE_SECURE) problems.push("COOKIE_SECURE must be true");
  if (!config.PUBLIC_ORIGIN.startsWith("https://")) problems.push("PUBLIC_ORIGIN must use https://");
  if (config.PRIVATE_FILE_STORAGE === "local") problems.push("PRIVATE_FILE_STORAGE must be mongodb, cloudinary or spaces in production");
  if (config.WORKER_RUNTIME === "hosted" && (!config.BROWSER_PUBLIC_ORIGIN || !config.BROWSER_PUBLIC_ORIGIN.startsWith("https://")))
    problems.push("BROWSER_PUBLIC_ORIGIN must be the HTTPS Render service origin for hosted workers");
  if (config.PRIVATE_FILE_STORAGE === "spaces") {
    for (const key of ["SPACES_BUCKET", "SPACES_ACCESS_KEY", "SPACES_SECRET_KEY"] as const) {
      if (!config[key]?.trim()) problems.push(`${key} is missing`);
    }
  }
  if (config.PRIVATE_FILE_STORAGE === "cloudinary") {
    for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] as const) {
      if (!config[key]?.trim()) problems.push(`${key} is missing`);
    }
  }
  if (problems.length) {
    throw new Error(`Production configuration error: ${problems.join("; ")}. Update the Render service Environment settings and redeploy.`);
  }
}
