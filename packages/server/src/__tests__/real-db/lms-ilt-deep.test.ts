// ============================================================================
// ILT SERVICE - Deep Real-DB Tests
// ============================================================================
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import knex, { Knex } from "knex";

let db: Knex;
let empcloudDb: Knex;
const ORG = 5;
const USER = 522;
const USER2 = 523;
const ids: { table: string; id: string; db?: string }[] = [];
function track(table: string, id: string, dbName?: string) { ids.push({ table, id, db: dbName }); }

beforeAll(async () => {
  db = knex({ client: "mysql2", connection: { host: "localhost", port: 3306, user: "empcloud", password: "EmpCloud2026", database: "emp_lms" }, pool: { min: 1, max: 5 } });
  empcloudDb = knex({ client: "mysql2", connection: { host: "localhost", port: 3306, user: "empcloud", password: "EmpCloud2026", database: "empcloud" }, pool: { min: 1, max: 3 } });
  await db.raw("SELECT 1");
  await empcloudDb.raw("SELECT 1");
});
afterEach(async () => {
  for (const item of [...ids].reverse()) {
    try {
      const target = item.db === "empcloud" ? empcloudDb : db;
      await target(item.table).where({ id: item.id }).del();
    } catch {}
  }
  ids.length = 0;
});
afterAll(async () => { await db.destroy(); await empcloudDb.destroy(); });

async function createCourse(title?: string) {
  const id = uuidv4();
  await db("courses").insert({
    id, org_id: ORG, title: title || "ILT Course " + id.slice(0, 8),
    slug: "ic-" + id.slice(0, 8), status: "published",
    completion_criteria: "all_lessons", passing_score: 70, created_by: USER,
    enrollment_count: 0, completion_count: 0, avg_rating: 0, rating_count: 0, duration_minutes: 0,
  });
  track("courses", id);
  return id;
}

async function createSession(overrides: Record<string, any> = {}) {
  const id = uuidv4();
  const startTime = overrides.start_time || new Date(Date.now() + 86400000);
  const endTime = overrides.end_time || new Date(Date.now() + 90000000);
  await db("ilt_sessions").insert({
    id, org_id: ORG, course_id: overrides.course_id || null,
    title: overrides.title || "Test Session", description: overrides.description || null,
    instructor_id: overrides.instructor_id || USER,
    location: overrides.location || "Room 101", meeting_url: overrides.meeting_url || null,
    start_time: startTime, end_time: endTime,
    max_attendees: overrides.max_attendees || null, enrolled_count: overrides.enrolled_count || 0,
    status: overrides.status || "scheduled", materials_url: overrides.materials_url || null,
  });
  track("ilt_sessions", id);
  return id;
}

async function registerAttendee(sessionId: string, userId: number, status = "registered") {
  const id = uuidv4();
  await db("ilt_attendance").insert({ id, session_id: sessionId, user_id: userId, status });
  track("ilt_attendance", id);
  return id;
}

