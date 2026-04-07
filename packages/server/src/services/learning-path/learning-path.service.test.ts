import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/adapters/index", () => ({
  getDB: vi.fn(),
}));

vi.mock("../../db/empcloud", () => ({
  findUserById: vi.fn(),
  findUsersByOrgId: vi.fn(),
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
import { findUserById } from "../../db/empcloud";
import { lmsEvents } from "../../events/index";
import {
  listLearningPaths,
  getLearningPath,
  createLearningPath,
  updateLearningPath,
  deleteLearningPath,
  publishLearningPath,
  addCourse,
  removeCourse,
  reorderCourses,
  enrollUser,
  getEnrollment,
  listPathEnrollments,
  listUserPathEnrollments,
  updatePathProgress,
} from "./learning-path.service";

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
  mockDB.transaction.mockImplementation((fn: any) => fn(mockDB));
  // Reset findUserById to prevent mock leaking between tests
  (findUserById as any).mockReset();
});

// ── listLearningPaths ─────────────────────────────────────────────────────

describe("listLearningPaths", () => {
  it("should return paginated learning paths with course counts", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [{ id: "lp1", title: "Path 1" }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    mockDB.count.mockResolvedValue(3);

    const result = await listLearningPaths(1);

    expect(result.page).toBe(1);
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].course_count).toBe(3);
  });

  it("should apply status filter", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    await listLearningPaths(1, { status: "published" });

    expect(mockDB.findMany).toHaveBeenCalledWith(
      "learning_paths",
      expect.objectContaining({
        filters: expect.objectContaining({ status: "published" }),
      })
    );
  });

  it("should apply search filter", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    await listLearningPaths(1, { search: "typescript" });

    expect(mockDB.findMany).toHaveBeenCalledWith(
      "learning_paths",
      expect.objectContaining({
        search: { fields: ["title", "description"], term: "typescript" },
      })
    );
  });

  it("should apply pagination parameters", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [],
      total: 50,
      page: 3,
      limit: 10,
      totalPages: 5,
    });

    const result = await listLearningPaths(1, { page: 3, limit: 10 });

    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
  });
});

// ── getLearningPath ───────────────────────────────────────────────────────

describe("getLearningPath", () => {
  it("should return learning path with courses and total duration", async () => {
    mockDB.findOne.mockResolvedValue({ id: "lp1", title: "Test Path" });
    mockDB.raw.mockResolvedValue([
      { id: "c1", title: "Course 1", duration_minutes: 30, sort_order: 0 },
      { id: "c2", title: "Course 2", duration_minutes: 45, sort_order: 1 },
    ]);

    const result = await getLearningPath(1, "lp1");

    expect(result.title).toBe("Test Path");
    expect(result.courses).toHaveLength(2);
    expect(result.total_duration_minutes).toBe(75);
  });

  it("should throw NotFoundError when path does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getLearningPath(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should handle path with no courses (zero duration)", async () => {
    mockDB.findOne.mockResolvedValue({ id: "lp1", title: "Empty Path" });
    mockDB.raw.mockResolvedValue([]);

    const result = await getLearningPath(1, "lp1");

    expect(result.courses).toEqual([]);
    expect(result.total_duration_minutes).toBe(0);
  });
});

// ── createLearningPath ──────────────────────────────────────────────────

describe("createLearningPath", () => {
  it("should create a learning path successfully", async () => {
    mockDB.findOne.mockResolvedValue(null); // no slug conflict
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      title: "New Path",
      slug: "new-path",
      status: "draft",
    });

    const result = await createLearningPath(1, 42, { title: "New Path" });

    expect(mockDB.create).toHaveBeenCalledWith(
      "learning_paths",
      expect.objectContaining({
        id: "test-uuid-1234",
        org_id: 1,
        title: "New Path",
        slug: "new-path",
        status: "draft",
        created_by: 42,
      })
    );
    expect(result.title).toBe("New Path");
  });

  it("should throw BadRequestError when title is empty", async () => {
    await expect(createLearningPath(1, 42, { title: "" })).rejects.toThrow(
      "Title is required"
    );
  });

  it("should append timestamp to slug if slug already exists", async () => {
    mockDB.findOne.mockResolvedValue({ id: "existing", slug: "new-path" });
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      title: "New Path",
    });

    await createLearningPath(1, 42, { title: "New Path" });

    expect(mockDB.create).toHaveBeenCalledWith(
      "learning_paths",
      expect.objectContaining({
        slug: expect.stringMatching(/^new-path-\d+$/),
      })
    );
  });
});

