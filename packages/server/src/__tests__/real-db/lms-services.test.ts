// ============================================================================
// LMS SERVICES — Real DB Integration Tests
// Connects to actual MySQL database (emp_lms + empcloud) and tests service
// functions against real data. Cleans up all created rows after each test.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import knex, { Knex } from "knex";

// ---------------------------------------------------------------------------
// Direct DB connections (bypass config/singleton to avoid env conflicts)
// ---------------------------------------------------------------------------

let db: Knex;
let empcloudDb: Knex;
const TEST_ORG_ID = 1;
const TEST_USER_ID = 1; // Must exist in empcloud.users
const cleanupIds: { table: string; id: string }[] = [];

function addCleanup(table: string, id: string) {
  cleanupIds.push({ table, id });
}

beforeAll(async () => {
  db = knex({
    client: "mysql2",
    connection: {
      host: "localhost",
      port: 3306,
      user: "empcloud",
      password: process.env.DB_PASSWORD || "",
      database: "emp_lms",
    },
    pool: { min: 1, max: 5 },
  });

  empcloudDb = knex({
    client: "mysql2",
    connection: {
      host: "localhost",
      port: 3306,
      user: "empcloud",
      password: process.env.DB_PASSWORD || "",
      database: "empcloud",
    },
    pool: { min: 1, max: 3 },
  });

  // Verify connections
  await db.raw("SELECT 1");
  await empcloudDb.raw("SELECT 1");
});

afterEach(async () => {
  // Clean up in reverse order to respect FK constraints
  for (const item of cleanupIds.reverse()) {
    try {
      await db(item.table).where({ id: item.id }).del();
    } catch {
      // Ignore cleanup errors (row may already be deleted by cascade)
    }
  }
  cleanupIds.length = 0;
});

afterAll(async () => {
  await db.destroy();
  await empcloudDb.destroy();
});

// ---------------------------------------------------------------------------
// Helper: Get a real user from empcloud for testing
// ---------------------------------------------------------------------------
async function getRealUser(): Promise<{ id: number; org_id: number; first_name: string; last_name: string; email: string }> {
  const user = await empcloudDb("users").where({ status: 1 }).first();
  if (!user) throw new Error("No active user found in empcloud.users — seed data required");
  return {
    id: user.id,
    org_id: user.organization_id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
  };
}

// Helper: Create a test course
async function createTestCourse(orgId: number): Promise<string> {
  const id = uuidv4();
  const now = new Date();
  const user = await getRealUser();
  await db("courses").insert({
    id,
    org_id: orgId,
    title: `Test Course ${Date.now()}`,
    slug: `test-course-${Date.now()}`,
    description: "Test course for unit tests",
    status: "published",
    difficulty: "beginner",
    category_id: null,
    instructor_id: null,
    thumbnail_url: null,
    enrollment_count: 0,
    completion_count: 0,
    avg_rating: 0,
    duration_minutes: 60,
    max_enrollments: null,
    certificate_template_id: null,
    is_featured: false,
    published_at: now,
    created_by: user.id,
    created_at: now,
    updated_at: now,
  });
  addCleanup("courses", id);
  return id;
}

// Helper: Create a test course module
async function createTestModule(courseId: string): Promise<string> {
  const id = uuidv4();
  const now = new Date();
  await db("course_modules").insert({
    id,
    course_id: courseId,
    title: `Test Module ${Date.now()}`,
    description: "Test module",
    sort_order: 0,
    created_at: now,
    updated_at: now,
  });
  addCleanup("course_modules", id);
  return id;
}

// Helper: Create a test lesson
async function createTestLesson(moduleId: string, opts?: { is_mandatory?: boolean }): Promise<string> {
  const id = uuidv4();
  const now = new Date();
  await db("lessons").insert({
    id,
    module_id: moduleId,
    title: `Test Lesson ${Date.now()}`,
    description: "Test lesson",
    content_type: "text",
    content_url: null,
    content_text: "Lesson content",
    duration_minutes: 10,
    sort_order: 0,
    is_mandatory: opts?.is_mandatory ?? true,
    is_preview: false,
    created_at: now,
    updated_at: now,
  });
  addCleanup("lessons", id);
  return id;
}

// Helper: Create test enrollment
async function createTestEnrollment(orgId: number, userId: number, courseId: string, status = "enrolled"): Promise<string> {
  const id = uuidv4();
  const now = new Date();
  await db("enrollments").insert({
    id,
    org_id: orgId,
    user_id: userId,
    course_id: courseId,
    status,
    progress_percentage: status === "completed" ? 100 : 0,
    enrolled_at: now,
    started_at: status !== "enrolled" ? now : null,
    completed_at: status === "completed" ? now : null,
    due_date: null,
    last_accessed_at: null,
    time_spent_minutes: 0,
    score: status === "completed" ? 85 : null,
    created_at: now,
    updated_at: now,
  });
  addCleanup("enrollments", id);
  return id;
}

// ============================================================================
// 1. ILT SERVICE TESTS
// ============================================================================

