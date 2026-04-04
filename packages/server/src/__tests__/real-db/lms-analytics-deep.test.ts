// ============================================================================
// ANALYTICS SERVICE - Deep Real-DB Tests
// ============================================================================
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import knex, { Knex } from "knex";

let db: Knex;
const ORG = 5;
const USER = 522;
const USER2 = 523;
const ids: { table: string; id: string }[] = [];
function track(table: string, id: string) { ids.push({ table, id }); }

beforeAll(async () => {
  db = knex({ client: "mysql2", connection: { host: "localhost", port: 3306, user: "empcloud", password: "EmpCloud2026", database: "emp_lms" }, pool: { min: 1, max: 5 } });
  await db.raw("SELECT 1");
});
afterEach(async () => {
  for (const item of [...ids].reverse()) {
    try { await db(item.table).where({ id: item.id }).del(); } catch {}
  }
  ids.length = 0;
});
afterAll(async () => { await db.destroy(); });

async function createCourse(title?: string, overrides: Record<string, any> = {}) {
  const id = uuidv4();
  await db("courses").insert({
    id, org_id: ORG, title: title || "Analytics Course " + id.slice(0, 8),
    slug: "ac-" + id.slice(0, 8), status: overrides.status || "published",
    completion_criteria: "all_lessons", passing_score: 70, created_by: USER,
    enrollment_count: overrides.enrollment_count ?? 0,
    completion_count: overrides.completion_count ?? 0,
    avg_rating: overrides.avg_rating ?? 0, rating_count: 0, duration_minutes: 0,
    instructor_id: overrides.instructor_id || null,
    category_id: overrides.category_id || null,
  });
  track("courses", id);
  return id;
}
async function createCategory(name: string) {
  const id = uuidv4();
  await db("course_categories").insert({ id, org_id: ORG, name, slug: "cat-" + id.slice(0, 8), sort_order: 0, is_active: 1 });
  track("course_categories", id);
  return id;
}
async function createEnrollment(courseId: string, userId = USER, overrides: Record<string, any> = {}) {
  const id = uuidv4();
  await db("enrollments").insert({
    id, org_id: ORG, user_id: userId, course_id: courseId,
    status: overrides.status || "enrolled",
    progress_percentage: overrides.progress_percentage ?? 0,
    enrolled_at: overrides.enrolled_at || new Date(),
    completed_at: overrides.completed_at || null,
    time_spent_minutes: overrides.time_spent_minutes ?? 0,
    score: overrides.score || null,
    last_accessed_at: overrides.last_accessed_at || new Date(),
  });
  track("enrollments", id);
  return id;
}

// -------------------------------------------------------------------------
describe("Overview Dashboard", () => {
  it("counts total courses, enrollments, completions", async () => {
    const cid = await createCourse("Overview Course");
    await createEnrollment(cid, USER, { status: "completed", completed_at: new Date() });
    await createEnrollment(cid, USER2, { status: "in_progress" });

    const totalCourses = await db("courses").where({ org_id: ORG }).whereNot("status", "archived").count("* as c");
    const totalEnrollments = await db("enrollments").where({ org_id: ORG }).count("* as c");
    const completed = await db("enrollments").where({ org_id: ORG, status: "completed" }).count("* as c");

    expect(Number(totalCourses[0].c)).toBeGreaterThanOrEqual(1);
    expect(Number(totalEnrollments[0].c)).toBeGreaterThanOrEqual(2);
    expect(Number(completed[0].c)).toBeGreaterThanOrEqual(1);
  });

  it("active learners in 30 days", async () => {
    const cid = await createCourse();
    await createEnrollment(cid, USER, { last_accessed_at: new Date() });
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const active = await db("enrollments").where({ org_id: ORG }).where("last_accessed_at", ">=", thirtyDaysAgo).countDistinct("user_id as c");
    expect(Number(active[0].c)).toBeGreaterThanOrEqual(1);
  });

  it("avg course rating", async () => {
    const cid = await createCourse();
    // Unique constraint on (course_id, user_id) — use different users
    const users = [USER, USER2, 524];
    for (let i = 0; i < 3; i++) {
      const rid = uuidv4();
      await db("course_ratings").insert({ id: rid, course_id: cid, user_id: users[i], org_id: ORG, rating: [4, 5, 3][i], is_approved: 1 });
      track("course_ratings", rid);
    }
    const avgResult = await db("course_ratings").where({ course_id: cid, org_id: ORG }).avg("rating as avg");
    expect(Number(avgResult[0].avg)).toBe(4);
  });

  it("total time spent", async () => {
    const cid = await createCourse();
    await createEnrollment(cid, USER, { time_spent_minutes: 120 });
    await createEnrollment(cid, USER2, { time_spent_minutes: 60 });
    const result = await db("enrollments").where({ org_id: ORG, course_id: cid }).sum("time_spent_minutes as total");
    expect(Number(result[0].total)).toBeGreaterThanOrEqual(180);
  });

  it("total certificates issued", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid, USER, { status: "completed" });
    const certId = uuidv4();
    const certNum = "CERT-" + ORG + "-" + Date.now() + "-" + uuidv4().slice(0, 6).toUpperCase();
    await db("certificates").insert({ id: certId, org_id: ORG, user_id: USER, course_id: cid, enrollment_id: eid, certificate_number: certNum, status: "active", issued_at: new Date() });
    track("certificates", certId);
    const cnt = await db("certificates").where({ org_id: ORG }).count("* as c");
    expect(Number(cnt[0].c)).toBeGreaterThanOrEqual(1);
  });
});

