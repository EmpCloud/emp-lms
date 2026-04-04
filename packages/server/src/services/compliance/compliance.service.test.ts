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

// Mock empcloud DB utilities
const mockEmpDbChain = {
  where: vi.fn().mockReturnThis(),
  whereIn: vi.fn().mockReturnThis(),
  select: vi.fn().mockResolvedValue([]),
};
const mockEmpDb = vi.fn(() => mockEmpDbChain);

vi.mock("../../db/empcloud", () => ({
  findUserById: vi.fn(),
  findUsersByOrgId: vi.fn(),
  getEmpCloudDB: vi.fn(() => mockEmpDb),
}));

import { getDB } from "../../db/adapters/index";
import { lmsEvents } from "../../events/index";
import { findUserById, findUsersByOrgId } from "../../db/empcloud";
import {
  createAssignment,
  listAssignments,
  getAssignment,
  updateAssignment,
  deactivateAssignment,
  getComplianceRecords,
  getUserComplianceRecords,
  updateComplianceStatus,
  markCompleted,
  checkOverdue,
  getComplianceDashboard,
  processRecurringAssignments,
  sendReminders,
} from "./compliance.service";

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
  (findUsersByOrgId as any).mockResolvedValue([]);
  (findUserById as any).mockResolvedValue(null);
});

// ── createAssignment ────────────────────────────────────────────────────

describe("createAssignment", () => {
  it("should create an assignment and generate compliance records for user type", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "course-1", org_id: 1 }); // course exists
    mockDB.create
      .mockResolvedValueOnce({
        id: "test-uuid-1234",
        org_id: 1,
        course_id: "course-1",
        name: "Annual Safety",
        assigned_to_type: "user",
        is_active: true,
      }) // assignment
      .mockResolvedValue({}); // compliance records

    const result = await createAssignment(1, 42, {
      course_id: "course-1",
      name: "Annual Safety",
      assigned_to_type: "user",
      assigned_to_ids: [100, 101],
      due_date: "2026-06-01",
    });

    expect(mockDB.create).toHaveBeenCalledWith(
      "compliance_assignments",
      expect.objectContaining({
        id: "test-uuid-1234",
        org_id: 1,
        course_id: "course-1",
        name: "Annual Safety",
        assigned_to_type: "user",
        is_active: true,
      })
    );
    expect(result.records_created).toBe(2);
    expect(lmsEvents.emit).toHaveBeenCalledWith(
      "compliance.assigned",
      expect.objectContaining({ courseId: "course-1", orgId: 1 })
    );
  });

  it("should create assignment for all users in org", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "course-1", org_id: 1 });
    (findUsersByOrgId as any).mockResolvedValue([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      org_id: 1,
      name: "All Staff Training",
      assigned_to_type: "all",
    });

    const result = await createAssignment(1, 42, {
      course_id: "course-1",
      name: "All Staff Training",
      assigned_to_type: "all",
      due_date: "2026-06-01",
    });

    expect(result.records_created).toBe(3);
  });

  it("should throw BadRequestError when required fields are missing", async () => {
    await expect(
      createAssignment(1, 42, {
        course_id: "",
        name: "Test",
        assigned_to_type: "all",
        due_date: "2026-06-01",
      })
    ).rejects.toThrow("required");
  });

  it("should throw NotFoundError when course does not exist", async () => {
    mockDB.findOne.mockResolvedValueOnce(null);

    await expect(
      createAssignment(1, 42, {
        course_id: "bad-course",
        name: "Test",
        assigned_to_type: "all",
        due_date: "2026-06-01",
      })
    ).rejects.toThrow("not found");
  });

  it("should throw BadRequestError for invalid due_date", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "course-1", org_id: 1 });

    await expect(
      createAssignment(1, 42, {
        course_id: "course-1",
        name: "Test",
        assigned_to_type: "all",
        due_date: "not-a-date",
      })
    ).rejects.toThrow("Invalid due_date");
  });

  it("should create assignment for department type", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "course-1", org_id: 1 });
    mockEmpDbChain.select.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      org_id: 1,
      name: "Dept Training",
      assigned_to_type: "department",
    });

    const result = await createAssignment(1, 42, {
      course_id: "course-1",
      name: "Dept Training",
      assigned_to_type: "department",
      assigned_to_ids: [5],
      due_date: "2026-06-01",
    });

    expect(result.records_created).toBe(2);
  });

  it("should create assignment for role type", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "course-1", org_id: 1 });
    mockEmpDbChain.select.mockResolvedValue([{ id: 20 }]);
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      org_id: 1,
      name: "Role Training",
      assigned_to_type: "role",
    });

    const result = await createAssignment(1, 42, {
      course_id: "course-1",
      name: "Role Training",
      assigned_to_type: "role",
      assigned_to_ids: ["hr_admin"],
      due_date: "2026-06-01",
    });

    expect(result.records_created).toBe(1);
  });

  it("should throw BadRequestError for department type without assigned_to_ids", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "course-1", org_id: 1 });
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", assigned_to_type: "department" });

    await expect(
      createAssignment(1, 42, {
        course_id: "course-1",
        name: "Test",
        assigned_to_type: "department",
        assigned_to_ids: [],
        due_date: "2026-06-01",
      })
    ).rejects.toThrow("assigned_to_ids required");
  });

  it("should throw BadRequestError for invalid assigned_to_type", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "course-1", org_id: 1 });
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234" });

    await expect(
      createAssignment(1, 42, {
        course_id: "course-1",
        name: "Test",
        assigned_to_type: "invalid" as any,
        due_date: "2026-06-01",
      })
    ).rejects.toThrow("Invalid assigned_to_type");
  });
});

