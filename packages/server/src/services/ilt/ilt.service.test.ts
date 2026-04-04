import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/adapters/index", () => ({
  getDB: vi.fn(),
}));

vi.mock("../../db/empcloud", () => ({
  findUserById: vi.fn(),
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
  listSessions,
  getSession,
  createSession,
  updateSession,
  cancelSession,
  completeSession,
  registerUser,
  unregisterUser,
  registerBulk,
  markAttendance,
  getSessionAttendance,
  getUserSessions,
  getUpcomingSessions,
  getSessionStats,
} from "./ilt.service";

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

// ── listSessions ────────────────────────────────────────────────────────

describe("listSessions", () => {
  it("should return paginated sessions with defaults", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [{ id: "s1", title: "Session 1" }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const result = await listSessions(1);

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("should apply status filter", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    await listSessions(1, { status: "scheduled" });

    expect(mockDB.findMany).toHaveBeenCalledWith(
      "ilt_sessions",
      expect.objectContaining({
        filters: expect.objectContaining({ status: "scheduled" }),
      })
    );
  });

  it("should use date range filtering with raw queries", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 5 }]) // count
      .mockResolvedValueOnce([{ id: "s1" }]); // data

    const result = await listSessions(1, {
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });

    expect(mockDB.raw).toHaveBeenCalled();
    expect(result.data).toHaveLength(1);
  });
});

// ── getSession ──────────────────────────────────────────────────────────

describe("getSession", () => {
  it("should return session with attendance and instructor info", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "s1",
      title: "Test Session",
      instructor_id: 10,
    });
    mockDB.raw.mockResolvedValue([
      { id: "a1", user_id: 42, status: "registered", checked_in_at: null },
    ]);
    (findUserById as any)
      .mockResolvedValueOnce({
        id: 42,
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@test.com",
      })
      .mockResolvedValueOnce({
        id: 10,
        first_name: "Prof",
        last_name: "Smith",
      });

    const result = await getSession(1, "s1");

    expect(result.title).toBe("Test Session");
    expect(result.instructor_name).toBe("Prof Smith");
    expect(result.attendance).toHaveLength(1);
    expect(result.attendance[0].user_name).toBe("Jane Doe");
  });

  it("should throw NotFoundError when session not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getSession(1, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── createSession ───────────────────────────────────────────────────────

describe("createSession", () => {
  it("should create a session successfully", async () => {
    (findUserById as any).mockResolvedValue({ id: 10, first_name: "Instructor" });
    mockDB.raw.mockResolvedValue([]); // no overlap
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      title: "New Session",
      status: "scheduled",
    });

    const result = await createSession(1, {
      title: "New Session",
      instructor_id: 10,
      start_time: "2026-06-01T09:00:00Z",
      end_time: "2026-06-01T11:00:00Z",
    });

    expect(mockDB.create).toHaveBeenCalledWith(
      "ilt_sessions",
      expect.objectContaining({
        id: "test-uuid-1234",
        title: "New Session",
        status: "scheduled",
        org_id: 1,
      })
    );
    expect(lmsEvents.emit).toHaveBeenCalledWith(
      "ilt.session_created",
      expect.any(Object)
    );
    expect(result.status).toBe("scheduled");
  });

  it("should throw BadRequestError when required fields are missing", async () => {
    await expect(
      createSession(1, { title: "", instructor_id: 0, start_time: "", end_time: "" })
    ).rejects.toThrow("required");
  });

  it("should throw BadRequestError when end_time is before start_time", async () => {
    (findUserById as any).mockResolvedValue({ id: 10 });

    await expect(
      createSession(1, {
        title: "Bad Session",
        instructor_id: 10,
        start_time: "2026-06-01T11:00:00Z",
        end_time: "2026-06-01T09:00:00Z",
      })
    ).rejects.toThrow("after start_time");
  });

  it("should throw ConflictError when instructor has overlapping session", async () => {
    (findUserById as any).mockResolvedValue({ id: 10 });
    mockDB.raw.mockResolvedValue([{ id: "existing-session" }]); // overlap found

    await expect(
      createSession(1, {
        title: "Overlap Session",
        instructor_id: 10,
        start_time: "2026-06-01T09:00:00Z",
        end_time: "2026-06-01T11:00:00Z",
      })
    ).rejects.toThrow("overlapping");
  });

  it("should throw NotFoundError when instructor does not exist", async () => {
    (findUserById as any).mockResolvedValue(null);

    await expect(
      createSession(1, {
        title: "Session",
        instructor_id: 999,
        start_time: "2026-06-01T09:00:00Z",
        end_time: "2026-06-01T11:00:00Z",
      })
    ).rejects.toThrow("not found");
  });

  it("should validate course exists when course_id is provided", async () => {
    (findUserById as any).mockResolvedValue({ id: 10 });
    mockDB.findOne.mockResolvedValue(null); // course not found

    await expect(
      createSession(1, {
        title: "Session",
        instructor_id: 10,
        course_id: "bad-course",
        start_time: "2026-06-01T09:00:00Z",
        end_time: "2026-06-01T11:00:00Z",
      })
    ).rejects.toThrow("not found");
  });
});

