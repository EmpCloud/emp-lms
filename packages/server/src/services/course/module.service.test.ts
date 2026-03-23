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
  listModules,
  getModule,
  createModule,
  updateModule,
  deleteModule,
  reorderModules,
} from "./module.service";

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

// ── listModules ─────────────────────────────────────────────────────────

describe("listModules", () => {
  it("should return modules ordered by sort_order", async () => {
    mockDB.raw.mockResolvedValue([
      { id: "m1", title: "Module 1", sort_order: 0 },
      { id: "m2", title: "Module 2", sort_order: 1 },
    ]);

    const result = await listModules("course-1");

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Module 1");
  });

  it("should return empty array when no modules exist", async () => {
    mockDB.raw.mockResolvedValue([]);

    const result = await listModules("course-1");

    expect(result).toEqual([]);
  });
});

// ── getModule ───────────────────────────────────────────────────────────

describe("getModule", () => {
  it("should return module with lessons", async () => {
    mockDB.findOne.mockResolvedValue({ id: "m1", title: "Module 1", course_id: "c1" });
    mockDB.raw.mockResolvedValue([
      { id: "l1", title: "Lesson 1", sort_order: 0 },
    ]);

    const result = await getModule("c1", "m1");

    expect(result.title).toBe("Module 1");
    expect(result.lessons).toHaveLength(1);
    expect(result.lessons[0].title).toBe("Lesson 1");
  });

  it("should throw NotFoundError when module does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getModule("c1", "nonexistent")).rejects.toThrow("not found");
  });

  it("should return empty lessons when module has none", async () => {
    mockDB.findOne.mockResolvedValue({ id: "m1", title: "Empty Module" });
    mockDB.raw.mockResolvedValue([]);

    const result = await getModule("c1", "m1");

    expect(result.lessons).toEqual([]);
  });
});

// ── createModule ────────────────────────────────────────────────────────

describe("createModule", () => {
  it("should create module successfully", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 }); // course exists
    mockDB.raw.mockResolvedValue([{ max_order: 2 }]); // max sort_order
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", title: "New Module", sort_order: 3 });

    const result = await createModule(1, "c1", { title: "New Module" });

    expect(mockDB.create).toHaveBeenCalledWith("course_modules", expect.objectContaining({
      id: "test-uuid-1234",
      course_id: "c1",
      title: "New Module",
      sort_order: 3,
    }));
    expect(result.title).toBe("New Module");
  });

  it("should throw NotFoundError when course does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(createModule(1, "bad-course", { title: "Test" })).rejects.toThrow("not found");
  });

  it("should use provided sort_order", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", title: "Test", sort_order: 5 });

    await createModule(1, "c1", { title: "Test", sort_order: 5 });

    expect(mockDB.create).toHaveBeenCalledWith("course_modules", expect.objectContaining({
      sort_order: 5,
    }));
  });

  it("should auto-set sort_order to 0 when no modules exist", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.raw.mockResolvedValue([{ max_order: null }]);
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", sort_order: 0 });

    await createModule(1, "c1", { title: "First Module" });

    expect(mockDB.create).toHaveBeenCalledWith("course_modules", expect.objectContaining({
      sort_order: 0,
    }));
  });
});

// ── updateModule ────────────────────────────────────────────────────────

describe("updateModule", () => {
  it("should update module successfully", async () => {
    mockDB.findById.mockResolvedValue({ id: "m1", course_id: "c1" });
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.update.mockResolvedValue({ id: "m1", title: "Updated Title" });

    const result = await updateModule(1, "m1", { title: "Updated Title" });

    expect(mockDB.update).toHaveBeenCalledWith("course_modules", "m1", { title: "Updated Title" });
    expect(result.title).toBe("Updated Title");
  });

  it("should throw NotFoundError when module does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(updateModule(1, "nonexistent", { title: "X" })).rejects.toThrow("not found");
  });

  it("should throw NotFoundError when course does not belong to org", async () => {
    mockDB.findById.mockResolvedValue({ id: "m1", course_id: "c1" });
    mockDB.findOne.mockResolvedValue(null); // course not found for org

    await expect(updateModule(1, "m1", { title: "X" })).rejects.toThrow("not found");
  });
});

// ── deleteModule ────────────────────────────────────────────────────────

describe("deleteModule", () => {
  it("should delete module successfully", async () => {
    mockDB.findById.mockResolvedValue({ id: "m1", course_id: "c1" });
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.delete.mockResolvedValue(undefined);

    const result = await deleteModule(1, "m1");

    expect(mockDB.delete).toHaveBeenCalledWith("course_modules", "m1");
    expect(result.deleted).toBe(true);
  });

  it("should throw NotFoundError when module does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(deleteModule(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should throw NotFoundError when course does not belong to org", async () => {
    mockDB.findById.mockResolvedValue({ id: "m1", course_id: "c1" });
    mockDB.findOne.mockResolvedValue(null);

    await expect(deleteModule(1, "m1")).rejects.toThrow("not found");
  });
});

// ── reorderModules ──────────────────────────────────────────────────────

describe("reorderModules", () => {
  it("should reorder modules successfully", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.raw.mockResolvedValue([{ id: "m1" }, { id: "m2" }, { id: "m3" }]);
    mockDB.update.mockResolvedValue(undefined);

    const result = await reorderModules(1, "c1", ["m3", "m1", "m2"]);

    expect(mockDB.update).toHaveBeenCalledWith("course_modules", "m3", { sort_order: 0 });
    expect(mockDB.update).toHaveBeenCalledWith("course_modules", "m1", { sort_order: 1 });
    expect(mockDB.update).toHaveBeenCalledWith("course_modules", "m2", { sort_order: 2 });
    expect(result.reordered).toBe(true);
  });

  it("should throw NotFoundError when course does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(reorderModules(1, "bad-course", ["m1"])).rejects.toThrow("not found");
  });

  it("should throw BadRequestError when module does not belong to course", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: 1 });
    mockDB.raw.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);

    await expect(reorderModules(1, "c1", ["m1", "m-bad"])).rejects.toThrow("does not belong");
  });
});
