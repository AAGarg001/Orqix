import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Writable } from "node:stream";
import { config } from "../config.js";
import { PrivateFiles } from "./files.js";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), destroy: vi.fn(), downloadUrl: vi.fn() }));
vi.mock("cloudinary", () => ({ v2: { uploader: { upload_stream: mocks.upload, destroy: mocks.destroy }, utils: { private_download_url: mocks.downloadUrl } } }));
const key = "12345678-1234-1234-1234-123456789abc";
const original = { storage: config.PRIVATE_FILE_STORAGE, cloud: config.CLOUDINARY_CLOUD_NAME, key: config.CLOUDINARY_API_KEY, secret: config.CLOUDINARY_API_SECRET };

describe("private Cloudinary file storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.PRIVATE_FILE_STORAGE = "cloudinary";
    config.CLOUDINARY_CLOUD_NAME = "test-cloud";
    config.CLOUDINARY_API_KEY = "test-key";
    config.CLOUDINARY_API_SECRET = "test-secret";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    config.PRIVATE_FILE_STORAGE = original.storage;
    config.CLOUDINARY_CLOUD_NAME = original.cloud;
    config.CLOUDINARY_API_KEY = original.key;
    config.CLOUDINARY_API_SECRET = original.secret;
  });

  it("uploads raw authenticated bytes and returns metadata without signed URLs or credentials", async () => {
    const chunks: Buffer[] = [];
    mocks.upload.mockImplementation((options, callback) => new Writable({
      write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); },
      final(done) { callback(null, { public_id: options.public_id, type: "authenticated", resource_type: "raw" }); done(); },
    }));
    const bytes = Buffer.from("private workbook bytes");
    const file = await new PrivateFiles().put(bytes, "report.xlsx", "application/octet-stream");
    expect(Buffer.concat(chunks)).toEqual(bytes);
    expect(mocks.upload.mock.calls[0][0]).toMatchObject({ resource_type: "raw", type: "authenticated", overwrite: false, public_id: `orqix/private/${file.key}.xlsx` });
    expect(file).toEqual({ key: file.key, name: "report.xlsx", size: bytes.length, contentType: "application/octet-stream", storage: "cloudinary", cloudinaryExtension: "xlsx" });
  });

  it("keeps expiring download URLs on the server and returns the exact bytes", async () => {
    mocks.downloadUrl.mockReturnValue("https://api.cloudinary.com/test-signed-download");
    const bytes = Buffer.from("private PDF bytes");
    const fetcher = vi.fn().mockResolvedValue(new Response(bytes));
    vi.stubGlobal("fetch", fetcher);
    expect(await new PrivateFiles().get({ key, storage: "cloudinary", cloudinaryExtension: "xlsx" })).toEqual(bytes);
    expect(mocks.downloadUrl.mock.calls[0]).toEqual([
      `orqix/private/${key}.xlsx`, "", expect.objectContaining({ resource_type: "raw", type: "authenticated", expires_at: expect.any(Number) }),
    ]);
    const expiry = mocks.downloadUrl.mock.calls[0][2].expires_at;
    expect(expiry - Math.floor(Date.now() / 1000)).toBeGreaterThan(0);
    expect(expiry - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(60);
  });

  it("deletes authenticated raw assets with CDN invalidation and permits repeated cleanup", async () => {
    mocks.destroy.mockResolvedValueOnce({ result: "ok" }).mockResolvedValueOnce({ result: "not found" });
    const files = new PrivateFiles();
    await files.delete({ key, storage: "cloudinary", cloudinaryExtension: "xlsx" });
    await files.delete({ key, storage: "cloudinary", cloudinaryExtension: "xlsx" });
    expect(mocks.destroy).toHaveBeenCalledWith(`orqix/private/${key}.xlsx`, expect.objectContaining({ resource_type: "raw", type: "authenticated", invalidate: true }));
  });

  it("rejects malformed keys before provider access", async () => {
    await expect(new PrivateFiles().get({ key: "../secret", storage: "cloudinary", cloudinaryExtension: "xlsx" })).rejects.toThrow("Invalid private file key");
    await expect(new PrivateFiles().delete({ key: "../secret", storage: "cloudinary", cloudinaryExtension: "xlsx" })).rejects.toThrow("Invalid private file key");
    expect(mocks.downloadUrl).not.toHaveBeenCalled();
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it("fails closed when credentials are absent or the provider refuses a download", async () => {
    config.CLOUDINARY_API_SECRET = undefined;
    await expect(new PrivateFiles().put(Buffer.from("x"), "x.pdf", "application/pdf")).rejects.toMatchObject({ status: 503 });
    config.CLOUDINARY_API_SECRET = "test-secret";
    mocks.downloadUrl.mockReturnValue("https://api.cloudinary.com/test-signed-download");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 401 })));
    await expect(new PrivateFiles().get({ key, storage: "cloudinary", cloudinaryExtension: "xlsx" })).rejects.toMatchObject({ status: 502 });
  });
});