// ── updateSession ───────────────────────────────────────────────────────

describe("updateSession", () => {
  it("should update session successfully", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "s1",
      title: "Old Title",
      status: "scheduled",
      org_id: 1,
      start_time: "2026-06-01T09:00:00Z",
      end_time: "2026-06-01T11:00:00Z",
    });
    mockDB.update.mockResolvedValue({ id: "s1", title: "New Title" });

    const result = await updateSession(1, "s1", { title: "New Title" });

    expect(mockDB.update).toHaveBeenCalledWith(
      "ilt_sessions",
      "s1",
      expect.objectContaining({ title: "New Title" })
    );
  });

  it("should throw NotFoundError when session not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(updateSession(1, "nonexistent", { title: "X" })).rejects.toThrow(
      "not found"
    );
  });

  it("should throw BadRequestError when updating cancelled session", async () => {
    mockDB.findOne.mockResolvedValue({ id: "s1", status: "cancelled", org_id: 1 });

    await expect(updateSession(1, "s1", { title: "X" })).rejects.toThrow(
      "Cannot update"
    );
  });

  it("should throw BadRequestError when updating completed session", async () => {
    mockDB.findOne.mockResolvedValue({ id: "s1", status: "completed", org_id: 1 });

    await expect(updateSession(1, "s1", { title: "X" })).rejects.toThrow(
      "Cannot update"
    );
  });

  it("should throw BadRequestError for invalid start_time format", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "s1", title: "Session", status: "scheduled", org_id: 1,
      start_time: "2026-06-01T09:00:00Z", end_time: "2026-06-01T11:00:00Z",
    });

    await expect(updateSession(1, "s1", { start_time: "not-a-date" })).rejects.toThrow("Invalid start_time");
  });

  it("should throw BadRequestError for invalid end_time format", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "s1", title: "Session", status: "scheduled", org_id: 1,
      start_time: "2026-06-01T09:00:00Z", end_time: "2026-06-01T11:00:00Z",
    });

    await expect(updateSession(1, "s1", { end_time: "not-a-date" })).rejects.toThrow("Invalid end_time");
  });

  it("should throw BadRequestError when updated end_time is before start_time", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "s1", title: "Session", status: "scheduled", org_id: 1,
      start_time: "2026-06-01T09:00:00Z", end_time: "2026-06-01T11:00:00Z",
    });

    await expect(updateSession(1, "s1", {
      start_time: "2026-06-01T12:00:00Z",
      end_time: "2026-06-01T10:00:00Z",
    })).rejects.toThrow("after start_time");
  });

  it("should return session unchanged when no update data provided", async () => {
    const session = {
      id: "s1", title: "Session", status: "scheduled", org_id: 1,
      start_time: "2026-06-01T09:00:00Z", end_time: "2026-06-01T11:00:00Z",
    };
    mockDB.findOne.mockResolvedValue(session);

    const result = await updateSession(1, "s1", {});
    expect(result).toEqual(session);
    expect(mockDB.update).not.toHaveBeenCalled();
  });

  it("should validate instructor exists when changing instructor_id", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "s1", status: "scheduled", org_id: 1,
      start_time: "2026-06-01T09:00:00Z", end_time: "2026-06-01T11:00:00Z",
    });
    (findUserById as any).mockResolvedValue(null);

    await expect(updateSession(1, "s1", { instructor_id: 999 })).rejects.toThrow("not found");
  });
});