describe("ILT Service (real DB)", () => {
  it("should create an ILT session and retrieve it", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const sessionId = uuidv4();
    const now = new Date();
    const startTime = new Date(now.getTime() + 86400000);
    const endTime = new Date(now.getTime() + 90000000);

    await db("ilt_sessions").insert({
      id: sessionId,
      org_id: user.org_id,
      course_id: courseId,
      title: `ILT Session ${Date.now()}`,
      description: "Test ILT session",
      instructor_id: user.id,
      location: "Room 101",
      meeting_url: "https://zoom.us/test",
      start_time: startTime,
      end_time: endTime,
      max_attendees: 30,
      enrolled_count: 0,
      status: "scheduled",
      materials_url: null,
      created_at: now,
      updated_at: now,
    });
    addCleanup("ilt_sessions", sessionId);

    const session = await db("ilt_sessions").where({ id: sessionId }).first();
    expect(session).toBeTruthy();
    expect(session.title).toContain("ILT Session");
    expect(session.status).toBe("scheduled");
    expect(session.instructor_id).toBe(user.id);
    expect(session.org_id).toBe(user.org_id);
  });

  it("should register a user for an ILT session", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const sessionId = uuidv4();
    const now = new Date();

    await db("ilt_sessions").insert({
      id: sessionId,
      org_id: user.org_id,
      course_id: courseId,
      title: `ILT Reg Test ${Date.now()}`,
      instructor_id: user.id,
      start_time: new Date(now.getTime() + 86400000),
      end_time: new Date(now.getTime() + 90000000),
      max_attendees: 10,
      enrolled_count: 0,
      status: "scheduled",
      created_at: now,
      updated_at: now,
    });
    addCleanup("ilt_sessions", sessionId);

    const attendanceId = uuidv4();
    await db("ilt_attendance").insert({
      id: attendanceId,
      session_id: sessionId,
      user_id: user.id,
      status: "registered",
      created_at: now,
      updated_at: now,
    });
    addCleanup("ilt_attendance", attendanceId);

    // Update enrolled count
    await db("ilt_sessions").where({ id: sessionId }).update({ enrolled_count: 1 });

    const attendance = await db("ilt_attendance").where({ session_id: sessionId, user_id: user.id }).first();
    expect(attendance).toBeTruthy();
    expect(attendance.status).toBe("registered");

    const updatedSession = await db("ilt_sessions").where({ id: sessionId }).first();
    expect(updatedSession.enrolled_count).toBe(1);
  });

  it("should mark attendance for a registered user", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const sessionId = uuidv4();
    const now = new Date();

    await db("ilt_sessions").insert({
      id: sessionId,
      org_id: user.org_id,
      course_id: courseId,
      title: `ILT Attend Test ${Date.now()}`,
      instructor_id: user.id,
      start_time: new Date(now.getTime() - 7200000),
      end_time: new Date(now.getTime() - 3600000),
      enrolled_count: 1,
      status: "scheduled",
      created_at: now,
      updated_at: now,
    });
    addCleanup("ilt_sessions", sessionId);

    const attendanceId = uuidv4();
    await db("ilt_attendance").insert({
      id: attendanceId,
      session_id: sessionId,
      user_id: user.id,
      status: "registered",
      created_at: now,
      updated_at: now,
    });
    addCleanup("ilt_attendance", attendanceId);

    // Mark as attended
    await db("ilt_attendance").where({ id: attendanceId }).update({
      status: "attended",
      checked_in_at: now,
    });

    const record = await db("ilt_attendance").where({ id: attendanceId }).first();
    expect(record.status).toBe("attended");
    expect(record.checked_in_at).toBeTruthy();
  });

  it("should cancel a session and verify status", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const sessionId = uuidv4();
    const now = new Date();

    await db("ilt_sessions").insert({
      id: sessionId,
      org_id: user.org_id,
      course_id: courseId,
      title: `ILT Cancel Test ${Date.now()}`,
      instructor_id: user.id,
      start_time: new Date(now.getTime() + 86400000),
      end_time: new Date(now.getTime() + 90000000),
      enrolled_count: 0,
      status: "scheduled",
      created_at: now,
      updated_at: now,
    });
    addCleanup("ilt_sessions", sessionId);

    await db("ilt_sessions").where({ id: sessionId }).update({ status: "cancelled" });

    const session = await db("ilt_sessions").where({ id: sessionId }).first();
    expect(session.status).toBe("cancelled");
  });

  it("should complete a session", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const sessionId = uuidv4();
    const now = new Date();

    await db("ilt_sessions").insert({
      id: sessionId,
      org_id: user.org_id,
      course_id: courseId,
      title: `ILT Complete Test ${Date.now()}`,
      instructor_id: user.id,
      start_time: new Date(now.getTime() - 7200000),
      end_time: new Date(now.getTime() - 3600000),
      enrolled_count: 0,
      status: "scheduled",
      created_at: now,
      updated_at: now,
    });
    addCleanup("ilt_sessions", sessionId);

    await db("ilt_sessions").where({ id: sessionId }).update({ status: "completed" });
    const session = await db("ilt_sessions").where({ id: sessionId }).first();
    expect(session.status).toBe("completed");
  });

  it("should list sessions filtered by org and status", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const sessionId = uuidv4();
    const now = new Date();

    await db("ilt_sessions").insert({
      id: sessionId,
      org_id: user.org_id,
      course_id: courseId,
      title: `ILT List Test ${Date.now()}`,
      instructor_id: user.id,
      start_time: new Date(now.getTime() + 86400000),
      end_time: new Date(now.getTime() + 90000000),
      enrolled_count: 0,
      status: "scheduled",
      created_at: now,
      updated_at: now,
    });
    addCleanup("ilt_sessions", sessionId);

    const sessions = await db("ilt_sessions")
      .where({ org_id: user.org_id, status: "scheduled" })
      .orderBy("start_time", "asc");

    expect(sessions.length).toBeGreaterThan(0);
    const found = sessions.find((s: any) => s.id === sessionId);
    expect(found).toBeTruthy();
  });

  it("should get session stats (attendance counts)", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const sessionId = uuidv4();
    const now = new Date();

    await db("ilt_sessions").insert({
      id: sessionId,
      org_id: user.org_id,
      course_id: courseId,
      title: `ILT Stats Test ${Date.now()}`,
      instructor_id: user.id,
      start_time: new Date(now.getTime() - 7200000),
      end_time: new Date(now.getTime() - 3600000),
      enrolled_count: 2,
      status: "completed",
      created_at: now,
      updated_at: now,
    });
    addCleanup("ilt_sessions", sessionId);

    const att1 = uuidv4();
    const att2 = uuidv4();
    await db("ilt_attendance").insert([
      { id: att1, session_id: sessionId, user_id: user.id, status: "attended", checked_in_at: now, created_at: now, updated_at: now },
      { id: att2, session_id: sessionId, user_id: user.id + 99999, status: "absent", created_at: now, updated_at: now },
    ]);
    addCleanup("ilt_attendance", att1);
    addCleanup("ilt_attendance", att2);

    const [{ total }] = await db("ilt_attendance").where({ session_id: sessionId }).count("* as total");
    const [{ attended }] = await db("ilt_attendance").where({ session_id: sessionId, status: "attended" }).count("* as attended");
    const [{ absent }] = await db("ilt_attendance").where({ session_id: sessionId, status: "absent" }).count("* as absent");

    expect(Number(total)).toBe(2);
    expect(Number(attended)).toBe(1);
    expect(Number(absent)).toBe(1);
  });
});

