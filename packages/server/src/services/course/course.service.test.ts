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
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  publishCourse,
  unpublishCourse,
  duplicateCourse,
  getCourseStats,
  getPopularCourses,
  getRecommendedCourses,
} from "./course.service";

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

// ── listCourses ──────────────────────────────────────────────────────────

describe("listCourses", () => {
  it("should return paginated courses with defaults", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ id: "c1", title: "Course 1", category_name: "Tech" }])
      .mockResolvedValueOnce([{ total: 1 }]);

    const result = await listCourses(1, {});

    expect(result.page).toBe(1);
    expect(result.perPage).toBe(20);
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it("should apply pagination parameters", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 50 }]);

    const result = await listCourses(1, { page: 3, perPage: 10 });

    expect(result.page).toBe(3);
    expect(result.perPage).toBe(10);
    expect(result.total).toBe(50);
  });

  it("should filter by status", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await listCourses(1, { status: "published" });

    const dataQuery = mockDB.raw.mock.calls[0][0];
    expect(dataQuery).toContain("c.status = ?");
  });

  it("should filter by category_id", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await listCourses(1, { category_id: "cat-1" });

    const dataQuery = mockDB.raw.mock.calls[0][0];
    expect(dataQuery).toContain("c.category_id = ?");
  });

  it("should filter by difficulty", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await listCourses(1, { difficulty: "advanced" });

    const dataQuery = mockDB.raw.mock.calls[0][0];
    expect(dataQuery).toContain("c.difficulty = ?");
  });

  it("should filter by is_mandatory", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await listCourses(1, { is_mandatory: true });

    const dataQuery = mockDB.raw.mock.calls[0][0];
    expect(dataQuery).toContain("c.is_mandatory = ?");
  });

  it("should apply search filter", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await listCourses(1, { search: "typescript" });

    const dataQuery = mockDB.raw.mock.calls[0][0];
    expect(dataQuery).toContain("c.title LIKE ?");
    expect(dataQuery).toContain("c.description LIKE ?");
  });

  it("should return empty results", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    const result = await listCourses(1, {});

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("should handle tags filter", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await listCourses(1, { tags: "javascript,react" });

    const dataQuery = mockDB.raw.mock.calls[0][0];
    expect(dataQuery).toContain("JSON_CONTAINS(c.tags, ?)");
  });
});

// ── getCourse ────────────────────────────────────────────────────────────

describe("getCourse", () => {
  it("should return course with counts", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", title: "Test Course" });
    mockDB.count
      .mockResolvedValueOnce(3) // modules
      .mockResolvedValueOnce(1); // quizzes
    mockDB.raw
      .mockResolvedValueOnce([{ total: 10 }]); // lessons
    mockDB.count.mockResolvedValueOnce(5); // enrollments

    const result = await getCourse(1, "c1");

    expect(result.title).toBe("Test Course");
    expect(result.modules_count).toBe(3);
    expect(result.lessons_count).toBe(10);
  });

  it("should throw NotFoundError when course does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getCourse(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should handle zero counts gracefully", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", title: "Empty Course" });
    mockDB.count.mockResolvedValue(0);
    mockDB.raw.mockResolvedValue([{ total: 0 }]);

    const result = await getCourse(1, "c1");

    expect(result.lessons_count).toBe(0);
  });
});

// ── createCourse ─────────────────────────────────────────────────────────

describe("createCourse", () => {
  it("should create a course successfully", async () => {
    mockDB.findOne.mockResolvedValue(null); // no slug conflict
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", title: "New Course", slug: "new-course" });

    const result = await createCourse(1, 42, { title: "New Course" });

    expect(mockDB.create).toHaveBeenCalledWith("courses", expect.objectContaining({
      id: "test-uuid-1234",
      organization_id: 1,
      created_by: 42,
      title: "New Course",
      slug: "new-course",
      status: "draft",
    }));
    expect(lmsEvents.emit).toHaveBeenCalledWith("course.created", expect.any(Object));
    expect(result.title).toBe("New Course");
  });

  it("should validate category exists", async () => {
    mockDB.findOne.mockResolvedValueOnce(null); // category not found

    await expect(createCourse(1, 42, { title: "Test", category_id: "bad-cat" })).rejects.toThrow("not found");
  });

  it("should generate slug from title", async () => {
    mockDB.findOne.mockResolvedValue(null);
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", slug: "my-great-course" });

    await createCourse(1, 42, { title: "My Great Course!" });

    expect(mockDB.create).toHaveBeenCalledWith("courses", expect.objectContaining({
      slug: "my-great-course",
    }));
  });

  it("should throw ConflictError on duplicate slug", async () => {
    // First findOne for category check (no category_id so skipped)
    // Then findOne for slug check returns existing
    mockDB.findOne.mockResolvedValueOnce({ id: "existing", slug: "test" });

    await expect(createCourse(1, 42, { title: "Test" })).rejects.toThrow("already exists");
  });

  it("should use provided slug over auto-generated", async () => {
    mockDB.findOne.mockResolvedValue(null);
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", slug: "custom-slug" });

    await createCourse(1, 42, { title: "Test", slug: "custom-slug" });

    expect(mockDB.create).toHaveBeenCalledWith("courses", expect.objectContaining({
      slug: "custom-slug",
    }));
  });
});

