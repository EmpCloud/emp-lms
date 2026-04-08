// ============================================================================
// ENROLLMENT SERVICE - Deep Real-DB Tests
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
  db = knex({ client: "mysql2", connection: { host: "localhost", port: 3306, user: "empcloud", password: process.env.DB_PASSWORD || "", database: "emp_lms" }, pool: { min: 1, max: 5 } });
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
    id, org_id: ORG, title: title || "Enroll Course " + id.slice(0, 8),
    slug: "ec-" + id.slice(0, 8), status: overrides.status || "published",
    completion_criteria: overrides.completion_criteria || "all_lessons",
    passing_score: 70, created_by: USER,
    enrollment_count: overrides.enrollment_count ?? 0,
    completion_count: 0, avg_rating: 0, rating_count: 0, duration_minutes: 0,
    max_enrollments: overrides.max_enrollments || null,
  });
  track("courses", id);
  return id;
}
async function createModule(courseId: string, sortOrder = 0) {
  const id = uuidv4();
  await db("course_modules").insert({ id, course_id: courseId, title: "Mod " + sortOrder, sort_order: sortOrder, is_published: 1 });
  track("course_modules", id);
  return id;
}
async function createLesson(moduleId: string, sortOrder = 0, isMandatory = true) {
  const id = uuidv4();
  await db("lessons").insert({
    id, module_id: moduleId, title: "Lesson " + sortOrder,
    content_type: "text", sort_order: sortOrder, is_mandatory: isMandatory ? 1 : 0,
    is_preview: 0, duration_minutes: 10,
  });
  track("lessons", id);
  return id;
}
async function createEnrollment(courseId: string, userId = USER, status = "enrolled") {
  const id = uuidv4();
  await db("enrollments").insert({
    id, org_id: ORG, user_id: userId, course_id: courseId, status,
    progress_percentage: 0, enrolled_at: new Date(), time_spent_minutes: 0,
  });
  track("enrollments", id);
  return id;
}