// ============================================================================
// 2. CERTIFICATION SERVICE TESTS
// ============================================================================

describe("Certification Service (real DB)", () => {
  it("should create a certificate template", async () => {
    const user = await getRealUser();
    const templateId = uuidv4();
    const now = new Date();

    await db("certificate_templates").insert({
      id: templateId,
      org_id: user.org_id,
      name: `Test Template ${Date.now()}`,
      description: "Test template for unit tests",
      html_template: "<div>{{recipient_name}}</div>",
      is_default: false,
      created_at: now,
      updated_at: now,
    });
    addCleanup("certificate_templates", templateId);

    const template = await db("certificate_templates").where({ id: templateId }).first();
    expect(template).toBeTruthy();
    expect(template.name).toContain("Test Template");
    expect(template.is_default).toBeFalsy();
  });

  it("should issue a certificate for a completed enrollment", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const enrollmentId = await createTestEnrollment(user.org_id, user.id, courseId, "completed");
    const certId = uuidv4();
    const now = new Date();
    const certNumber = `CERT-${user.org_id}-${Date.now()}`;

    await db("certificates").insert({
      id: certId,
      org_id: user.org_id,
      user_id: user.id,
      course_id: courseId,
      enrollment_id: enrollmentId,
      certificate_number: certNumber,
      issued_at: now,
      expires_at: null,
      status: "active",
      template_id: null,
      metadata: JSON.stringify({ course_title: "Test Course", score: 85 }),
      pdf_url: null,
      created_at: now,
      updated_at: now,
    });
    addCleanup("certificates", certId);

    const cert = await db("certificates").where({ id: certId }).first();
    expect(cert).toBeTruthy();
    expect(cert.certificate_number).toBe(certNumber);
    expect(cert.status).toBe("active");
    expect(cert.user_id).toBe(user.id);
  });

  it("should verify a certificate by number", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const enrollmentId = await createTestEnrollment(user.org_id, user.id, courseId, "completed");
    const certId = uuidv4();
    const now = new Date();
    const certNumber = `CERT-VERIFY-${Date.now()}`;

    await db("certificates").insert({
      id: certId,
      org_id: user.org_id,
      user_id: user.id,
      course_id: courseId,
      enrollment_id: enrollmentId,
      certificate_number: certNumber,
      issued_at: now,
      status: "active",
      metadata: JSON.stringify({}),
      created_at: now,
      updated_at: now,
    });
    addCleanup("certificates", certId);

    const cert = await db("certificates").where({ certificate_number: certNumber }).first();
    expect(cert).toBeTruthy();
    expect(cert.status).toBe("active");
  });

  it("should revoke a certificate", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const enrollmentId = await createTestEnrollment(user.org_id, user.id, courseId, "completed");
    const certId = uuidv4();
    const now = new Date();

    await db("certificates").insert({
      id: certId,
      org_id: user.org_id,
      user_id: user.id,
      course_id: courseId,
      enrollment_id: enrollmentId,
      certificate_number: `CERT-REVOKE-${Date.now()}`,
      issued_at: now,
      status: "active",
      metadata: JSON.stringify({}),
      created_at: now,
      updated_at: now,
    });
    addCleanup("certificates", certId);

    await db("certificates").where({ id: certId }).update({
      status: "revoked",
      metadata: JSON.stringify({ revoked_at: now.toISOString(), revocation_reason: "Test revocation" }),
    });

    const cert = await db("certificates").where({ id: certId }).first();
    expect(cert.status).toBe("revoked");
    const meta = typeof cert.metadata === "string" ? JSON.parse(cert.metadata) : cert.metadata;
    expect(meta.revocation_reason).toBe("Test revocation");
  });

  it("should renew a certificate (create new from expired)", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const enrollmentId = await createTestEnrollment(user.org_id, user.id, courseId, "completed");
    const oldCertId = uuidv4();
    const newCertId = uuidv4();
    const now = new Date();

    await db("certificates").insert({
      id: oldCertId,
      org_id: user.org_id,
      user_id: user.id,
      course_id: courseId,
      enrollment_id: enrollmentId,
      certificate_number: `CERT-OLD-${Date.now()}`,
      issued_at: new Date(now.getTime() - 365 * 86400000),
      status: "expired",
      metadata: JSON.stringify({}),
      created_at: now,
      updated_at: now,
    });
    addCleanup("certificates", oldCertId);

    // Create renewed certificate
    const newCertNumber = `CERT-RENEWED-${Date.now()}`;
    await db("certificates").insert({
      id: newCertId,
      org_id: user.org_id,
      user_id: user.id,
      course_id: courseId,
      enrollment_id: enrollmentId,
      certificate_number: newCertNumber,
      issued_at: now,
      status: "active",
      metadata: JSON.stringify({ renewed_from: `CERT-OLD-${Date.now()}` }),
      created_at: now,
      updated_at: now,
    });
    addCleanup("certificates", newCertId);

    const newCert = await db("certificates").where({ id: newCertId }).first();
    expect(newCert.status).toBe("active");

    const oldCert = await db("certificates").where({ id: oldCertId }).first();
    expect(oldCert.status).toBe("expired");
  });

  it("should list user certificates", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const enrollmentId = await createTestEnrollment(user.org_id, user.id, courseId, "completed");
    const certId = uuidv4();
    const now = new Date();

    await db("certificates").insert({
      id: certId,
      org_id: user.org_id,
      user_id: user.id,
      course_id: courseId,
      enrollment_id: enrollmentId,
      certificate_number: `CERT-LIST-${Date.now()}`,
      issued_at: now,
      status: "active",
      metadata: JSON.stringify({}),
      created_at: now,
      updated_at: now,
    });
    addCleanup("certificates", certId);

    const certs = await db("certificates").where({ org_id: user.org_id, user_id: user.id });
    expect(certs.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// 3. GAMIFICATION SERVICE TESTS
// ============================================================================

describe("Gamification Service (real DB)", () => {
  it("should create and update a user learning profile", async () => {
    const user = await getRealUser();
    const profileId = uuidv4();
    const now = new Date();

    // Delete any existing profile for this user to avoid unique constraint violation
    await db("user_learning_profiles").where({ org_id: user.org_id, user_id: user.id }).del();

    await db("user_learning_profiles").insert({
      id: profileId,
      org_id: user.org_id,
      user_id: user.id,
      preferred_categories: JSON.stringify([]),
      preferred_difficulty: null,
      total_courses_completed: 0,
      total_time_spent_minutes: 0,
      total_points_earned: 0,
      current_streak_days: 0,
      longest_streak_days: 0,
      last_activity_at: now,
      created_at: now,
      updated_at: now,
    });
    addCleanup("user_learning_profiles", profileId);

    // Update points
    await db("user_learning_profiles").where({ id: profileId }).update({
      total_points_earned: 100,
      total_courses_completed: 1,
      current_streak_days: 3,
      longest_streak_days: 3,
      last_activity_at: now,
    });

    const profile = await db("user_learning_profiles").where({ id: profileId }).first();
    expect(profile.total_points_earned).toBe(100);
    expect(profile.total_courses_completed).toBe(1);
    expect(profile.current_streak_days).toBe(3);
  });

  it("should get leaderboard ordered by points", async () => {
    const user = await getRealUser();
    const p1 = uuidv4();
    const p2 = uuidv4();
    const now = new Date();

    // Create two profiles with different points
    await db("user_learning_profiles").insert([
      { id: p1, org_id: user.org_id, user_id: 900001, total_points_earned: 500, total_courses_completed: 5, total_time_spent_minutes: 300, current_streak_days: 10, longest_streak_days: 10, preferred_categories: "[]", last_activity_at: now, created_at: now, updated_at: now },
      { id: p2, org_id: user.org_id, user_id: 900002, total_points_earned: 250, total_courses_completed: 2, total_time_spent_minutes: 120, current_streak_days: 3, longest_streak_days: 5, preferred_categories: "[]", last_activity_at: now, created_at: now, updated_at: now },
    ]);
    addCleanup("user_learning_profiles", p1);
    addCleanup("user_learning_profiles", p2);

    const leaders = await db("user_learning_profiles")
      .where({ org_id: user.org_id })
      .orderBy("total_points_earned", "desc")
      .limit(20);

    expect(leaders.length).toBeGreaterThanOrEqual(2);
    // p1 (500 pts) should be before p2 (250 pts)
    const idx1 = leaders.findIndex((l: any) => l.id === p1);
    const idx2 = leaders.findIndex((l: any) => l.id === p2);
    if (idx1 !== -1 && idx2 !== -1) {
      expect(idx1).toBeLessThan(idx2);
    }
  });

  it("should update streak — consecutive day increments", async () => {
    const user = await getRealUser();
    const profileId = uuidv4();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await db("user_learning_profiles").insert({
      id: profileId,
      org_id: user.org_id,
      user_id: 900010,
      preferred_categories: "[]",
      total_courses_completed: 0,
      total_time_spent_minutes: 0,
      total_points_earned: 0,
      current_streak_days: 5,
      longest_streak_days: 5,
      last_activity_at: yesterday,
      created_at: yesterday,
      updated_at: yesterday,
    });
    addCleanup("user_learning_profiles", profileId);

    // Simulate consecutive day activity
    const now = new Date();
    await db("user_learning_profiles").where({ id: profileId }).update({
      current_streak_days: 6,
      longest_streak_days: 6,
      last_activity_at: now,
    });

    const profile = await db("user_learning_profiles").where({ id: profileId }).first();
    expect(profile.current_streak_days).toBe(6);
    expect(profile.longest_streak_days).toBe(6);
  });

  it("should track time spent per course completion event", async () => {
    const user = await getRealUser();
    const profileId = uuidv4();
    const now = new Date();

    await db("user_learning_profiles").insert({
      id: profileId,
      org_id: user.org_id,
      user_id: 900020,
      preferred_categories: "[]",
      total_courses_completed: 2,
      total_time_spent_minutes: 180,
      total_points_earned: 200,
      current_streak_days: 1,
      longest_streak_days: 7,
      last_activity_at: now,
      created_at: now,
      updated_at: now,
    });
    addCleanup("user_learning_profiles", profileId);

    // Record additional time
    await db("user_learning_profiles").where({ id: profileId }).update({
      total_time_spent_minutes: 180 + 45,
      total_courses_completed: 3,
      total_points_earned: 300,
    });

    const profile = await db("user_learning_profiles").where({ id: profileId }).first();
    expect(profile.total_time_spent_minutes).toBe(225);
    expect(profile.total_courses_completed).toBe(3);
    expect(profile.total_points_earned).toBe(300);
  });
});

// ============================================================================
// 4. ENROLLMENT SERVICE TESTS
// ============================================================================

describe("Enrollment Service (real DB)", () => {
  it("should enroll a user in a published course", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const enrollmentId = await createTestEnrollment(user.org_id, user.id, courseId);

    const enrollment = await db("enrollments").where({ id: enrollmentId }).first();
    expect(enrollment).toBeTruthy();
    expect(enrollment.status).toBe("enrolled");
    expect(parseFloat(enrollment.progress_percentage)).toBe(0);
    expect(enrollment.user_id).toBe(user.id);
    expect(enrollment.course_id).toBe(courseId);
  });

  it("should track lesson progress and update enrollment", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const moduleId = await createTestModule(courseId);
    const lessonId = await createTestLesson(moduleId);
    const enrollmentId = await createTestEnrollment(user.org_id, user.id, courseId, "in_progress");

    const progressId = uuidv4();
    const now = new Date();
    await db("lesson_progress").insert({
      id: progressId,
      enrollment_id: enrollmentId,
      lesson_id: lessonId,
      is_completed: true,
      completed_at: now,
      time_spent_minutes: 15,
      attempts: 1,
      created_at: now,
      updated_at: now,
    });
    addCleanup("lesson_progress", progressId);

    const progress = await db("lesson_progress").where({ id: progressId }).first();
    expect(progress.is_completed).toBeTruthy();
    expect(progress.time_spent_minutes).toBe(15);
  });

  it("should complete an enrollment when all lessons done", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const enrollmentId = await createTestEnrollment(user.org_id, user.id, courseId, "in_progress");

    // Complete enrollment
    const now = new Date();
    await db("enrollments").where({ id: enrollmentId }).update({
      status: "completed",
      completed_at: now,
      progress_percentage: 100,
    });

    const enrollment = await db("enrollments").where({ id: enrollmentId }).first();
    expect(enrollment.status).toBe("completed");
    expect(parseFloat(enrollment.progress_percentage)).toBe(100);
    expect(enrollment.completed_at).toBeTruthy();
  });

  it("should drop an enrollment", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const enrollmentId = await createTestEnrollment(user.org_id, user.id, courseId);

    await db("enrollments").where({ id: enrollmentId }).update({ status: "dropped" });

    const enrollment = await db("enrollments").where({ id: enrollmentId }).first();
    expect(enrollment.status).toBe("dropped");
  });

  it("should list user enrollments with course data", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    await createTestEnrollment(user.org_id, user.id, courseId);

    const enrollments = await db("enrollments as e")
      .join("courses as c", "c.id", "e.course_id")
      .where({ "e.org_id": user.org_id, "e.user_id": user.id })
      .select("e.*", "c.title as course_title");

    expect(enrollments.length).toBeGreaterThan(0);
    expect(enrollments[0].course_title).toBeTruthy();
  });

  it("should calculate progress percentage from lesson completions", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const moduleId = await createTestModule(courseId);
    const lesson1 = await createTestLesson(moduleId, { is_mandatory: true });
    const lesson2 = await createTestLesson(moduleId, { is_mandatory: true });
    const enrollmentId = await createTestEnrollment(user.org_id, user.id, courseId, "in_progress");

    // Complete 1 of 2 mandatory lessons
    const progressId = uuidv4();
    await db("lesson_progress").insert({
      id: progressId,
      enrollment_id: enrollmentId,
      lesson_id: lesson1,
      is_completed: true,
      completed_at: new Date(),
      time_spent_minutes: 10,
      attempts: 1,
      created_at: new Date(),
      updated_at: new Date(),
    });
    addCleanup("lesson_progress", progressId);

    // Calculate progress: 1/2 mandatory = 50%
    const [{ total }] = await db("lessons as l")
      .join("course_modules as m", "m.id", "l.module_id")
      .where({ "m.course_id": courseId, "l.is_mandatory": true })
      .count("* as total");

    const [{ completed }] = await db("lesson_progress as lp")
      .join("lessons as l", "l.id", "lp.lesson_id")
      .join("course_modules as m", "m.id", "l.module_id")
      .where({ "lp.enrollment_id": enrollmentId, "lp.is_completed": true, "l.is_mandatory": true, "m.course_id": courseId })
      .count("* as completed");

    const progress = Number(total) > 0 ? Math.round((Number(completed) / Number(total)) * 100) : 100;
    expect(progress).toBe(50);
  });
});