// ── cancelSession ───────────────────────────────────────────────────────

describe("cancelSession", () => {
  it("should cancel session and notify attendees", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "s1",
      title: "Session",
      status: "scheduled",
      org_id: 1,
      start_time: "2026-06-01T09:00:00Z",
    });
    mockDB.update.mockResolvedValue({ id: "s1", status: "cancelled" });
    mockDB.raw.mockResolvedValue([{ user_id: 42 }, { user_id: 43 }]);
    mockDB.create.mockResolvedValue({});

    const result = await cancelSession(1, "s1");

    expect(result.status).toBe("cancelled");
    // Two notification creates for two attendees
    expect(mockDB.create).toHaveBeenCalledTimes(2);
  });

  it("should throw BadRequestError when already cancelled", async () => {
    mockDB.findOne.mockResolvedValue({ id: "s1", status: "cancelled", org_id: 1 });

    await expect(cancelSession(1, "s1")).rejects.toThrow("already cancelled");
  });

  it("should throw NotFoundError when session not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(cancelSession(1, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── completeSession ─────────────────────────────────────────────────────

describe("completeSession", () => {
  it("should complete a scheduled session", async () => {
    mockDB.findOne.mockResolvedValue({ id: "s1", status: "scheduled", org_id: 1 });
    mockDB.update.mockResolvedValue({ id: "s1", status: "completed" });

    const result = await completeSession(1, "s1");

    expect(result.status).toBe("completed");
  });

  it("should complete an in_progress session", async () => {
    mockDB.findOne.mockResolvedValue({ id: "s1", status: "in_progress", org_id: 1 });
    mockDB.update.mockResolvedValue({ id: "s1", status: "completed" });

    const result = await completeSession(1, "s1");
    expect(result.status).toBe("completed");
  });

  it("should fail when session is cancelled", async () => {
    mockDB.findOne.mockResolvedValue({ id: "s1", status: "cancelled", org_id: 1 });

    await expect(completeSession(1, "s1")).rejects.toThrow("Cannot complete");
  });

  it("should throw NotFoundError when session not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(completeSession(1, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── registerUser ────────────────────────────────────────────────────────

describe("registerUser", () => {
  it("should register a user for a scheduled session", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "s1", status: "scheduled", max_attendees: 20, enrolled_count: 5, org_id: 1 })
      .mockResolvedValueOnce(null); // no existing registration
    (findUserById as any).mockResolvedValue({ id: 42, organization_id: 1 });
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      session_id: "s1",
      user_id: 42,
      status: "registered",
    });
    mockDB.update.mockResolvedValue({});

    const result = await registerUser(1, "s1", 42);

    expect(result.status).toBe("registered");
    expect(mockDB.update).toHaveBeenCalledWith("ilt_sessions", "s1", {
      enrolled_count: 6,
    });
  });

  it("should throw BadRequestError when session is full", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "s1",
      status: "scheduled",
      max_attendees: 5,
      enrolled_count: 5,
      org_id: 1,
    });

    await expect(registerUser(1, "s1", 42)).rejects.toThrow("full");
  });

  it("should throw ConflictError when already registered", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "s1", status: "scheduled", max_attendees: 20, enrolled_count: 5, org_id: 1 })
      .mockResolvedValueOnce({ id: "existing" }); // already registered

    await expect(registerUser(1, "s1", 42)).rejects.toThrow("already registered");
  });

  it("should throw BadRequestError when session is not scheduled", async () => {
    mockDB.findOne.mockResolvedValue({ id: "s1", status: "completed", org_id: 1 });

    await expect(registerUser(1, "s1", 42)).rejects.toThrow("scheduled");
  });
});

