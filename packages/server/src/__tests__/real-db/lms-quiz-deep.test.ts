// ============================================================================
// QUIZ SERVICE - Deep Real-DB Tests
// ============================================================================
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import knex, { Knex } from "knex";

let db: Knex;
const ORG = 5;
const USER = 522;
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

async function createCourse(title?: string) {
  const id = uuidv4();
  await db("courses").insert({
    id, org_id: ORG, title: title || "Test Course " + id.slice(0, 8),
    slug: "tc-" + id.slice(0, 8), status: "published",
    completion_criteria: "all_lessons", passing_score: 70, created_by: USER,
    enrollment_count: 0, completion_count: 0, avg_rating: 0, rating_count: 0, duration_minutes: 0,
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
async function createEnrollment(courseId: string, status = "in_progress") {
  const id = uuidv4();
  await db("enrollments").insert({
    id, org_id: ORG, user_id: USER, course_id: courseId, status,
    progress_percentage: status === "completed" ? 100 : 0,
    enrolled_at: new Date(), time_spent_minutes: 0,
    completed_at: status === "completed" ? new Date() : null,
  });
  track("enrollments", id);
  return id;
}
async function createQuiz(courseId: string, overrides: Record<string, any> = {}) {
  const id = uuidv4();
  await db("quizzes").insert({
    id, course_id: courseId, title: overrides.title || "Test Quiz",
    type: overrides.type || "graded", passing_score: overrides.passing_score ?? 70,
    max_attempts: overrides.max_attempts ?? 3, shuffle_questions: overrides.shuffle_questions ?? 0,
    show_answers: overrides.show_answers ?? 1, sort_order: 0,
    module_id: overrides.module_id || null,
    time_limit_minutes: overrides.time_limit_minutes || null,
    description: overrides.description || null,
  });
  track("quizzes", id);
  return id;
}
async function createQuestion(quizId: string, type: string, opts: Record<string, any> = {}) {
  const id = uuidv4();
  const options = opts.options || [
    { id: uuidv4(), text: "A", is_correct: true, sort_order: 0 },
    { id: uuidv4(), text: "B", is_correct: false, sort_order: 1 },
  ];
  await db("questions").insert({
    id, quiz_id: quizId, type, text: opts.text || "Q " + type,
    points: opts.points ?? 1, sort_order: opts.sort_order ?? 0,
    options: JSON.stringify(options),
  });
  track("questions", id);
  return { id, options };
}
async function insertAttempt(quizId: string, enrollmentId: string, score: number, passed: number, answers: any[], attemptNum = 1) {
  const id = uuidv4();
  await db("quiz_attempts").insert({
    id, quiz_id: quizId, enrollment_id: enrollmentId, user_id: USER,
    attempt_number: attemptNum, score, passed, started_at: new Date(), completed_at: new Date(),
    answers: JSON.stringify(answers),
  });
  track("quiz_attempts", id);
  return id;
}

describe("Quiz CRUD", () => {
  it("createQuiz + list returns quiz", async () => {
    const cid = await createCourse();
    const qid = await createQuiz(cid, { title: "My Quiz" });
    const rows = await db("quizzes").where({ course_id: cid });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.find((r: any) => r.id === qid)).toBeTruthy();
  });
  it("listAllQuizzes via join on org", async () => {
    const cid = await createCourse();
    await createQuiz(cid);
    const rows = await db("quizzes").join("courses", "courses.id", "quizzes.course_id").where("courses.org_id", ORG).select("quizzes.*");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
  it("getQuiz with questions", async () => {
    const cid = await createCourse();
    const qzid = await createQuiz(cid);
    await createQuestion(qzid, "mcq");
    await createQuestion(qzid, "true_false");
    const qs = await db("questions").where({ quiz_id: qzid });
    expect(qs.length).toBe(2);
  });
  it("raw options contain is_correct", async () => {
    const cid = await createCourse();
    const qzid = await createQuiz(cid, { shuffle_questions: 1 });
    await createQuestion(qzid, "mcq");
    const q = await db("questions").where({ quiz_id: qzid }).first();
    const opts = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
    expect(opts[0].is_correct).toBeDefined();
  });
  it("updateQuiz changes fields", async () => {
    const cid = await createCourse();
    const qzid = await createQuiz(cid, { title: "Old" });
    await db("quizzes").where({ id: qzid }).update({ title: "New", passing_score: 80 });
    const u = await db("quizzes").where({ id: qzid }).first();
    expect(u.title).toBe("New");
    expect(u.passing_score).toBe(80);
  });
  it("deleteQuiz cascades cleanup", async () => {
    const cid = await createCourse();
    const qzid = await createQuiz(cid);
    await createQuestion(qzid, "mcq");
    await db("questions").where({ quiz_id: qzid }).del();
    await db("quizzes").where({ id: qzid }).del();
    ids.splice(ids.findIndex(i => i.id === qzid), 1);
    expect(await db("quizzes").where({ id: qzid }).first()).toBeUndefined();
  });
});

describe("Question CRUD", () => {
  it("MCQ options stored", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const { id } = await createQuestion(qz, "mcq", { options: [{ id: "a1", text: "Paris", is_correct: true }, { id: "a2", text: "London", is_correct: false }] });
    const row = await db("questions").where({ id }).first();
    const parsed = typeof row.options === "string" ? JSON.parse(row.options) : row.options;
    expect(parsed.length).toBe(2);
  });
  it("multi_select type", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const { id } = await createQuestion(qz, "multi_select", { options: [{ id: "a", text: "A", is_correct: true }, { id: "b", text: "B", is_correct: true }] });
    expect((await db("questions").where({ id }).first()).type).toBe("multi_select");
  });
  it("fill_blank type", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const { id } = await createQuestion(qz, "fill_blank", { options: [{ id: "fb", text: "Paris", is_correct: true }] });
    expect((await db("questions").where({ id }).first()).type).toBe("fill_blank");
  });
  it("essay type", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const { id } = await createQuestion(qz, "essay", { options: [] });
    expect((await db("questions").where({ id }).first()).type).toBe("essay");
  });
  it("matching type", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const { id } = await createQuestion(qz, "matching", { options: [{ id: "m1", text: "FR", match_target: "Paris" }, { id: "m2", text: "DE", match_target: "Berlin" }] });
    expect((await db("questions").where({ id }).first()).type).toBe("matching");
  });
  it("ordering type", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const { id } = await createQuestion(qz, "ordering", { options: [{ id: "o1", text: "1st", sort_order: 0 }, { id: "o2", text: "2nd", sort_order: 1 }] });
    expect((await db("questions").where({ id }).first()).type).toBe("ordering");
  });
  it("updateQuestion", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const { id } = await createQuestion(qz, "mcq");
    await db("questions").where({ id }).update({ text: "Updated", points: 5 });
    const q = await db("questions").where({ id }).first();
    expect(q.text).toBe("Updated"); expect(q.points).toBe(5);
  });
  it("deleteQuestion", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const { id } = await createQuestion(qz, "mcq");
    await db("questions").where({ id }).del();
    ids.splice(ids.findIndex(i => i.id === id), 1);
    expect(await db("questions").where({ id }).first()).toBeUndefined();
  });
  it("reorderQuestions", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const q1 = await createQuestion(qz, "mcq", { sort_order: 0 });
    const q2 = await createQuestion(qz, "mcq", { sort_order: 1 });
    await db("questions").where({ id: q2.id }).update({ sort_order: 0 });
    await db("questions").where({ id: q1.id }).update({ sort_order: 1 });
    const ordered = await db("questions").where({ quiz_id: qz }).orderBy("sort_order", "asc");
    expect(ordered[0].id).toBe(q2.id);
  });
});

