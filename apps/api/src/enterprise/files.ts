import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
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
  async delete(file: {key:string;storage?:unknown}) {
    if (!/^[a-f0-9-]{36}$/.test(file.key)) throw new Error('Invalid private file key');
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
    if (this.s3)
      await this.s3.send(
        new PutObjectCommand({
          Bucket: config.SPACES_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ACL: "private",
        }),
      );
    else {
      if (process.env.NODE_ENV === "production")
        throw Object.assign(
          new Error("Private Spaces storage is not configured."),
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
      storage: this.s3 ? "spaces" : "local",
    };
  }
  async get(file: { key: string; storage?: unknown }) {
    if (!/^[a-f0-9-]{36}$/.test(file.key))
      throw new Error("Invalid private file key");
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
