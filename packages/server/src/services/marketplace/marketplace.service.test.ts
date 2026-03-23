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
import { logger } from "../../utils/logger";
import {
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  importToCourse,
  getPublicItems,
} from "./marketplace.service";

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

// ── listItems ───────────────────────────────────────────────────────────

describe("listItems", () => {
  it("should return paginated items with defaults", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ id: "item-1", title: "Item 1" }])
      .mockResolvedValueOnce([{ total: 1 }]);

    const result = await listItems(1);

    expect(result.page).toBe(1);
    expect(result.perPage).toBe(20);
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it("should apply pagination parameters", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 50 }]);

    const result = await listItems(1, { page: 3, perPage: 10 });

    expect(result.page).toBe(3);
    expect(result.perPage).toBe(10);
    expect(result.total).toBe(50);
  });

  it("should filter by content_type", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await listItems(1, { content_type: "video" });

    const dataQuery = mockDB.raw.mock.calls[0][0];
    expect(dataQuery).toContain("cl.content_type = ?");
  });

  it("should filter by category", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await listItems(1, { category: "tech" });

    const dataQuery = mockDB.raw.mock.calls[0][0];
    expect(dataQuery).toContain("cl.category = ?");
  });

  it("should filter by is_public", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await listItems(1, { is_public: true });

    const dataQuery = mockDB.raw.mock.calls[0][0];
    expect(dataQuery).toContain("cl.is_public = ?");
  });

  it("should apply search filter", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await listItems(1, { search: "typescript" });

    const dataQuery = mockDB.raw.mock.calls[0][0];
    expect(dataQuery).toContain("cl.title LIKE ?");
    expect(dataQuery).toContain("cl.description LIKE ?");
  });

  it("should return empty results", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    const result = await listItems(1);

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ── getItem ─────────────────────────────────────────────────────────────

describe("getItem", () => {
  it("should return an item", async () => {
    mockDB.findOne.mockResolvedValue({ id: "item-1", title: "Test Item" });

    const result = await getItem(1, "item-1");

    expect(result.title).toBe("Test Item");
  });

  it("should throw NotFoundError when item does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getItem(1, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── createItem ──────────────────────────────────────────────────────────

describe("createItem", () => {
  it("should create an item successfully", async () => {
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", title: "New Item", content_type: "video" });

    const result = await createItem(1, 42, { title: "New Item", content_type: "video" });

    expect(mockDB.create).toHaveBeenCalledWith("content_library", expect.objectContaining({
      id: "test-uuid-1234",
      org_id: 1,
      title: "New Item",
      content_type: "video",
      created_by: 42,
    }));
    expect(logger.info).toHaveBeenCalled();
    expect(result.title).toBe("New Item");
  });

  it("should throw BadRequestError when title is missing", async () => {
    await expect(createItem(1, 42, { title: "", content_type: "video" })).rejects.toThrow("Title is required");
  });

  it("should throw BadRequestError when content_type is missing", async () => {
    await expect(createItem(1, 42, { title: "Test", content_type: "" })).rejects.toThrow("Content type is required");
  });

  it("should serialize tags and metadata", async () => {
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234" });

    await createItem(1, 42, {
      title: "Test",
      content_type: "video",
      tags: ["js", "react"],
      metadata: { key: "value" },
    });

    expect(mockDB.create).toHaveBeenCalledWith("content_library", expect.objectContaining({
      tags: JSON.stringify(["js", "react"]),
      metadata: JSON.stringify({ key: "value" }),
    }));
  });

  it("should set defaults for optional fields", async () => {
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234" });

    await createItem(1, 42, { title: "Test", content_type: "pdf" });

    expect(mockDB.create).toHaveBeenCalledWith("content_library", expect.objectContaining({
      description: null,
      content_url: null,
      thumbnail_url: null,
      category: null,
      tags: JSON.stringify([]),
      is_public: false,
      source: null,
      external_id: null,
      metadata: null,
    }));
  });
});

// ── updateItem ──────────────────────────────────────────────────────────

describe("updateItem", () => {
  it("should update item successfully", async () => {
    mockDB.findOne.mockResolvedValue({ id: "item-1", title: "Old Title" });
    mockDB.update.mockResolvedValue({ id: "item-1", title: "Updated Title" });

    const result = await updateItem(1, "item-1", { title: "Updated Title" });

    expect(mockDB.update).toHaveBeenCalledWith("content_library", "item-1", expect.objectContaining({
      title: "Updated Title",
    }));
    expect(result.title).toBe("Updated Title");
  });

  it("should throw NotFoundError when item does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(updateItem(1, "nonexistent", { title: "X" })).rejects.toThrow("not found");
  });

  it("should serialize tags on update", async () => {
    mockDB.findOne.mockResolvedValue({ id: "item-1" });
    mockDB.update.mockResolvedValue({ id: "item-1" });

    await updateItem(1, "item-1", { tags: ["new-tag"] });

    expect(mockDB.update).toHaveBeenCalledWith("content_library", "item-1", expect.objectContaining({
      tags: JSON.stringify(["new-tag"]),
    }));
  });

  it("should serialize metadata on update", async () => {
    mockDB.findOne.mockResolvedValue({ id: "item-1" });
    mockDB.update.mockResolvedValue({ id: "item-1" });

    await updateItem(1, "item-1", { metadata: { duration: 120 } });

    expect(mockDB.update).toHaveBeenCalledWith("content_library", "item-1", expect.objectContaining({
      metadata: JSON.stringify({ duration: 120 }),
    }));
  });
});

// ── deleteItem ──────────────────────────────────────────────────────────

describe("deleteItem", () => {
  it("should delete item successfully", async () => {
    mockDB.findOne.mockResolvedValue({ id: "item-1" });
    mockDB.delete.mockResolvedValue(undefined);

    await deleteItem(1, "item-1");

    expect(mockDB.delete).toHaveBeenCalledWith("content_library", "item-1");
    expect(logger.info).toHaveBeenCalled();
  });

  it("should throw NotFoundError when item does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(deleteItem(1, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── importToCourse ──────────────────────────────────────────────────────

describe("importToCourse", () => {
  it("should import library item as lesson", async () => {
    mockDB.raw.mockResolvedValueOnce([{ id: "item-1", title: "Library Video", description: "Desc", content_type: "video", content_url: "/url" }]); // item
    mockDB.findOne
      .mockResolvedValueOnce({ id: "c1", organization_id: 1 }) // course
      .mockResolvedValueOnce({ id: "m1", course_id: "c1" }); // module
    mockDB.raw.mockResolvedValueOnce([{ max_sort: 2 }]); // max sort
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", title: "Library Video" });

    const result = await importToCourse(1, "item-1", "c1", "m1");

    expect(mockDB.create).toHaveBeenCalledWith("lessons", expect.objectContaining({
      id: "test-uuid-1234",
      module_id: "m1",
      title: "Library Video",
      content_type: "video",
      sort_order: 3,
    }));
    expect(result.title).toBe("Library Video");
  });

  it("should throw NotFoundError when item does not exist", async () => {
    mockDB.raw.mockResolvedValue([]);

    await expect(importToCourse(1, "bad-item", "c1", "m1")).rejects.toThrow("not found");
  });

  it("should throw NotFoundError when course does not exist", async () => {
    mockDB.raw.mockResolvedValue([{ id: "item-1" }]);
    mockDB.findOne.mockResolvedValueOnce(null); // course not found

    await expect(importToCourse(1, "item-1", "bad-course", "m1")).rejects.toThrow("not found");
  });

  it("should throw NotFoundError when module does not exist", async () => {
    mockDB.raw.mockResolvedValue([{ id: "item-1" }]);
    mockDB.findOne
      .mockResolvedValueOnce({ id: "c1", organization_id: 1 }) // course found
      .mockResolvedValueOnce(null); // module not found

    await expect(importToCourse(1, "item-1", "c1", "bad-module")).rejects.toThrow("not found");
  });
});

// ── getPublicItems ──────────────────────────────────────────────────────

describe("getPublicItems", () => {
  it("should return paginated public items", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ id: "pub-1", title: "Public Item", is_public: true }])
      .mockResolvedValueOnce([{ total: 1 }]);

    const result = await getPublicItems();

    expect(result.page).toBe(1);
    expect(result.perPage).toBe(20);
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it("should filter public items by content_type", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await getPublicItems({ content_type: "video" });

    const dataQuery = mockDB.raw.mock.calls[0][0];
    expect(dataQuery).toContain("cl.content_type = ?");
  });

  it("should filter public items by search", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    await getPublicItems({ search: "react" });

    const dataQuery = mockDB.raw.mock.calls[0][0];
    expect(dataQuery).toContain("cl.title LIKE ?");
    expect(dataQuery).toContain("cl.description LIKE ?");
  });

  it("should return empty results when no public items exist", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    const result = await getPublicItems();

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });
});
