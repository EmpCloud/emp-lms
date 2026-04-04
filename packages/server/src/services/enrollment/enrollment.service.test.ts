import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { getDB } from "../../db/adapters/index";
import { lmsEvents } from "../../events/index";
import {
  enrollUser,
  enrollBulk,
  getEnrollment,
  getEnrollmentById,
  listUserEnrollments,
  listCourseEnrollments,
  markLessonComplete,
  calculateProgress,
  completeEnrollment,
  dropEnrollment,
  getMyProgress,
  updateTimeSpent,
  getRecentActivity,
  updateProgress,
} from "./enrollment.service";

const mockDB = {
  findById: vi.fn(),
  findOne: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
  sum: vi.fn(),
  raw: vi.fn(),
  transaction: vi.fn((fn: any) => fn(mockDB)),
  updateMany: vi.fn(),
  createMany: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (getDB as any).mockReturnValue(mockDB);
});

// ── enrollUser ──────────────────────────────────────────────────────────

describe("enrollUser", () => {
  it("should enroll a user in a published course", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "c1", status: "published", organization_id: 1, enrollment_count: 0 }) // course
      .mockResolvedValueOnce(null); // no existing enrollment
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", status: "enrolled" });
    mockDB.raw.mockResolvedValue(undefined);

    const result = await enrollUser(1, 42, "c1");

    expect(mockDB.create).toHaveBeenCalledWith("enrollments", expect.objectContaining({
      id: "test-uuid-1234",
      org_id: 1,
      user_id: 42,
      course_id: "c1",
      status: "enrolled",
      progress_percentage: 0,
    }));
    expect(lmsEvents.emit).toHaveBeenCalledWith("enrollment.created", expect.any(Object));
    expect(result.status).toBe("enrolled");
  });

  it("should throw NotFoundError when course does not exist", async () => {
    mockDB.findOne.mockResolvedValueOnce(null);

    await expect(enrollUser(1, 42, "nonexistent")).rejects.toThrow("not found");
  });

  it("should throw BadRequestError when course is unpublished", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "c1", status: "draft", organization_id: 1 });

    await expect(enrollUser(1, 42, "c1")).rejects.toThrow("unpublished");
  });

  it("should throw BadRequestError when max enrollments reached", async () => {
    mockDB.findOne.mockResolvedValueOnce({
      id: "c1", status: "published", organization_id: 1,
      max_enrollments: 5, enrollment_count: 5,
    });

    await expect(enrollUser(1, 42, "c1")).rejects.toThrow("maximum enrollment capacity");
  });

  it("should throw ConflictError when user is already enrolled", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "c1", status: "published", organization_id: 1 }) // course
      .mockResolvedValueOnce({ id: "e1", status: "enrolled" }); // existing enrollment (active)

    await expect(enrollUser(1, 42, "c1")).rejects.toThrow("already enrolled");
  });

  it("should re-enroll a previously dropped user", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "c1", status: "published", organization_id: 1, enrollment_count: 3 }) // course
      .mockResolvedValueOnce({ id: "e1", status: "dropped" }); // existing dropped enrollment
    mockDB.update.mockResolvedValue({ id: "e1", status: "enrolled" });
    mockDB.raw.mockResolvedValue(undefined);

    const result = await enrollUser(1, 42, "c1");

    expect(mockDB.update).toHaveBeenCalledWith("enrollments", "e1", expect.objectContaining({
      status: "enrolled",
      progress_percentage: 0,
    }));
    expect(lmsEvents.emit).toHaveBeenCalledWith("enrollment.created", expect.any(Object));
    expect(result.status).toBe("enrolled");
  });

  it("should pass due date when provided", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "c1", status: "published", organization_id: 1 })
      .mockResolvedValueOnce(null);
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", status: "enrolled" });
    mockDB.raw.mockResolvedValue(undefined);

    await enrollUser(1, 42, "c1", "2026-12-31");

    expect(mockDB.create).toHaveBeenCalledWith("enrollments", expect.objectContaining({
      due_date: "2026-12-31",
    }));
  });
});

// ── enrollBulk ──────────────────────────────────────────────────────────