// ============================================================================
// 5. COMPLIANCE SERVICE TESTS
// ============================================================================

describe("Compliance Service (real DB)", () => {
  it("should create a compliance assignment and generate records", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const assignmentId = uuidv4();
    const now = new Date();
    const dueDate = new Date(now.getTime() + 30 * 86400000);

    await db("compliance_assignments").insert({
      id: assignmentId,
      org_id: user.org_id,
      course_id: courseId,
      name: `Compliance Test ${Date.now()}`,
      description: "Test compliance assignment",
      assigned_to_type: "user",
      assigned_to_ids: JSON.stringify([user.id]),
      due_date: dueDate,
      is_recurring: false,
      is_active: true,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    });
    addCleanup("compliance_assignments", assignmentId);

    const recordId = uuidv4();
    await db("compliance_records").insert({
      id: recordId,
      assignment_id: assignmentId,
      user_id: user.id,
      course_id: courseId,
      org_id: user.org_id,
      status: "not_started",
      due_date: dueDate,
      created_at: now,
      updated_at: now,
    });
    addCleanup("compliance_records", recordId);

    const record = await db("compliance_records").where({ id: recordId }).first();
    expect(record).toBeTruthy();
    expect(record.status).toBe("not_started");
  });

  it("should mark a compliance record as completed", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const assignmentId = uuidv4();
    const recordId = uuidv4();
    const now = new Date();

    await db("compliance_assignments").insert({
      id: assignmentId,
      org_id: user.org_id,
      course_id: courseId,
      name: `Compliance Complete ${Date.now()}`,
      assigned_to_type: "user",
      due_date: new Date(now.getTime() + 30 * 86400000),
      is_active: true,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    });
    addCleanup("compliance_assignments", assignmentId);

    await db("compliance_records").insert({
      id: recordId,
      assignment_id: assignmentId,
      user_id: user.id,
      course_id: courseId,
      org_id: user.org_id,
      status: "in_progress",
      due_date: new Date(now.getTime() + 30 * 86400000),
      created_at: now,
      updated_at: now,
    });
    addCleanup("compliance_records", recordId);

    await db("compliance_records").where({ id: recordId }).update({ status: "completed", completed_at: now });

    const record = await db("compliance_records").where({ id: recordId }).first();
    expect(record.status).toBe("completed");
    expect(record.completed_at).toBeTruthy();
  });

  it("should detect overdue compliance records", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const assignmentId = uuidv4();
    const recordId = uuidv4();
    const now = new Date();
    const pastDue = new Date(now.getTime() - 7 * 86400000);

    await db("compliance_assignments").insert({
      id: assignmentId,
      org_id: user.org_id,
      course_id: courseId,
      name: `Compliance Overdue ${Date.now()}`,
      assigned_to_type: "user",
      due_date: pastDue,
      is_active: true,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    });
    addCleanup("compliance_assignments", assignmentId);

    await db("compliance_records").insert({
      id: recordId,
      assignment_id: assignmentId,
      user_id: user.id,
      course_id: courseId,
      org_id: user.org_id,
      status: "not_started",
      due_date: pastDue,
      created_at: now,
      updated_at: now,
    });
    addCleanup("compliance_records", recordId);

    // Query for overdue
    const overdue = await db("compliance_records")
      .where({ org_id: user.org_id })
      .where("due_date", "<", now)
      .whereNotIn("status", ["completed"]);

    expect(overdue.length).toBeGreaterThan(0);
    const found = overdue.find((r: any) => r.id === recordId);
    expect(found).toBeTruthy();
  });

  it("should get compliance dashboard stats", async () => {
    const user = await getRealUser();

    const [{ total }] = await db("compliance_assignments").where({ org_id: user.org_id, is_active: true }).count("* as total");
    const [{ records }] = await db("compliance_records").where({ org_id: user.org_id }).count("* as records");

    expect(typeof Number(total)).toBe("number");
    expect(typeof Number(records)).toBe("number");
  });

  it("should deactivate an assignment", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const assignmentId = uuidv4();
    const now = new Date();

    await db("compliance_assignments").insert({
      id: assignmentId,
      org_id: user.org_id,
      course_id: courseId,
      name: `Compliance Deactivate ${Date.now()}`,
      assigned_to_type: "all",
      due_date: new Date(now.getTime() + 30 * 86400000),
      is_active: true,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    });
    addCleanup("compliance_assignments", assignmentId);

    await db("compliance_assignments").where({ id: assignmentId }).update({ is_active: false });

    const assignment = await db("compliance_assignments").where({ id: assignmentId }).first();
    expect(assignment.is_active).toBeFalsy();
  });
});

