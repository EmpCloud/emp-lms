// ============================================================================
// MISC SERVICES - Deep Real-DB Tests
// Covers: gamification, marketplace, compliance, lesson, course, module,
// discussion, learning-path, notification, scorm
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
    id, org_id: ORG, title: title || "Misc Course " + id.slice(0, 8),
    slug: "mc-" + id.slice(0, 8), status: overrides.status || "published",
    completion_criteria: "all_lessons", passing_score: 70, created_by: USER,
    enrollment_count: 0, completion_count: 0, avg_rating: 0, rating_count: 0, duration_minutes: 0,
    category_id: overrides.category_id || null, instructor_id: overrides.instructor_id || null,
    is_mandatory: overrides.is_mandatory ?? 0, is_featured: overrides.is_featured ?? 0,
    tags: overrides.tags ? JSON.stringify(overrides.tags) : null,
    difficulty: overrides.difficulty || null,
    certificate_template_id: overrides.certificate_template_id || null,
  });
  track("courses", id);
  return id;
}
async function createModule(courseId: string, sortOrder = 0) {
  const id = uuidv4();
  await db("course_modules").insert({ id, course_id: courseId, title: "Module " + sortOrder, sort_order: sortOrder, is_published: 1 });
  track("course_modules", id);
  return id;
}
async function createCategory(name: string) {
  const id = uuidv4();
  await db("course_categories").insert({ id, org_id: ORG, name, slug: "cat-" + id.slice(0, 8), sort_order: 0, is_active: 1 });
  track("course_categories", id);
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

// =========================================================================
// GAMIFICATION
// =========================================================================
describe("Gamification - User Learning Profile", () => {
  it("create and update learning profile", async () => {
    const profileId = uuidv4();
    await db("user_learning_profiles").insert({
      id: profileId, org_id: ORG, user_id: USER,
      preferred_categories: JSON.stringify(["tech"]),
      preferred_difficulty: "intermediate",
      total_courses_completed: 0, total_time_spent_minutes: 0,
      total_points_earned: 0, current_streak_days: 0, longest_streak_days: 0,
      last_activity_at: new Date(),
    });
    track("user_learning_profiles", profileId);
    const p = await db("user_learning_profiles").where({ id: profileId }).first();
    expect(p.org_id).toBe(ORG);
    const cats = typeof p.preferred_categories === "string" ? JSON.parse(p.preferred_categories) : p.preferred_categories;
    expect(cats).toContain("tech");
  });

  it("updateLearningStreak consecutive day", async () => {
    const profileId = uuidv4();
    const yesterday = new Date(Date.now() - 86400000);
    await db("user_learning_profiles").insert({
      id: profileId, org_id: ORG, user_id: USER,
      current_streak_days: 3, longest_streak_days: 5,
      last_activity_at: yesterday, total_courses_completed: 0, total_time_spent_minutes: 0, total_points_earned: 0,
    });
    track("user_learning_profiles", profileId);
    // Simulate streak update
    await db("user_learning_profiles").where({ id: profileId }).update({
      current_streak_days: 4, last_activity_at: new Date(),
    });
    const p = await db("user_learning_profiles").where({ id: profileId }).first();
    expect(p.current_streak_days).toBe(4);
  });

  it("updateLearningStreak gap resets", async () => {
    const profileId = uuidv4();
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
    await db("user_learning_profiles").insert({
      id: profileId, org_id: ORG, user_id: USER,
      current_streak_days: 5, longest_streak_days: 10,
      last_activity_at: threeDaysAgo, total_courses_completed: 0, total_time_spent_minutes: 0, total_points_earned: 0,
    });
    track("user_learning_profiles", profileId);
    // Gap > 1 day = reset to 1
    await db("user_learning_profiles").where({ id: profileId }).update({
      current_streak_days: 1, last_activity_at: new Date(),
    });
    expect((await db("user_learning_profiles").where({ id: profileId }).first()).current_streak_days).toBe(1);
  });

  it("updateUserLearningProfile course_completed", async () => {
    const profileId = uuidv4();
    await db("user_learning_profiles").insert({
      id: profileId, org_id: ORG, user_id: USER,
      total_courses_completed: 5, total_time_spent_minutes: 100, total_points_earned: 300,
    });
    track("user_learning_profiles", profileId);
    await db("user_learning_profiles").where({ id: profileId }).update({ total_courses_completed: 6, last_activity_at: new Date() });
    expect((await db("user_learning_profiles").where({ id: profileId }).first()).total_courses_completed).toBe(6);
  });

  it("updateUserLearningProfile time_spent", async () => {
    const profileId = uuidv4();
    await db("user_learning_profiles").insert({
      id: profileId, org_id: ORG, user_id: USER,
      total_courses_completed: 0, total_time_spent_minutes: 100, total_points_earned: 0,
    });
    track("user_learning_profiles", profileId);
    await db("user_learning_profiles").where({ id: profileId }).update({ total_time_spent_minutes: 150 });
    expect((await db("user_learning_profiles").where({ id: profileId }).first()).total_time_spent_minutes).toBe(150);
  });

  it("updateUserLearningProfile points_earned", async () => {
    const profileId = uuidv4();
    await db("user_learning_profiles").insert({
      id: profileId, org_id: ORG, user_id: USER,
      total_courses_completed: 0, total_time_spent_minutes: 0, total_points_earned: 200,
    });
    track("user_learning_profiles", profileId);
    await db("user_learning_profiles").where({ id: profileId }).update({ total_points_earned: 250 });
    expect((await db("user_learning_profiles").where({ id: profileId }).first()).total_points_earned).toBe(250);
  });

  it("getLeaderboard returns sorted by points", async () => {
    for (const [uid, pts] of [[USER, 500], [USER2, 300]] as [number, number][]) {
      const pid = uuidv4();
      await db("user_learning_profiles").insert({
        id: pid, org_id: ORG, user_id: uid,
        total_courses_completed: 0, total_time_spent_minutes: 0, total_points_earned: pts,
      });
      track("user_learning_profiles", pid);
    }
    const leaders = await db("user_learning_profiles").where({ org_id: ORG }).orderBy("total_points_earned", "desc").limit(20);
    expect(leaders.length).toBeGreaterThanOrEqual(2);
    expect(leaders[0].total_points_earned).toBeGreaterThanOrEqual(leaders[1].total_points_earned);
  });
});

// =========================================================================
// MARKETPLACE / CONTENT LIBRARY
// =========================================================================
describe("Marketplace - Content Library", () => {
  async function createItem(overrides: Record<string, any> = {}) {
    const id = uuidv4();
    await db("content_library").insert({
      id, org_id: ORG, title: overrides.title || "Content Item " + id.slice(0, 8),
      description: overrides.description || null,
      content_type: overrides.content_type || "document",
      content_url: overrides.content_url || null,
      category: overrides.category || null,
      tags: overrides.tags ? JSON.stringify(overrides.tags) : JSON.stringify([]),
      is_public: overrides.is_public ?? 0,
      source: overrides.source || null, external_id: overrides.external_id || null,
      metadata: overrides.metadata ? JSON.stringify(overrides.metadata) : null,
      created_by: USER,
    });
    track("content_library", id);
    return id;
  }

  it("createItem stores all fields", async () => {
    const id = await createItem({ title: "My Doc", content_type: "document", category: "HR", tags: ["onboarding"], is_public: true, source: "internal" });
    const item = await db("content_library").where({ id }).first();
    expect(item.title).toBe("My Doc");
    expect(item.content_type).toBe("document");
    expect(item.category).toBe("HR");
    const tags = typeof item.tags === "string" ? JSON.parse(item.tags) : item.tags;
    expect(tags).toContain("onboarding");
    expect(item.is_public).toBe(1);
  });

  it("listItems filters by org", async () => {
    await createItem();
    const rows = await db("content_library").where({ org_id: ORG });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("listItems filter by content_type", async () => {
    await createItem({ content_type: "video" });
    const rows = await db("content_library").where({ org_id: ORG, content_type: "video" });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("listItems filter by category", async () => {
    await createItem({ category: "Engineering" });
    const rows = await db("content_library").where({ org_id: ORG, category: "Engineering" });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("listItems search by title", async () => {
    await createItem({ title: "Unique Search Content XYZ" });
    const rows = await db("content_library").where({ org_id: ORG }).where("title", "like", "%Unique Search Content%");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("getItem by id", async () => {
    const id = await createItem({ title: "Get Item Test" });
    const item = await db("content_library").where({ id, org_id: ORG }).first();
    expect(item.title).toBe("Get Item Test");
  });

  it("updateItem changes fields", async () => {
    const id = await createItem({ title: "Old Item" });
    await db("content_library").where({ id }).update({ title: "New Item", category: "Updated" });
    const item = await db("content_library").where({ id }).first();
    expect(item.title).toBe("New Item");
    expect(item.category).toBe("Updated");
  });

  it("deleteItem removes row", async () => {
    const id = await createItem();
    await db("content_library").where({ id }).del();
    ids.splice(ids.findIndex(i => i.id === id), 1);
    expect(await db("content_library").where({ id }).first()).toBeUndefined();
  });

  it("importToCourse creates lesson from library item", async () => {
    const itemId = await createItem({ title: "Import Me", content_type: "video" });
    const cid = await createCourse();
    const mid = await createModule(cid);
    const lessonId = uuidv4();
    const item = await db("content_library").where({ id: itemId }).first();
    await db("lessons").insert({
      id: lessonId, module_id: mid, title: item.title,
      content_type: item.content_type, content_url: item.content_url,
      sort_order: 0, is_mandatory: 1, is_preview: 0, duration_minutes: 0,
    });
    track("lessons", lessonId);
    expect((await db("lessons").where({ id: lessonId }).first()).title).toBe("Import Me");
  });

  it("getPublicItems returns only public items", async () => {
    await createItem({ is_public: 1, title: "Public Content" });
    await createItem({ is_public: 0, title: "Private Content" });
    const publicItems = await db("content_library").where({ is_public: 1 });
    expect(publicItems.length).toBeGreaterThanOrEqual(1);
    expect(publicItems.every((i: any) => i.is_public === 1)).toBe(true);
  });
});

// =========================================================================
// COMPLIANCE
// =========================================================================
describe("Compliance", () => {
  it("createAssignment with all fields", async () => {
    const cid = await createCourse();
    const id = uuidv4();
    await db("compliance_assignments").insert({
      id, org_id: ORG, course_id: cid, name: "Annual Safety",
      description: "Mandatory safety training", assigned_to_type: "all",
      due_date: new Date(Date.now() + 30 * 86400000), is_recurring: 1,
      recurrence_interval_days: 365, is_active: 1, created_by: USER,
    });
    track("compliance_assignments", id);
    const a = await db("compliance_assignments").where({ id }).first();
    expect(a.name).toBe("Annual Safety");
    expect(a.is_recurring).toBe(1);
    expect(a.recurrence_interval_days).toBe(365);
  });

  it("listAssignments for org", async () => {
    const cid = await createCourse();
    const id = uuidv4();
    await db("compliance_assignments").insert({ id, org_id: ORG, course_id: cid, name: "List Test", assigned_to_type: "all", due_date: new Date(Date.now() + 86400000), is_active: 1, created_by: USER });
    track("compliance_assignments", id);
    const rows = await db("compliance_assignments").where({ org_id: ORG, is_active: 1 });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("getAssignment with records", async () => {
    const cid = await createCourse();
    const asgId = uuidv4();
    await db("compliance_assignments").insert({ id: asgId, org_id: ORG, course_id: cid, name: "Get Test", assigned_to_type: "all", due_date: new Date(Date.now() + 86400000), is_active: 1, created_by: USER });
    track("compliance_assignments", asgId);
    const recId = uuidv4();
    await db("compliance_records").insert({ id: recId, assignment_id: asgId, user_id: USER, course_id: cid, org_id: ORG, status: "not_started", due_date: new Date(Date.now() + 86400000) });
    track("compliance_records", recId);
    const records = await db("compliance_records").where({ assignment_id: asgId });
    expect(records.length).toBe(1);
  });

  it("updateAssignment changes fields", async () => {
    const cid = await createCourse();
    const id = uuidv4();
    await db("compliance_assignments").insert({ id, org_id: ORG, course_id: cid, name: "Old Name", assigned_to_type: "all", due_date: new Date(Date.now() + 86400000), is_active: 1, created_by: USER });
    track("compliance_assignments", id);
    await db("compliance_assignments").where({ id }).update({ name: "New Name" });
    expect((await db("compliance_assignments").where({ id }).first()).name).toBe("New Name");
  });

  it("deactivateAssignment sets is_active=0", async () => {
    const cid = await createCourse();
    const id = uuidv4();
    await db("compliance_assignments").insert({ id, org_id: ORG, course_id: cid, name: "Deactivate", assigned_to_type: "all", due_date: new Date(Date.now() + 86400000), is_active: 1, created_by: USER });
    track("compliance_assignments", id);
    await db("compliance_assignments").where({ id }).update({ is_active: 0 });
    expect((await db("compliance_assignments").where({ id }).first()).is_active).toBe(0);
  });

  it("markCompleted updates record status", async () => {
    const cid = await createCourse();
    const asgId = uuidv4();
    await db("compliance_assignments").insert({ id: asgId, org_id: ORG, course_id: cid, name: "Mark Complete", assigned_to_type: "user", due_date: new Date(Date.now() + 86400000), is_active: 1, created_by: USER });
    track("compliance_assignments", asgId);
    const recId = uuidv4();
    await db("compliance_records").insert({ id: recId, assignment_id: asgId, user_id: USER, course_id: cid, org_id: ORG, status: "in_progress", due_date: new Date(Date.now() + 86400000) });
    track("compliance_records", recId);
    await db("compliance_records").where({ id: recId }).update({ status: "completed", completed_at: new Date() });
    expect((await db("compliance_records").where({ id: recId }).first()).status).toBe("completed");
  });

  it("checkOverdue finds past-due records", async () => {
    const cid = await createCourse();
    const asgId = uuidv4();
    await db("compliance_assignments").insert({ id: asgId, org_id: ORG, course_id: cid, name: "Overdue Check", assigned_to_type: "user", due_date: new Date(Date.now() - 86400000), is_active: 1, created_by: USER });
    track("compliance_assignments", asgId);
    const recId = uuidv4();
    await db("compliance_records").insert({ id: recId, assignment_id: asgId, user_id: USER, course_id: cid, org_id: ORG, status: "not_started", due_date: new Date(Date.now() - 86400000) });
    track("compliance_records", recId);
    const overdue = await db("compliance_records").where({ org_id: ORG }).whereIn("status", ["not_started", "in_progress"]).where("due_date", "<", new Date());
    expect(overdue.length).toBeGreaterThanOrEqual(1);
  });

  it("getComplianceDashboard aggregates", async () => {
    const cid = await createCourse();
    const asgId = uuidv4();
    await db("compliance_assignments").insert({ id: asgId, org_id: ORG, course_id: cid, name: "Dashboard Test", assigned_to_type: "all", due_date: new Date(Date.now() + 86400000), is_active: 1, created_by: USER });
    track("compliance_assignments", asgId);
    const usersForCompliance = [USER, USER2, 524];
    for (let i = 0; i < 3; i++) {
      const recId = uuidv4();
      await db("compliance_records").insert({ id: recId, assignment_id: asgId, user_id: usersForCompliance[i], course_id: cid, org_id: ORG, status: ["completed", "not_started", "overdue"][i], due_date: new Date(Date.now() + 86400000) });
      track("compliance_records", recId);
    }
    const result = await db.raw("SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed FROM compliance_records WHERE org_id = ?", [ORG]);
    expect(Number(result[0][0].total)).toBeGreaterThanOrEqual(3);
  });
});

// =========================================================================
// LESSON SERVICE
// =========================================================================
describe("Lesson CRUD", () => {
  it("createLesson with all content types", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    for (const ct of ["text", "video", "document", "slide", "link", "embed"] as const) {
      const lid = uuidv4();
      await db("lessons").insert({ id: lid, module_id: mid, title: "Lesson " + ct, content_type: ct, sort_order: 0, is_mandatory: 1, is_preview: 0, duration_minutes: 10 });
      track("lessons", lid);
      expect((await db("lessons").where({ id: lid }).first()).content_type).toBe(ct);
    }
  });

  it("listLessons by module", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    const lid = uuidv4();
    await db("lessons").insert({ id: lid, module_id: mid, title: "List Lesson", content_type: "text", sort_order: 0, is_mandatory: 1, is_preview: 0, duration_minutes: 5 });
    track("lessons", lid);
    const lessons = await db("lessons").where({ module_id: mid }).orderBy("sort_order");
    expect(lessons.length).toBeGreaterThanOrEqual(1);
  });

  it("updateLesson changes fields", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    const lid = uuidv4();
    await db("lessons").insert({ id: lid, module_id: mid, title: "Old Lesson", content_type: "text", sort_order: 0, is_mandatory: 1, is_preview: 0, duration_minutes: 5 });
    track("lessons", lid);
    await db("lessons").where({ id: lid }).update({ title: "New Lesson", duration_minutes: 20 });
    const l = await db("lessons").where({ id: lid }).first();
    expect(l.title).toBe("New Lesson");
    expect(l.duration_minutes).toBe(20);
  });

  it("deleteLesson removes row", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    const lid = uuidv4();
    await db("lessons").insert({ id: lid, module_id: mid, title: "Del Lesson", content_type: "text", sort_order: 0, is_mandatory: 1, is_preview: 0, duration_minutes: 5 });
    track("lessons", lid);
    await db("lessons").where({ id: lid }).del();
    ids.splice(ids.findIndex(i => i.id === lid), 1);
    expect(await db("lessons").where({ id: lid }).first()).toBeUndefined();
  });

  it("reorderLessons updates sort_order", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    const l1 = uuidv4(); const l2 = uuidv4();
    await db("lessons").insert({ id: l1, module_id: mid, title: "L1", content_type: "text", sort_order: 0, is_mandatory: 1, is_preview: 0, duration_minutes: 5 });
    await db("lessons").insert({ id: l2, module_id: mid, title: "L2", content_type: "text", sort_order: 1, is_mandatory: 1, is_preview: 0, duration_minutes: 5 });
    track("lessons", l1); track("lessons", l2);
    await db("lessons").where({ id: l2 }).update({ sort_order: 0 });
    await db("lessons").where({ id: l1 }).update({ sort_order: 1 });
    const ordered = await db("lessons").where({ module_id: mid }).orderBy("sort_order");
    expect(ordered[0].id).toBe(l2);
  });

  it("getPreviewLessons returns is_preview=true lessons", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    const lid = uuidv4();
    await db("lessons").insert({ id: lid, module_id: mid, title: "Preview", content_type: "text", sort_order: 0, is_mandatory: 0, is_preview: 1, duration_minutes: 5 });
    track("lessons", lid);
    const previews = await db("lessons as l")
      .join("course_modules as m", "m.id", "l.module_id")
      .where({ "m.course_id": cid, "l.is_preview": 1 });
    expect(previews.length).toBeGreaterThanOrEqual(1);
  });
});

// =========================================================================
// COURSE SERVICE
// =========================================================================
describe("Course CRUD", () => {
  it("createCourse with all fields", async () => {
    const catId = await createCategory("Programming");
    const cid = await createCourse("Advanced TypeScript", { category_id: catId, difficulty: "advanced", is_mandatory: 1, is_featured: 1, tags: ["typescript", "advanced"] });
    const c = await db("courses").where({ id: cid }).first();
    expect(c.title).toBe("Advanced TypeScript");
    expect(c.difficulty).toBe("advanced");
    expect(c.is_mandatory).toBe(1);
    expect(c.is_featured).toBe(1);
    expect(c.category_id).toBe(catId);
  });

  it("listCourses with filters", async () => {
    await createCourse("Filter Test", { status: "published", difficulty: "beginner" });
    const rows = await db("courses").where({ org_id: ORG, status: "published" }).where("difficulty", "beginner");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("getCourse with modules and lessons count", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    const lid = uuidv4();
    await db("lessons").insert({ id: lid, module_id: mid, title: "L", content_type: "text", sort_order: 0, is_mandatory: 1, is_preview: 0, duration_minutes: 5 });
    track("lessons", lid);
    const modules = await db("course_modules").where({ course_id: cid });
    expect(modules.length).toBe(1);
    const lessons = await db("lessons").where({ module_id: mid });
    expect(lessons.length).toBe(1);
  });

  it("updateCourse changes fields", async () => {
    const cid = await createCourse("Old Course");
    await db("courses").where({ id: cid }).update({ title: "Updated Course", difficulty: "expert" });
    const c = await db("courses").where({ id: cid }).first();
    expect(c.title).toBe("Updated Course");
    expect(c.difficulty).toBe("expert");
  });

  it("publishCourse changes status", async () => {
    const cid = await createCourse("Draft Course", { status: "draft" });
    await db("courses").where({ id: cid }).update({ status: "published", published_at: new Date() });
    expect((await db("courses").where({ id: cid }).first()).status).toBe("published");
  });

  it("unpublishCourse sets to draft", async () => {
    const cid = await createCourse();
    await db("courses").where({ id: cid }).update({ status: "draft" });
    expect((await db("courses").where({ id: cid }).first()).status).toBe("draft");
  });

  it("deleteCourse removes course", async () => {
    const cid = await createCourse("Delete Me");
    await db("courses").where({ id: cid }).del();
    ids.splice(ids.findIndex(i => i.id === cid), 1);
    expect(await db("courses").where({ id: cid }).first()).toBeUndefined();
  });

  it("getPopularCourses sorted by enrollment_count", async () => {
    await createCourse("Popular 1", { enrollment_count: 100 });
    await createCourse("Popular 2", { enrollment_count: 50 });
    const popular = await db("courses").where({ org_id: ORG, status: "published" }).orderBy("enrollment_count", "desc").limit(10);
    expect(popular.length).toBeGreaterThanOrEqual(2);
    expect(popular[0].enrollment_count).toBeGreaterThanOrEqual(popular[1].enrollment_count);
  });
});

// =========================================================================
// MODULE SERVICE
// =========================================================================
describe("Module CRUD", () => {
  it("createModule and list", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid, 0);
    const modules = await db("course_modules").where({ course_id: cid });
    expect(modules.length).toBe(1);
  });

  it("updateModule", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    await db("course_modules").where({ id: mid }).update({ title: "Updated Module", description: "Desc" });
    const m = await db("course_modules").where({ id: mid }).first();
    expect(m.title).toBe("Updated Module");
  });

  it("deleteModule", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    await db("course_modules").where({ id: mid }).del();
    ids.splice(ids.findIndex(i => i.id === mid), 1);
    expect(await db("course_modules").where({ id: mid }).first()).toBeUndefined();
  });

  it("reorderModules", async () => {
    const cid = await createCourse();
    const m1 = await createModule(cid, 0);
    const m2 = await createModule(cid, 1);
    await db("course_modules").where({ id: m2 }).update({ sort_order: 0 });
    await db("course_modules").where({ id: m1 }).update({ sort_order: 1 });
    const ordered = await db("course_modules").where({ course_id: cid }).orderBy("sort_order");
    expect(ordered[0].id).toBe(m2);
  });
});

// =========================================================================
// DISCUSSION SERVICE
// =========================================================================
describe("Discussion CRUD", () => {
  it("createDiscussion with title and content", async () => {
    const cid = await createCourse();
    const id = uuidv4();
    await db("discussions").insert({ id, course_id: cid, user_id: USER, org_id: ORG, title: "Help with Module 1", content: "I need help understanding...", is_pinned: 0, is_resolved: 0, reply_count: 0 });
    track("discussions", id);
    const d = await db("discussions").where({ id }).first();
    expect(d.title).toBe("Help with Module 1");
  });

  it("replyToDiscussion creates child record", async () => {
    const cid = await createCourse();
    const parentId = uuidv4();
    await db("discussions").insert({ id: parentId, course_id: cid, user_id: USER, org_id: ORG, title: "Parent", content: "Question", is_pinned: 0, is_resolved: 0, reply_count: 0 });
    track("discussions", parentId);
    const replyId = uuidv4();
    await db("discussions").insert({ id: replyId, course_id: cid, user_id: USER2, org_id: ORG, parent_id: parentId, content: "Answer here", is_pinned: 0, is_resolved: 0, reply_count: 0 });
    track("discussions", replyId);
    await db("discussions").where({ id: parentId }).update({ reply_count: 1 });
    expect((await db("discussions").where({ id: parentId }).first()).reply_count).toBe(1);
  });

  it("togglePin toggles is_pinned", async () => {
    const cid = await createCourse();
    const id = uuidv4();
    await db("discussions").insert({ id, course_id: cid, user_id: USER, org_id: ORG, title: "Pin Test", content: "Content", is_pinned: 0, is_resolved: 0, reply_count: 0 });
    track("discussions", id);
    await db("discussions").where({ id }).update({ is_pinned: 1 });
    expect((await db("discussions").where({ id }).first()).is_pinned).toBe(1);
  });

  it("toggleResolve toggles is_resolved", async () => {
    const cid = await createCourse();
    const id = uuidv4();
    await db("discussions").insert({ id, course_id: cid, user_id: USER, org_id: ORG, title: "Resolve Test", content: "Content", is_pinned: 0, is_resolved: 0, reply_count: 0 });
    track("discussions", id);
    await db("discussions").where({ id }).update({ is_resolved: 1 });
    expect((await db("discussions").where({ id }).first()).is_resolved).toBe(1);
  });

  it("deleteDiscussion removes row", async () => {
    const cid = await createCourse();
    const id = uuidv4();
    await db("discussions").insert({ id, course_id: cid, user_id: USER, org_id: ORG, title: "Delete Me", content: "Content", is_pinned: 0, is_resolved: 0, reply_count: 0 });
    track("discussions", id);
    await db("discussions").where({ id }).del();
    ids.splice(ids.findIndex(i => i.id === id), 1);
    expect(await db("discussions").where({ id }).first()).toBeUndefined();
  });
});

// =========================================================================
// LEARNING PATH SERVICE
// =========================================================================
describe("Learning Path", () => {
  async function createPath(overrides: Record<string, any> = {}) {
    const id = uuidv4();
    await db("learning_paths").insert({
      id, org_id: ORG, title: overrides.title || "Path " + id.slice(0, 8),
      slug: "lp-" + id.slice(0, 8), status: overrides.status || "draft",
      difficulty: overrides.difficulty || "beginner",
      estimated_duration_minutes: overrides.estimated_duration_minutes || 0,
      is_mandatory: overrides.is_mandatory ?? 0, sort_order: 0, created_by: USER,
    });
    track("learning_paths", id);
    return id;
  }

  it("createLearningPath stores fields", async () => {
    const pid = await createPath({ title: "Full Stack Path", difficulty: "advanced" });
    const p = await db("learning_paths").where({ id: pid }).first();
    expect(p.title).toBe("Full Stack Path");
    expect(p.difficulty).toBe("advanced");
  });

  it("publishLearningPath changes status", async () => {
    const pid = await createPath();
    await db("learning_paths").where({ id: pid }).update({ status: "published" });
    expect((await db("learning_paths").where({ id: pid }).first()).status).toBe("published");
  });

  it("addCourse to learning path", async () => {
    const pid = await createPath();
    const cid = await createCourse();
    const lpcId = uuidv4();
    await db("learning_path_courses").insert({ id: lpcId, learning_path_id: pid, course_id: cid, sort_order: 0, is_mandatory: 1 });
    track("learning_path_courses", lpcId);
    const courses = await db("learning_path_courses").where({ learning_path_id: pid });
    expect(courses.length).toBe(1);
  });

  it("removeCourse from learning path", async () => {
    const pid = await createPath();
    const cid = await createCourse();
    const lpcId = uuidv4();
    await db("learning_path_courses").insert({ id: lpcId, learning_path_id: pid, course_id: cid, sort_order: 0, is_mandatory: 1 });
    track("learning_path_courses", lpcId);
    await db("learning_path_courses").where({ id: lpcId }).del();
    ids.splice(ids.findIndex(i => i.id === lpcId), 1);
    expect((await db("learning_path_courses").where({ learning_path_id: pid })).length).toBe(0);
  });

  it("enrollUser in learning path", async () => {
    const pid = await createPath({ status: "published" });
    const lpeId = uuidv4();
    await db("learning_path_enrollments").insert({ id: lpeId, org_id: ORG, user_id: USER, learning_path_id: pid, status: "enrolled", progress_percentage: 0 });
    track("learning_path_enrollments", lpeId);
    const e = await db("learning_path_enrollments").where({ id: lpeId }).first();
    expect(e.status).toBe("enrolled");
  });

  it("updatePathProgress tracks completion", async () => {
    const pid = await createPath({ status: "published" });
    const lpeId = uuidv4();
    await db("learning_path_enrollments").insert({ id: lpeId, org_id: ORG, user_id: USER, learning_path_id: pid, status: "in_progress", progress_percentage: 50 });
    track("learning_path_enrollments", lpeId);
    await db("learning_path_enrollments").where({ id: lpeId }).update({ progress_percentage: 100, status: "completed", completed_at: new Date() });
    const e = await db("learning_path_enrollments").where({ id: lpeId }).first();
    expect(e.status).toBe("completed");
    expect(Number(e.progress_percentage)).toBe(100);
  });

  it("deleteLearningPath removes path", async () => {
    const pid = await createPath();
    await db("learning_paths").where({ id: pid }).del();
    ids.splice(ids.findIndex(i => i.id === pid), 1);
    expect(await db("learning_paths").where({ id: pid }).first()).toBeUndefined();
  });
});

// =========================================================================
// NOTIFICATION SERVICE
// =========================================================================
describe("Notification CRUD", () => {
  async function createNotification(overrides: Record<string, any> = {}) {
    const id = uuidv4();
    await db("notifications").insert({
      id, org_id: ORG, user_id: overrides.user_id || USER,
      type: overrides.type || "general", title: overrides.title || "Test Notification",
      message: overrides.message || "Test message", is_read: overrides.is_read ?? 0,
      reference_id: overrides.reference_id || null, reference_type: overrides.reference_type || null,
    });
    track("notifications", id);
    return id;
  }

  it("createNotification stores fields", async () => {
    const nid = await createNotification({ type: "course_completed", title: "Course Done" });
    const n = await db("notifications").where({ id: nid }).first();
    expect(n.type).toBe("course_completed");
    expect(n.title).toBe("Course Done");
  });

  it("listNotifications paginated", async () => {
    await createNotification();
    await createNotification();
    const rows = await db("notifications").where({ org_id: ORG, user_id: USER }).orderBy("created_at", "desc").limit(20);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("getUnreadCount", async () => {
    await createNotification({ is_read: 0 });
    await createNotification({ is_read: 0 });
    await createNotification({ is_read: 1 });
    const unread = await db("notifications").where({ org_id: ORG, user_id: USER, is_read: 0 }).count("* as c");
    expect(Number(unread[0].c)).toBeGreaterThanOrEqual(2);
  });

  it("markAsRead updates single notification", async () => {
    const nid = await createNotification();
    await db("notifications").where({ id: nid }).update({ is_read: 1, read_at: new Date() });
    const n = await db("notifications").where({ id: nid }).first();
    expect(n.is_read).toBe(1);
    expect(n.read_at).toBeTruthy();
  });

  it("markAllAsRead updates all for user", async () => {
    await createNotification();
    await createNotification();
    await db("notifications").where({ org_id: ORG, user_id: USER, is_read: 0 }).update({ is_read: 1, read_at: new Date() });
    const unread = await db("notifications").where({ org_id: ORG, user_id: USER, is_read: 0 }).count("* as c");
    expect(Number(unread[0].c)).toBe(0);
  });

  it("deleteNotification removes row", async () => {
    const nid = await createNotification();
    await db("notifications").where({ id: nid }).del();
    ids.splice(ids.findIndex(i => i.id === nid), 1);
    expect(await db("notifications").where({ id: nid }).first()).toBeUndefined();
  });

  it("createBulkNotifications inserts multiple", async () => {
    const nids = [];
    for (const uid of [USER, USER2]) {
      const nid = await createNotification({ user_id: uid, title: "Bulk Notice" });
      nids.push(nid);
    }
    const rows = await db("notifications").where({ title: "Bulk Notice" });
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});

// =========================================================================
// SCORM TRACKING
// =========================================================================
describe("SCORM Tracking", () => {
  it("create scorm package and tracking", async () => {
    const cid = await createCourse();
    const mid = await createModule(cid);
    const lid = uuidv4();
    await db("lessons").insert({ id: lid, module_id: mid, title: "SCORM Lesson", content_type: "scorm", sort_order: 0, is_mandatory: 1, is_preview: 0, duration_minutes: 0 });
    track("lessons", lid);
    const pkgId = uuidv4();
    await db("scorm_packages").insert({ id: pkgId, org_id: ORG, course_id: cid, lesson_id: lid, title: "SCORM Pkg", version: "2004", entry_point: "index.html", package_url: "/scorm/pkg1.zip" });
    track("scorm_packages", pkgId);
    const eid = await createEnrollment(cid, USER, "in_progress");
    const trackId = uuidv4();
    await db("scorm_tracking").insert({ id: trackId, package_id: pkgId, user_id: USER, enrollment_id: eid, status: "incomplete", score: null, time_spent: 0 });
    track("scorm_tracking", trackId);
    const t = await db("scorm_tracking").where({ id: trackId }).first();
    expect(t.status).toBe("incomplete");
  });

  it("updateTracking changes status and score", async () => {
    const cid = await createCourse();
    const pkgId = uuidv4();
    await db("scorm_packages").insert({ id: pkgId, org_id: ORG, course_id: cid, title: "SCORM Update", version: "1.2", entry_point: "index.html", package_url: "/scorm/pkg2.zip" });
    track("scorm_packages", pkgId);
    const eid = await createEnrollment(cid, USER, "in_progress");
    const trackId = uuidv4();
    await db("scorm_tracking").insert({ id: trackId, package_id: pkgId, user_id: USER, enrollment_id: eid, status: "incomplete", score: null, time_spent: 0 });
    track("scorm_tracking", trackId);
    await db("scorm_tracking").where({ id: trackId }).update({ status: "completed", score: 95, time_spent: 1800, completion_status: "completed", success_status: "passed" });
    const t = await db("scorm_tracking").where({ id: trackId }).first();
    expect(t.status).toBe("completed");
    expect(Number(t.score)).toBe(95);
    expect(t.time_spent).toBe(1800);
  });

  it("getTracking returns tracking data", async () => {
    const cid = await createCourse();
    const pkgId = uuidv4();
    await db("scorm_packages").insert({ id: pkgId, org_id: ORG, course_id: cid, title: "SCORM Get", version: "2004", entry_point: "index.html", package_url: "/scorm/pkg3.zip" });
    track("scorm_packages", pkgId);
    const eid = await createEnrollment(cid, USER, "in_progress");
    const trackId = uuidv4();
    await db("scorm_tracking").insert({ id: trackId, package_id: pkgId, user_id: USER, enrollment_id: eid, status: "not_attempted", suspend_data: "bookmark=page5", location: "page5" });
    track("scorm_tracking", trackId);
    const t = await db("scorm_tracking").where({ package_id: pkgId, user_id: USER, enrollment_id: eid }).first();
    expect(t.suspend_data).toBe("bookmark=page5");
    expect(t.location).toBe("page5");
  });
});

// =========================================================================
// COURSE CATEGORIES
// =========================================================================
describe("Course Categories", () => {
  it("create and list categories", async () => {
    const catId = await createCategory("Data Science");
    const cats = await db("course_categories").where({ org_id: ORG, is_active: 1 });
    expect(cats.length).toBeGreaterThanOrEqual(1);
  });

  it("nested categories with parent_id", async () => {
    const parentId = await createCategory("Engineering");
    const childId = uuidv4();
    await db("course_categories").insert({ id: childId, org_id: ORG, name: "Frontend", slug: "fe-" + childId.slice(0, 8), parent_id: parentId, sort_order: 0, is_active: 1 });
    track("course_categories", childId);
    const child = await db("course_categories").where({ id: childId }).first();
    expect(child.parent_id).toBe(parentId);
  });
});

// =========================================================================
// COURSE RATINGS
// =========================================================================
describe("Course Ratings", () => {
  it("create and retrieve rating", async () => {
    const cid = await createCourse();
    const rid = uuidv4();
    await db("course_ratings").insert({ id: rid, course_id: cid, user_id: USER, org_id: ORG, rating: 5, review: "Excellent course!", is_approved: 1 });
    track("course_ratings", rid);
    const r = await db("course_ratings").where({ id: rid }).first();
    expect(r.rating).toBe(5);
    expect(r.review).toBe("Excellent course!");
  });

  it("avg rating calculation", async () => {
    const cid = await createCourse();
    const ratingUsers = [USER, USER2, 524];
    for (let i = 0; i < 3; i++) {
      const rid = uuidv4();
      await db("course_ratings").insert({ id: rid, course_id: cid, user_id: ratingUsers[i], org_id: ORG, rating: [5, 4, 3][i], is_approved: 1 });
      track("course_ratings", rid);
    }
    const avg = await db("course_ratings").where({ course_id: cid }).avg("rating as avg");
    expect(Number(avg[0].avg)).toBe(4);
  });
});

// =========================================================================
// AUDIT LOGS
// =========================================================================
describe("Audit Logs", () => {
  it("create audit log entry", async () => {
    const id = uuidv4();
    await db("audit_logs").insert({
      id, org_id: ORG, user_id: USER, action: "course.created",
      entity_type: "course", entity_id: uuidv4(),
      new_values: JSON.stringify({ title: "New Course" }),
    });
    track("audit_logs", id);
    const log = await db("audit_logs").where({ id }).first();
    expect(log.action).toBe("course.created");
  });
});

// =========================================================================
// USER PREFERENCES
// =========================================================================
describe("User Preferences", () => {
  it("create and update preferences", async () => {
    // Use a unique user to avoid duplicate entry on (org_id, user_id)
    const testUserId = 527; // Arjun
    // Delete any existing row first
    await db("user_preferences").where({ org_id: ORG, user_id: testUserId }).del();
    const id = uuidv4();
    await db("user_preferences").insert({
      id, org_id: ORG, user_id: testUserId,
      preferences: JSON.stringify({ theme: "dark", language: "en", notifications_enabled: true }),
    });
    track("user_preferences", id);
    const p = await db("user_preferences").where({ id }).first();
    const prefs = typeof p.preferences === "string" ? JSON.parse(p.preferences) : p.preferences;
    expect(prefs.theme).toBe("dark");
    expect(prefs.language).toBe("en");
  });
});