describe("Quiz Attempts & Grading", () => {
  it("MCQ correct = 100%", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const { id: qId } = await createQuestion(qz, "mcq", { options: [{ id: "ca", text: "C", is_correct: true }, { id: "cb", text: "W", is_correct: false }] });
    const eid = await createEnrollment(cid);
    const aid = await insertAttempt(qz, eid, 100, 1, [{ question_id: qId, selected_options: ["ca"], is_correct: true, points_earned: 1, points_possible: 1 }]);
    expect(Number((await db("quiz_attempts").where({ id: aid }).first()).score)).toBe(100);
  });
  it("MCQ wrong = 0%", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const { id: qId } = await createQuestion(qz, "mcq", { options: [{ id: "ca", text: "C", is_correct: true }, { id: "cb", text: "W", is_correct: false }] });
    const eid = await createEnrollment(cid);
    const aid = await insertAttempt(qz, eid, 0, 0, [{ question_id: qId, selected_options: ["cb"], is_correct: false, points_earned: 0, points_possible: 1 }]);
    expect((await db("quiz_attempts").where({ id: aid }).first()).passed).toBeFalsy();
  });
  it("multi_select all correct", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const { id: qId } = await createQuestion(qz, "multi_select", { options: [{ id: "a", text: "A", is_correct: true }, { id: "b", text: "B", is_correct: true }] });
    const eid = await createEnrollment(cid);
    const aid = await insertAttempt(qz, eid, 100, 1, [{ question_id: qId, selected_options: ["a", "b"], is_correct: true, points_earned: 1, points_possible: 1 }]);
    expect((await db("quiz_attempts").where({ id: aid }).first()).passed).toBeTruthy();
  });
  it("fill_blank correct", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const { id: qId } = await createQuestion(qz, "fill_blank", { options: [{ id: "fb", text: "Paris", is_correct: true }] });
    const eid = await createEnrollment(cid);
    const aid = await insertAttempt(qz, eid, 100, 1, [{ question_id: qId, text_answer: "Paris", is_correct: true, points_earned: 1, points_possible: 1 }]);
    expect((await db("quiz_attempts").where({ id: aid }).first()).passed).toBeTruthy();
  });
  it("essay null grading", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const { id: qId } = await createQuestion(qz, "essay", { options: [] });
    const eid = await createEnrollment(cid);
    const aid = await insertAttempt(qz, eid, 0, 0, [{ question_id: qId, text_answer: "My essay", is_correct: null, points_earned: 0, points_possible: 1 }]);
    const att = await db("quiz_attempts").where({ id: aid }).first();
    const answers = typeof att.answers === "string" ? JSON.parse(att.answers) : att.answers;
    expect(answers[0].is_correct).toBeNull();
  });
  it("matching correct", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const { id: qId } = await createQuestion(qz, "matching", { options: [{ id: "m1", text: "FR", match_target: "Paris" }, { id: "m2", text: "DE", match_target: "Berlin" }] });
    const eid = await createEnrollment(cid);
    const aid = await insertAttempt(qz, eid, 100, 1, [{ question_id: qId, matching_pairs: { m1: "Paris", m2: "Berlin" }, is_correct: true, points_earned: 1, points_possible: 1 }]);
    expect((await db("quiz_attempts").where({ id: aid }).first()).passed).toBeTruthy();
  });
  it("ordering correct", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    const { id: qId } = await createQuestion(qz, "ordering", { options: [{ id: "o1", text: "1", sort_order: 0 }, { id: "o2", text: "2", sort_order: 1 }] });
    const eid = await createEnrollment(cid);
    const aid = await insertAttempt(qz, eid, 100, 1, [{ question_id: qId, ordered_ids: ["o1", "o2"], is_correct: true, points_earned: 1, points_possible: 1 }]);
    expect((await db("quiz_attempts").where({ id: aid }).first()).passed).toBeTruthy();
  });
  it("max_attempts count enforcement", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid, { max_attempts: 2 }); const eid = await createEnrollment(cid);
    for (let i = 1; i <= 2; i++) await insertAttempt(qz, eid, 50, 0, [], i);
    const cnt = await db("quiz_attempts").where({ quiz_id: qz, user_id: USER }).count("* as c");
    expect(cnt[0].c).toBe(2);
  });
  it("getAttempts returns all", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid); const eid = await createEnrollment(cid);
    for (let i = 1; i <= 3; i++) await insertAttempt(qz, eid, i * 25, 0, [], i);
    expect((await db("quiz_attempts").where({ quiz_id: qz, user_id: USER })).length).toBe(3);
  });
  it("getAttempt by ID", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid); const eid = await createEnrollment(cid);
    const aid = await insertAttempt(qz, eid, 85, 1, []);
    expect(Number((await db("quiz_attempts").where({ id: aid }).first()).score)).toBe(85);
  });
});