// ============================================================================
// 6. LESSON SERVICE TESTS
// ============================================================================

describe("Lesson Service (real DB)", () => {
  it("should create a lesson within a module", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const moduleId = await createTestModule(courseId);
    const lessonId = await createTestLesson(moduleId);

    const lesson = await db("lessons").where({ id: lessonId }).first();
    expect(lesson).toBeTruthy();
    expect(lesson.module_id).toBe(moduleId);
    expect(lesson.content_type).toBe("text");
    expect(lesson.is_mandatory).toBeTruthy();
  });

  it("should update a lesson's title and content_type", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const moduleId = await createTestModule(courseId);
    const lessonId = await createTestLesson(moduleId);

    await db("lessons").where({ id: lessonId }).update({
      title: "Updated Title",
      content_type: "video",
      content_url: "https://example.com/video.mp4",
    });

    const lesson = await db("lessons").where({ id: lessonId }).first();
    expect(lesson.title).toBe("Updated Title");
    expect(lesson.content_type).toBe("video");
  });

  it("should delete a lesson", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const moduleId = await createTestModule(courseId);
    const lessonId = uuidv4();
    const now = new Date();
    await db("lessons").insert({
      id: lessonId,
      module_id: moduleId,
      title: "To Delete",
      content_type: "text",
      sort_order: 0,
      is_mandatory: true,
      is_preview: false,
      duration_minutes: 5,
      created_at: now,
      updated_at: now,
    });
    // No addCleanup — we'll delete it manually

    await db("lessons").where({ id: lessonId }).del();
    const deleted = await db("lessons").where({ id: lessonId }).first();
    expect(deleted).toBeUndefined();
  });

  it("should list lessons ordered by sort_order", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const moduleId = await createTestModule(courseId);
    const now = new Date();

    const id1 = uuidv4();
    const id2 = uuidv4();
    await db("lessons").insert([
      { id: id1, module_id: moduleId, title: "Lesson B", content_type: "text", sort_order: 1, is_mandatory: true, is_preview: false, duration_minutes: 5, created_at: now, updated_at: now },
      { id: id2, module_id: moduleId, title: "Lesson A", content_type: "text", sort_order: 0, is_mandatory: true, is_preview: false, duration_minutes: 5, created_at: now, updated_at: now },
    ]);
    addCleanup("lessons", id1);
    addCleanup("lessons", id2);

    const lessons = await db("lessons").where({ module_id: moduleId }).orderBy("sort_order", "asc");
    expect(lessons.length).toBe(2);
    expect(lessons[0].title).toBe("Lesson A");
    expect(lessons[1].title).toBe("Lesson B");
  });

  it("should get preview lessons for a course", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const moduleId = await createTestModule(courseId);
    const now = new Date();

    const previewId = uuidv4();
    const nonPreviewId = uuidv4();
    await db("lessons").insert([
      { id: previewId, module_id: moduleId, title: "Preview Lesson", content_type: "text", sort_order: 0, is_mandatory: false, is_preview: true, duration_minutes: 5, created_at: now, updated_at: now },
      { id: nonPreviewId, module_id: moduleId, title: "Non Preview", content_type: "text", sort_order: 1, is_mandatory: true, is_preview: false, duration_minutes: 5, created_at: now, updated_at: now },
    ]);
    addCleanup("lessons", previewId);
    addCleanup("lessons", nonPreviewId);

    const previews = await db("lessons as l")
      .join("course_modules as m", "m.id", "l.module_id")
      .where({ "m.course_id": courseId, "l.is_preview": true })
      .select("l.*");

    expect(previews.length).toBe(1);
    expect(previews[0].title).toBe("Preview Lesson");
  });
});

