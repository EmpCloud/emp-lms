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
import {
  listLessons,
  getLesson,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
  getPreviewLessons,
} from "./lesson.service";

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

// ── listLessons ─────────────────────────────────────────────────────────

describe("listLessons", () => {
  it("should return lessons ordered by sort_order", async () => {
    mockDB.raw.mockResolvedValue([
      { id: "l1", title: "Lesson 1", sort_order: 0 },
      { id: "l2", title: "Lesson 2", sort_order: 1 },
    ]);

    const result = await listLessons("module-1");

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Lesson 1");
  });

  it("should return empty array when no lessons exist", async () => {
    mockDB.raw.mockResolvedValue([]);

    const result = await listLessons("module-1");

    expect(result).toEqual([]);
  });
});

// ── getLesson ───────────────────────────────────────────────────────────

describe("getLesson", () => {
  it("should return a lesson", async () => {
    mockDB.findOne.mockResolvedValue({ id: "l1", title: "Intro", module_id: "m1" });

    const result = await getLesson("m1", "l1");

    expect(result.title).toBe("Intro");
  });

  it("should throw NotFoundError when lesson does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getLesson("m1", "nonexistent")).rejects.toThrow("not found");
  });
});

// ── createLesson ────────────────────────────────────────────────────────

describe("createLesson", () => {
  it("should create lesson successfully", async () => {
    mockDB.findById.mockResolvedValue({ id: "m1", course_id: "c1" }); // module exists
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 }); // course exists
    mockDB.raw.mockResolvedValue([{ max_order: 2 }]); // max sort_order
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", title: "New Lesson", sort_order: 3 });

    const result = await createLesson(1, "m1", { title: "New Lesson", content_type: "video" });

    expect(mockDB.create).toHaveBeenCalledWith("lessons", expect.objectContaining({
      id: "test-uuid-1234",
      module_id: "m1",
      title: "New Lesson",
      content_type: "video",
      sort_order: 3,
      is_mandatory: true,
      is_preview: false,
    }));
    expect(result.title).toBe("New Lesson");
  });

  it("should throw NotFoundError when module does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(createLesson(1, "bad-module", { title: "Test", content_type: "text" })).rejects.toThrow("not found");
  });

  it("should throw NotFoundError when course does not belong to org", async () => {
    mockDB.findById.mockResolvedValue({ id: "m1", course_id: "c1" });
    mockDB.findOne.mockResolvedValue(null); // course not found for org

    await expect(createLesson(1, "m1", { title: "Test", content_type: "text" })).rejects.toThrow("not found");
  });

  it("should use provided sort_order", async () => {
    mockDB.findById.mockResolvedValue({ id: "m1", course_id: "c1" });
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", sort_order: 10 });

    await createLesson(1, "m1", { title: "Test", content_type: "video", sort_order: 10 });

    expect(mockDB.create).toHaveBeenCalledWith("lessons", expect.objectContaining({
      sort_order: 10,
    }));
  });

  it("should auto-set sort_order to 0 when no lessons exist", async () => {
    mockDB.findById.mockResolvedValue({ id: "m1", course_id: "c1" });
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.raw.mockResolvedValue([{ max_order: null }]);
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", sort_order: 0 });

    await createLesson(1, "m1", { title: "First Lesson", content_type: "text" });

    expect(mockDB.create).toHaveBeenCalledWith("lessons", expect.objectContaining({
      sort_order: 0,
    }));
  });

  it("should set optional fields to defaults", async () => {
    mockDB.findById.mockResolvedValue({ id: "m1", course_id: "c1" });
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.raw.mockResolvedValue([{ max_order: 0 }]);
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234" });

    await createLesson(1, "m1", { title: "Test", content_type: "video" });

    expect(mockDB.create).toHaveBeenCalledWith("lessons", expect.objectContaining({
      description: null,
      content_url: null,
      content_text: null,
      duration_minutes: 0,
    }));
  });
});

// ── updateLesson ────────────────────────────────────────────────────────