describe("enrollBulk", () => {
  it("should enroll multiple users and return results", async () => {
    // For each user: findOne for course, findOne for existing enrollment
    mockDB.findOne
      .mockResolvedValueOnce({ id: "c1", status: "published", organization_id: 1 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "c1", status: "published", organization_id: 1 })
      .mockResolvedValueOnce(null);
    mockDB.create
      .mockResolvedValueOnce({ id: "uuid-1" })
      .mockResolvedValueOnce({ id: "uuid-2" });
    mockDB.raw.mockResolvedValue(undefined);

    const results = await enrollBulk(1, [42, 43], "c1");

    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty("enrollmentId");
    expect(results[1]).toHaveProperty("enrollmentId");
  });

  it("should capture errors for individual users without failing", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "c1", status: "published", organization_id: 1 })
      .mockResolvedValueOnce({ id: "e1", status: "enrolled" }) // already enrolled
      .mockResolvedValueOnce({ id: "c1", status: "published", organization_id: 1 })
      .mockResolvedValueOnce(null);
    mockDB.create.mockResolvedValue({ id: "uuid-2" });
    mockDB.raw.mockResolvedValue(undefined);

    const results = await enrollBulk(1, [42, 43], "c1");

    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty("error");
    expect(results[1]).toHaveProperty("enrollmentId");
  });
});

// ── getEnrollment ───────────────────────────────────────────────────────

describe("getEnrollment", () => {
  it("should return enrollment with lesson progress", async () => {
    mockDB.findOne.mockResolvedValue({ id: "e1", course_id: "c1", status: "in_progress" });
    mockDB.raw.mockResolvedValue([{ lesson_id: "l1", is_completed: true }]);

    const result = await getEnrollment(1, 42, "c1");

    expect(result.id).toBe("e1");
    expect(result.lesson_progress).toHaveLength(1);
  });

  it("should throw NotFoundError when enrollment does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getEnrollment(1, 42, "c1")).rejects.toThrow("not found");
  });
});

// ── getEnrollmentById ──────────────────────────────────────────────────

describe("getEnrollmentById", () => {
  it("should return enrollment by id", async () => {
    mockDB.findOne.mockResolvedValue({ id: "e1", org_id: 1, status: "enrolled" });

    const result = await getEnrollmentById(1, "e1");
    expect(result.id).toBe("e1");
  });

  it("should throw NotFoundError when enrollment does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getEnrollmentById(1, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── markLessonComplete — existing progress update ──────────────────────

describe("markLessonComplete — existing progress", () => {
  it("should update existing lesson progress instead of creating new", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "e1", status: "in_progress", course_id: "c1", organization_id: 1, started_at: "2026-01-01" })
      .mockResolvedValueOnce({ id: "lp1", enrollment_id: "e1", lesson_id: "l1", time_spent_minutes: 10, attempts: 2 }); // existing progress
    mockDB.raw.mockResolvedValueOnce([{ id: "l1" }]); // lesson validation
    mockDB.update.mockResolvedValue({});
    mockDB.findById.mockResolvedValue({ id: "e1", course_id: "c1" });
    mockDB.raw
      .mockResolvedValueOnce([{ total: 5 }])
      .mockResolvedValueOnce([{ total: 3 }]);

    const result = await markLessonComplete(1, "e1", "l1", 15);

    // Should update existing progress, not create
    expect(mockDB.update).toHaveBeenCalledWith("lesson_progress", "lp1", expect.objectContaining({
      is_completed: true,
      time_spent_minutes: 25, // 10 + 15
      attempts: 3, // 2 + 1
    }));
    expect(mockDB.create).not.toHaveBeenCalledWith("lesson_progress", expect.anything());
  });
});

// ── listUserEnrollments ─────────────────────────────────────────────────

describe("listUserEnrollments", () => {
  it("should return paginated enrollments with defaults", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ id: "e1", course_title: "Course 1" }])
      .mockResolvedValueOnce([{ total: 1 }]);

    const result = await listUserEnrollments(1, 42);

    expect(result.page).toBe(1);
    expect(result.perPage).toBe(20);
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it("should apply status filter", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await listUserEnrollments(1, 42, { status: "in_progress" });

    const dataQuery = mockDB.raw.mock.calls[0][0];
    expect(dataQuery).toContain("e.status = ?");
  });

  it("should apply search filter on course title", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await listUserEnrollments(1, 42, { search: "react" });

    const dataQuery = mockDB.raw.mock.calls[0][0];
    expect(dataQuery).toContain("c.title LIKE ?");
  });

  it("should apply pagination parameters", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 50 }]);

    const result = await listUserEnrollments(1, 42, { page: 3, perPage: 10 });

    expect(result.page).toBe(3);
    expect(result.perPage).toBe(10);
    expect(result.total).toBe(50);
  });
});

// ── listCourseEnrollments ───────────────────────────────────────────────

