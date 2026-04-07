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
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from "./category.service";

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

// ── listCategories ──────────────────────────────────────────────────────

describe("listCategories", () => {
  it("should return categories with course counts", async () => {
    mockDB.raw.mockResolvedValue([
      { id: "cat-1", name: "Tech", course_count: 5 },
      { id: "cat-2", name: "Design", course_count: 3 },
    ]);

    const result = await listCategories(1);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Tech");
    expect(result[0].course_count).toBe(5);
  });

  it("should return empty array when no categories exist", async () => {
    mockDB.raw.mockResolvedValue([]);

    const result = await listCategories(1);

    expect(result).toEqual([]);
  });
});

// ── getCategory ─────────────────────────────────────────────────────────

describe("getCategory", () => {
  it("should return category with subcategories", async () => {
    mockDB.findOne.mockResolvedValue({ id: "cat-1", name: "Tech" });
    mockDB.raw.mockResolvedValue([
      { id: "sub-1", name: "Frontend", parent_id: "cat-1" },
    ]);

    const result = await getCategory(1, "cat-1");

    expect(result.name).toBe("Tech");
    expect(result.subcategories).toHaveLength(1);
    expect(result.subcategories[0].name).toBe("Frontend");
  });

  it("should throw NotFoundError when category does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getCategory(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should return empty subcategories when none exist", async () => {
    mockDB.findOne.mockResolvedValue({ id: "cat-1", name: "Tech" });
    mockDB.raw.mockResolvedValue([]);

    const result = await getCategory(1, "cat-1");

    expect(result.subcategories).toEqual([]);
  });
});

// ── createCategory ──────────────────────────────────────────────────────

describe("createCategory", () => {
  it("should create a category successfully", async () => {
    mockDB.findOne.mockResolvedValue(null); // no slug conflict
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", name: "New Category", slug: "new-category" });

    const result = await createCategory(1, { name: "New Category" });

    expect(mockDB.create).toHaveBeenCalledWith("course_categories", expect.objectContaining({
      id: "test-uuid-1234",
      org_id: 1,
      name: "New Category",
      slug: "new-category",
    }));
    expect(result.name).toBe("New Category");
  });

  it("should generate slug from name", async () => {
    mockDB.findOne.mockResolvedValue(null);
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", slug: "my-great-category" });

    await createCategory(1, { name: "My Great Category!" });

    expect(mockDB.create).toHaveBeenCalledWith("course_categories", expect.objectContaining({
      slug: "my-great-category",
    }));
  });

  it("should use provided slug over auto-generated", async () => {
    mockDB.findOne.mockResolvedValue(null);
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", slug: "custom-slug" });

    await createCategory(1, { name: "Test", slug: "custom-slug" });

    expect(mockDB.create).toHaveBeenCalledWith("course_categories", expect.objectContaining({
      slug: "custom-slug",
    }));
  });

  it("should handle category with all optional fields", async () => {
    mockDB.findOne.mockResolvedValue(null);
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", name: "Test", slug: "test", description: "desc" });

    const result = await createCategory(1, { name: "Test", description: "desc", sort_order: 5 });

    expect(result.name).toBe("Test");
  });

  it("should throw NotFoundError when parent_id does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(createCategory(1, { name: "Sub", parent_id: "bad-parent" })).rejects.toThrow("not found");
  });

  it("should create category with parent_id successfully", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "parent-1", name: "Parent" }); // parent exists
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", name: "Child", parent_id: "parent-1" });

    const result = await createCategory(1, { name: "Child", parent_id: "parent-1" });

    expect(mockDB.create).toHaveBeenCalledWith("course_categories", expect.objectContaining({
      parent_id: "parent-1",
    }));
    expect(result.parent_id).toBe("parent-1");
  });
});

// ── updateCategory ──────────────────────────────────────────────────────

