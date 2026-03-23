import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/adapters/index", () => ({
  getDB: vi.fn(),
}));

vi.mock("../../events/index", () => ({
  lmsEvents: { emit: vi.fn() },
}));

vi.mock("../../config/index", () => ({
  config: {
    upload: { uploadDir: "/tmp/uploads" },
  },
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
    existsSync: vi.fn(() => true),
    rmSync: vi.fn(),
    unlinkSync: vi.fn(),
    readFileSync: vi.fn(() => "<manifest></manifest>"),
  },
}));

import { getDB } from "../../db/adapters/index";
import {
  getPackage,
  getPackagesByCourse,
  deletePackage,
  getLaunchUrl,
  initTracking,
  updateTracking,
  getTracking,
} from "./scorm.service";

const mockDB = {
  findById: vi.fn(),
  findOne: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
  raw: vi.fn(),
  transaction: vi.fn((fn: any) => fn(mockDB)),
};

beforeEach(() => {
  vi.clearAllMocks();
  (getDB as any).mockReturnValue(mockDB);
});

// ── getPackage ───────────────────────────────────────────────────────────

describe("getPackage", () => {
  it("should return the package when found", async () => {
    const pkg = { id: "pkg-1", org_id: 1, title: "SCORM Course", version: "1.2" };
    mockDB.findOne.mockResolvedValue(pkg);

    const result = await getPackage(1, "pkg-1");

    expect(result).toEqual(pkg);
    expect(mockDB.findOne).toHaveBeenCalledWith("scorm_packages", { id: "pkg-1", org_id: 1 });
  });

  it("should throw NotFoundError when package does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getPackage(1, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── getPackagesByCourse ──────────────────────────────────────────────────

describe("getPackagesByCourse", () => {
  it("should return packages for a course", async () => {
    const packages = [
      { id: "pkg-1", course_id: "c1" },
      { id: "pkg-2", course_id: "c1" },
    ];
    mockDB.raw.mockResolvedValue(packages);

    const result = await getPackagesByCourse(1, "c1");

    expect(result).toHaveLength(2);
    expect(mockDB.raw).toHaveBeenCalledWith(
      expect.stringContaining("SELECT * FROM scorm_packages"),
      [1, "c1"]
    );
  });

  it("should return empty array when no packages exist", async () => {
    mockDB.raw.mockResolvedValue([]);

    const result = await getPackagesByCourse(1, "c1");

    expect(result).toEqual([]);
  });
});

// ── deletePackage ────────────────────────────────────────────────────────

describe("deletePackage", () => {
  it("should delete tracking records, package, and files", async () => {
    mockDB.findOne.mockResolvedValue({ id: "pkg-1", org_id: 1 });
    mockDB.deleteMany.mockResolvedValue(undefined);
    mockDB.delete.mockResolvedValue(undefined);

    await deletePackage(1, "pkg-1");

    expect(mockDB.deleteMany).toHaveBeenCalledWith("scorm_tracking", { package_id: "pkg-1" });
    expect(mockDB.delete).toHaveBeenCalledWith("scorm_packages", "pkg-1");
  });

  it("should throw NotFoundError when package does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(deletePackage(1, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── getLaunchUrl ─────────────────────────────────────────────────────────

describe("getLaunchUrl", () => {
  it("should return launch URL, version, and title", async () => {
    mockDB.findById.mockResolvedValue({
      id: "pkg-1",
      package_url: "/scorm/1/pkg-1",
      entry_point: "index.html",
      version: "2004",
      title: "My SCORM",
    });

    const result = await getLaunchUrl("pkg-1");

    expect(result.launchUrl).toBe("/scorm/1/pkg-1/index.html");
    expect(result.version).toBe("2004");
    expect(result.title).toBe("My SCORM");
  });

  it("should throw NotFoundError when package is missing", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(getLaunchUrl("nonexistent")).rejects.toThrow("not found");
  });
});

// ── initTracking ─────────────────────────────────────────────────────────

describe("initTracking", () => {
  it("should create new tracking record when none exists", async () => {
    mockDB.findById.mockResolvedValue({ id: "pkg-1" });
    mockDB.findOne.mockResolvedValue(null);
    const newTracking = { id: "test-uuid-1234", package_id: "pkg-1", user_id: 42, status: "not_attempted" };
    mockDB.create.mockResolvedValue(newTracking);

    const result = await initTracking("pkg-1", 42, "enroll-1");

    expect(mockDB.create).toHaveBeenCalledWith("scorm_tracking", expect.objectContaining({
      id: "test-uuid-1234",
      package_id: "pkg-1",
      user_id: 42,
      enrollment_id: "enroll-1",
      status: "not_attempted",
    }));
    expect(result).toEqual(newTracking);
  });

  it("should return existing tracking when already initialized", async () => {
    const existing = { id: "existing-id", package_id: "pkg-1", user_id: 42, status: "incomplete" };
    mockDB.findById.mockResolvedValue({ id: "pkg-1" });
    mockDB.findOne.mockResolvedValue(existing);

    const result = await initTracking("pkg-1", 42, "enroll-1");

    expect(mockDB.create).not.toHaveBeenCalled();
    expect(result).toEqual(existing);
  });

  it("should throw NotFoundError when package does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(initTracking("nonexistent", 42, "enroll-1")).rejects.toThrow("not found");
  });
});

// ── updateTracking ───────────────────────────────────────────────────────

describe("updateTracking", () => {
  it("should update tracking fields", async () => {
    const existing = { id: "track-1", package_id: "pkg-1", user_id: 42 };
    mockDB.findOne.mockResolvedValue(existing);
    mockDB.update.mockResolvedValue({ ...existing, status: "completed", score: 95 });

    const result = await updateTracking("pkg-1", 42, { status: "completed", score: 95 });

    expect(mockDB.update).toHaveBeenCalledWith("scorm_tracking", "track-1", { status: "completed", score: 95 });
    expect(result.status).toBe("completed");
  });

  it("should throw NotFoundError when tracking record is missing", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(updateTracking("pkg-1", 42, { status: "completed" })).rejects.toThrow("not found");
  });
});

// ── getTracking ──────────────────────────────────────────────────────────

describe("getTracking", () => {
  it("should return tracking record when found", async () => {
    const tracking = { id: "track-1", package_id: "pkg-1", user_id: 42, status: "incomplete" };
    mockDB.findOne.mockResolvedValue(tracking);

    const result = await getTracking("pkg-1", 42);

    expect(result).toEqual(tracking);
  });

  it("should return null when no tracking exists", async () => {
    mockDB.findOne.mockResolvedValue(null);

    const result = await getTracking("pkg-1", 42);

    expect(result).toBeNull();
  });
});
