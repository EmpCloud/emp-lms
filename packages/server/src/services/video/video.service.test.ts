import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("../../db/adapters/index", () => ({
  getDB: vi.fn(),
}));

vi.mock("../../events/index", () => ({
  lmsEvents: { emit: vi.fn() },
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-uuid-1234"),
}));

vi.mock("fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
    copyFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
  },
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  copyFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

import { execFile } from "child_process";

vi.mock("child_process", () => ({
  execFile: vi.fn((_cmd: any, _args: any, _opts: any, cb: any) => {
    cb(new Error("ffprobe not available"), "", "");
  }),
}));

vi.mock("../../config/index", () => ({
  config: {
    upload: {
      uploadDir: "/tmp/uploads",
    },
  },
}));

import {
  uploadVideo,
  getVideoUrl,
  deleteVideo,
  getVideoMetadata,
} from "./video.service";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── uploadVideo ─────────────────────────────────────────────────────────

describe("uploadVideo", () => {
  it("should upload a video successfully", async () => {
    (fs.mkdirSync as any).mockReturnValue(undefined);
    (fs.renameSync as any).mockReturnValue(undefined);
    (fs.statSync as any).mockReturnValue({ size: 1024 });

    const file = {
      path: "/tmp/tmp-upload",
      originalname: "video.mp4",
      size: 1024,
      mimetype: "video/mp4",
    } as Express.Multer.File;

    const result = await uploadVideo(1, file);

    expect(result.id).toBe("test-uuid-1234");
    expect(result.url).toContain("/uploads/videos/1/test-uuid-1234.mp4");
    expect(result.originalName).toBe("video.mp4");
    expect(result.size).toBe(1024);
    expect(result.mimeType).toBe("video/mp4");
  });

  it("should throw BadRequestError when no file provided", async () => {
    await expect(uploadVideo(1, null as any)).rejects.toThrow("No video file provided");
  });

  it("should fallback to copy when rename fails", async () => {
    (fs.mkdirSync as any).mockReturnValue(undefined);
    (fs.renameSync as any).mockImplementation(() => { throw new Error("cross-device"); });
    (fs.copyFileSync as any).mockReturnValue(undefined);
    (fs.unlinkSync as any).mockReturnValue(undefined);
    (fs.statSync as any).mockReturnValue({ size: 2048 });

    const file = {
      path: "/tmp/tmp-upload",
      originalname: "video.mp4",
      size: 2048,
      mimetype: "video/mp4",
    } as Express.Multer.File;

    const result = await uploadVideo(1, file);

    expect(fs.copyFileSync).toHaveBeenCalled();
    expect(result.id).toBe("test-uuid-1234");
  });
});

// ── getVideoUrl ─────────────────────────────────────────────────────────

describe("getVideoUrl", () => {
  it("should return video URL when file exists", async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readdirSync as any).mockReturnValue(["test-uuid-1234.mp4", "other.mp4"]);

    const result = await getVideoUrl(1, "test-uuid-1234");

    expect(result.url).toBe("/uploads/videos/1/test-uuid-1234.mp4");
  });

  it("should throw NotFoundError when video directory does not exist", async () => {
    (fs.existsSync as any).mockReturnValue(false);

    await expect(getVideoUrl(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should throw NotFoundError when video file not found in directory", async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readdirSync as any).mockReturnValue(["other-video.mp4"]);

    await expect(getVideoUrl(1, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── deleteVideo ─────────────────────────────────────────────────────────

describe("deleteVideo", () => {
  it("should delete video successfully", async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.unlinkSync as any).mockReturnValue(undefined);

    await deleteVideo(1, "videos/1/test-uuid-1234.mp4");

    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  it("should throw BadRequestError on directory traversal attempt", async () => {
    await expect(deleteVideo(1, "../../../etc/passwd")).rejects.toThrow("Invalid video path");
  });

  it("should throw NotFoundError when video file does not exist", async () => {
    (fs.existsSync as any).mockReturnValue(false);

    await expect(deleteVideo(1, "videos/1/nonexistent.mp4")).rejects.toThrow("not found");
  });
});

// ── getVideoMetadata ────────────────────────────────────────────────────

describe("getVideoMetadata", () => {
  it("should return file size and default duration when ffprobe is unavailable", async () => {
    (fs.statSync as any).mockReturnValue({ size: 5000 });

    const result = await getVideoMetadata("/tmp/video.mp4");

    expect(result.size).toBe(5000);
    expect(result.duration).toBe(0);
  });

  it("should return zero size when file does not exist", async () => {
    (fs.statSync as any).mockImplementation(() => { throw new Error("ENOENT"); });

    const result = await getVideoMetadata("/tmp/nonexistent.mp4");

    expect(result.size).toBe(0);
    expect(result.duration).toBe(0);
  });

  it("should return duration from ffprobe when available", async () => {
    (fs.statSync as any).mockReturnValue({ size: 3000 });
    // Override execFile mock for this test to simulate success
    (execFile as any).mockImplementationOnce((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, "120.5\n", "");
    });

    const result = await getVideoMetadata("/tmp/video.mp4");

    expect(result.size).toBe(3000);
    expect(result.duration).toBe(121); // Math.round(120.5)
  });

  it("should return 0 duration when ffprobe returns NaN", async () => {
    (fs.statSync as any).mockReturnValue({ size: 1000 });
    (execFile as any).mockImplementationOnce((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, "N/A\n", "");
    });

    const result = await getVideoMetadata("/tmp/video.mp4");

    expect(result.size).toBe(1000);
    expect(result.duration).toBe(0);
  });
});

// ── uploadVideo — cross-device cleanup failure ────────────────────────

describe("uploadVideo — cleanup failure", () => {
  it("should handle cleanup failure after cross-device copy gracefully", async () => {
    (fs.mkdirSync as any).mockReturnValue(undefined);
    (fs.renameSync as any).mockImplementation(() => { throw new Error("cross-device"); });
    (fs.copyFileSync as any).mockReturnValue(undefined);
    (fs.unlinkSync as any).mockImplementation(() => { throw new Error("EPERM"); }); // cleanup fails
    (fs.statSync as any).mockReturnValue({ size: 1024 });

    const file = {
      path: "/tmp/tmp-upload",
      originalname: "video.mp4",
      size: 1024,
      mimetype: "video/mp4",
    } as Express.Multer.File;

    // Should not throw even when cleanup fails
    const result = await uploadVideo(1, file);
    expect(result.id).toBe("test-uuid-1234");
  });
});