describe("updateCategory", () => {
  it("should update category successfully", async () => {
    mockDB.findOne.mockResolvedValue({ id: "cat-1", name: "Old Name", organization_id: 1 });
    mockDB.update.mockResolvedValue({ id: "cat-1", name: "Old Name", description: "Updated" });

    const result = await updateCategory(1, "cat-1", { description: "Updated" });

    expect(mockDB.update).toHaveBeenCalledWith("course_categories", "cat-1", expect.objectContaining({
      description: "Updated",
    }));
    expect(result.description).toBe("Updated");
  });

  it("should throw NotFoundError when category does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(updateCategory(1, "nonexistent", { name: "X" })).rejects.toThrow("not found");
  });

  it("should regenerate slug when name changes", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "cat-1", name: "Old Name", organization_id: 1 }) // category
      .mockResolvedValueOnce(null); // no slug conflict
    mockDB.update.mockResolvedValue({ id: "cat-1", name: "New Name", slug: "new-name" });

    await updateCategory(1, "cat-1", { name: "New Name" });

    expect(mockDB.update).toHaveBeenCalledWith("course_categories", "cat-1", expect.objectContaining({
      slug: "new-name",
    }));
  });

  it("should throw ConflictError on slug collision during name update", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "cat-1", name: "Old", organization_id: 1 })
      .mockResolvedValueOnce({ id: "cat-2", slug: "new-name" }); // different category owns slug

    await expect(updateCategory(1, "cat-1", { name: "New Name" })).rejects.toThrow("already exists");
  });

  it("should throw BadRequestError when setting category as its own parent", async () => {
    mockDB.findOne.mockResolvedValue({ id: "cat-1", name: "Test", parent_id: null, organization_id: 1 });

    await expect(updateCategory(1, "cat-1", { parent_id: "cat-1" })).rejects.toThrow("its own parent");
  });

  it("should throw NotFoundError when new parent does not exist", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "cat-1", name: "Test", parent_id: null, organization_id: 1 })
      .mockResolvedValueOnce(null); // parent not found

    await expect(updateCategory(1, "cat-1", { parent_id: "bad-parent" })).rejects.toThrow("not found");
  });
});

// ── deleteCategory ──────────────────────────────────────────────────────

describe("deleteCategory", () => {
  it("should delete category and reassign courses to parent", async () => {
    mockDB.findOne.mockResolvedValue({ id: "cat-1", parent_id: "parent-1", organization_id: 1 });
    mockDB.count.mockResolvedValue(3);
    mockDB.updateMany.mockResolvedValue(undefined);
    mockDB.delete.mockResolvedValue(undefined);

    const result = await deleteCategory(1, "cat-1");

    expect(mockDB.updateMany).toHaveBeenCalledWith("courses", { category_id: "cat-1" }, { category_id: "parent-1" });
    expect(mockDB.delete).toHaveBeenCalledWith("course_categories", "cat-1");
    expect(result.deleted).toBe(true);
  });

  it("should throw NotFoundError when category does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(deleteCategory(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should reassign subcategories to parent on delete", async () => {
    mockDB.findOne.mockResolvedValue({ id: "cat-1", parent_id: "parent-1", organization_id: 1 });
    mockDB.count.mockResolvedValue(0);
    mockDB.updateMany.mockResolvedValue(undefined);
    mockDB.delete.mockResolvedValue(undefined);

    await deleteCategory(1, "cat-1");

    expect(mockDB.updateMany).toHaveBeenCalledWith(
      "course_categories",
      { parent_id: "cat-1", org_id: 1 },
      { parent_id: "parent-1" }
    );
  });

  it("should set courses to null category when no parent", async () => {
    mockDB.findOne.mockResolvedValue({ id: "cat-1", parent_id: null, organization_id: 1 });
    mockDB.count.mockResolvedValue(2);
    mockDB.updateMany.mockResolvedValue(undefined);
    mockDB.delete.mockResolvedValue(undefined);

    await deleteCategory(1, "cat-1");

    expect(mockDB.updateMany).toHaveBeenCalledWith("courses", { category_id: "cat-1" }, { category_id: null });
  });
});