// ── unregisterUser ──────────────────────────────────────────────────────

describe("unregisterUser", () => {
  it("should unregister a user and decrement count", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "s1", enrolled_count: 5, org_id: 1 }) // session
      .mockResolvedValueOnce({ id: "a1", session_id: "s1", user_id: 42 }); // attendance
    mockDB.delete.mockResolvedValue(undefined);
    mockDB.update.mockResolvedValue({});

    const result = await unregisterUser(1, "s1", 42);

    expect(mockDB.delete).toHaveBeenCalledWith("ilt_attendance", "a1");
    expect(mockDB.update).toHaveBeenCalledWith("ilt_sessions", "s1", {
      enrolled_count: 4,
    });
    expect(result.unregistered).toBe(true);
  });

  it("should throw NotFoundError when registration not found", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "s1", org_id: 1 }) // session
      .mockResolvedValueOnce(null); // no attendance

    await expect(unregisterUser(1, "s1", 42)).rejects.toThrow("not found");
  });
});

// ── registerBulk ────────────────────────────────────────────────────────

describe("registerBulk", () => {
  it("should bulk register multiple users", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "s1", status: "scheduled", max_attendees: 50, enrolled_count: 0, org_id: 1 })
      .mockResolvedValueOnce(null) // user 42 not registered
      .mockResolvedValueOnce(null); // user 43 not registered
    (findUserById as any)
      .mockResolvedValueOnce({ id: 42, organization_id: 1 })
      .mockResolvedValueOnce({ id: 43, organization_id: 1 });
    mockDB.create.mockResolvedValue({});
    mockDB.update.mockResolvedValue({});

    const result = await registerBulk(1, "s1", [42, 43]);

    expect(result.registered_count).toBe(2);
    expect(result.results).toHaveLength(2);
  });

  it("should skip already registered users", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "s1", status: "scheduled", max_attendees: 50, enrolled_count: 0, org_id: 1 })
      .mockResolvedValueOnce({ id: "existing" }); // user 42 already registered
    mockDB.update.mockResolvedValue({});

    const result = await registerBulk(1, "s1", [42]);

    expect(result.registered_count).toBe(0);
    expect(result.results[0].status).toBe("skipped");
  });

  it("should throw BadRequestError when capacity exceeded", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "s1",
      status: "scheduled",
      max_attendees: 2,
      enrolled_count: 1,
      org_id: 1,
    });

    await expect(registerBulk(1, "s1", [42, 43, 44])).rejects.toThrow("capacity");
  });

  it("should skip users not found in org", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "s1", status: "scheduled", max_attendees: 50, enrolled_count: 0, org_id: 1 })
      .mockResolvedValueOnce(null); // user 42 not registered
    (findUserById as any).mockResolvedValueOnce(null); // user not found
    mockDB.update.mockResolvedValue({});

    const result = await registerBulk(1, "s1", [42]);

    expect(result.registered_count).toBe(0);
    expect(result.results[0].status).toBe("skipped");
    expect(result.results[0].error).toBe("User not found");
  });

  it("should throw BadRequestError with empty userIds", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "s1",
      status: "scheduled",
      max_attendees: 50,
      enrolled_count: 0,
      org_id: 1,
    });

    await expect(registerBulk(1, "s1", [])).rejects.toThrow("cannot be empty");
  });
});

// ── markAttendance ──────────────────────────────────────────────────────