describe("listCourseEnrollments", () => {
  it("should return paginated enrollments for a course", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ id: "e1" }, { id: "e2" }])
      .mockResolvedValueOnce([{ total: 2 }]);

    const result = await listCourseEnrollments(1, "c1");

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("should filter by status", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await listCourseEnrollments(1, "c1", { status: "completed" });

    const dataQuery = mockDB.raw.mock.calls[0][0];
    expect(dataQuery).toContain("e.status = ?");
  });
});

// ── markLessonComplete ──────────────────────────────────────────────────

describe("markLessonComplete", () => {
  it("should mark a lesson as complete and update progress", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "e1", status: "enrolled", course_id: "c1", organization_id: 1, started_at: null }) // enrollment
      .mockResolvedValueOnce(null); // no existing progress
    mockDB.raw
      .mockResolvedValueOnce([{ id: "l1" }]) // lesson validation
      .mockResolvedValue(undefined); // updateTimeSpent raw
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234" }); // new lesson_progress
    mockDB.update.mockResolvedValue({}); // update enrollment

    // calculateProgress mocks
    mockDB.findById.mockResolvedValue({ id: "e1", course_id: "c1" });
    mockDB.raw
      .mockResolvedValueOnce([{ total: 5 }]) // total mandatory lessons
      .mockResolvedValueOnce([{ total: 1 }]); // completed mandatory lessons

    const result = await markLessonComplete(1, "e1", "l1", 10);

    expect(result.enrollment_id).toBe("e1");
    expect(result.lesson_id).toBe("l1");
  });

  it("should throw NotFoundError when enrollment does not exist", async () => {
    mockDB.findOne.mockResolvedValueOnce(null);

    await expect(markLessonComplete(1, "nonexistent", "l1")).rejects.toThrow("not found");
  });

  it("should throw BadRequestError when enrollment is completed", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "e1", status: "completed", organization_id: 1 });

    await expect(markLessonComplete(1, "e1", "l1")).rejects.toThrow("Cannot update progress");
  });

  it("should throw BadRequestError when enrollment is dropped", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "e1", status: "dropped", organization_id: 1 });

    await expect(markLessonComplete(1, "e1", "l1")).rejects.toThrow("Cannot update progress");
  });

  it("should throw NotFoundError when lesson is not in enrolled course", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "e1", status: "in_progress", course_id: "c1", organization_id: 1 });
    mockDB.raw.mockResolvedValueOnce([]); // no lesson found

    await expect(markLessonComplete(1, "e1", "bad-lesson")).rejects.toThrow("not found");
  });
});

// ── calculateProgress ───────────────────────────────────────────────────

describe("calculateProgress", () => {
  it("should calculate progress as percentage of mandatory lessons completed", async () => {
    mockDB.findById.mockResolvedValue({ id: "e1", course_id: "c1" });
    mockDB.raw
      .mockResolvedValueOnce([{ total: 10 }])  // total mandatory lessons
      .mockResolvedValueOnce([{ total: 5 }]);   // completed mandatory lessons
    mockDB.update.mockResolvedValue({});

    const progress = await calculateProgress("e1");

    expect(progress).toBe(50);
    expect(mockDB.update).toHaveBeenCalledWith("enrollments", "e1", { progress_percentage: 50 });
  });

  it("should return 100 when no mandatory lessons exist", async () => {
    mockDB.findById.mockResolvedValue({ id: "e1", course_id: "c1" });
    mockDB.raw.mockResolvedValueOnce([{ total: 0 }]); // no mandatory lessons

    const progress = await calculateProgress("e1");

    expect(progress).toBe(100);
  });

  it("should return 0 when enrollment not found", async () => {
    mockDB.findById.mockResolvedValue(null);

    const progress = await calculateProgress("nonexistent");

    expect(progress).toBe(0);
  });
});

// ── completeEnrollment ──────────────────────────────────────────────────

describe("completeEnrollment", () => {
  it("should complete an active enrollment", async () => {
    mockDB.findOne.mockResolvedValue({ id: "e1", status: "in_progress", course_id: "c1", user_id: 42, organization_id: 1 });
    mockDB.update.mockResolvedValue({});
    mockDB.raw.mockResolvedValue(undefined);
    mockDB.findById.mockResolvedValue({ id: "e1", status: "completed", certificate_template_id: null });

    await completeEnrollment(1, "e1");

    expect(mockDB.update).toHaveBeenCalledWith("enrollments", "e1", expect.objectContaining({
      status: "completed",
      progress_percentage: 100,
    }));
    expect(lmsEvents.emit).toHaveBeenCalledWith("enrollment.completed", expect.any(Object));
  });

  it("should throw NotFoundError when enrollment does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(completeEnrollment(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should throw BadRequestError when enrollment is already completed", async () => {
    mockDB.findOne.mockResolvedValue({ id: "e1", status: "completed", organization_id: 1 });

    await expect(completeEnrollment(1, "e1")).rejects.toThrow("already completed");
  });
});