// ── updateLearningPath ──────────────────────────────────────────────────

describe("updateLearningPath", () => {
  it("should update learning path successfully", async () => {
    mockDB.findOne.mockResolvedValue({ id: "lp1", title: "Old Title", org_id: 1 });
    mockDB.update.mockResolvedValue({ id: "lp1", description: "Updated" });

    const result = await updateLearningPath(1, "lp1", { description: "Updated" });

    expect(mockDB.update).toHaveBeenCalledWith(
      "learning_paths",
      "lp1",
      expect.objectContaining({ description: "Updated" })
    );
    expect(result.description).toBe("Updated");
  });

  it("should throw NotFoundError when path does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(
      updateLearningPath(1, "nonexistent", { title: "X" })
    ).rejects.toThrow("not found");
  });

  it("should regenerate slug when title changes", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "lp1", title: "Old Title", org_id: 1 })
      .mockResolvedValueOnce(null); // slug check
    mockDB.update.mockResolvedValue({ id: "lp1", title: "New Title", slug: "new-title" });

    await updateLearningPath(1, "lp1", { title: "New Title" });

    expect(mockDB.update).toHaveBeenCalledWith(
      "learning_paths",
      "lp1",
      expect.objectContaining({ slug: "new-title" })
    );
  });

  it("should return existing path when no fields to update", async () => {
    const path = { id: "lp1", title: "Title", org_id: 1 };
    mockDB.findOne.mockResolvedValue(path);

    const result = await updateLearningPath(1, "lp1", {});

    expect(mockDB.update).not.toHaveBeenCalled();
    expect(result).toEqual(path);
  });
});

// ── deleteLearningPath ──────────────────────────────────────────────────

describe("deleteLearningPath", () => {
  it("should archive the learning path", async () => {
    mockDB.findOne.mockResolvedValue({ id: "lp1", org_id: 1 });
    mockDB.update.mockResolvedValue({ id: "lp1", status: "archived" });

    const result = await deleteLearningPath(1, "lp1");

    expect(mockDB.update).toHaveBeenCalledWith("learning_paths", "lp1", {
      status: "archived",
    });
    expect(result.status).toBe("archived");
  });

  it("should throw NotFoundError when path not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(deleteLearningPath(1, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── publishLearningPath ─────────────────────────────────────────────────

describe("publishLearningPath", () => {
  it("should publish path with courses", async () => {
    mockDB.findOne.mockResolvedValue({ id: "lp1", status: "draft", org_id: 1 });
    mockDB.count.mockResolvedValue(3);
    mockDB.raw.mockResolvedValue([{ total_duration: 120 }]);
    mockDB.update.mockResolvedValue({ id: "lp1", status: "published" });

    const result = await publishLearningPath(1, "lp1");

    expect(result.status).toBe("published");
  });

  it("should fail without courses", async () => {
    mockDB.findOne.mockResolvedValue({ id: "lp1", status: "draft", org_id: 1 });
    mockDB.count.mockResolvedValue(0);

    await expect(publishLearningPath(1, "lp1")).rejects.toThrow("no courses");
  });

  it("should throw NotFoundError when path not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(publishLearningPath(1, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── addCourse ───────────────────────────────────────────────────────────

describe("addCourse", () => {
  it("should add a course to the learning path", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "lp1", org_id: 1 }) // path
      .mockResolvedValueOnce({ id: "c1", org_id: 1 }) // course
      .mockResolvedValueOnce(null); // no existing
    mockDB.raw.mockResolvedValue([{ max_order: 2 }]); // max sort order
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      learning_path_id: "lp1",
      course_id: "c1",
    });
    // calculatePathDuration raw call
    mockDB.raw.mockResolvedValue([{ total_duration: 60 }]);
    mockDB.update.mockResolvedValue({});

    const result = await addCourse(1, "lp1", "c1");

    expect(mockDB.create).toHaveBeenCalledWith(
      "learning_path_courses",
      expect.objectContaining({
        learning_path_id: "lp1",
        course_id: "c1",
      })
    );
    expect(result).toBeDefined();
  });

  it("should throw NotFoundError when path does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(addCourse(1, "nonexistent", "c1")).rejects.toThrow("not found");
  });

  it("should throw NotFoundError when course does not exist", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "lp1", org_id: 1 }) // path found
      .mockResolvedValueOnce(null); // course not found

    await expect(addCourse(1, "lp1", "nonexistent")).rejects.toThrow("not found");
  });

  it("should throw ConflictError when course already in path", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "lp1", org_id: 1 }) // path
      .mockResolvedValueOnce({ id: "c1", org_id: 1 }) // course
      .mockResolvedValueOnce({ id: "existing" }); // already linked

    await expect(addCourse(1, "lp1", "c1")).rejects.toThrow("already");
  });
});