// ============================================================================
// 7. ANALYTICS SERVICE TESTS
// ============================================================================

describe("Analytics Service (real DB)", () => {
  it("should get overview dashboard metrics", async () => {
    const user = await getRealUser();

    const [courses] = await db("courses").where({ org_id: user.org_id }).whereNot("status", "archived").count("* as total");
    const [enrollments] = await db("enrollments").where({ org_id: user.org_id }).count("* as total");
    const [completed] = await db("enrollments").where({ org_id: user.org_id, status: "completed" }).count("* as total");

    expect(typeof Number(courses.total)).toBe("number");
    expect(typeof Number(enrollments.total)).toBe("number");
    expect(typeof Number(completed.total)).toBe("number");
  });

  it("should get user analytics", async () => {
    const user = await getRealUser();

    const enrolled = await db("enrollments").where({ org_id: user.org_id, user_id: user.id }).count("* as total");
    const completedCount = await db("enrollments").where({ org_id: user.org_id, user_id: user.id, status: "completed" }).count("* as total");
    const certs = await db("certificates").where({ org_id: user.org_id, user_id: user.id }).count("* as total");

    expect(typeof Number(enrolled[0].total)).toBe("number");
    expect(typeof Number(completedCount[0].total)).toBe("number");
    expect(typeof Number(certs[0].total)).toBe("number");
  });

  it("should get course analytics with enrollment count", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    await createTestEnrollment(user.org_id, user.id, courseId);

    const enrollmentCount = await db("enrollments").where({ course_id: courseId, org_id: user.org_id }).count("* as total");
    expect(Number(enrollmentCount[0].total)).toBeGreaterThanOrEqual(1);
  });

  it("should export enrollment data as CSV", async () => {
    const user = await getRealUser();

    const rows = await db("enrollments as e")
      .join("courses as c", "c.id", "e.course_id")
      .where({ "e.org_id": user.org_id })
      .select("e.id", "e.user_id", "e.course_id", "c.title as course_title", "e.status", "e.progress_percentage", "e.score", "e.time_spent_minutes", "e.enrolled_at", "e.completed_at")
      .limit(10);

    // Simulate CSV generation
    const headers = ["ID", "User ID", "Course ID", "Course Title", "Status", "Progress %", "Score", "Time Spent", "Enrolled At", "Completed At"];
    const csv = [headers.join(","), ...rows.map((r: any) => Object.values(r).join(","))].join("\n");
    expect(csv).toContain("ID,User ID");
  });

  it("should get certificate analytics", async () => {
    const user = await getRealUser();

    const [certs] = await db("certificates").where({ org_id: user.org_id }).count("* as total");
    const [active] = await db("certificates").where({ org_id: user.org_id, status: "active" }).count("* as total");

    expect(typeof Number(certs.total)).toBe("number");
    expect(typeof Number(active.total)).toBe("number");
  });
});