// ── listAssignments ─────────────────────────────────────────────────────

describe("listAssignments", () => {
  it("should return paginated assignments", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [{ id: "a1" }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const result = await listAssignments(1);

    expect(mockDB.findMany).toHaveBeenCalledWith(
      "compliance_assignments",
      expect.objectContaining({
        filters: { org_id: 1 },
      })
    );
    expect(result.data).toHaveLength(1);
  });

  it("should apply is_active filter", async () => {
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

    await listAssignments(1, { is_active: true });

    expect(mockDB.findMany).toHaveBeenCalledWith(
      "compliance_assignments",
      expect.objectContaining({
        filters: expect.objectContaining({ is_active: true }),
      })
    );
  });

  it("should apply course_id filter", async () => {
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

    await listAssignments(1, { course_id: "course-1" });

    expect(mockDB.findMany).toHaveBeenCalledWith(
      "compliance_assignments",
      expect.objectContaining({
        filters: expect.objectContaining({ course_id: "course-1" }),
      })
    );
  });
});

// ── getAssignment ───────────────────────────────────────────────────────

describe("getAssignment", () => {
  it("should return assignment with completion stats", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "a1", org_id: 1, name: "Safety" });
    mockDB.count
      .mockResolvedValueOnce(10) // total assigned
      .mockResolvedValueOnce(7) // completed
      .mockResolvedValueOnce(2); // overdue

    const result = await getAssignment(1, "a1");

    expect(result.name).toBe("Safety");
    expect(result.stats.total_assigned).toBe(10);
    expect(result.stats.completed).toBe(7);
    expect(result.stats.overdue).toBe(2);
    expect(result.stats.completion_rate).toBe(70);
  });

  it("should throw NotFoundError when assignment does not exist", async () => {
    mockDB.findOne.mockResolvedValueOnce(null);

    await expect(getAssignment(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should handle zero assigned records gracefully", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "a1", org_id: 1 });
    mockDB.count.mockResolvedValue(0);

    const result = await getAssignment(1, "a1");

    expect(result.stats.completion_rate).toBe(0);
  });
});

// ── updateAssignment ────────────────────────────────────────────────────

describe("updateAssignment", () => {
  it("should update assignment fields", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "a1", org_id: 1, name: "Old" });
    mockDB.update.mockResolvedValue({ id: "a1", name: "Updated" });

    const result = await updateAssignment(1, "a1", { name: "Updated" });

    expect(mockDB.update).toHaveBeenCalledWith(
      "compliance_assignments",
      "a1",
      expect.objectContaining({ name: "Updated" })
    );
    expect(result.name).toBe("Updated");
  });

  it("should throw NotFoundError when assignment does not exist", async () => {
    mockDB.findOne.mockResolvedValueOnce(null);

    await expect(updateAssignment(1, "bad-id", { name: "X" })).rejects.toThrow(
      "not found"
    );
  });

  it("should throw BadRequestError for invalid due_date", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "a1", org_id: 1 });

    await expect(
      updateAssignment(1, "a1", { due_date: "not-valid" })
    ).rejects.toThrow("Invalid due_date");
  });

  it("should return assignment unchanged when no update data provided", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "a1", org_id: 1, name: "Unchanged" });

    const result = await updateAssignment(1, "a1", {});

    expect(mockDB.update).not.toHaveBeenCalled();
    expect(result.name).toBe("Unchanged");
  });
});

// ── deactivateAssignment ────────────────────────────────────────────────

describe("deactivateAssignment", () => {
  it("should deactivate an assignment", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "a1", org_id: 1, is_active: true });
    mockDB.update.mockResolvedValue({ id: "a1", is_active: false });

    const result = await deactivateAssignment(1, "a1");

    expect(mockDB.update).toHaveBeenCalledWith(
      "compliance_assignments",
      "a1",
      { is_active: false }
    );
    expect(result.is_active).toBe(false);
  });

  it("should throw NotFoundError when assignment does not exist", async () => {
    mockDB.findOne.mockResolvedValueOnce(null);

    await expect(deactivateAssignment(1, "bad-id")).rejects.toThrow("not found");
  });
});