// ── removeCourse ────────────────────────────────────────────────────────

describe("removeCourse", () => {
  it("should remove a course from the learning path", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "lp1", org_id: 1 }) // path
      .mockResolvedValueOnce({ id: "lpc1", learning_path_id: "lp1", course_id: "c1" }); // record
    mockDB.delete.mockResolvedValue(undefined);
    mockDB.raw.mockResolvedValue([{ total_duration: 30 }]);
    mockDB.update.mockResolvedValue({});

    const result = await removeCourse(1, "lp1", "c1");

    expect(mockDB.delete).toHaveBeenCalledWith("learning_path_courses", "lpc1");
    expect(result.removed).toBe(true);
  });

  it("should throw NotFoundError when path not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(removeCourse(1, "nonexistent", "c1")).rejects.toThrow("not found");
  });

  it("should throw NotFoundError when course not in path", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "lp1", org_id: 1 }) // path
      .mockResolvedValueOnce(null); // record not found

    await expect(removeCourse(1, "lp1", "c1")).rejects.toThrow("not found");
  });
});

// ── reorderCourses ──────────────────────────────────────────────────────

describe("reorderCourses", () => {
  it("should reorder courses in the learning path", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "lp1", org_id: 1 }) // path
      .mockResolvedValueOnce({ id: "lpc1" }) // record for c1
      .mockResolvedValueOnce({ id: "lpc2" }); // record for c2
    mockDB.update.mockResolvedValue({});

    const result = await reorderCourses(1, "lp1", ["c1", "c2"]);

    expect(mockDB.update).toHaveBeenCalledWith("learning_path_courses", "lpc1", {
      sort_order: 0,
    });
    expect(mockDB.update).toHaveBeenCalledWith("learning_path_courses", "lpc2", {
      sort_order: 1,
    });
    expect(result.order).toEqual(["c1", "c2"]);
  });

  it("should throw NotFoundError when path not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(reorderCourses(1, "nonexistent", ["c1"])).rejects.toThrow(
      "not found"
    );
  });
});

// ── enrollUser ──────────────────────────────────────────────────────────

describe("enrollUser", () => {
  it("should enroll user in a published learning path", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "lp1", org_id: 1, status: "published" }) // path
      .mockResolvedValueOnce(null); // no existing enrollment
    (findUserById as any).mockResolvedValueOnce({
      id: 42,
      organization_id: 1,
      first_name: "John",
      last_name: "Doe",
    });
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      user_id: 42,
      learning_path_id: "lp1",
      status: "enrolled",
    });
    mockDB.raw.mockResolvedValue([]); // no path courses

    const result = await enrollUser(1, 42, "lp1");

    expect(result.status).toBe("enrolled");
  });

  it("should throw BadRequestError when path is not published", async () => {
    mockDB.findOne.mockResolvedValue({ id: "lp1", org_id: 1, status: "draft" });

    await expect(enrollUser(1, 42, "lp1")).rejects.toThrow("unpublished");
  });

  it("should throw ConflictError when already enrolled", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "lp1", org_id: 1, status: "published" }) // path
      .mockResolvedValueOnce({ id: "existing-enrollment" }); // already enrolled
    (findUserById as any).mockResolvedValueOnce({
      id: 42,
      organization_id: 1,
    });

    await expect(enrollUser(1, 42, "lp1")).rejects.toThrow("already enrolled");
  });

  it("should throw NotFoundError when path not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(enrollUser(1, 42, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── getEnrollment ───────────────────────────────────────────────────────

describe("getEnrollment", () => {
  it("should return enrollment with course progress", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "e1",
      user_id: 42,
      learning_path_id: "lp1",
      progress_percentage: 50,
    });
    mockDB.raw.mockResolvedValue([
      { course_id: "c1", course_title: "Course 1", progress_percentage: 100 },
      { course_id: "c2", course_title: "Course 2", progress_percentage: 0 },
    ]);

    const result = await getEnrollment(1, 42, "lp1");

    expect(result.progress_percentage).toBe(50);
    expect(result.courses).toHaveLength(2);
  });

  it("should throw NotFoundError when enrollment not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getEnrollment(1, 42, "lp1")).rejects.toThrow("not found");
  });
});

