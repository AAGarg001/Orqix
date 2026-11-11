import { Store } from "./store.js";
import { config } from "./config.js";
import { hashPassword } from "./auth.js";
import { z } from "zod";
let text = "";
for await (const chunk of process.stdin) text += chunk;
const input = z
  .object({
    email: z.email().transform((v) => v.toLowerCase()),
    name: z.string().min(2),
    password: z.string().min(14).max(128),
  })
  .parse(JSON.parse(text));
if (config.METADATA_STORE !== "mongodb")
  throw new Error(
    "Admin provisioning requires MongoDB persistence. Configure MONGODB_URI and METADATA_STORE=mongodb first.",
  );
const store = new Store(false);
await store.connect(config.MONGODB_URI);
if (await store.userByEmail(input.email))
  throw new Error("Account already exists. No existing account was modified.");
await store.createUser({
  name: input.name,
  email: input.email,
  username: input.email,
  passwordHash: await hashPassword(input.password),
  role: "super_admin",
  active: true,
});
console.log(
  "Super Admin account created successfully. Password was hashed; existing data was not changed.",
);
process.exit(0);
