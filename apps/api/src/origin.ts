import { config } from "./config.js";
export function allowedOrigin(origin: string | undefined): boolean {
  if (origin === config.PUBLIC_ORIGIN) return true;
  if (!origin || config.WORKER_RUNTIME !== "local") return false;
  try {
    const candidate = new URL(origin),
      configured = new URL(config.PUBLIC_ORIGIN);
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
    return (
      loopback.has(candidate.hostname) &&
      loopback.has(configured.hostname) &&
      candidate.protocol === configured.protocol &&
      candidate.port === configured.port &&
      candidate.origin === origin
    );
  } catch {
    return false;
  }
}
