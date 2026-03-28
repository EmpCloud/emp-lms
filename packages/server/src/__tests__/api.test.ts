// ============================================================================
// EMP LMS — Comprehensive API Integration Tests
// Runs against https://testlms.empcloud.com or http://localhost:4700
// ============================================================================

import { describe, it, expect, beforeAll } from "vitest";

const API = process.env.LMS_TEST_API || "http://localhost:4700";
const BASE = `${API}/api/v1`;

// ---------------------------------------------------------------------------
// Credentials — the LMS supports both SSO and direct login
// ---------------------------------------------------------------------------
const LOGIN_EMAIL = process.env.LMS_TEST_EMAIL || "admin@empcloud.com";
const LOGIN_PASS = process.env.LMS_TEST_PASS || "Admin@123";

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
let authToken = "";
let currentUserId = 0;

// IDs captured during CRUD flows
let categoryId = "";
let courseId = "";
let courseModuleId = "";
let lessonId = "";
let enrollmentId = "";
let quizId = "";
let questionId = "";
let learningPathId = "";
let certTemplateId = "";
let certId = "";
let complianceAssignmentId = "";
let iltSessionId = "";
let discussionId = "";
let ratingId = "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function api(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const opts: RequestInit = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

// ============================================================================
// AUTH
// ============================================================================
describe("Auth", () => {
  it("1. POST /auth/login — should authenticate", async () => {
    const res = await api("POST", "/auth/login", {
      email: LOGIN_EMAIL,
      password: LOGIN_PASS,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    authToken = res.body.data.accessToken || res.body.data.token;
    expect(authToken).toBeTruthy();
  });

  it("2. GET /auth/me — should return current user", async () => {
    const res = await api("GET", "/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    currentUserId =
      res.body.data.user?.empcloudUserId ||
      res.body.data.user?.id ||
      res.body.data.empcloudUserId ||
      res.body.data.id ||
      0;
  });

  it("3. POST /auth/login — should reject invalid credentials", async () => {
    const res = await api("POST", "/auth/login", {
      email: LOGIN_EMAIL,
      password: "WrongPassword!",
    });
    expect([400, 401]).toContain(res.status);
  });
});

// ============================================================================
// COURSE CATEGORIES
// ============================================================================
describe("Course Categories", () => {
  it("4. POST /courses/categories — create category", async () => {
    const res = await api("POST", "/courses/categories", {
      name: `Test Category ${Date.now()}`,
      description: "Integration test category",
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    categoryId = res.body.data.id;
    expect(categoryId).toBeTruthy();
  });

  it("5. GET /courses/categories — list categories", async () => {
    const res = await api("GET", "/courses/categories");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("6. PUT /courses/categories/:id — update category", async () => {
    const res = await api("PUT", `/courses/categories/${categoryId}`, {
      name: `Updated Category ${Date.now()}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ============================================================================
// COURSES CRUD
// ============================================================================
describe("Courses CRUD", () => {
  it("7. POST /courses — create course", async () => {
    const res = await api("POST", "/courses", {
      title: `Integration Test Course ${Date.now()}`,
      description: "A course created by the API integration test suite",
      category_id: categoryId,
      difficulty: "beginner",
      duration_hours: 10,
      is_free: true,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    courseId = res.body.data.id;
    expect(courseId).toBeTruthy();
  });

  it("8. GET /courses — list courses (paginated)", async () => {
    const res = await api("GET", "/courses?page=1&perPage=10");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("9. GET /courses/:id — get single course", async () => {
    const res = await api("GET", `/courses/${courseId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(courseId);
  });

  it("10. PUT /courses/:id — update course", async () => {
    const res = await api("PUT", `/courses/${courseId}`, {
      title: `Updated Course ${Date.now()}`,
      description: "Updated by integration tests",
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("11. POST /courses/:id/publish — publish course", async () => {
    const res = await api("POST", `/courses/${courseId}/publish`);
    expect([200, 400]).toContain(res.status);
  });

  it("12. POST /courses/:id/unpublish — unpublish course", async () => {
    const res = await api("POST", `/courses/${courseId}/unpublish`);
    expect([200, 400]).toContain(res.status);
  });

  it("13. GET /courses/popular — get popular courses", async () => {
    const res = await api("GET", "/courses/popular?limit=5");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("14. GET /courses/recommended — get recommended courses", async () => {
    const res = await api("GET", "/courses/recommended?limit=5");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("15. POST /courses/:id/duplicate — duplicate course", async () => {
    const res = await api("POST", `/courses/${courseId}/duplicate`);
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).not.toBe(courseId);
  });

  it("16. GET /courses/:id/stats — course statistics", async () => {
    const res = await api("GET", `/courses/${courseId}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ============================================================================
// COURSE MODULES & LESSONS
// ============================================================================
describe("Modules & Lessons", () => {
  it("17. POST /courses/:id/modules — create module", async () => {
    const res = await api("POST", `/courses/${courseId}/modules`, {
      title: `Test Module ${Date.now()}`,
      description: "Module for integration tests",
      sort_order: 1,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    courseModuleId = res.body.data.id;
    expect(courseModuleId).toBeTruthy();
  });

  it("18. GET /courses/:id/modules — list modules", async () => {
    const res = await api("GET", `/courses/${courseId}/modules`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("19. PUT /courses/:id/modules/:moduleId — update module", async () => {
    const res = await api(
      "PUT",
      `/courses/${courseId}/modules/${courseModuleId}`,
      { title: `Updated Module ${Date.now()}` },
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("20. POST /courses/:id/modules/:moduleId/lessons — create lesson", async () => {
    const res = await api(
      "POST",
      `/courses/${courseId}/modules/${courseModuleId}/lessons`,
      {
        title: `Test Lesson ${Date.now()}`,
        content_type: "text",
        content: "This is the lesson content for testing.",
        sort_order: 1,
        duration_minutes: 15,
      },
    );
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    lessonId = res.body.data.id;
    expect(lessonId).toBeTruthy();
  });

  it("21. GET /courses/:id/modules/:moduleId/lessons — list lessons", async () => {
    const res = await api(
      "GET",
      `/courses/${courseId}/modules/${courseModuleId}/lessons`,
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("22. PUT /courses/:id/lessons/:lessonId — update lesson", async () => {
    const res = await api("PUT", `/courses/${courseId}/lessons/${lessonId}`, {
      title: `Updated Lesson ${Date.now()}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("23. GET /courses/:id/preview — preview lessons", async () => {
    const res = await api("GET", `/courses/${courseId}/preview`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ============================================================================
// ENROLLMENTS
// ============================================================================
describe("Enrollments", () => {
  it("24. POST /enrollments — enroll in course", async () => {
    // Publish first so enrollment works
    await api("POST", `/courses/${courseId}/publish`);

    const res = await api("POST", "/enrollments", {
      course_id: courseId,
      user_id: currentUserId,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    enrollmentId = res.body.data.id;
    expect(enrollmentId).toBeTruthy();
  });

  it("25. GET /enrollments/my — list my enrollments", async () => {
    const res = await api("GET", "/enrollments/my");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("26. GET /enrollments/my/:courseId — get my progress", async () => {
    const res = await api("GET", `/enrollments/my/${courseId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("27. GET /enrollments/course/:courseId — list course enrollments (admin)", async () => {
    const res = await api("GET", `/enrollments/course/${courseId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("28. POST /enrollments/:id/lessons/:lessonId/complete — mark lesson complete", async () => {
    const res = await api(
      "POST",
      `/enrollments/${enrollmentId}/lessons/${lessonId}/complete`,
      { time_spent: 300 },
    );
    expect([200, 400]).toContain(res.status);
  });

  it("29. GET /enrollments/recent — recent activity", async () => {
    const res = await api("GET", "/enrollments/recent?limit=5");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("30. POST /enrollments/:id/complete — admin complete enrollment", async () => {
    const res = await api("POST", `/enrollments/${enrollmentId}/complete`);
    expect([200, 400]).toContain(res.status);
  });
});

// ============================================================================
// QUIZZES
// ============================================================================
describe("Quizzes", () => {
  it("31. POST /quizzes — create quiz", async () => {
    const res = await api("POST", "/quizzes", {
      course_id: courseId,
      title: `Integration Test Quiz ${Date.now()}`,
      description: "Quiz for integration testing",
      passing_score: 70,
      time_limit_minutes: 30,
      max_attempts: 3,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    quizId = res.body.data.id;
    expect(quizId).toBeTruthy();
  });

  it("32. GET /quizzes/course/:courseId — list quizzes for course", async () => {
    const res = await api("GET", `/quizzes/course/${courseId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("33. GET /quizzes/:id — get quiz (admin sees answers)", async () => {
    const res = await api("GET", `/quizzes/${quizId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(quizId);
  });

  it("34. PUT /quizzes/:id — update quiz", async () => {
    const res = await api("PUT", `/quizzes/${quizId}`, {
      title: `Updated Quiz ${Date.now()}`,
      passing_score: 80,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("35. POST /quizzes/:id/questions — add question", async () => {
    const res = await api("POST", `/quizzes/${quizId}/questions`, {
      question_text: "What is 2 + 2?",
      question_type: "multiple_choice",
      points: 10,
      sort_order: 1,
      options: [
        { text: "3", is_correct: false },
        { text: "4", is_correct: true },
        { text: "5", is_correct: false },
      ],
      explanation: "2 + 2 = 4",
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    questionId = res.body.data.id;
    expect(questionId).toBeTruthy();
  });

  it("36. PUT /quizzes/questions/:id — update question", async () => {
    const res = await api("PUT", `/quizzes/questions/${questionId}`, {
      question_text: "What is 2 + 2? (updated)",
      points: 15,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("37. GET /quizzes/:id/take — get quiz for taking (answers stripped)", async () => {
    const res = await api("GET", `/quizzes/${quizId}/take`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Verify answers are stripped for the take endpoint
    if (res.body.data.questions && res.body.data.questions.length > 0) {
      const q = res.body.data.questions[0];
      if (q.options && q.options.length > 0) {
        expect(q.options[0].is_correct).toBeUndefined();
      }
    }
  });

  it("38. POST /quizzes/:id/submit — submit quiz attempt", async () => {
    const res = await api("POST", `/quizzes/${quizId}/submit`, {
      enrollment_id: enrollmentId,
      answers: [
        { question_id: questionId, selected_option_ids: [], answer_text: "4" },
      ],
    });
    expect([200, 201, 400]).toContain(res.status);
  });

  it("39. GET /quizzes/:id/attempts — list my attempts", async () => {
    const res = await api("GET", `/quizzes/${quizId}/attempts`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("40. GET /quizzes/:id/stats — quiz statistics (admin)", async () => {
    const res = await api("GET", `/quizzes/${quizId}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ============================================================================
// LEARNING PATHS
// ============================================================================
describe("Learning Paths", () => {
  it("41. POST /learning-paths — create learning path", async () => {
    const res = await api("POST", "/learning-paths", {
      title: `Test Learning Path ${Date.now()}`,
      description: "Learning path for integration testing",
      difficulty: "beginner",
      is_mandatory: false,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    learningPathId = res.body.data.id;
    expect(learningPathId).toBeTruthy();
  });

  it("42. GET /learning-paths — list learning paths", async () => {
    const res = await api("GET", "/learning-paths");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("43. GET /learning-paths/:id — get single path", async () => {
    const res = await api("GET", `/learning-paths/${learningPathId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(learningPathId);
  });

  it("44. PUT /learning-paths/:id — update learning path", async () => {
    const res = await api("PUT", `/learning-paths/${learningPathId}`, {
      title: `Updated Path ${Date.now()}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("45. POST /learning-paths/:id/courses — add course to path", async () => {
    const res = await api("POST", `/learning-paths/${learningPathId}/courses`, {
      course_id: courseId,
      sort_order: 1,
      is_mandatory: true,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
  });

  it("46. POST /learning-paths/:id/publish — publish learning path", async () => {
    const res = await api("POST", `/learning-paths/${learningPathId}/publish`);
    expect([200, 400]).toContain(res.status);
  });

  it("47. POST /learning-paths/:id/enroll — enroll in learning path", async () => {
    const res = await api("POST", `/learning-paths/${learningPathId}/enroll`);
    expect([200, 201, 400, 409]).toContain(res.status);
  });

  it("48. GET /learning-paths/my/enrollments — my path enrollments", async () => {
    const res = await api("GET", "/learning-paths/my/enrollments");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("49. GET /learning-paths/:id/my-progress — my progress in path", async () => {
    const res = await api("GET", `/learning-paths/${learningPathId}/my-progress`);
    expect([200, 404]).toContain(res.status);
  });

  it("50. GET /learning-paths/:id/enrollments — path enrollments (admin)", async () => {
    const res = await api("GET", `/learning-paths/${learningPathId}/enrollments`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ============================================================================
// CERTIFICATIONS
// ============================================================================
describe("Certifications", () => {
  it("51. POST /certificates/templates — create certificate template", async () => {
    const res = await api("POST", "/certificates/templates", {
      name: `Test Template ${Date.now()}`,
      description: "Integration test template",
      html_template: "<h1>Certificate of Completion</h1><p>{{user_name}}</p>",
      is_default: false,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    certTemplateId = res.body.data.id;
    expect(certTemplateId).toBeTruthy();
  });

  it("52. GET /certificates/templates — list templates", async () => {
    const res = await api("GET", "/certificates/templates");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("53. GET /certificates/templates/:id — get template", async () => {
    const res = await api("GET", `/certificates/templates/${certTemplateId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(certTemplateId);
  });

  it("54. PUT /certificates/templates/:id — update template", async () => {
    const res = await api("PUT", `/certificates/templates/${certTemplateId}`, {
      name: `Updated Template ${Date.now()}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("55. POST /certificates/issue — issue certificate", async () => {
    const res = await api("POST", "/certificates/issue", {
      user_id: currentUserId,
      course_id: courseId,
      enrollment_id: enrollmentId,
      template_id: certTemplateId,
    });
    expect([200, 201, 400]).toContain(res.status);
    if (res.body.success && res.body.data?.id) {
      certId = res.body.data.id;
    }
  });

  it("56. GET /certificates/my — my certificates", async () => {
    const res = await api("GET", "/certificates/my");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("57. GET /certificates/course/:courseId — course certificates (admin)", async () => {
    const res = await api("GET", `/certificates/course/${courseId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("58. GET /certificates/:id — get single certificate", async () => {
    if (!certId) return;
    const res = await api("GET", `/certificates/${certId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(certId);
  });
});

// ============================================================================
// SCORM
// ============================================================================
describe("SCORM Packages", () => {
  it("59. GET /scorm/course/:courseId — list SCORM packages by course", async () => {
    const res = await api("GET", `/scorm/course/${courseId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ============================================================================
// COMPLIANCE TRAINING
// ============================================================================
describe("Compliance Training", () => {
  it("60. POST /compliance/assignments — create compliance assignment", async () => {
    const res = await api("POST", "/compliance/assignments", {
      course_id: courseId,
      title: `Compliance Test ${Date.now()}`,
      description: "Mandatory compliance training for integration tests",
      due_days: 30,
      is_recurring: false,
      is_active: true,
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    complianceAssignmentId = res.body.data.id;
    expect(complianceAssignmentId).toBeTruthy();
  });

  it("61. GET /compliance/assignments — list compliance assignments", async () => {
    const res = await api("GET", "/compliance/assignments");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("62. GET /compliance/assignments/:id — get assignment", async () => {
    const res = await api("GET", `/compliance/assignments/${complianceAssignmentId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(complianceAssignmentId);
  });

  it("63. PUT /compliance/assignments/:id — update assignment", async () => {
    const res = await api("PUT", `/compliance/assignments/${complianceAssignmentId}`, {
      title: `Updated Compliance ${Date.now()}`,
      due_days: 60,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("64. GET /compliance/records — list compliance records (admin)", async () => {
    const res = await api("GET", "/compliance/records");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("65. GET /compliance/records/my — my compliance records", async () => {
    const res = await api("GET", "/compliance/records/my");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("66. GET /compliance/dashboard — compliance dashboard", async () => {
    const res = await api("GET", "/compliance/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("67. POST /compliance/assignments/:id/deactivate — deactivate assignment", async () => {
    const res = await api(
      "POST",
      `/compliance/assignments/${complianceAssignmentId}/deactivate`,
    );
    expect([200, 400]).toContain(res.status);
  });
});

// ============================================================================
// DISCUSSIONS
// ============================================================================
describe("Discussions", () => {
  it("68. POST /discussions — create discussion", async () => {
    const res = await api("POST", "/discussions", {
      course_id: courseId,
      title: `Test Discussion ${Date.now()}`,
      body: "This is an integration test discussion thread.",
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    discussionId = res.body.data.id;
    expect(discussionId).toBeTruthy();
  });

  it("69. GET /discussions?course_id — list discussions for course", async () => {
    const res = await api("GET", `/discussions?course_id=${courseId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("70. GET /discussions/:id — get discussion with replies", async () => {
    const res = await api("GET", `/discussions/${discussionId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("71. POST /discussions/:id/replies — reply to discussion", async () => {
    const res = await api("POST", `/discussions/${discussionId}/replies`, {
      body: "This is a test reply to the integration test discussion.",
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
  });

  it("72. PUT /discussions/:id — update discussion", async () => {
    const res = await api("PUT", `/discussions/${discussionId}`, {
      title: `Updated Discussion ${Date.now()}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("73. PATCH /discussions/:id/resolve — toggle resolve", async () => {
    const res = await api("PATCH", `/discussions/${discussionId}/resolve`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ============================================================================
// ILT (INSTRUCTOR-LED TRAINING) SESSIONS
// ============================================================================
describe("ILT Sessions", () => {
  it("74. POST /ilt/sessions — create ILT session", async () => {
    const startDate = new Date(Date.now() + 7 * 86400000);
    const endDate = new Date(startDate.getTime() + 2 * 3600000);
    const res = await api("POST", "/ilt/sessions", {
      course_id: courseId,
      title: `Test ILT Session ${Date.now()}`,
      description: "Integration test ILT session",
      instructor_id: currentUserId,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      location: "Virtual - Zoom",
      max_capacity: 30,
      session_type: "virtual",
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    iltSessionId = res.body.data.id;
    expect(iltSessionId).toBeTruthy();
  });

  it("75. GET /ilt/sessions — list ILT sessions", async () => {
    const res = await api("GET", "/ilt/sessions");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("76. GET /ilt/sessions/:id — get session details", async () => {
    const res = await api("GET", `/ilt/sessions/${iltSessionId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(iltSessionId);
  });

  it("77. PUT /ilt/sessions/:id — update session", async () => {
    const res = await api("PUT", `/ilt/sessions/${iltSessionId}`, {
      title: `Updated ILT Session ${Date.now()}`,
      max_capacity: 50,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("78. POST /ilt/sessions/:id/register — register for session", async () => {
    const res = await api("POST", `/ilt/sessions/${iltSessionId}/register`);
    expect([200, 201, 400, 409]).toContain(res.status);
  });

  it("79. GET /ilt/my/sessions — my ILT sessions", async () => {
    const res = await api("GET", "/ilt/my/sessions");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("80. GET /ilt/sessions/upcoming — upcoming sessions", async () => {
    const res = await api("GET", "/ilt/sessions/upcoming");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("81. GET /ilt/sessions/:id/stats — session stats (admin)", async () => {
    const res = await api("GET", `/ilt/sessions/${iltSessionId}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("82. POST /ilt/sessions/:id/unregister — unregister from session", async () => {
    const res = await api("POST", `/ilt/sessions/${iltSessionId}/unregister`);
    expect([200, 400]).toContain(res.status);
  });
});

// ============================================================================
// GAMIFICATION
// ============================================================================
describe("Gamification", () => {
  it("83. GET /gamification/leaderboard — get leaderboard", async () => {
    const res = await api("GET", "/gamification/leaderboard?limit=10");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("84. GET /gamification/my/points — my points", async () => {
    const res = await api("GET", "/gamification/my/points");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("85. GET /gamification/my/streak — my learning streak", async () => {
    const res = await api("GET", "/gamification/my/streak");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("current_streak_days");
  });

  it("86. PUT /gamification/my/preferences — update learning preferences", async () => {
    const res = await api("PUT", "/gamification/my/preferences", {
      preferred_difficulty: "intermediate",
      preferred_duration: "medium",
      interests: ["technology", "leadership"],
    });
    expect([200, 400]).toContain(res.status);
  });
});

// ============================================================================
// ANALYTICS
// ============================================================================
describe("Analytics", () => {
  it("87. GET /analytics/overview — overview dashboard", async () => {
    const res = await api("GET", "/analytics/overview");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("88. GET /analytics/course/:courseId — course analytics", async () => {
    const res = await api("GET", `/analytics/course/${courseId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("89. GET /analytics/user/:userId — user analytics", async () => {
    const res = await api("GET", `/analytics/user/${currentUserId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("90. GET /analytics/org — org-wide analytics", async () => {
    const res = await api("GET", "/analytics/org");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("91. GET /analytics/compliance — compliance analytics", async () => {
    const res = await api("GET", "/analytics/compliance");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("92. GET /analytics/certificates — certificate analytics", async () => {
    const res = await api("GET", "/analytics/certificates");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("93. GET /analytics/time-spent — time spent analytics", async () => {
    const res = await api("GET", "/analytics/time-spent");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ============================================================================
// RATINGS
// ============================================================================
describe("Ratings", () => {
  it("94. POST /ratings — submit rating", async () => {
    const res = await api("POST", "/ratings", {
      course_id: courseId,
      rating: 4,
      review: "Great integration test course!",
    });
    expect([200, 201, 409]).toContain(res.status);
    if (res.body.success && res.body.data?.id) {
      ratingId = res.body.data.id;
    }
  });

  it("95. GET /ratings?course_id — list ratings", async () => {
    const res = await api("GET", `/ratings?course_id=${courseId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("96. GET /ratings/summary?course_id — rating summary", async () => {
    const res = await api("GET", `/ratings/summary?course_id=${courseId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("97. PUT /ratings/:id — update rating", async () => {
    if (!ratingId) return;
    const res = await api("PUT", `/ratings/${ratingId}`, {
      rating: 5,
      review: "Updated: Excellent integration test course!",
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ============================================================================
// CLEANUP — remove test resources
// ============================================================================
describe("Cleanup", () => {
  it("98. DELETE /ratings/:id — delete rating", async () => {
    if (!ratingId) return;
    const res = await api("DELETE", `/ratings/${ratingId}`);
    expect([200, 204]).toContain(res.status);
  });

  it("99. DELETE /discussions/:id — delete discussion", async () => {
    if (!discussionId) return;
    const res = await api("DELETE", `/discussions/${discussionId}`);
    expect([200, 204]).toContain(res.status);
  });

  it("100. POST /ilt/sessions/:id/cancel — cancel ILT session", async () => {
    if (!iltSessionId) return;
    const res = await api("POST", `/ilt/sessions/${iltSessionId}/cancel`);
    expect([200, 400]).toContain(res.status);
  });

  it("101. POST /enrollments/:id/drop — drop enrollment", async () => {
    if (!enrollmentId) return;
    const res = await api("POST", `/enrollments/${enrollmentId}/drop`);
    expect([200, 400]).toContain(res.status);
  });

  it("102. DELETE /quizzes/questions/:id — delete question", async () => {
    if (!questionId) return;
    const res = await api("DELETE", `/quizzes/questions/${questionId}`);
    expect([200, 204]).toContain(res.status);
  });

  it("103. DELETE /quizzes/:id — delete quiz", async () => {
    if (!quizId) return;
    const res = await api("DELETE", `/quizzes/${quizId}`);
    expect([200, 204]).toContain(res.status);
  });

  it("104. DELETE /certificates/templates/:id — delete cert template", async () => {
    if (!certTemplateId) return;
    const res = await api("DELETE", `/certificates/templates/${certTemplateId}`);
    expect([200, 204]).toContain(res.status);
  });

  it("105. DELETE /learning-paths/:id/courses/:courseId — remove course from path", async () => {
    if (!learningPathId || !courseId) return;
    const res = await api(
      "DELETE",
      `/learning-paths/${learningPathId}/courses/${courseId}`,
    );
    expect([200, 204, 400]).toContain(res.status);
  });

  it("106. DELETE /learning-paths/:id — delete learning path", async () => {
    if (!learningPathId) return;
    const res = await api("DELETE", `/learning-paths/${learningPathId}`);
    expect([200, 204]).toContain(res.status);
  });

  it("107. DELETE /courses/:id/lessons/:lessonId — delete lesson", async () => {
    if (!lessonId) return;
    const res = await api("DELETE", `/courses/${courseId}/lessons/${lessonId}`);
    expect([200, 204]).toContain(res.status);
  });

  it("108. DELETE /courses/:id/modules/:moduleId — delete module", async () => {
    if (!courseModuleId) return;
    const res = await api(
      "DELETE",
      `/courses/${courseId}/modules/${courseModuleId}`,
    );
    expect([200, 204]).toContain(res.status);
  });

  it("109. DELETE /courses/:id — delete course", async () => {
    if (!courseId) return;
    const res = await api("DELETE", `/courses/${courseId}`);
    expect([200, 204, 400]).toContain(res.status);
  });

  it("110. DELETE /courses/categories/:id — delete category", async () => {
    if (!categoryId) return;
    const res = await api("DELETE", `/courses/categories/${categoryId}`);
    expect([200, 204, 400]).toContain(res.status);
  });
});