describe("Course Analytics", () => {
  it("enrollment trend by month", async () => {
    const cid = await createCourse();
    await createEnrollment(cid);
    const trend = await db.raw(
      "SELECT DATE_FORMAT(enrolled_at, '%Y-%m') AS month, COUNT(*) AS count FROM enrollments WHERE course_id = ? AND org_id = ? GROUP BY month ORDER BY month DESC LIMIT 12",
      [cid, ORG]
    );
    expect(trend[0].length).toBeGreaterThanOrEqual(1);
  });

  it("completion rate calculation", async () => {
    const cid = await createCourse();
    await createEnrollment(cid, USER, { status: "completed", completed_at: new Date() });
    await createEnrollment(cid, USER2, { status: "in_progress" });
    const total = await db("enrollments").where({ course_id: cid, org_id: ORG }).count("* as c");
    const completed = await db("enrollments").where({ course_id: cid, org_id: ORG, status: "completed" }).count("* as c");
    const rate = Math.round((Number(completed[0].c) / Number(total[0].c)) * 100);
    expect(rate).toBe(50);
  });

  it("rating distribution", async () => {
    const cid = await createCourse();
    const users = [USER, USER2, 524, 525];
    for (let i = 0; i < 4; i++) {
      const rid = uuidv4();
      await db("course_ratings").insert({ id: rid, course_id: cid, user_id: users[i], org_id: ORG, rating: [5, 5, 4, 3][i], is_approved: 1 });
      track("course_ratings", rid);
    }
    const dist = await db.raw("SELECT rating, COUNT(*) as count FROM course_ratings WHERE course_id = ? AND org_id = ? GROUP BY rating ORDER BY rating", [cid, ORG]);
    expect(dist[0].length).toBeGreaterThanOrEqual(2);
  });

  it("avg score and time", async () => {
    const cid = await createCourse();
    await createEnrollment(cid, USER, { score: 85, time_spent_minutes: 60 });
    await createEnrollment(cid, USER2, { score: 75, time_spent_minutes: 40 });
    const avgScore = await db.raw("SELECT AVG(score) as avg FROM enrollments WHERE course_id = ? AND org_id = ? AND score IS NOT NULL", [cid, ORG]);
    const avgTime = await db.raw("SELECT AVG(time_spent_minutes) as avg FROM enrollments WHERE course_id = ? AND org_id = ?", [cid, ORG]);
    expect(Number(avgScore[0][0].avg)).toBe(80);
    expect(Number(avgTime[0][0].avg)).toBe(50);
  });
});

