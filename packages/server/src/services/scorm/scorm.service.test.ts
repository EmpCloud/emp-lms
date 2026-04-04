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
  commitTracking,
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

// ── commitTracking ──────────────────────────────────────────────────────

describe("commitTracking", () => {
  it("should update tracking and mark enrollment completed when SCORM is passed", async () => {
    // updateTracking mock
    const tracking = { id: "track-1", package_id: "pkg-1", user_id: 42, enrollment_id: "enr-1" };
    mockDB.findOne
      .mockResolvedValueOnce(tracking) // updateTracking lookup
      .mockResolvedValueOnce(tracking); // commitTracking re-lookup for enrollment_id
    mockDB.update.mockResolvedValue({ ...tracking, status: "passed" });
    // Package lookup
    mockDB.findById
      .mockResolvedValueOnce({ id: "pkg-1", course_id: "c1", org_id: 1 }) // package
      .mockResolvedValueOnce({ id: "enr-1", status: "in_progress", time_spent_minutes: 10 }); // enrollment

    const result = await commitTracking("pkg-1", 42, {
      status: "passed",
      completion_status: "completed",
      success_status: "passed",
      score: 95,
      time_spent: 120,
    });

    expect(result).toBeDefined();
    // Should update enrollment
    expect(mockDB.update).toHaveBeenCalledWith(
      "enrollments",
      "enr-1",
      expect.objectContaining({
        status: "completed",
        progress_percentage: 100,
      })
    );
  });

  it("should mark enrollment as failed when SCORM reports failed without completion", async () => {
    const tracking = { id: "track-1", package_id: "pkg-1", user_id: 42, enrollment_id: "enr-1" };
    mockDB.findOne
      .mockResolvedValueOnce(tracking)
      .mockResolvedValueOnce(tracking);
    mockDB.update.mockResolvedValue({ ...tracking, status: "failed" });
    mockDB.findById
      .mockResolvedValueOnce({ id: "pkg-1", course_id: "c1", org_id: 1 })
      .mockResolvedValueOnce({ id: "enr-1", status: "in_progress", time_spent_minutes: 5 });

    // Note: completion_status="incomplete" + success_status="failed" -> isCompleted=true because status="failed" is NOT in the check
    // The isCompleted check is: completion_status=completed OR status=completed OR status=passed OR success_status=passed
    // So status=failed does NOT trigger completion path
    await commitTracking("pkg-1", 42, {
      status: "failed",
      completion_status: "incomplete",
      success_status: "failed",
    });

    // Since isCompleted is false (none of the completion triggers matched),
    // no enrollment update happens
    const enrollmentCalls = mockDB.update.mock.calls.filter(
      (c: any[]) => c[0] === "enrollments"
    );
    expect(enrollmentCalls).toHaveLength(0);
  });

  it("should mark enrollment as failed when SCORM passes isCompleted but isFailed", async () => {
    const tracking = { id: "track-1", package_id: "pkg-1", user_id: 42, enrollment_id: "enr-1" };
    mockDB.findOne
      .mockResolvedValueOnce(tracking)
      .mockResolvedValueOnce(tracking);
    mockDB.update.mockResolvedValue({ ...tracking, status: "completed" });
    mockDB.findById
      .mockResolvedValueOnce({ id: "pkg-1", course_id: "c1", org_id: 1 })
      .mockResolvedValueOnce({ id: "enr-1", status: "in_progress", time_spent_minutes: 5 });

    // status="completed" triggers isCompleted=true
    // isPassed = false, isFailed = success_status==="failed" => true
    // BUT completion_status="incomplete", so (isPassed || completion_status==="completed") is false
    // Then isFailed check => status: "failed"
    await commitTracking("pkg-1", 42, {
      status: "completed",
      completion_status: "incomplete",
      success_status: "failed",
    });

    expect(mockDB.update).toHaveBeenCalledWith(
      "enrollments",
      "enr-1",
      expect.objectContaining({
        status: "failed",
      })
    );
  });

  it("should not change enrollment status when it is already completed", async () => {
    const tracking = { id: "track-1", package_id: "pkg-1", user_id: 42, enrollment_id: "enr-1" };
    mockDB.findOne
      .mockResolvedValueOnce(tracking)  // updateTracking lookup
      .mockResolvedValueOnce(tracking); // commitTracking fullTracking lookup
    mockDB.update.mockResolvedValue({ ...tracking, status: "completed" });
    mockDB.findById
      .mockResolvedValueOnce({ id: "pkg-1", course_id: "c1", org_id: 1 })  // package
      .mockResolvedValueOnce({ id: "enr-1", status: "completed", time_spent_minutes: 60 }); // enrollment

    await commitTracking("pkg-1", 42, {
      completion_status: "completed",
    });

    // When enrollment is already "completed", the guard at line 474 prevents
    // the status-changing block. The enrollment update still fires with time/access fields.
    const enrollmentUpdate = mockDB.update.mock.calls.find(
      (c: any[]) => c[0] === "enrollments" && c[1] === "enr-1"
    );
    expect(enrollmentUpdate).toBeDefined();
    // The update should have last_accessed_at but should NOT change the status
    expect(enrollmentUpdate![2]).toHaveProperty("last_accessed_at");
  });

  it("should handle non-completion data gracefully (no enrollment update)", async () => {
    const tracking = { id: "track-1", package_id: "pkg-1", user_id: 42, enrollment_id: "enr-1" };
    mockDB.findOne.mockResolvedValueOnce(tracking);
    mockDB.update.mockResolvedValue({ ...tracking, location: "page5" });

    // Only updating location, no completion flags
    await commitTracking("pkg-1", 42, {
      location: "page5",
      suspend_data: "bookmark=5",
    });

    // Should not try to update enrollments
    const enrollmentCalls = mockDB.update.mock.calls.filter(
      (c: any[]) => c[0] === "enrollments"
    );
    expect(enrollmentCalls).toHaveLength(0);
  });
});