// ── getComplianceRecords ────────────────────────────────────────────────

describe("getComplianceRecords", () => {
  it("should return enriched compliance records", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [
        { id: "r1", user_id: 42, course_id: "c1" },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    (findUserById as any).mockResolvedValueOnce({
      first_name: "John",
      last_name: "Doe",
      email: "john@example.com",
    });
    mockDB.findById.mockResolvedValueOnce({ id: "c1", title: "Safety Training" });

    const result = await getComplianceRecords(1);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].user_name).toBe("John Doe");
    expect(result.data[0].course_title).toBe("Safety Training");
  });

  it("should handle unknown user gracefully", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [{ id: "r1", user_id: 999, course_id: "c1" }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    (findUserById as any).mockResolvedValueOnce(null);
    mockDB.findById.mockResolvedValueOnce(null);

    const result = await getComplianceRecords(1);

    expect(result.data[0].user_name).toBe("Unknown User");
    expect(result.data[0].course_title).toBeNull();
  });

  it("should apply status filter", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    await getComplianceRecords(1, { status: "overdue" });

    expect(mockDB.findMany).toHaveBeenCalledWith(
      "compliance_records",
      expect.objectContaining({
        filters: expect.objectContaining({ status: "overdue" }),
      })
    );
  });
});

// ── getUserComplianceRecords ────────────────────────────────────────────

describe("getUserComplianceRecords", () => {
  it("should return user records enriched with course and assignment info", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [
        { id: "r1", course_id: "c1", assignment_id: "a1" },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    mockDB.findById
      .mockResolvedValueOnce({ id: "c1", title: "Safety" }) // course
      .mockResolvedValueOnce({ id: "a1", name: "Annual Safety" }); // assignment

    const result = await getUserComplianceRecords(1, 42);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].course_title).toBe("Safety");
    expect(result.data[0].assignment_name).toBe("Annual Safety");
  });
});

// ── updateComplianceStatus ──────────────────────────────────────────────

describe("updateComplianceStatus", () => {
  it("should update status to completed and set completed_at", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "r1", org_id: 1 });
    mockDB.update.mockResolvedValue({ id: "r1", status: "completed" });

    const result = await updateComplianceStatus(1, "r1", "completed");

    expect(mockDB.update).toHaveBeenCalledWith(
      "compliance_records",
      "r1",
      expect.objectContaining({
        status: "completed",
        completed_at: expect.any(Date),
      })
    );
    expect(result.status).toBe("completed");
  });

  it("should update status to in_progress without completed_at", async () => {
    mockDB.findOne.mockResolvedValueOnce({ id: "r1", org_id: 1 });
    mockDB.update.mockResolvedValue({ id: "r1", status: "in_progress" });

    await updateComplianceStatus(1, "r1", "in_progress");

    expect(mockDB.update).toHaveBeenCalledWith(
      "compliance_records",
      "r1",
      { status: "in_progress" }
    );
  });

  it("should throw BadRequestError for invalid status", async () => {
    await expect(
      updateComplianceStatus(1, "r1", "invalid_status")
    ).rejects.toThrow("Invalid status");
  });

  it("should throw NotFoundError when record does not exist", async () => {
    mockDB.findOne.mockResolvedValueOnce(null);

    await expect(
      updateComplianceStatus(1, "bad-id", "completed")
    ).rejects.toThrow("not found");
  });
});

// ── markCompleted ───────────────────────────────────────────────────────

describe("markCompleted", () => {
  it("should mark record as completed and emit event", async () => {
    mockDB.findOne.mockResolvedValueOnce({
      id: "r1",
      org_id: 1,
      course_id: "c1",
      user_id: 42,
    });
    mockDB.update.mockResolvedValue({ id: "r1", status: "completed" });

    const result = await markCompleted(1, "r1");

    expect(mockDB.update).toHaveBeenCalledWith(
      "compliance_records",
      "r1",
      expect.objectContaining({
        status: "completed",
        completed_at: expect.any(Date),
      })
    );
    expect(lmsEvents.emit).toHaveBeenCalledWith(
      "compliance.completed",
      expect.objectContaining({
        complianceId: "r1",
        courseId: "c1",
        userId: 42,
        orgId: 1,
      })
    );
  });

  it("should throw NotFoundError when record does not exist", async () => {
    mockDB.findOne.mockResolvedValueOnce(null);

    await expect(markCompleted(1, "bad-id")).rejects.toThrow("not found");
  });
});

// ── checkOverdue ────────────────────────────────────────────────────────