// ── listPathEnrollments ─────────────────────────────────────────────────

describe("listPathEnrollments", () => {
  it("should return enriched enrollments for a path", async () => {
    mockDB.findOne.mockResolvedValue({ id: "lp1", org_id: 1 }); // path
    mockDB.findMany.mockResolvedValue({
      data: [{ id: "e1", user_id: 42, learning_path_id: "lp1" }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    (findUserById as any).mockResolvedValue({
      id: 42,
      first_name: "John",
      last_name: "Doe",
      email: "john@test.com",
    });

    const result = await listPathEnrollments(1, "lp1");

    expect(result.data).toHaveLength(1);
    expect(result.data[0].user_name).toBe("John Doe");
    expect(result.data[0].user_email).toBe("john@test.com");
  });

  it("should throw NotFoundError when path not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(listPathEnrollments(1, "nonexistent")).rejects.toThrow(
      "not found"
    );
  });
});

// ── listUserPathEnrollments ─────────────────────────────────────────────

describe("listUserPathEnrollments", () => {
  it("should return enriched enrollments for a user", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [{ id: "e1", user_id: 42, learning_path_id: "lp1" }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    mockDB.findById.mockResolvedValue({
      id: "lp1",
      title: "My Path",
      status: "published",
    });

    const result = await listUserPathEnrollments(1, 42);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].learning_path_title).toBe("My Path");
    expect(result.data[0].learning_path_status).toBe("published");
  });
});

// ── updatePathProgress ──────────────────────────────────────────────────

describe("updatePathProgress", () => {
  it("should calculate and update progress to in_progress", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "e1",
      user_id: 42,
      learning_path_id: "lp1",
      status: "enrolled",
    });
    mockDB.raw.mockResolvedValue([
      { course_id: "c1", is_mandatory: true, progress_percentage: 100, enrollment_status: "completed" },
      { course_id: "c2", is_mandatory: true, progress_percentage: 0, enrollment_status: "enrolled" },
    ]);
    mockDB.update.mockResolvedValue({
      id: "e1",
      status: "in_progress",
      progress_percentage: 50,
    });

    const result = await updatePathProgress(1, 42, "lp1");

    expect(mockDB.update).toHaveBeenCalledWith(
      "learning_path_enrollments",
      "e1",
      expect.objectContaining({
        status: "in_progress",
      })
    );
  });

  it("should mark as completed when all courses done", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "e1",
      user_id: 42,
      learning_path_id: "lp1",
      status: "in_progress",
    });
    mockDB.raw.mockResolvedValue([
      { course_id: "c1", is_mandatory: true, progress_percentage: 100, enrollment_status: "completed" },
      { course_id: "c2", is_mandatory: true, progress_percentage: 100, enrollment_status: "completed" },
    ]);
    mockDB.update.mockResolvedValue({
      id: "e1",
      status: "completed",
      progress_percentage: 100,
    });

    await updatePathProgress(1, 42, "lp1");

    expect(lmsEvents.emit).toHaveBeenCalledWith(
      "learning_path.completed",
      expect.objectContaining({
        learningPathId: "lp1",
        userId: 42,
      })
    );
  });

  it("should throw NotFoundError when enrollment not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(updatePathProgress(1, 42, "lp1")).rejects.toThrow("not found");
  });

  it("should return enrollment unchanged when no courses exist", async () => {
    const enrollment = {
      id: "e1",
      user_id: 42,
      learning_path_id: "lp1",
      status: "enrolled",
    };
    mockDB.findOne.mockResolvedValue(enrollment);
    mockDB.raw.mockResolvedValue([]);

    const result = await updatePathProgress(1, 42, "lp1");

    expect(result).toEqual(enrollment);
    expect(mockDB.update).not.toHaveBeenCalled();
  });
});