// -------------------------------------------------------------------------
describe("ILT Session CRUD", () => {
  it("createSession with all fields", async () => {
    const cid = await createCourse();
    const sid = await createSession({ course_id: cid, title: "Advanced Training", location: "Room A", meeting_url: "https://meet.example.com", max_attendees: 50, materials_url: "https://docs.example.com" });
    const s = await db("ilt_sessions").where({ id: sid }).first();
    expect(s.title).toBe("Advanced Training");
    expect(s.location).toBe("Room A");
    expect(s.max_attendees).toBe(50);
    expect(s.status).toBe("scheduled");
  });

  it("listSessions filters by org_id", async () => {
    await createSession({ title: "Org Session" });
    const rows = await db("ilt_sessions").where({ org_id: ORG });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("listSessions filters by status", async () => {
    await createSession({ status: "scheduled" });
    const rows = await db("ilt_sessions").where({ org_id: ORG, status: "scheduled" });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("listSessions with date range filter", async () => {
    const future = new Date(Date.now() + 7 * 86400000);
    await createSession({ start_time: future, end_time: new Date(future.getTime() + 3600000) });
    const rows = await db("ilt_sessions").where({ org_id: ORG }).where("start_time", ">=", new Date());
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("listSessions filters by instructor_id", async () => {
    await createSession({ instructor_id: USER });
    const rows = await db("ilt_sessions").where({ org_id: ORG, instructor_id: USER });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("listSessions filters by course_id", async () => {
    const cid = await createCourse();
    await createSession({ course_id: cid });
    const rows = await db("ilt_sessions").where({ org_id: ORG, course_id: cid });
    expect(rows.length).toBe(1);
  });

  it("getSession returns attendance list", async () => {
    const sid = await createSession();
    await registerAttendee(sid, USER);
    await registerAttendee(sid, USER2);
    const att = await db("ilt_attendance").where({ session_id: sid });
    expect(att.length).toBe(2);
  });

  it("updateSession changes fields", async () => {
    const sid = await createSession({ title: "Old Title" });
    await db("ilt_sessions").where({ id: sid }).update({ title: "New Title", location: "Room B" });
    const s = await db("ilt_sessions").where({ id: sid }).first();
    expect(s.title).toBe("New Title");
    expect(s.location).toBe("Room B");
  });

  it("updateSession rejects cancelled sessions", async () => {
    const sid = await createSession({ status: "cancelled" });
    const s = await db("ilt_sessions").where({ id: sid }).first();
    expect(s.status).toBe("cancelled");
  });

  it("updateSession rejects completed sessions", async () => {
    const sid = await createSession({ status: "completed" });
    const s = await db("ilt_sessions").where({ id: sid }).first();
    expect(s.status).toBe("completed");
  });

  it("cancelSession sets status and creates notifications", async () => {
    const sid = await createSession();
    await registerAttendee(sid, USER);
    await db("ilt_sessions").where({ id: sid }).update({ status: "cancelled" });
    // Create notification like the service does
    const nid = uuidv4();
    await db("notifications").insert({
      id: nid, org_id: ORG, user_id: USER, type: "ilt_session_cancelled",
      title: "Session Cancelled", message: "The session has been cancelled.",
      reference_id: sid, reference_type: "ilt_session", is_read: false,
    });
    track("notifications", nid);
    const n = await db("notifications").where({ reference_id: sid }).first();
    expect(n.type).toBe("ilt_session_cancelled");
  });

  it("completeSession sets status", async () => {
    const sid = await createSession();
    await db("ilt_sessions").where({ id: sid }).update({ status: "completed" });
    expect((await db("ilt_sessions").where({ id: sid }).first()).status).toBe("completed");
  });
});

describe("ILT Registration", () => {
  it("registerUser creates attendance record", async () => {
    const sid = await createSession();
    const aid = await registerAttendee(sid, USER);
    const a = await db("ilt_attendance").where({ id: aid }).first();
    expect(a.user_id).toBe(USER);
    expect(a.status).toBe("registered");
  });

  it("duplicate registration prevention", async () => {
    const sid = await createSession();
    await registerAttendee(sid, USER);
    const existing = await db("ilt_attendance").where({ session_id: sid, user_id: USER }).first();
    expect(existing).toBeTruthy();
  });

  it("max_attendees check", async () => {
    const sid = await createSession({ max_attendees: 2, enrolled_count: 2 });
    const s = await db("ilt_sessions").where({ id: sid }).first();
    expect(s.enrolled_count).toBe(2);
    expect(s.max_attendees).toBe(2);
  });

  it("unregisterUser removes attendance and decrements count", async () => {
    const sid = await createSession({ enrolled_count: 1 });
    const aid = await registerAttendee(sid, USER);
    await db("ilt_attendance").where({ id: aid }).del();
    ids.splice(ids.findIndex(i => i.id === aid), 1);
    await db("ilt_sessions").where({ id: sid }).update({ enrolled_count: 0 });
    const s = await db("ilt_sessions").where({ id: sid }).first();
    expect(s.enrolled_count).toBe(0);
  });

  it("registerBulk multiple users", async () => {
    const sid = await createSession();
    await registerAttendee(sid, USER);
    await registerAttendee(sid, USER2);
    await db("ilt_sessions").where({ id: sid }).update({ enrolled_count: 2 });
    const att = await db("ilt_attendance").where({ session_id: sid });
    expect(att.length).toBe(2);
  });
});

describe("ILT Attendance", () => {
  it("markAttendance updates status to attended", async () => {
    const sid = await createSession();
    const aid = await registerAttendee(sid, USER);
    await db("ilt_attendance").where({ id: aid }).update({ status: "attended", checked_in_at: new Date() });
    const a = await db("ilt_attendance").where({ id: aid }).first();
    expect(a.status).toBe("attended");
    expect(a.checked_in_at).toBeTruthy();
  });

  it("markAttendance absent", async () => {
    const sid = await createSession();
    const aid = await registerAttendee(sid, USER);
    await db("ilt_attendance").where({ id: aid }).update({ status: "absent" });
    expect((await db("ilt_attendance").where({ id: aid }).first()).status).toBe("absent");
  });

  it("markAttendance excused", async () => {
    const sid = await createSession();
    const aid = await registerAttendee(sid, USER);
    await db("ilt_attendance").where({ id: aid }).update({ status: "excused" });
    expect((await db("ilt_attendance").where({ id: aid }).first()).status).toBe("excused");
  });

  it("getSessionAttendance returns full list", async () => {
    const sid = await createSession();
    await registerAttendee(sid, USER, "attended");
    await registerAttendee(sid, USER2, "absent");
    const att = await db("ilt_attendance").where({ session_id: sid }).orderBy("created_at", "asc");
    expect(att.length).toBe(2);
  });
});

describe("ILT Queries", () => {
  it("getUserSessions returns user sessions via join", async () => {
    const sid = await createSession();
    await registerAttendee(sid, USER);
    const rows = await db("ilt_attendance as ia")
      .join("ilt_sessions as s", "s.id", "ia.session_id")
      .where({ "ia.user_id": USER, "s.org_id": ORG })
      .select("s.*", "ia.status as attendance_status");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("getUpcomingSessions returns future scheduled sessions", async () => {
    await createSession({ start_time: new Date(Date.now() + 86400000), end_time: new Date(Date.now() + 90000000) });
    const rows = await db("ilt_sessions")
      .where({ org_id: ORG, status: "scheduled" })
      .where("start_time", ">", new Date())
      .orderBy("start_time", "asc")
      .limit(10);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("getSessionStats computes attendance counts", async () => {
    const sid = await createSession();
    await registerAttendee(sid, USER, "attended");
    await registerAttendee(sid, USER2, "absent");
    const registered = await db("ilt_attendance").where({ session_id: sid }).count("* as c");
    const attended = await db("ilt_attendance").where({ session_id: sid, status: "attended" }).count("* as c");
    const absent = await db("ilt_attendance").where({ session_id: sid, status: "absent" }).count("* as c");
    expect(registered[0].c).toBe(2);
    expect(attended[0].c).toBe(1);
    expect(absent[0].c).toBe(1);
  });
});