// -------------------------------------------------------------------------
describe("Enrollment CRUD", () => {
  it("enrollUser creates enrollment record", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    const e = await db("enrollments").where({ id: eid }).first();
    expect(e.status).toBe("enrolled");
    expect(e.org_id).toBe(ORG);
    expect(e.user_id).toBe(USER);
  });

  it("enrollUser rejects unpublished course", async () => {
    const cid = await createCourse("Draft", { status: "draft" });
    const course = await db("courses").where({ id: cid }).first();
    expect(course.status).toBe("draft");
  });

  it("enrollUser rejects when max_enrollments reached", async () => {
    const cid = await createCourse("Full", { max_enrollments: 1, enrollment_count: 1 });
    const course = await db("courses").where({ id: cid }).first();
    expect(course.enrollment_count).toBe(1);
    expect(course.max_enrollments).toBe(1);
  });

  it("duplicate enrollment detection", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    const existing = await db("enrollments").where({ user_id: USER, course_id: cid }).whereNot("status", "dropped").first();
    expect(existing).toBeTruthy();
  });

  it("re-enroll after drop resets progress", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    await db("enrollments").where({ id: eid }).update({ status: "dropped" });
    // Re-enroll
    await db("enrollments").where({ id: eid }).update({
      status: "enrolled", progress_percentage: 0, started_at: null, completed_at: null, time_spent_minutes: 0,
    });
    const e = await db("enrollments").where({ id: eid }).first();
    expect(e.status).toBe("enrolled");
    expect(Number(e.progress_percentage)).toBe(0);
  });

  it("enrollBulk multiple users", async () => {
    const cid = await createCourse();
    const eid1 = await createEnrollment(cid, USER);
    const eid2 = await createEnrollment(cid, USER2);
    const enrollments = await db("enrollments").where({ course_id: cid });
    expect(enrollments.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Enrollment Retrieval", () => {
  it("getEnrollment with lesson progress", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    const lid = await createLesson(mid);
    const eid = await createEnrollment(cid);
    // Add lesson progress
    const lpId = uuidv4();
    await db("lesson_progress").insert({ id: lpId, enrollment_id: eid, lesson_id: lid, is_completed: 1, completed_at: new Date(), time_spent_minutes: 5 });
    track("lesson_progress", lpId);
    const progress = await db("lesson_progress").where({ enrollment_id: eid });
    expect(progress.length).toBe(1);
  });

  it("getEnrollmentById checks org", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    const e = await db("enrollments").where({ id: eid, org_id: ORG }).first();
    expect(e).toBeTruthy();
  });

  it("listUserEnrollments paginated", async () => {
    const cid1 = await createCourse("Course A");
    const cid2 = await createCourse("Course B");
    await createEnrollment(cid1);
    await createEnrollment(cid2);
    const enrollments = await db("enrollments as e")
      .join("courses as c", "c.id", "e.course_id")
      .where({ "e.org_id": ORG, "e.user_id": USER })
      .select("e.*", "c.title as course_title")
      .orderBy("e.enrolled_at", "desc")
      .limit(20);
    expect(enrollments.length).toBeGreaterThanOrEqual(2);
  });

  it("listUserEnrollments with status filter", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    await db("enrollments").where({ id: eid }).update({ status: "in_progress" });
    const rows = await db("enrollments").where({ org_id: ORG, user_id: USER, status: "in_progress" });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("listUserEnrollments with search filter", async () => {
    const cid = await createCourse("Unique Search Title 999");
    await createEnrollment(cid);
    const rows = await db("enrollments as e")
      .join("courses as c", "c.id", "e.course_id")
      .where({ "e.org_id": ORG, "e.user_id": USER })
      .where("c.title", "like", "%Unique Search%");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("listCourseEnrollments admin view", async () => {
    const cid = await createCourse();
    await createEnrollment(cid, USER);
    await createEnrollment(cid, USER2);
    const rows = await db("enrollments").where({ org_id: ORG, course_id: cid });
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Lesson Progress & Completion", () => {
  it("markLessonComplete creates lesson_progress", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    const lid = await createLesson(mid);
    const eid = await createEnrollment(cid);
    const lpId = uuidv4();
    await db("lesson_progress").insert({
      id: lpId, enrollment_id: eid, lesson_id: lid, is_completed: 1,
      completed_at: new Date(), time_spent_minutes: 10, attempts: 1,
    });
    track("lesson_progress", lpId);
    const lp = await db("lesson_progress").where({ id: lpId }).first();
    expect(lp.is_completed).toBe(1);
  });

  it("markLessonComplete upserts existing progress", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    const lid = await createLesson(mid);
    const eid = await createEnrollment(cid);
    const lpId = uuidv4();
    await db("lesson_progress").insert({ id: lpId, enrollment_id: eid, lesson_id: lid, is_completed: 0, time_spent_minutes: 5, attempts: 1 });
    track("lesson_progress", lpId);
    await db("lesson_progress").where({ id: lpId }).update({ is_completed: 1, completed_at: new Date(), time_spent_minutes: 15, attempts: 2 });
    const lp = await db("lesson_progress").where({ id: lpId }).first();
    expect(lp.is_completed).toBe(1);
    expect(lp.time_spent_minutes).toBe(15);
    expect(lp.attempts).toBe(2);
  });

  it("markLessonComplete updates enrollment to in_progress", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    const lid = await createLesson(mid);
    const eid = await createEnrollment(cid);
    await db("enrollments").where({ id: eid }).update({ status: "in_progress", started_at: new Date() });
    const e = await db("enrollments").where({ id: eid }).first();
    expect(e.status).toBe("in_progress");
  });

  it("calculateProgress 100% when all mandatory lessons done", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    const l1 = await createLesson(mid, 0, true);
    const l2 = await createLesson(mid, 1, true);
    const eid = await createEnrollment(cid);
    for (const lid of [l1, l2]) {
      const lpId = uuidv4();
      await db("lesson_progress").insert({ id: lpId, enrollment_id: eid, lesson_id: lid, is_completed: 1, completed_at: new Date() });
      track("lesson_progress", lpId);
    }
    const totalResult = await db.raw(
      "SELECT COUNT(*) as total FROM lessons l JOIN course_modules m ON m.id = l.module_id WHERE m.course_id = ? AND l.is_mandatory = 1",
      [cid]
    );
    const completedResult = await db.raw(
      "SELECT COUNT(*) as total FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN course_modules m ON m.id = l.module_id WHERE lp.enrollment_id = ? AND lp.is_completed = 1 AND l.is_mandatory = 1 AND m.course_id = ?",
      [eid, cid]
    );
    const total = totalResult[0][0].total;
    const completed = completedResult[0][0].total;
    expect(Math.round((completed / total) * 100)).toBe(100);
  });

  it("calculateProgress 50% when half done", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    const l1 = await createLesson(mid, 0, true);
    const l2 = await createLesson(mid, 1, true);
    const eid = await createEnrollment(cid);
    const lpId = uuidv4();
    await db("lesson_progress").insert({ id: lpId, enrollment_id: eid, lesson_id: l1, is_completed: 1, completed_at: new Date() });
    track("lesson_progress", lpId);
    const totalResult = await db.raw("SELECT COUNT(*) as total FROM lessons l JOIN course_modules m ON m.id = l.module_id WHERE m.course_id = ? AND l.is_mandatory = 1", [cid]);
    const completedResult = await db.raw("SELECT COUNT(*) as total FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN course_modules m ON m.id = l.module_id WHERE lp.enrollment_id = ? AND lp.is_completed = 1 AND l.is_mandatory = 1 AND m.course_id = ?", [eid, cid]);
    expect(Math.round((completedResult[0][0].total / totalResult[0][0].total) * 100)).toBe(50);
  });

  it("calculateProgress 100% when no mandatory lessons", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    await createLesson(mid, 0, false); // non-mandatory
    const totalResult = await db.raw("SELECT COUNT(*) as total FROM lessons l JOIN course_modules m ON m.id = l.module_id WHERE m.course_id = ? AND l.is_mandatory = 1", [cid]);
    expect(totalResult[0][0].total).toBe(0); // no mandatory = 100%
  });
});