describe("markAttendance", () => {
  it("should mark attendance for multiple users", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "s1", course_id: "c1", org_id: 1 }) // session
      .mockResolvedValueOnce({ id: "a1", session_id: "s1", user_id: 42 }) // record 1
      .mockResolvedValueOnce({ id: "a2", session_id: "s1", user_id: 43 }); // record 2
    mockDB.update.mockResolvedValue({});

    const result = await markAttendance(1, "s1", [
      { user_id: 42, status: "attended" },
      { user_id: 43, status: "absent" },
    ]);

    expect(result.results).toHaveLength(2);
    expect(result.results[0].updated).toBe(true);
    expect(result.results[1].updated).toBe(true);
    expect(lmsEvents.emit).toHaveBeenCalledWith(
      "ilt.attendance_marked",
      expect.any(Object)
    );
  });

  it("should skip users without attendance records", async () => {
    mockDB.findOne
      .mockResolvedValueOnce({ id: "s1", course_id: "c1", org_id: 1 }) // session
      .mockResolvedValueOnce(null); // no record for user 42

    const result = await markAttendance(1, "s1", [
      { user_id: 42, status: "attended" },
    ]);

    expect(result.results[0].updated).toBe(false);
  });

  it("should throw BadRequestError when attendanceData is empty", async () => {
    mockDB.findOne.mockResolvedValue({ id: "s1", org_id: 1 });

    await expect(markAttendance(1, "s1", [])).rejects.toThrow("required");
  });

  it("should throw NotFoundError when session not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(
      markAttendance(1, "nonexistent", [{ user_id: 42, status: "attended" }])
    ).rejects.toThrow("not found");
  });
});

// ── getSessionAttendance ────────────────────────────────────────────────

describe("getSessionAttendance", () => {
  it("should return attendance with user details", async () => {
    mockDB.findOne.mockResolvedValue({ id: "s1", title: "Session", org_id: 1 });
    mockDB.raw.mockResolvedValue([
      { id: "a1", user_id: 42, status: "attended" },
    ]);
    (findUserById as any).mockResolvedValue({
      id: 42,
      first_name: "John",
      last_name: "Doe",
      email: "john@test.com",
    });

    const result = await getSessionAttendance(1, "s1");

    expect(result.session_title).toBe("Session");
    expect(result.attendance).toHaveLength(1);
    expect(result.attendance[0].user_name).toBe("John Doe");
  });

  it("should throw NotFoundError when session not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getSessionAttendance(1, "nonexistent")).rejects.toThrow(
      "not found"
    );
  });
});

// ── getUserSessions ─────────────────────────────────────────────────────

describe("getUserSessions", () => {
  it("should return paginated sessions for a user", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([{ id: "s1" }, { id: "s2" }]);

    const result = await getUserSessions(1, 42);

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});

// ── getUpcomingSessions ─────────────────────────────────────────────────

describe("getUpcomingSessions", () => {
  it("should return upcoming scheduled sessions", async () => {
    mockDB.raw.mockResolvedValue([
      { id: "s1", start_time: "2026-07-01T09:00:00Z" },
    ]);

    const result = await getUpcomingSessions(1);

    expect(result).toHaveLength(1);
  });
});

// ── getSessionStats ─────────────────────────────────────────────────────

describe("getSessionStats", () => {
  it("should return correct session statistics", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "s1",
      max_attendees: 20,
      org_id: 1,
    });
    mockDB.count
      .mockResolvedValueOnce(10) // registered
      .mockResolvedValueOnce(8) // attended
      .mockResolvedValueOnce(1) // absent
      .mockResolvedValueOnce(1); // excused

    const result = await getSessionStats(1, "s1");

    expect(result.registered_count).toBe(10);
    expect(result.attended_count).toBe(8);
    expect(result.absent_count).toBe(1);
    expect(result.excused_count).toBe(1);
    expect(result.attendance_rate).toBe(80);
    expect(result.capacity_utilization).toBe(50);
  });

  it("should handle zero registrations", async () => {
    mockDB.findOne.mockResolvedValue({ id: "s1", max_attendees: 20, org_id: 1 });
    mockDB.count.mockResolvedValue(0);

    const result = await getSessionStats(1, "s1");

    expect(result.attendance_rate).toBe(0);
  });

  it("should throw NotFoundError when session not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getSessionStats(1, "nonexistent")).rejects.toThrow("not found");
  });
});
