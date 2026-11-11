import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request } from "express";
import type { Store } from "./store.js";
const scrypt = promisify(scryptCb);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function checkPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
export async function requestUser(req: Request, store: Store, onSession?: (session: Awaited<ReturnType<Store["session"]>>) => void) {
  const token = req.cookies?.session;
  if (typeof token !== "string") return null;
  const session = await store.session(tokenHash(token));
  onSession?.(session);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now())
    return null;
  const user = await store.user(session.userId);
  return user?.active === false ? null : user;
}
