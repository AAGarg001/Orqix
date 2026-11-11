import { v2 as cloudinary } from "cloudinary";
import { config } from "../config.js";

export class CloudinaryFiles {
  private credentials() {
    if (!config.CLOUDINARY_CLOUD_NAME || !config.CLOUDINARY_API_KEY || !config.CLOUDINARY_API_SECRET)
      throw Object.assign(new Error("Private Cloudinary storage is not configured."), { status: 503 });
    return {
      cloud_name: config.CLOUDINARY_CLOUD_NAME,
      api_key: config.CLOUDINARY_API_KEY,
      api_secret: config.CLOUDINARY_API_SECRET,
      secure: true,
    };
  }

  private publicId(key: string, extension: unknown) {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid private file key");
    if (typeof extension !== "string" || !/^[a-z0-9]{1,10}$/.test(extension))
      throw new Error("Invalid private file extension");
    return `orqix/private/${key}.${extension}`;
  }

  async put(key: string, buffer: Buffer, extension: unknown) {
    const options = {
      ...this.credentials(),
      resource_type: "raw" as const,
      type: "authenticated" as const,
      public_id: this.publicId(key, extension),
      overwrite: false,
      timeout: 60000,
    };
    await new Promise<void>((resolve, reject) => {
      const fail = () => reject(Object.assign(new Error("Private file upload failed. Please retry."), { status: 502 }));
      const upload = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error || !result || result.public_id !== options.public_id || result.type !== "authenticated" || result.resource_type !== "raw") fail();
        else resolve();
      });
      upload.once("error", fail);
      upload.end(buffer);
    });
  }

  async get(key: string, extension: unknown) {
    const options = {
      ...this.credentials(),
      resource_type: "raw" as const,
      type: "authenticated" as const,
      expires_at: Math.floor(Date.now() / 1000) + 60,
      attachment: false,
    };
    // The signed URL stays on the server; callers only receive file bytes after
    // the existing routes have checked file ownership and permissions.
    const url = cloudinary.utils.private_download_url(this.publicId(key, extension), "", options);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error("Download unavailable");
      return Buffer.from(await response.arrayBuffer());
    } catch {
      throw Object.assign(new Error("Private file download failed. Please retry."), { status: 502 });
    }
  }

  async delete(key: string, extension: unknown) {
    const options = { ...this.credentials(), resource_type: "raw" as const, type: "authenticated" as const, invalidate: true };
    try {
      const result = await cloudinary.uploader.destroy(this.publicId(key, extension), options);
      if (!["ok", "not found"].includes(result.result)) throw new Error("Delete unavailable");
    } catch {
      throw Object.assign(new Error("Private file deletion failed. Please retry."), { status: 502 });
    }
  }
}
