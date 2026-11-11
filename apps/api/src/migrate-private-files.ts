import mongoose from "mongoose";
import path from "node:path";
import { createHash } from "node:crypto";
import { config } from "./config.js";
import { PrivateFiles } from "./enterprise/files.js";
import { CloudinaryFiles } from "./enterprise/cloudinary-files.js";

// Default is read-only. Existing GridFS bytes are retained so snapshots and
// rollback references remain readable. No existing asset is overwritten.
const apply = process.argv.includes("--apply");
await mongoose.connect(config.MONGODB_URI!, { serverSelectionTimeoutMS: 10000 });
let migrated = 0;
try {
  const db = mongoose.connection.db!;
  const files = new PrivateFiles(), target = new CloudinaryFiles();
  const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  for (const kind of ["filerecords", "clientdocuments"]) {
    const collection = db.collection(kind);
    const candidates = await collection.countDocuments({ storage: "mongodb" });
    console.log(`${kind}: ${candidates} GridFS records${apply ? " to migrate" : " (dry run)"}`);
    if (!apply) continue;
    for await (const file of collection.find({ storage: "mongodb" })) {
      const key = String(file.key), extension = path.extname(String(file.name)).slice(1).toLowerCase();
      const bytes = await files.get({ key, storage: "mongodb" });
      await target.put(key, bytes, extension);
      try {
        if (digest(await target.get(key, extension)) !== digest(bytes)) throw new Error("Migration verification failed");
        const updated = await collection.updateOne({ _id: file._id, storage: "mongodb", version: file.version }, {
          $set: { storage: "cloudinary", cloudinaryExtension: extension, updatedAt: new Date().toISOString() },
          $inc: { version: 1 },
        });
        if (updated.modifiedCount !== 1) throw new Error("File record changed during migration; retry after reviewing concurrent updates");
        migrated++;
      } catch (error) {
        await target.delete(key, extension);
        throw error;
      }
    }
  }
  console.log(`Migrated ${migrated} files. Existing GridFS originals retained.`);
} finally {
  await mongoose.disconnect();
}