describe("checkOverdue", () => {
  it("should mark overdue records and emit events", async () => {
    mockDB.raw.mockResolvedValue([
      { id: "r1", user_id: 42, course_id: "c1" },
      { id: "r2", user_id: 43, course_id: "c2" },
    ]);
    mockDB.update.mockResolvedValue({});

    const result = await checkOverdue(1);

    expect(result.updated_count).toBe(2);
    expect(mockDB.update).toHaveBeenCalledTimes(2);
    expect(lmsEvents.emit).toHaveBeenCalledWith(
      "compliance.overdue",
      expect.objectContaining({ complianceId: "r1" })
    );
    expect(lmsEvents.emit).toHaveBeenCalledWith(
      "compliance.overdue",
      expect.objectContaining({ complianceId: "r2" })
    );
  });

  it("should return zero when no overdue records exist", async () => {
    mockDB.raw.mockResolvedValue([]);

    const result = await checkOverdue(1);

    expect(result.updated_count).toBe(0);
    expect(mockDB.update).not.toHaveBeenCalled();
  });
});

// ── getComplianceDashboard ──────────────────────────────────────────────

describe("getComplianceDashboard", () => {
  it("should return dashboard statistics", async () => {
    mockDB.count
      .mockResolvedValueOnce(5)  // total assignments
      .mockResolvedValueOnce(50) // total records
      .mockResolvedValueOnce(30) // completed
      .mockResolvedValueOnce(10) // overdue
      .mockResolvedValueOnce(5)  // in_progress
      .mockResolvedValueOnce(5); // not_started
    mockDB.raw.mockResolvedValue([]); // department breakdown

    const result = await getComplianceDashboard(1);

    expect(result.total_assignments).toBe(5);
    expect(result.total_records).toBe(50);
    expect(result.completed).toBe(30);
    expect(result.overdue).toBe(10);
    expect(result.completion_rate).toBe(60);
    expect(result.by_department).toEqual([]);
  });

  it("should handle zero records with 0% completion rate", async () => {
    mockDB.count.mockResolvedValue(0);
    mockDB.raw.mockResolvedValue([]);

    const result = await getComplianceDashboard(1);

    expect(result.completion_rate).toBe(0);
  });
});

// ── processRecurringAssignments ────────────────────────────────────────

describe("processRecurringAssignments", () => {
  it("should create new records for completed recurring assignments", async () => {
    mockDB.raw
      .mockResolvedValueOnce([
        {
          id: "a1",
          course_id: "c1",
          assigned_to_type: "user",
          assigned_to_ids: JSON.stringify([42]),
          recurrence_interval_days: 30,
        },
      ]) // recurring assignments
      .mockResolvedValueOnce([{ last_completed: "2026-03-01T00:00:00Z" }]); // latest completion

    // resolveAffectedUsers for user type
    mockDB.findOne.mockResolvedValue(null); // no existing record for new due date
    mockDB.deleteMany.mockResolvedValue(undefined);
    mockDB.create.mockResolvedValue({});
    mockDB.update.mockResolvedValue({});

    const result = await processRecurringAssignments(1);

    expect(result.processed_assignments).toBe(1);
    expect(result.new_records).toBe(1);
    expect(mockDB.create).toHaveBeenCalledWith(
      "compliance_records",
      expect.objectContaining({
        assignment_id: "a1",
        course_id: "c1",
        user_id: 42,
        status: "not_started",
      })
    );
  });

  it("should return zero when no recurring assignments need processing", async () => {
    mockDB.raw.mockResolvedValueOnce([]); // no recurring assignments

    const result = await processRecurringAssignments(1);

    expect(result.processed_assignments).toBe(0);
    expect(result.new_records).toBe(0);
  });
});

// ── sendReminders ───────────────────────────────────────────────────────

describe("sendReminders", () => {
  it("should create notification records for upcoming due dates", async () => {
    mockDB.raw.mockResolvedValue([
      {
        id: "r1",
        user_id: 42,
        course_id: "c1",
        due_date: "2026-03-28",
        last_reminder_sent_at: null,
        course_title: "Safety Training",
      },
    ]);
    mockDB.create.mockResolvedValue({});
    mockDB.update.mockResolvedValue({});

    const result = await sendReminders(1);

    expect(result.reminders_sent).toBe(1);
    expect(mockDB.create).toHaveBeenCalledWith(
      "notifications",
      expect.objectContaining({
        user_id: 42,
        type: "compliance_reminder",
        title: "Compliance Training Reminder",
      })
    );
    expect(mockDB.update).toHaveBeenCalledWith(
      "compliance_records",
      "r1",
      expect.objectContaining({ last_reminder_sent_at: expect.any(Date) })
    );
  });

  it("should return zero when no reminders are needed", async () => {
    mockDB.raw.mockResolvedValue([]);

    const result = await sendReminders(1);

    expect(result.reminders_sent).toBe(0);
  });
});