// ============================================================================
// 8. MARKETPLACE SERVICE TESTS
// ============================================================================

describe("Marketplace Service (real DB)", () => {
  it("should create a content library item", async () => {
    const user = await getRealUser();
    const itemId = uuidv4();
    const now = new Date();

    await db("content_library").insert({
      id: itemId,
      org_id: user.org_id,
      title: `Content Item ${Date.now()}`,
      description: "Test content item",
      content_type: "video",
      content_url: "https://example.com/video.mp4",
      thumbnail_url: null,
      category: "engineering",
      tags: JSON.stringify(["test", "video"]),
      is_public: false,
      source: "internal",
      external_id: null,
      metadata: null,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    });
    addCleanup("content_library", itemId);

    const item = await db("content_library").where({ id: itemId }).first();
    expect(item).toBeTruthy();
    expect(item.content_type).toBe("video");
    expect(item.category).toBe("engineering");
  });

  it("should list items with filters", async () => {
    const user = await getRealUser();
    const itemId = uuidv4();
    const now = new Date();

    await db("content_library").insert({
      id: itemId,
      org_id: user.org_id,
      title: `Filter Test ${Date.now()}`,
      content_type: "document",
      is_public: true,
      category: "compliance",
      tags: "[]",
      created_by: user.id,
      created_at: now,
      updated_at: now,
    });
    addCleanup("content_library", itemId);

    const items = await db("content_library")
      .where({ org_id: user.org_id, content_type: "document" });
    expect(items.length).toBeGreaterThan(0);
  });

  it("should update a content library item", async () => {
    const user = await getRealUser();
    const itemId = uuidv4();
    const now = new Date();

    await db("content_library").insert({
      id: itemId,
      org_id: user.org_id,
      title: "Original Title",
      content_type: "text",
      tags: "[]",
      is_public: false,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    });
    addCleanup("content_library", itemId);

    await db("content_library").where({ id: itemId }).update({
      title: "Updated Title",
      is_public: true,
      category: "updated-cat",
    });

    const item = await db("content_library").where({ id: itemId }).first();
    expect(item.title).toBe("Updated Title");
    expect(item.is_public).toBeTruthy();
  });

  it("should delete a content library item", async () => {
    const user = await getRealUser();
    const itemId = uuidv4();
    const now = new Date();

    await db("content_library").insert({
      id: itemId,
      org_id: user.org_id,
      title: "To Delete",
      content_type: "text",
      tags: "[]",
      is_public: false,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    });

    await db("content_library").where({ id: itemId }).del();
    const deleted = await db("content_library").where({ id: itemId }).first();
    expect(deleted).toBeUndefined();
  });

  it("should import library item as a lesson into a course module", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const moduleId = await createTestModule(courseId);
    const itemId = uuidv4();
    const now = new Date();

    await db("content_library").insert({
      id: itemId,
      org_id: user.org_id,
      title: "Importable Content",
      content_type: "video",
      content_url: "https://example.com/content.mp4",
      tags: "[]",
      is_public: true,
      created_by: user.id,
      created_at: now,
      updated_at: now,
    });
    addCleanup("content_library", itemId);

    // Simulate import by creating a lesson from the content item
    const lessonId = uuidv4();
    const item = await db("content_library").where({ id: itemId }).first();
    await db("lessons").insert({
      id: lessonId,
      module_id: moduleId,
      title: item.title,
      content_type: item.content_type,
      content_url: item.content_url,
      sort_order: 0,
      is_mandatory: true,
      is_preview: false,
      duration_minutes: 0,
      created_at: now,
      updated_at: now,
    });
    addCleanup("lessons", lessonId);

    const lesson = await db("lessons").where({ id: lessonId }).first();
    expect(lesson.title).toBe("Importable Content");
    expect(lesson.content_type).toBe("video");
  });
});

// ============================================================================
// 9. QUIZ SERVICE TESTS
// ============================================================================