// ── updateCourse ─────────────────────────────────────────────────────────

describe("updateCourse", () => {
  it("should update course successfully", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", title: "Old Title", organization_id: 1 });
    mockDB.update.mockResolvedValue({ id: "c1", title: "Old Title", description: "Updated" });

    const result = await updateCourse(1, "c1", { description: "Updated" });

    expect(mockDB.update).toHaveBeenCalledWith("courses", "c1", expect.objectContaining({
      description: "Updated",
    }));
    expect(result.description).toBe("Updated");
  });

  it("should throw NotFoundError when course does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(updateCourse(1, "nonexistent", { title: "X" })).rejects.toThrow("not found");
  });

  it("should regenerate slug when title changes", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "c1", title: "Old Title", organization_id: 1 }) // course
      .mockResolvedValueOnce(null); // slug check
    mockDB.update.mockResolvedValue({ id: "c1", title: "New Title", slug: "new-title" });

    await updateCourse(1, "c1", { title: "New Title" });

    expect(mockDB.update).toHaveBeenCalledWith("courses", "c1", expect.objectContaining({
      slug: "new-title",
    }));
  });

  it("should throw ConflictError on slug collision during title update", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "c1", title: "Old", organization_id: 1 })
      .mockResolvedValueOnce({ id: "c2", slug: "new-title" }); // different course owns slug

    await expect(updateCourse(1, "c1", { title: "New Title" })).rejects.toThrow("already exists");
  });

  it("should validate category when changed", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "c1", title: "X", category_id: "old-cat", organization_id: 1 })
      .mockResolvedValueOnce(null); // category not found

    await expect(updateCourse(1, "c1", { category_id: "bad-cat" })).rejects.toThrow("not found");
  });
});

// ── deleteCourse ─────────────────────────────────────────────────────────

describe("deleteCourse", () => {
  it("should archive course with no active enrollments", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.count
      .mockResolvedValueOnce(0)  // enrolled
      .mockResolvedValueOnce(0); // in_progress
    mockDB.update.mockResolvedValue({ id: "c1", status: "archived" });

    const result = await deleteCourse(1, "c1");

    expect(result.status).toBe("archived");
    expect(lmsEvents.emit).toHaveBeenCalledWith("course.archived", expect.any(Object));
  });

  it("should throw when active enrollments exist", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.count
      .mockResolvedValueOnce(5)  // enrolled
      .mockResolvedValueOnce(0); // in_progress

    await expect(deleteCourse(1, "c1")).rejects.toThrow("active enrollments");
  });

  it("should throw when in-progress enrollments exist", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.count
      .mockResolvedValueOnce(0)  // enrolled
      .mockResolvedValueOnce(3); // in_progress

    await expect(deleteCourse(1, "c1")).rejects.toThrow("active enrollments");
  });

  it("should throw NotFoundError when course not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(deleteCourse(1, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── publishCourse ────────────────────────────────────────────────────────

describe("publishCourse", () => {
  it("should publish course with modules and lessons", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", title: "Test", status: "draft", organization_id: 1 });
    mockDB.raw
      .mockResolvedValueOnce([{ id: "m1" }]) // modules
      .mockResolvedValueOnce([{ total: 5 }]); // lessons count
    mockDB.update.mockResolvedValue({ id: "c1", status: "published" });

    const result = await publishCourse(1, "c1");

    expect(result.status).toBe("published");
    expect(lmsEvents.emit).toHaveBeenCalledWith("course.published", expect.any(Object));
  });

  it("should fail without modules", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", status: "draft", organization_id: 1 });
    mockDB.raw.mockResolvedValueOnce([]); // no modules

    await expect(publishCourse(1, "c1")).rejects.toThrow("at least one module");
  });

  it("should fail without lessons", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", status: "draft", organization_id: 1 });
    mockDB.raw
      .mockResolvedValueOnce([{ id: "m1" }]) // has module
      .mockResolvedValueOnce([{ total: 0 }]); // no lessons

    await expect(publishCourse(1, "c1")).rejects.toThrow("at least one lesson");
  });

  it("should fail if already published", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", status: "published", organization_id: 1 });

    await expect(publishCourse(1, "c1")).rejects.toThrow("already published");
  });
});

// ── unpublishCourse ──────────────────────────────────────────────────────