describe("updateLesson", () => {
  it("should update lesson successfully", async () => {
    mockDB.findById
      .mockResolvedValueOnce({ id: "l1", module_id: "m1" })  // lesson
      .mockResolvedValueOnce({ id: "m1", course_id: "c1" }); // module
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 }); // course
    mockDB.update.mockResolvedValue({ id: "l1", title: "Updated" });

    const result = await updateLesson(1, "l1", { title: "Updated" });

    expect(mockDB.update).toHaveBeenCalledWith("lessons", "l1", { title: "Updated" });
    expect(result.title).toBe("Updated");
  });

  it("should throw NotFoundError when lesson does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(updateLesson(1, "nonexistent", { title: "X" })).rejects.toThrow("not found");
  });

  it("should throw NotFoundError when module does not exist", async () => {
    mockDB.findById
      .mockResolvedValueOnce({ id: "l1", module_id: "m1" })
      .mockResolvedValueOnce(null); // module not found

    await expect(updateLesson(1, "l1", { title: "X" })).rejects.toThrow("not found");
  });

  it("should throw NotFoundError when course does not belong to org", async () => {
    mockDB.findById
      .mockResolvedValueOnce({ id: "l1", module_id: "m1" })
      .mockResolvedValueOnce({ id: "m1", course_id: "c1" });
    mockDB.findOne.mockResolvedValue(null);

    await expect(updateLesson(1, "l1", { title: "X" })).rejects.toThrow("not found");
  });
});

// ── deleteLesson ────────────────────────────────────────────────────────

describe("deleteLesson", () => {
  it("should delete lesson successfully", async () => {
    mockDB.findById
      .mockResolvedValueOnce({ id: "l1", module_id: "m1" })
      .mockResolvedValueOnce({ id: "m1", course_id: "c1" });
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.delete.mockResolvedValue(undefined);

    const result = await deleteLesson(1, "l1");

    expect(mockDB.delete).toHaveBeenCalledWith("lessons", "l1");
    expect(result.deleted).toBe(true);
  });

  it("should throw NotFoundError when lesson does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(deleteLesson(1, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── reorderLessons ──────────────────────────────────────────────────────

describe("reorderLessons", () => {
  it("should reorder lessons successfully", async () => {
    mockDB.findById.mockResolvedValue({ id: "m1", course_id: "c1" });
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.raw.mockResolvedValue([{ id: "l1" }, { id: "l2" }, { id: "l3" }]);
    mockDB.update.mockResolvedValue(undefined);

    const result = await reorderLessons(1, "m1", ["l3", "l1", "l2"]);

    expect(mockDB.update).toHaveBeenCalledWith("lessons", "l3", { sort_order: 0 });
    expect(mockDB.update).toHaveBeenCalledWith("lessons", "l1", { sort_order: 1 });
    expect(mockDB.update).toHaveBeenCalledWith("lessons", "l2", { sort_order: 2 });
    expect(result.reordered).toBe(true);
  });

  it("should throw NotFoundError when module does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(reorderLessons(1, "bad-module", ["l1"])).rejects.toThrow("not found");
  });

  it("should throw BadRequestError when lesson does not belong to module", async () => {
    mockDB.findById.mockResolvedValue({ id: "m1", course_id: "c1" });
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.raw.mockResolvedValue([{ id: "l1" }, { id: "l2" }]);

    await expect(reorderLessons(1, "m1", ["l1", "l-bad"])).rejects.toThrow("does not belong");
  });
});

// ── getPreviewLessons ───────────────────────────────────────────────────

describe("getPreviewLessons", () => {
  it("should return preview lessons for a course", async () => {
    mockDB.raw.mockResolvedValue([
      { id: "l1", title: "Preview Lesson", is_preview: true, module_title: "Module 1" },
    ]);

    const result = await getPreviewLessons("c1");

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Preview Lesson");
  });

  it("should return empty array when no preview lessons exist", async () => {
    mockDB.raw.mockResolvedValue([]);

    const result = await getPreviewLessons("c1");

    expect(result).toEqual([]);
  });
});