describe("User Analytics", () => {
  it("user stats: enrolled, completed, in_progress", async () => {
    const cid1 = await createCourse();
    const cid2 = await createCourse();
    await createEnrollment(cid1, USER, { status: "completed" });
    await createEnrollment(cid2, USER, { status: "in_progress" });
    const enrolled = await db("enrollments").where({ org_id: ORG, user_id: USER }).count("* as c");
    const completed = await db("enrollments").where({ org_id: ORG, user_id: USER, status: "completed" }).count("* as c");
    const inProgress = await db("enrollments").where({ org_id: ORG, user_id: USER, status: "in_progress" }).count("* as c");
    expect(Number(enrolled[0].c)).toBeGreaterThanOrEqual(2);
    expect(Number(completed[0].c)).toBeGreaterThanOrEqual(1);
    expect(Number(inProgress[0].c)).toBeGreaterThanOrEqual(1);
  });

  it("user compliance records", async () => {
    const cid = await createCourse();
    // Create assignment
    const asgId = uuidv4();
    await db("compliance_assignments").insert({
      id: asgId, org_id: ORG, course_id: cid, name: "Test Compliance",
      assigned_to_type: "user", due_date: new Date(Date.now() + 86400000),
      is_active: 1, created_by: USER,
    });
    track("compliance_assignments", asgId);
    const recId = uuidv4();
    await db("compliance_records").insert({
      id: recId, assignment_id: asgId, user_id: USER, course_id: cid,
      org_id: ORG, status: "completed", due_date: new Date(Date.now() + 86400000),
      completed_at: new Date(),
    });
    track("compliance_records", recId);
    const result = await db.raw(
      "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed FROM compliance_records WHERE org_id = ? AND user_id = ?",
      [ORG, USER]
    );
    expect(Number(result[0][0].total)).toBeGreaterThanOrEqual(1);
  });

  it("user learning profile stats", async () => {
    const profileId = uuidv4();
    await db("user_learning_profiles").insert({
      id: profileId, org_id: ORG, user_id: USER,
      total_courses_completed: 5, total_time_spent_minutes: 300,
      total_points_earned: 500, current_streak_days: 3, longest_streak_days: 10,
    });
    track("user_learning_profiles", profileId);
    const profile = await db("user_learning_profiles").where({ org_id: ORG, user_id: USER }).first();
    expect(profile.total_courses_completed).toBe(5);
    expect(profile.total_points_earned).toBe(500);
  });
});

describe("Org Analytics", () => {
  it("enrollment and completion trends", async () => {
    const cid = await createCourse();
    await createEnrollment(cid, USER, { status: "completed", completed_at: new Date() });
    const enrollTrend = await db.raw("SELECT DATE_FORMAT(enrolled_at, '%Y-%m') AS month, COUNT(*) AS enrollments FROM enrollments WHERE org_id = ? GROUP BY month ORDER BY month", [ORG]);
    const completionTrend = await db.raw("SELECT DATE_FORMAT(completed_at, '%Y-%m') AS month, COUNT(*) AS completions FROM enrollments WHERE org_id = ? AND status = 'completed' AND completed_at IS NOT NULL GROUP BY month ORDER BY month", [ORG]);
    expect(enrollTrend[0].length).toBeGreaterThanOrEqual(1);
    expect(completionTrend[0].length).toBeGreaterThanOrEqual(1);
  });

  it("top courses by enrollment", async () => {
    const cid = await createCourse("Popular", { enrollment_count: 100 });
    const top = await db("courses").where({ org_id: ORG, status: "published" }).orderBy("enrollment_count", "desc").limit(10);
    expect(top.length).toBeGreaterThanOrEqual(1);
  });

  it("org analytics with date range", async () => {
    const cid = await createCourse();
    const start = new Date(Date.now() - 86400000).toISOString();
    const end = new Date(Date.now() + 86400000).toISOString();
    await createEnrollment(cid);
    const result = await db.raw("SELECT COUNT(*) as total FROM enrollments WHERE org_id = ? AND enrolled_at >= ? AND enrolled_at <= ?", [ORG, start, end]);
    expect(Number(result[0][0].total)).toBeGreaterThanOrEqual(1);
  });
});

describe("Compliance Analytics", () => {
  it("compliance overall stats", async () => {
    const cid = await createCourse();
    const asgId = uuidv4();
    await db("compliance_assignments").insert({ id: asgId, org_id: ORG, course_id: cid, name: "Safety Training", assigned_to_type: "all", due_date: new Date(Date.now() + 86400000), is_active: 1, created_by: USER });
    track("compliance_assignments", asgId);
    for (const [status, uid] of [["completed", USER], ["overdue", USER2]] as [string, number][]) {
      const recId = uuidv4();
      await db("compliance_records").insert({ id: recId, assignment_id: asgId, user_id: uid, course_id: cid, org_id: ORG, status, due_date: new Date(Date.now() + 86400000) });
      track("compliance_records", recId);
    }
    const result = await db.raw(
      "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue FROM compliance_records WHERE org_id = ?",
      [ORG]
    );
    expect(Number(result[0][0].total)).toBeGreaterThanOrEqual(2);
  });
});

describe("Certificate Analytics", () => {
  it("certificate status breakdown", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid, USER, { status: "completed" });
    for (const status of ["active", "expired", "revoked"]) {
      const certId = uuidv4();
      const certNum = "CERT-" + ORG + "-" + Date.now() + "-" + uuidv4().slice(0, 6);
      await db("certificates").insert({ id: certId, org_id: ORG, user_id: USER, course_id: cid, enrollment_id: eid, certificate_number: certNum, status, issued_at: new Date() });
      track("certificates", certId);
    }
    const result = await db.raw(
      "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired FROM certificates WHERE org_id = ?",
      [ORG]
    );
    expect(Number(result[0][0].total)).toBeGreaterThanOrEqual(3);
  });
});