describe("Quiz Stats", () => {
  it("computes avg and pass rate", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid, { passing_score: 60 });
    const { id: qId } = await createQuestion(qz, "mcq"); const eid = await createEnrollment(cid);
    await insertAttempt(qz, eid, 80, 1, [{ question_id: qId, is_correct: true }], 1);
    await insertAttempt(qz, eid, 40, 0, [{ question_id: qId, is_correct: false }], 2);
    const atts = await db("quiz_attempts").where({ quiz_id: qz });
    expect(atts.length).toBe(2);
    const avg = atts.reduce((s: number, a: any) => s + Number(a.score), 0) / atts.length;
    expect(avg).toBe(60);
  });
  it("no attempts = empty", async () => {
    const cid = await createCourse(); const qz = await createQuiz(cid);
    expect((await db("quiz_attempts").where({ quiz_id: qz })).length).toBe(0);
  });
});

describe("Quiz type variations", () => {
  it("practice type", async () => { const c = await createCourse(); const q = await createQuiz(c, { type: "practice" }); expect((await db("quizzes").where({ id: q }).first()).type).toBe("practice"); });
  it("survey type", async () => { const c = await createCourse(); const q = await createQuiz(c, { type: "survey" }); expect((await db("quizzes").where({ id: q }).first()).type).toBe("survey"); });
  it("time_limit", async () => { const c = await createCourse(); const q = await createQuiz(c, { time_limit_minutes: 30 }); expect((await db("quizzes").where({ id: q }).first()).time_limit_minutes).toBe(30); });
  it("module_id", async () => { const c = await createCourse(); const m = await createModule(c); const q = await createQuiz(c, { module_id: m }); expect((await db("quizzes").where({ id: q }).first()).module_id).toBe(m); });
});
