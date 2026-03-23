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
  listDiscussions,
  getDiscussion,
  createDiscussion,
  replyToDiscussion,
  updateDiscussion,
  deleteDiscussion,
  togglePin,
  toggleResolve,
} from "./discussion.service";

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

// ── listDiscussions ─────────────────────────────────────────────────────

describe("listDiscussions", () => {
  it("should return paginated discussions with defaults", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 3 }])
      .mockResolvedValueOnce([
        { id: "d1", title: "Discussion 1" },
        { id: "d2", title: "Discussion 2" },
        { id: "d3", title: "Discussion 3" },
      ]);

    const result = await listDiscussions(1, "course-1");

    expect(result.page).toBe(1);
    expect(result.perPage).toBe(20);
    expect(result.total).toBe(3);
    expect(result.data).toHaveLength(3);
  });

  it("should apply pagination parameters", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 50 }])
      .mockResolvedValueOnce([]);

    const result = await listDiscussions(1, "course-1", { page: 2, perPage: 5 });

    expect(result.page).toBe(2);
    expect(result.perPage).toBe(5);
    expect(result.total).toBe(50);
    expect(result.totalPages).toBe(10);
  });

  it("should filter by lessonId", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{ id: "d1" }]);

    await listDiscussions(1, "course-1", { lessonId: "lesson-1" });

    const countQuery = mockDB.raw.mock.calls[0][0];
    expect(countQuery).toContain("lesson_id = ?");
  });

  it("should return empty results", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    const result = await listDiscussions(1, "course-1");

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("should order by pinned first then created_at", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listDiscussions(1, "course-1");

    const dataQuery = mockDB.raw.mock.calls[1][0];
    expect(dataQuery).toContain("ORDER BY is_pinned DESC, created_at DESC");
  });
});

// ── getDiscussion ───────────────────────────────────────────────────────

describe("getDiscussion", () => {
  it("should return discussion with replies", async () => {
    mockDB.findOne.mockResolvedValue({ id: "d1", title: "My Discussion", org_id: 1 });
    mockDB.raw.mockResolvedValueOnce([
      { id: "r1", content: "Reply 1", parent_id: "d1" },
      { id: "r2", content: "Reply 2", parent_id: "d1" },
    ]);

    const result = await getDiscussion(1, "d1");

    expect(result.title).toBe("My Discussion");
    expect(result.replies).toHaveLength(2);
  });

  it("should throw NotFoundError when discussion does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getDiscussion(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should return empty replies array when no replies exist", async () => {
    mockDB.findOne.mockResolvedValue({ id: "d1", title: "No replies" });
    mockDB.raw.mockResolvedValueOnce([]);

    const result = await getDiscussion(1, "d1");

    expect(result.replies).toEqual([]);
  });
});

// ── createDiscussion ────────────────────────────────────────────────────

describe("createDiscussion", () => {
  it("should create a top-level discussion", async () => {
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      course_id: "course-1",
      user_id: 42,
      org_id: 1,
      content: "Hello world",
      is_pinned: false,
      is_resolved: false,
    });

    const result = await createDiscussion(1, 42, {
      course_id: "course-1",
      content: "Hello world",
    });

    expect(mockDB.create).toHaveBeenCalledWith("discussions", expect.objectContaining({
      id: "test-uuid-1234",
      course_id: "course-1",
      user_id: 42,
      org_id: 1,
      parent_id: null,
      content: "Hello world",
      is_pinned: false,
      is_resolved: false,
      reply_count: 0,
    }));
    expect(result.id).toBe("test-uuid-1234");
  });

  it("should set lesson_id when provided", async () => {
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234" });

    await createDiscussion(1, 42, {
      course_id: "course-1",
      lesson_id: "lesson-1",
      content: "Question about this lesson",
    });

    expect(mockDB.create).toHaveBeenCalledWith("discussions", expect.objectContaining({
      lesson_id: "lesson-1",
    }));
  });

  it("should set lesson_id to null when not provided", async () => {
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234" });

    await createDiscussion(1, 42, {
      course_id: "course-1",
      content: "General question",
    });

    expect(mockDB.create).toHaveBeenCalledWith("discussions", expect.objectContaining({
      lesson_id: null,
    }));
  });
});

// ── replyToDiscussion ───────────────────────────────────────────────────

describe("replyToDiscussion", () => {
  it("should create a reply and increment parent reply count", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "d1",
      course_id: "course-1",
      lesson_id: "lesson-1",
      org_id: 1,
    });
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      parent_id: "d1",
      content: "My reply",
    });
    mockDB.raw.mockResolvedValue(undefined);

    const result = await replyToDiscussion(1, 42, "d1", { content: "My reply" });

    expect(mockDB.create).toHaveBeenCalledWith("discussions", expect.objectContaining({
      parent_id: "d1",
      course_id: "course-1",
      lesson_id: "lesson-1",
      content: "My reply",
    }));
    expect(mockDB.raw).toHaveBeenCalledWith(
      expect.stringContaining("reply_count = reply_count + 1"),
      ["d1"]
    );
    expect(result.parent_id).toBe("d1");
  });

  it("should throw NotFoundError when parent discussion not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(replyToDiscussion(1, 42, "nonexistent", { content: "Reply" })).rejects.toThrow("not found");
  });
});

