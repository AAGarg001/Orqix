import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import mongoose from "mongoose";
import { config } from "../config.js";
import { CloudinaryFiles } from "./cloudinary-files.js";
export function validateExcelArchive(buffer: Buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0)
    throw Object.assign(new Error("Invalid XLSX archive."), { status: 400 });
  const entries = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16),
    total = 0;
  if (entries > 1000)
    throw Object.assign(new Error("Workbook has too many archive entries."), {
      status: 400,
    });
  for (let n = 0; n < entries; n++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    )
      throw Object.assign(new Error("Malformed XLSX archive."), {
        status: 400,
      });
    total += buffer.readUInt32LE(offset + 24);
    if (total > 50 * 1024 * 1024)
      throw Object.assign(new Error("Expanded workbook exceeds 50 MB."), {
        status: 400,
      });
    const nameLength = buffer.readUInt16LE(offset + 28),
      extra = buffer.readUInt16LE(offset + 30),
      comment = buffer.readUInt16LE(offset + 32),
      name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString();
    if (name.includes("..") || /vbaProject|externalLinks/i.test(name))
      throw Object.assign(
        new Error("Macros/external links are not permitted."),
        { status: 400 },
      );
    offset += 46 + nameLength + extra + comment;
  }
}
export class PrivateFiles {
  private bucket() {
    const db = mongoose.connection.db;
    if (mongoose.connection.readyState !== 1 || !db)
      throw Object.assign(new Error("MongoDB private storage is unavailable."), { status: 503 });
    return new mongoose.mongo.GridFSBucket(db, { bucketName: "orqix_private_files" });
  }
  async delete(file: {key:string;storage?:unknown;cloudinaryExtension?:unknown}) {
    if (!/^[a-f0-9-]{36}$/.test(file.key)) throw new Error('Invalid private file key');
    if (file.storage === "cloudinary") return new CloudinaryFiles().delete(file.key, file.cloudinaryExtension);
    if (file.storage === "mongodb") {
      const bucket = this.bucket();
      const stored = await bucket.find({ filename: file.key }).next();
      if (stored) await bucket.delete(stored._id);
      return;
    }
    if (file.storage === 'spaces') {
      if (!this.s3) throw new Error('Spaces unavailable');
      await this.s3.send(new DeleteObjectCommand({Bucket:config.SPACES_BUCKET,Key:file.key}));
    } else {
      await unlink(path.resolve(config.LOCAL_PRIVATE_DIRECTORY,file.key)).catch(error=>{if(error.code!=='ENOENT')throw error;});
    }
  }
  private s3 = config.SPACES_BUCKET
    ? new S3Client({
        region: config.SPACES_REGION,
        endpoint: config.SPACES_ENDPOINT,
        credentials:
          config.SPACES_ACCESS_KEY && config.SPACES_SECRET_KEY
            ? {
                accessKeyId: config.SPACES_ACCESS_KEY,
                secretAccessKey: config.SPACES_SECRET_KEY,
              }
            : undefined,
      })
    : null;
  async put(buffer: Buffer, name: string, contentType: string) {
    const key = randomUUID();
    const storage = config.PRIVATE_FILE_STORAGE;
    const cloudinaryExtension = path.extname(name).slice(1).toLowerCase();
    if (storage === "cloudinary") {
      await new CloudinaryFiles().put(key, buffer, cloudinaryExtension);
    } else if (storage === "mongodb") {
      const upload = this.bucket().openUploadStream(key, {
        metadata: { name: path.basename(name), contentType },
      });
      try {
        await pipeline(Readable.from([buffer]), upload);
      } catch (error) {
        await upload.abort().catch(() => {});
        throw error;
      }
    } else if (storage === "spaces") {
      if (!this.s3) throw Object.assign(new Error("Private Spaces storage is not configured."), { status: 503 });
      await this.s3.send(
        new PutObjectCommand({
          Bucket: config.SPACES_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ACL: "private",
        }),
      );
    } else {
      if (process.env.NODE_ENV === "production")
        throw Object.assign(
          new Error("Local private storage is disabled in production."),
          { status: 503 },
        );
      await mkdir(path.resolve(config.LOCAL_PRIVATE_DIRECTORY), { recursive: true });
      await writeFile(path.resolve(config.LOCAL_PRIVATE_DIRECTORY, key), buffer, {
        mode: 0o600,
      });
    }
    return {
      key,
      name: path.basename(name),
      contentType,
      size: buffer.length,
      storage,
      ...(storage === "cloudinary" ? { cloudinaryExtension } : {}),
    };
  }
  async get(file: { key: string; storage?: unknown; cloudinaryExtension?: unknown }) {
    if (!/^[a-f0-9-]{36}$/.test(file.key))
      throw new Error("Invalid private file key");
    if (file.storage === "cloudinary") return new CloudinaryFiles().get(file.key, file.cloudinaryExtension);
    if (file.storage === "mongodb") {
      const chunks: Buffer[] = [];
      for await (const chunk of this.bucket().openDownloadStreamByName(file.key))
        chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    }
    if (file.storage === "spaces") {
      if (!this.s3) throw new Error("Spaces unavailable");
      const r = await this.s3.send(
        new GetObjectCommand({ Bucket: config.SPACES_BUCKET, Key: file.key }),
      );
      return Buffer.from(await r.Body!.transformToByteArray());
    }
    return readFile(path.resolve(config.LOCAL_PRIVATE_DIRECTORY, file.key));
  }
}