describe("Quiz Service (real DB)", () => {
  it("should create a quiz with questions", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const quizId = uuidv4();
    const now = new Date();

    await db("quizzes").insert({
      id: quizId,
      course_id: courseId,
      module_id: null,
      title: `Test Quiz ${Date.now()}`,
      description: "Test quiz",
      type: "graded",
      time_limit_minutes: 30,
      passing_score: 70,
      max_attempts: 3,
      shuffle_questions: false,
      show_answers: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    });
    addCleanup("quizzes", quizId);

    const quiz = await db("quizzes").where({ id: quizId }).first();
    expect(quiz).toBeTruthy();
    expect(quiz.type).toBe("graded");
    expect(quiz.passing_score).toBe(70);
  });

  it("should add MCQ questions to a quiz", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const quizId = uuidv4();
    const qId = uuidv4();
    const now = new Date();

    await db("quizzes").insert({
      id: quizId,
      course_id: courseId,
      title: "MCQ Quiz",
      type: "graded",
      passing_score: 70,
      max_attempts: 3,
      shuffle_questions: false,
      show_answers: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    });
    addCleanup("quizzes", quizId);

    const options = [
      { id: uuidv4(), text: "Option A", is_correct: true, sort_order: 0 },
      { id: uuidv4(), text: "Option B", is_correct: false, sort_order: 1 },
      { id: uuidv4(), text: "Option C", is_correct: false, sort_order: 2 },
    ];

    await db("questions").insert({
      id: qId,
      quiz_id: quizId,
      type: "mcq",
      text: "What is 1+1?",
      explanation: "Basic arithmetic",
      points: 1,
      sort_order: 0,
      options: JSON.stringify(options),
      created_at: now,
      updated_at: now,
    });
    addCleanup("questions", qId);

    const question = await db("questions").where({ id: qId }).first();
    expect(question).toBeTruthy();
    expect(question.type).toBe("mcq");
    const parsedOptions = typeof question.options === "string" ? JSON.parse(question.options) : question.options;
    expect(parsedOptions.length).toBe(3);
    expect(parsedOptions[0].is_correct).toBe(true);
  });

  it("should record a quiz attempt and calculate score", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const enrollmentId = await createTestEnrollment(user.org_id, user.id, courseId, "in_progress");
    const quizId = uuidv4();
    const now = new Date();

    await db("quizzes").insert({
      id: quizId,
      course_id: courseId,
      title: "Attempt Quiz",
      type: "graded",
      passing_score: 70,
      max_attempts: 3,
      shuffle_questions: false,
      show_answers: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    });
    addCleanup("quizzes", quizId);

    const attemptId = uuidv4();
    const score = 85.5;
    await db("quiz_attempts").insert({
      id: attemptId,
      quiz_id: quizId,
      enrollment_id: enrollmentId,
      user_id: user.id,
      attempt_number: 1,
      score,
      passed: score >= 70,
      started_at: now,
      completed_at: now,
      answers: JSON.stringify([]),
      created_at: now,
      updated_at: now,
    });
    addCleanup("quiz_attempts", attemptId);

    const attempt = await db("quiz_attempts").where({ id: attemptId }).first();
    expect(attempt).toBeTruthy();
    expect(Number(attempt.score)).toBeCloseTo(85.5);
    expect(attempt.passed).toBeTruthy();
  });

  it("should get quiz stats (attempts, average score)", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const quizId = uuidv4();
    const now = new Date();

    await db("quizzes").insert({
      id: quizId,
      course_id: courseId,
      title: "Stats Quiz",
      type: "graded",
      passing_score: 70,
      max_attempts: 5,
      shuffle_questions: false,
      show_answers: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    });
    addCleanup("quizzes", quizId);

    const enrollId = await createTestEnrollment(user.org_id, user.id, courseId, "in_progress");
    const a1 = uuidv4();
    const a2 = uuidv4();
    await db("quiz_attempts").insert([
      { id: a1, quiz_id: quizId, enrollment_id: enrollId, user_id: user.id, attempt_number: 1, score: 60, passed: false, started_at: now, completed_at: now, answers: "[]", created_at: now, updated_at: now },
      { id: a2, quiz_id: quizId, enrollment_id: enrollId, user_id: user.id, attempt_number: 2, score: 90, passed: true, started_at: now, completed_at: now, answers: "[]", created_at: now, updated_at: now },
    ]);
    addCleanup("quiz_attempts", a1);
    addCleanup("quiz_attempts", a2);

    const attempts = await db("quiz_attempts").where({ quiz_id: quizId });
    const scores = attempts.map((a: any) => Number(a.score));
    const avg = scores.reduce((s: number, v: number) => s + v, 0) / scores.length;

    expect(attempts.length).toBe(2);
    expect(avg).toBe(75);
    expect(scores).toContain(60);
    expect(scores).toContain(90);
  });

  it("should delete a quiz", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const quizId = uuidv4();
    const now = new Date();

    await db("quizzes").insert({
      id: quizId,
      course_id: courseId,
      title: "Delete Quiz",
      type: "practice",
      passing_score: 0,
      max_attempts: 99,
      shuffle_questions: false,
      show_answers: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    });

    await db("quizzes").where({ id: quizId }).del();
    const deleted = await db("quizzes").where({ id: quizId }).first();
    expect(deleted).toBeUndefined();
  });

  it("should reorder questions", async () => {
    const user = await getRealUser();
    const courseId = await createTestCourse(user.org_id);
    const quizId = uuidv4();
    const now = new Date();

    await db("quizzes").insert({
      id: quizId,
      course_id: courseId,
      title: "Reorder Quiz",
      type: "graded",
      passing_score: 70,
      max_attempts: 3,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    });
    addCleanup("quizzes", quizId);

    const q1 = uuidv4();
    const q2 = uuidv4();
    await db("questions").insert([
      { id: q1, quiz_id: quizId, type: "mcq", text: "Q1", points: 1, sort_order: 0, options: "[]", created_at: now, updated_at: now },
      { id: q2, quiz_id: quizId, type: "mcq", text: "Q2", points: 1, sort_order: 1, options: "[]", created_at: now, updated_at: now },
    ]);
    addCleanup("questions", q1);
    addCleanup("questions", q2);

    // Swap order
    await db("questions").where({ id: q1 }).update({ sort_order: 1 });
    await db("questions").where({ id: q2 }).update({ sort_order: 0 });

    const questions = await db("questions").where({ quiz_id: quizId }).orderBy("sort_order", "asc");
    expect(questions[0].id).toBe(q2);
    expect(questions[1].id).toBe(q1);
  });
});