// ── dropEnrollment ──────────────────────────────────────────────────────

describe("dropEnrollment", () => {
  it("should drop an active enrollment", async () => {
    mockDB.findOne.mockResolvedValue({ id: "e1", status: "in_progress", course_id: "c1", organization_id: 1 });
    mockDB.update.mockResolvedValue({});
    mockDB.raw.mockResolvedValue(undefined);
    mockDB.findById.mockResolvedValue({ id: "e1", status: "dropped" });

    const result = await dropEnrollment(1, "e1");

    expect(mockDB.update).toHaveBeenCalledWith("enrollments", "e1", { status: "dropped" });
    expect(result.status).toBe("dropped");
  });

  it("should throw NotFoundError when enrollment does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(dropEnrollment(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should throw BadRequestError when enrollment is completed", async () => {
    mockDB.findOne.mockResolvedValue({ id: "e1", status: "completed", organization_id: 1 });

    await expect(dropEnrollment(1, "e1")).rejects.toThrow("Cannot drop a completed enrollment");
  });

  it("should throw BadRequestError when enrollment is already dropped", async () => {
    mockDB.findOne.mockResolvedValue({ id: "e1", status: "dropped", organization_id: 1 });

    await expect(dropEnrollment(1, "e1")).rejects.toThrow("already dropped");
  });
});

// ── getMyProgress ───────────────────────────────────────────────────────

describe("getMyProgress", () => {
  it("should return enrollment and lessons with progress", async () => {
    mockDB.findOne.mockResolvedValue({ id: "e1", course_id: "c1" });
    mockDB.raw.mockResolvedValue([
      { id: "l1", title: "Lesson 1", is_completed: true },
      { id: "l2", title: "Lesson 2", is_completed: false },
    ]);

    const result = await getMyProgress(1, 42, "c1");

    expect(result.enrollment.id).toBe("e1");
    expect(result.lessons).toHaveLength(2);
  });

  it("should throw NotFoundError when enrollment not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getMyProgress(1, 42, "c1")).rejects.toThrow("not found");
  });
});

// ── updateTimeSpent ─────────────────────────────────────────────────────

describe("updateTimeSpent", () => {
  it("should update time spent via raw query", async () => {
    mockDB.raw.mockResolvedValue(undefined);

    await updateTimeSpent("e1", 30);

    expect(mockDB.raw).toHaveBeenCalledWith(
      expect.stringContaining("time_spent_minutes = time_spent_minutes + ?"),
      [30, "e1"]
    );
  });
});

// ── getRecentActivity ───────────────────────────────────────────────────

describe("getRecentActivity", () => {
  it("should return recent lesson progress activity", async () => {
    mockDB.raw.mockResolvedValue([
      { lesson_title: "Lesson 1", course_title: "Course 1" },
      { lesson_title: "Lesson 2", course_title: "Course 1" },
    ]);

    const result = await getRecentActivity(1, 42, 10);

    expect(result).toHaveLength(2);
    expect(mockDB.raw).toHaveBeenCalledWith(expect.stringContaining("LIMIT ?"), [42, 1, 10]);
  });

  it("should use default limit of 10", async () => {
    mockDB.raw.mockResolvedValue([]);

    await getRecentActivity(1, 42);

    expect(mockDB.raw).toHaveBeenCalledWith(expect.any(String), [42, 1, 10]);
  });
});

// ── updateProgress (alias) ──────────────────────────────────────────────

describe("updateProgress", () => {
  it("should delegate to markLessonComplete", async () => {
    // Set up the same mocks as markLessonComplete would need
    mockDB.findOne
      .mockResolvedValueOnce({ id: "e1", status: "in_progress", course_id: "c1", organization_id: 1 })
      .mockResolvedValueOnce(null); // no existing lesson progress
    mockDB.raw
      .mockResolvedValueOnce([{ id: "l1" }]); // lesson validation
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234" });
    mockDB.update.mockResolvedValue({});
    mockDB.findById.mockResolvedValue({ id: "e1", course_id: "c1" });
    mockDB.raw
      .mockResolvedValueOnce([{ total: 5 }])
      .mockResolvedValueOnce([{ total: 2 }]);

    const result = await updateProgress(1, "e1", "l1");

    expect(result).toHaveProperty("enrollment_id", "e1");
    expect(result).toHaveProperty("lesson_id", "l1");
  });
});