describe("Instructor Analytics", () => {
  it("instructor session and attendance stats", async () => {
    const sid = uuidv4();
    await db("ilt_sessions").insert({
      id: sid, org_id: ORG, title: "Instructor Session", instructor_id: USER,
      start_time: new Date(), end_time: new Date(Date.now() + 3600000),
      status: "completed", enrolled_count: 1,
    });
    track("ilt_sessions", sid);
    const attId = uuidv4();
    await db("ilt_attendance").insert({ id: attId, session_id: sid, user_id: USER2, status: "attended" });
    track("ilt_attendance", attId);
    const sessions = await db.raw("SELECT COUNT(*) as total FROM ilt_sessions WHERE org_id = ? AND instructor_id = ?", [ORG, USER]);
    const attended = await db.raw("SELECT SUM(CASE WHEN ia.status = 'attended' THEN 1 ELSE 0 END) as total FROM ilt_attendance ia JOIN ilt_sessions s ON s.id = ia.session_id WHERE s.org_id = ? AND s.instructor_id = ?", [ORG, USER]);
    expect(Number(sessions[0][0].total)).toBeGreaterThanOrEqual(1);
    expect(Number(attended[0][0].total)).toBeGreaterThanOrEqual(1);
  });
});

describe("Time Spent Analytics", () => {
  it("total time and avg per user", async () => {
    const cid = await createCourse();
    await createEnrollment(cid, USER, { time_spent_minutes: 120 });
    await createEnrollment(cid, USER2, { time_spent_minutes: 80 });
    const totalResult = await db.raw("SELECT SUM(time_spent_minutes) as total FROM enrollments WHERE org_id = ?", [ORG]);
    expect(Number(totalResult[0][0].total)).toBeGreaterThanOrEqual(200);
  });

  it("time by category", async () => {
    const catId = await createCategory("Tech");
    const cid = await createCourse("Tech Course", { category_id: catId });
    await createEnrollment(cid, USER, { time_spent_minutes: 60 });
    const result = await db.raw(
      "SELECT cat.name as category, SUM(e.time_spent_minutes) as total_time FROM enrollments e JOIN courses c ON c.id = e.course_id LEFT JOIN course_categories cat ON cat.id = c.category_id WHERE e.org_id = ? GROUP BY cat.name",
      [ORG]
    );
    expect(result[0].length).toBeGreaterThanOrEqual(1);
  });
});

describe("Export Analytics", () => {
  it("enrollments export query", async () => {
    const cid = await createCourse("Export Course");
    await createEnrollment(cid, USER, { status: "completed" });
    const rows = await db.raw(
      "SELECT e.id, e.user_id, e.course_id, c.title, e.status, e.progress_percentage, e.score, e.time_spent_minutes, e.enrolled_at, e.completed_at FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.org_id = ? ORDER BY e.enrolled_at DESC",
      [ORG]
    );
    expect(rows[0].length).toBeGreaterThanOrEqual(1);
  });

  it("courses export query", async () => {
    await createCourse("Export Course 2");
    const rows = await db.raw("SELECT id, title, status, difficulty, enrollment_count, completion_count, avg_rating, duration_minutes FROM courses WHERE org_id = ?", [ORG]);
    expect(rows[0].length).toBeGreaterThanOrEqual(1);
  });

  it("certificates export query", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid, USER, { status: "completed" });
    const certId = uuidv4();
    const certNum = "CERT-EXP-" + Date.now();
    await db("certificates").insert({ id: certId, org_id: ORG, user_id: USER, course_id: cid, enrollment_id: eid, certificate_number: certNum, status: "active", issued_at: new Date() });
    track("certificates", certId);
    const rows = await db.raw("SELECT cert.id, cert.certificate_number, cert.user_id, c.title FROM certificates cert JOIN courses c ON c.id = cert.course_id WHERE cert.org_id = ?", [ORG]);
    expect(rows[0].length).toBeGreaterThanOrEqual(1);
  });

  it("users export query", async () => {
    const profileId = uuidv4();
    await db("user_learning_profiles").insert({ id: profileId, org_id: ORG, user_id: USER, total_courses_completed: 3, total_time_spent_minutes: 100, total_points_earned: 200 });
    track("user_learning_profiles", profileId);
    const rows = await db.raw("SELECT user_id, total_courses_completed, total_time_spent_minutes, total_points_earned FROM user_learning_profiles WHERE org_id = ?", [ORG]);
    expect(rows[0].length).toBeGreaterThanOrEqual(1);
  });
});