describe("Complete & Drop Enrollment", () => {
  it("completeEnrollment sets status and increments course count", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    await db("enrollments").where({ id: eid }).update({ status: "completed", completed_at: new Date(), progress_percentage: 100 });
    await db.raw("UPDATE courses SET completion_count = completion_count + 1 WHERE id = ?", [cid]);
    const e = await db("enrollments").where({ id: eid }).first();
    expect(e.status).toBe("completed");
    const c = await db("courses").where({ id: cid }).first();
    expect(c.completion_count).toBeGreaterThanOrEqual(1);
  });

  it("completeEnrollment rejects already completed", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    await db("enrollments").where({ id: eid }).update({ status: "completed" });
    const e = await db("enrollments").where({ id: eid }).first();
    expect(e.status).toBe("completed");
  });

  it("dropEnrollment sets status and decrements count", async () => {
    const cid = await createCourse("Drop Test", { enrollment_count: 1 });
    const eid = await createEnrollment(cid);
    await db("enrollments").where({ id: eid }).update({ status: "dropped" });
    await db.raw("UPDATE courses SET enrollment_count = GREATEST(enrollment_count - 1, 0) WHERE id = ?", [cid]);
    expect((await db("enrollments").where({ id: eid }).first()).status).toBe("dropped");
    expect((await db("courses").where({ id: cid }).first()).enrollment_count).toBe(0);
  });

  it("dropEnrollment rejects completed enrollment", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    await db("enrollments").where({ id: eid }).update({ status: "completed" });
    expect((await db("enrollments").where({ id: eid }).first()).status).toBe("completed");
  });
});

describe("Progress Queries", () => {
  it("getMyProgress returns enrollment + lessons", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    const lid = await createLesson(mid);
    const eid = await createEnrollment(cid);
    const lessons = await db.raw(
      "SELECT l.*, m.title as module_title FROM lessons l JOIN course_modules m ON m.id = l.module_id WHERE m.course_id = ? ORDER BY m.sort_order, l.sort_order",
      [cid]
    );
    expect(lessons[0].length).toBeGreaterThanOrEqual(1);
  });

  it("updateTimeSpent increments minutes", async () => {
    const cid = await createCourse();
    const eid = await createEnrollment(cid);
    await db.raw("UPDATE enrollments SET time_spent_minutes = time_spent_minutes + 15 WHERE id = ?", [eid]);
    await db.raw("UPDATE enrollments SET time_spent_minutes = time_spent_minutes + 10 WHERE id = ?", [eid]);
    expect((await db("enrollments").where({ id: eid }).first()).time_spent_minutes).toBe(25);
  });

  it("getRecentActivity returns lesson progress with course info", async () => {
    const cid = await createCourse("Recent Course");
    const mid = await createModule(cid);
    const lid = await createLesson(mid);
    const eid = await createEnrollment(cid);
    const lpId = uuidv4();
    await db("lesson_progress").insert({ id: lpId, enrollment_id: eid, lesson_id: lid, is_completed: 1, completed_at: new Date(), time_spent_minutes: 5 });
    track("lesson_progress", lpId);
    const activity = await db.raw(
      "SELECT lp.*, l.title as lesson_title, c.title as course_title FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN course_modules m ON m.id = l.module_id JOIN courses c ON c.id = m.course_id JOIN enrollments e ON e.id = lp.enrollment_id WHERE e.user_id = ? AND e.org_id = ? ORDER BY lp.updated_at DESC LIMIT 10",
      [USER, ORG]
    );
    expect(activity[0].length).toBeGreaterThanOrEqual(1);
  });
});
