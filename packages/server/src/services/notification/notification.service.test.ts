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
  listNotifications,
  getUnreadCount,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createBulkNotifications,
} from "./notification.service";

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

// ── listNotifications ─────────────────────────────────────────────────────

describe("listNotifications", () => {
  it("should return paginated notifications with defaults", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([
        { id: "n1", title: "Notification 1" },
        { id: "n2", title: "Notification 2" },
      ]);

    const result = await listNotifications(1, 42);

    expect(result.page).toBe(1);
    expect(result.perPage).toBe(20);
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
  });

  it("should apply pagination parameters", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 50 }])
      .mockResolvedValueOnce([]);

    const result = await listNotifications(1, 42, { page: 3, perPage: 10 });

    expect(result.page).toBe(3);
    expect(result.perPage).toBe(10);
    expect(result.total).toBe(50);
  });

  it("should filter unread only notifications", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 5 }])
      .mockResolvedValueOnce([]);

    await listNotifications(1, 42, { unreadOnly: true });

    const countQuery = mockDB.raw.mock.calls[0][0];
    expect(countQuery).toContain("is_read = false");
  });

  it("should return empty results", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    const result = await listNotifications(1, 42);

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it("should calculate totalPages correctly", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 45 }])
      .mockResolvedValueOnce([]);

    const result = await listNotifications(1, 42, { perPage: 10 });

    expect(result.totalPages).toBe(5);
  });
});

// ── getUnreadCount ────────────────────────────────────────────────────────

describe("getUnreadCount", () => {
  it("should return the unread count", async () => {
    mockDB.raw.mockResolvedValueOnce([{ count: 7 }]);

    const result = await getUnreadCount(1, 42);

    expect(result).toBe(7);
  });

  it("should return 0 when no unread notifications", async () => {
    mockDB.raw.mockResolvedValueOnce([{ count: 0 }]);

    const result = await getUnreadCount(1, 42);

    expect(result).toBe(0);
  });

  it("should return 0 when result is null", async () => {
    mockDB.raw.mockResolvedValueOnce([undefined]);

    const result = await getUnreadCount(1, 42);

    expect(result).toBe(0);
  });
});

// ── createNotification ──────────────────────────────────────────────────

describe("createNotification", () => {
  it("should create a notification successfully", async () => {
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      org_id: 1,
      user_id: 42,
      type: "enrollment",
      title: "New Enrollment",
      message: "You have been enrolled",
      is_read: false,
    });

    const result = await createNotification({
      orgId: 1,
      userId: 42,
      type: "enrollment",
      title: "New Enrollment",
      message: "You have been enrolled",
    });

    expect(mockDB.create).toHaveBeenCalledWith("notifications", expect.objectContaining({
      id: "test-uuid-1234",
      org_id: 1,
      user_id: 42,
      type: "enrollment",
      title: "New Enrollment",
      message: "You have been enrolled",
      is_read: false,
      read_at: null,
    }));
    expect(result.id).toBe("test-uuid-1234");
  });

  it("should set reference fields to null when not provided", async () => {
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234" });

    await createNotification({
      orgId: 1,
      userId: 42,
      type: "info",
      title: "Info",
      message: "Some message",
    });

    expect(mockDB.create).toHaveBeenCalledWith("notifications", expect.objectContaining({
      reference_id: null,
      reference_type: null,
    }));
  });

  it("should set reference fields when provided", async () => {
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234" });

    await createNotification({
      orgId: 1,
      userId: 42,
      type: "course_completed",
      title: "Course Completed",
      message: "Congrats",
      referenceId: "course-1",
      referenceType: "course",
    });

    expect(mockDB.create).toHaveBeenCalledWith("notifications", expect.objectContaining({
      reference_id: "course-1",
      reference_type: "course",
    }));
  });
});

// ── markAsRead ──────────────────────────────────────────────────────────

describe("markAsRead", () => {
  it("should mark notification as read", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "n1",
      org_id: 1,
      user_id: 42,
      is_read: false,
    });

    const result = await markAsRead(1, 42, "n1");

    expect(mockDB.update).toHaveBeenCalledWith("notifications", "n1", expect.objectContaining({
      is_read: true,
    }));
    expect(result.is_read).toBe(true);
    expect(result.read_at).toBeDefined();
  });

  it("should throw NotFoundError when notification does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(markAsRead(1, 42, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── markAllAsRead ───────────────────────────────────────────────────────

describe("markAllAsRead", () => {
  it("should mark all unread notifications as read", async () => {
    mockDB.updateMany.mockResolvedValue(5);

    const result = await markAllAsRead(1, 42);

    expect(mockDB.updateMany).toHaveBeenCalledWith(
      "notifications",
      { org_id: 1, user_id: 42, is_read: false },
      expect.objectContaining({ is_read: true })
    );
    expect(result).toBe(5);
  });

  it("should return 0 when no unread notifications", async () => {
    mockDB.updateMany.mockResolvedValue(0);

    const result = await markAllAsRead(1, 42);

    expect(result).toBe(0);
  });
});

// ── deleteNotification ──────────────────────────────────────────────────

describe("deleteNotification", () => {
  it("should delete a notification successfully", async () => {
    mockDB.findOne.mockResolvedValue({ id: "n1", org_id: 1, user_id: 42 });

    const result = await deleteNotification(1, 42, "n1");

    expect(mockDB.delete).toHaveBeenCalledWith("notifications", "n1");
    expect(result).toBe(true);
  });

  it("should throw NotFoundError when notification does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(deleteNotification(1, 42, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── createBulkNotifications ─────────────────────────────────────────────

describe("createBulkNotifications", () => {
  it("should create multiple notifications at once", async () => {
    mockDB.createMany.mockResolvedValue(undefined);

    const notifications = [
      { orgId: 1, userId: 10, type: "compliance", title: "Training Due", message: "Complete by Friday" },
      { orgId: 1, userId: 11, type: "compliance", title: "Training Due", message: "Complete by Friday" },
      { orgId: 1, userId: 12, type: "compliance", title: "Training Due", message: "Complete by Friday" },
    ];

    const result = await createBulkNotifications(notifications);

    expect(mockDB.createMany).toHaveBeenCalledWith("notifications", expect.arrayContaining([
      expect.objectContaining({
        id: "test-uuid-1234",
        org_id: 1,
        user_id: 10,
        type: "compliance",
        is_read: false,
        read_at: null,
      }),
    ]));
    expect(result).toBe(3);
  });

  it("should return 0 for empty array", async () => {
    mockDB.createMany.mockResolvedValue(undefined);

    const result = await createBulkNotifications([]);

    expect(result).toBe(0);
  });

  it("should set reference fields to null when not provided in bulk", async () => {
    mockDB.createMany.mockResolvedValue(undefined);

    await createBulkNotifications([
      { orgId: 1, userId: 10, type: "info", title: "Test", message: "Msg" },
    ]);

    const rows = mockDB.createMany.mock.calls[0][1];
    expect(rows[0].reference_id).toBeNull();
    expect(rows[0].reference_type).toBeNull();
  });
});