describe("unpublishCourse", () => {
  it("should unpublish a published course", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", status: "published", organization_id: 1 });
    mockDB.update.mockResolvedValue({ id: "c1", status: "draft" });

    const result = await unpublishCourse(1, "c1");

    expect(result.status).toBe("draft");
  });

  it("should fail if course is not published", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", status: "draft", organization_id: 1 });

    await expect(unpublishCourse(1, "c1")).rejects.toThrow("not published");
  });
});

// ── duplicateCourse ──────────────────────────────────────────────────────

describe("duplicateCourse", () => {
  it("should deep copy a course with modules and lessons", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "c1", title: "Original", description: "Desc",
      organization_id: 1, category_id: null, tags: "[]",
      prerequisites: "[]", metadata: "{}",
    });
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234" });
    mockDB.raw
      .mockResolvedValueOnce([{ id: "m1", title: "Mod 1", sort_order: 0 }]) // modules
      .mockResolvedValueOnce([{ id: "l1", title: "Lesson 1", sort_order: 0 }]) // lessons for m1
      .mockResolvedValueOnce([]) // quizzes for m1
      .mockResolvedValueOnce([]); // course-level quizzes
    mockDB.findById.mockResolvedValue({ id: "test-uuid-1234", title: "Original (Copy)" });

    const result = await duplicateCourse(1, 42, "c1");

    expect(mockDB.create).toHaveBeenCalledWith("courses", expect.objectContaining({
      title: "Original (Copy)",
      status: "draft",
      enrollment_count: 0,
    }));
    expect(result).toBeDefined();
  });

  it("should throw NotFoundError when source course missing", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(duplicateCourse(1, 42, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── getCourseStats ───────────────────────────────────────────────────────

describe("getCourseStats", () => {
  it("should return correct stats", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.count.mockResolvedValue(10);
    mockDB.raw
      .mockResolvedValueOnce([{ total: 7 }])   // completed
      .mockResolvedValueOnce([{ avg_score: 85.5 }])
      .mockResolvedValueOnce([{ avg_rating: 4.2 }])
      .mockResolvedValueOnce([{ total_time: 500 }]);

    const result = await getCourseStats(1, "c1");

    expect(result.enrollment_count).toBe(10);
    expect(result.completion_count).toBe(7);
    expect(result.completion_rate).toBe(70);
    expect(result.avg_score).toBe(85.5);
    expect(result.avg_rating).toBe(4.2);
    expect(result.total_time_spent_minutes).toBe(500);
  });

  it("should handle zero enrollments", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.count.mockResolvedValue(0);
    mockDB.raw.mockResolvedValue([{ total: 0, avg_score: null, avg_rating: null, total_time: null }]);

    const result = await getCourseStats(1, "c1");

    expect(result.completion_rate).toBe(0);
  });
});

// ── getPopularCourses ────────────────────────────────────────────────────

describe("getPopularCourses", () => {
  it("should return courses ordered by enrollment count", async () => {
    mockDB.raw.mockResolvedValue([
      { id: "c1", enrollment_count: 100 },
      { id: "c2", enrollment_count: 50 },
    ]);

    const result = await getPopularCourses(1, 10);

    expect(result).toHaveLength(2);
    const query = mockDB.raw.mock.calls[0][0];
    expect(query).toContain("ORDER BY c.enrollment_count DESC");
  });
});

// ── getRecommendedCourses ────────────────────────────────────────────────

describe("getRecommendedCourses", () => {
  it("should return popular courses when no profile exists", async () => {
    mockDB.findOne.mockResolvedValue(null); // no profile
    mockDB.raw.mockResolvedValue([{ id: "c1" }]);

    const result = await getRecommendedCourses(1, 42, 10);

    expect(result).toHaveLength(1);
  });

  it("should exclude already enrolled courses", async () => {
    mockDB.findOne.mockResolvedValue(null);
    mockDB.raw.mockResolvedValue([]);

    await getRecommendedCourses(1, 42, 10);

    const query = mockDB.raw.mock.calls[0][0];
    expect(query).toContain("NOT IN");
  });

  it("should use preferred categories from profile", async () => {
    mockDB.findOne.mockResolvedValue({
      preferred_categories: JSON.stringify(["cat-1", "cat-2"]),
    });
    mockDB.raw.mockResolvedValue([{ id: "c1" }]);

    const result = await getRecommendedCourses(1, 42, 10);

    expect(result).toHaveLength(1);
    const query = mockDB.raw.mock.calls[0][0];
    expect(query).toContain("category_id IN");
  });

  it("should fallback when profile has empty categories", async () => {
    mockDB.findOne.mockResolvedValue({
      preferred_categories: "[]",
    });
    mockDB.raw.mockResolvedValue([]);

    const result = await getRecommendedCourses(1, 42, 10);

    expect(result).toEqual([]);
  });
});