// ── updateDiscussion ────────────────────────────────────────────────────

describe("updateDiscussion", () => {
  it("should update discussion content", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "d1",
      user_id: 42,
      org_id: 1,
      content: "Old content",
    });

    const result = await updateDiscussion(1, 42, "d1", { content: "Updated content" });

    expect(mockDB.update).toHaveBeenCalledWith("discussions", "d1", { content: "Updated content" });
    expect(result.content).toBe("Updated content");
  });

  it("should throw NotFoundError when discussion does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(updateDiscussion(1, 42, "nonexistent", { content: "X" })).rejects.toThrow("not found");
  });

  it("should throw ForbiddenError when user is not the author", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "d1",
      user_id: 99,
      org_id: 1,
    });

    await expect(updateDiscussion(1, 42, "d1", { content: "X" })).rejects.toThrow("only edit your own");
  });

  it("should update title when provided", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "d1",
      user_id: 42,
      org_id: 1,
      title: "Old title",
    });

    const result = await updateDiscussion(1, 42, "d1", { title: "New title" });

    expect(mockDB.update).toHaveBeenCalledWith("discussions", "d1", { title: "New title" });
    expect(result.title).toBe("New title");
  });
});

// ── deleteDiscussion ────────────────────────────────────────────────────

describe("deleteDiscussion", () => {
  it("should delete own discussion", async () => {
    mockDB.findOne.mockResolvedValue({ id: "d1", user_id: 42, org_id: 1, parent_id: null });

    const result = await deleteDiscussion(1, 42, "d1");

    expect(mockDB.delete).toHaveBeenCalledWith("discussions", "d1");
    expect(result).toBe(true);
  });

  it("should allow admin to delete any discussion", async () => {
    mockDB.findOne.mockResolvedValue({ id: "d1", user_id: 99, org_id: 1, parent_id: null });

    const result = await deleteDiscussion(1, 42, "d1", true);

    expect(mockDB.delete).toHaveBeenCalledWith("discussions", "d1");
    expect(result).toBe(true);
  });

  it("should throw ForbiddenError when non-admin tries to delete others discussion", async () => {
    mockDB.findOne.mockResolvedValue({ id: "d1", user_id: 99, org_id: 1 });

    await expect(deleteDiscussion(1, 42, "d1", false)).rejects.toThrow("only delete your own");
  });

  it("should throw NotFoundError when discussion does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(deleteDiscussion(1, 42, "nonexistent")).rejects.toThrow("not found");
  });

  it("should decrement parent reply count when deleting a reply", async () => {
    mockDB.findOne.mockResolvedValue({ id: "r1", user_id: 42, org_id: 1, parent_id: "d1" });
    mockDB.raw.mockResolvedValue(undefined);

    await deleteDiscussion(1, 42, "r1");

    expect(mockDB.raw).toHaveBeenCalledWith(
      expect.stringContaining("reply_count = GREATEST(0, reply_count - 1)"),
      ["d1"]
    );
  });
});

// ── togglePin ───────────────────────────────────────────────────────────

describe("togglePin", () => {
  it("should pin an unpinned discussion", async () => {
    mockDB.findOne.mockResolvedValue({ id: "d1", org_id: 1, is_pinned: false });

    const result = await togglePin(1, "d1");

    expect(mockDB.update).toHaveBeenCalledWith("discussions", "d1", { is_pinned: true });
    expect(result.is_pinned).toBe(true);
  });

  it("should unpin a pinned discussion", async () => {
    mockDB.findOne.mockResolvedValue({ id: "d1", org_id: 1, is_pinned: true });

    const result = await togglePin(1, "d1");

    expect(mockDB.update).toHaveBeenCalledWith("discussions", "d1", { is_pinned: false });
    expect(result.is_pinned).toBe(false);
  });

  it("should throw NotFoundError when discussion not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(togglePin(1, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── toggleResolve ───────────────────────────────────────────────────────

describe("toggleResolve", () => {
  it("should resolve an unresolved discussion", async () => {
    mockDB.findOne.mockResolvedValue({ id: "d1", org_id: 1, is_resolved: false });

    const result = await toggleResolve(1, "d1");

    expect(mockDB.update).toHaveBeenCalledWith("discussions", "d1", { is_resolved: true });
    expect(result.is_resolved).toBe(true);
  });

  it("should unresolve a resolved discussion", async () => {
    mockDB.findOne.mockResolvedValue({ id: "d1", org_id: 1, is_resolved: true });

    const result = await toggleResolve(1, "d1");

    expect(mockDB.update).toHaveBeenCalledWith("discussions", "d1", { is_resolved: false });
    expect(result.is_resolved).toBe(false);
  });

  it("should throw NotFoundError when discussion not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(toggleResolve(1, "nonexistent")).rejects.toThrow("not found");
  });
});
