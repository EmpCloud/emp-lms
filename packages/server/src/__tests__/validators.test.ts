import { describe, it, expect } from "vitest";
import {
  createCourseSchema,
  updateCourseSchema,
  courseFilterSchema,
  paginationSchema,
  idParamSchema,
  createCourseCategorySchema,
  createCourseModuleSchema,
  createLessonSchema,
  enrollCourseSchema,
  createLearningPathSchema,
  createQuizSchema,
  createQuestionSchema,
  submitQuizAttemptSchema,
  createCertificateTemplateSchema,
  createComplianceAssignmentSchema,
  createILTSessionSchema,
  markILTAttendanceSchema,
  createCourseRatingSchema,
  createDiscussionSchema,
  createContentLibraryItemSchema,
} from "@emp-lms/shared/validators";

// ---------------------------------------------------------------------------
// paginationSchema
// ---------------------------------------------------------------------------

describe("paginationSchema", () => {
  it("should accept valid pagination", () => {
    const result = paginationSchema.parse({ page: 1, perPage: 20 });
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(20);
  });

  it("should apply defaults", () => {
    const result = paginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(20);
    expect(result.order).toBe("desc");
  });

  it("should reject page < 1", () => {
    expect(() => paginationSchema.parse({ page: 0 })).toThrow();
  });

  it("should reject perPage > 100", () => {
    expect(() => paginationSchema.parse({ perPage: 200 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// idParamSchema
// ---------------------------------------------------------------------------

describe("idParamSchema", () => {
  it("should accept valid UUID", () => {
    const result = idParamSchema.parse({ id: "550e8400-e29b-41d4-a716-446655440000" });
    expect(result.id).toBeDefined();
  });

  it("should reject non-UUID", () => {
    expect(() => idParamSchema.parse({ id: "not-a-uuid" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// createCourseSchema
// ---------------------------------------------------------------------------

describe("createCourseSchema", () => {
  it("should accept minimal valid course", () => {
    const result = createCourseSchema.parse({ title: "My Course" });
    expect(result.title).toBe("My Course");
    expect(result.difficulty).toBe("beginner");
    expect(result.is_mandatory).toBe(false);
    expect(result.tags).toEqual([]);
    expect(result.prerequisites).toEqual([]);
  });

  it("should accept full valid course", () => {
    const result = createCourseSchema.parse({
      title: "Advanced React",
      description: "Deep dive into React",
      short_description: "React advanced",
      difficulty: "advanced",
      duration_minutes: 120,
      is_mandatory: true,
      is_featured: true,
      tags: ["react", "frontend"],
      passing_score: 80,
    });
    expect(result.title).toBe("Advanced React");
    expect(result.difficulty).toBe("advanced");
    expect(result.passing_score).toBe(80);
  });

  it("should reject title shorter than 2 chars", () => {
    expect(() => createCourseSchema.parse({ title: "A" })).toThrow();
  });

  it("should reject invalid difficulty", () => {
    expect(() =>
      createCourseSchema.parse({ title: "Test", difficulty: "super_hard" })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// updateCourseSchema
// ---------------------------------------------------------------------------

describe("updateCourseSchema", () => {
  it("should accept partial update", () => {
    const result = updateCourseSchema.parse({ title: "Updated Title" });
    expect(result.title).toBe("Updated Title");
  });

  it("should accept empty object", () => {
    const result = updateCourseSchema.parse({});
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// enrollCourseSchema
// ---------------------------------------------------------------------------

describe("enrollCourseSchema", () => {
  it("should accept valid enrollment", () => {
    const result = enrollCourseSchema.parse({
      user_id: 1,
      course_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.user_id).toBe(1);
  });

  it("should reject missing user_id", () => {
    expect(() =>
      enrollCourseSchema.parse({
        course_id: "550e8400-e29b-41d4-a716-446655440000",
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// createQuizSchema
// ---------------------------------------------------------------------------

describe("createQuizSchema", () => {
  it("should accept valid quiz", () => {
    const result = createQuizSchema.parse({
      course_id: "550e8400-e29b-41d4-a716-446655440000",
      title: "Final Exam",
    });
    expect(result.title).toBe("Final Exam");
    expect(result.type).toBe("graded");
    expect(result.passing_score).toBe(70);
    expect(result.max_attempts).toBe(3);
  });

  it("should reject missing course_id", () => {
    expect(() => createQuizSchema.parse({ title: "Quiz" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// createQuestionSchema
// ---------------------------------------------------------------------------

describe("createQuestionSchema", () => {
  it("should accept valid MCQ question", () => {
    const result = createQuestionSchema.parse({
      quiz_id: "550e8400-e29b-41d4-a716-446655440000",
      type: "mcq",
      text: "What is 1+1?",
      options: [
        { text: "2", is_correct: true },
        { text: "3", is_correct: false },
      ],
    });
    expect(result.type).toBe("mcq");
    expect(result.options).toHaveLength(2);
    expect(result.points).toBe(1);
  });

  it("should accept essay question without options", () => {
    const result = createQuestionSchema.parse({
      quiz_id: "550e8400-e29b-41d4-a716-446655440000",
      type: "essay",
      text: "Explain React hooks",
    });
    expect(result.type).toBe("essay");
    expect(result.options).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// submitQuizAttemptSchema
// ---------------------------------------------------------------------------

describe("submitQuizAttemptSchema", () => {
  it("should accept valid attempt", () => {
    const result = submitQuizAttemptSchema.parse({
      quiz_id: "550e8400-e29b-41d4-a716-446655440000",
      answers: [
        { question_id: "550e8400-e29b-41d4-a716-446655440001", selected_options: ["a"] },
      ],
    });
    expect(result.answers).toHaveLength(1);
  });

  it("should reject empty answers array", () => {
    expect(() =>
      submitQuizAttemptSchema.parse({
        quiz_id: "550e8400-e29b-41d4-a716-446655440000",
        answers: [],
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// createComplianceAssignmentSchema
// ---------------------------------------------------------------------------

describe("createComplianceAssignmentSchema", () => {
  it("should accept valid assignment", () => {
    const result = createComplianceAssignmentSchema.parse({
      course_id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Annual Safety Training",
      assigned_to_type: "all",
      due_date: "2026-12-31",
    });
    expect(result.name).toBe("Annual Safety Training");
    expect(result.is_recurring).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createILTSessionSchema
// ---------------------------------------------------------------------------

describe("createILTSessionSchema", () => {
  it("should accept valid ILT session", () => {
    const result = createILTSessionSchema.parse({
      course_id: "550e8400-e29b-41d4-a716-446655440000",
      title: "Live Workshop",
      instructor_id: 5,
      start_time: "2026-06-01T10:00:00Z",
      end_time: "2026-06-01T12:00:00Z",
      max_attendees: 30,
    });
    expect(result.title).toBe("Live Workshop");
    expect(result.max_attendees).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// createCourseRatingSchema
// ---------------------------------------------------------------------------

describe("createCourseRatingSchema", () => {
  it("should accept valid rating", () => {
    const result = createCourseRatingSchema.parse({
      course_id: "550e8400-e29b-41d4-a716-446655440000",
      rating: 5,
      review: "Excellent course!",
    });
    expect(result.rating).toBe(5);
  });

  it("should reject rating > 5", () => {
    expect(() =>
      createCourseRatingSchema.parse({
        course_id: "550e8400-e29b-41d4-a716-446655440000",
        rating: 6,
      })
    ).toThrow();
  });

  it("should reject rating < 1", () => {
    expect(() =>
      createCourseRatingSchema.parse({
        course_id: "550e8400-e29b-41d4-a716-446655440000",
        rating: 0,
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// createDiscussionSchema
// ---------------------------------------------------------------------------

describe("createDiscussionSchema", () => {
  it("should accept valid discussion", () => {
    const result = createDiscussionSchema.parse({
      course_id: "550e8400-e29b-41d4-a716-446655440000",
      content: "How do hooks work?",
      title: "React Hooks Question",
    });
    expect(result.content).toBe("How do hooks work?");
  });

  it("should reject empty content", () => {
    expect(() =>
      createDiscussionSchema.parse({
        course_id: "550e8400-e29b-41d4-a716-446655440000",
        content: "",
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// createLearningPathSchema
// ---------------------------------------------------------------------------

describe("createLearningPathSchema", () => {
  it("should accept valid learning path", () => {
    const result = createLearningPathSchema.parse({
      title: "Frontend Developer Path",
    });
    expect(result.title).toBe("Frontend Developer Path");
    expect(result.difficulty).toBe("beginner");
    expect(result.is_mandatory).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createCertificateTemplateSchema
// ---------------------------------------------------------------------------

describe("createCertificateTemplateSchema", () => {
  it("should accept valid template", () => {
    const result = createCertificateTemplateSchema.parse({
      name: "Default Certificate",
      html_template: "<html><body>{{name}}</body></html>",
    });
    expect(result.name).toBe("Default Certificate");
    expect(result.is_default).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createContentLibraryItemSchema
// ---------------------------------------------------------------------------

describe("createContentLibraryItemSchema", () => {
  it("should accept valid content item", () => {
    const result = createContentLibraryItemSchema.parse({
      title: "React Cheat Sheet",
      content_type: "document",
      content_url: "https://example.com/react.pdf",
    });
    expect(result.title).toBe("React Cheat Sheet");
    expect(result.is_public).toBe(false);
    expect(result.tags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// markILTAttendanceSchema
// ---------------------------------------------------------------------------

describe("markILTAttendanceSchema", () => {
  it("should accept valid attendance", () => {
    const result = markILTAttendanceSchema.parse({
      session_id: "550e8400-e29b-41d4-a716-446655440000",
      attendees: [{ user_id: 1, status: "attended" }],
    });
    expect(result.attendees).toHaveLength(1);
  });

  it("should reject empty attendees", () => {
    expect(() =>
      markILTAttendanceSchema.parse({
        session_id: "550e8400-e29b-41d4-a716-446655440000",
        attendees: [],
      })
    ).toThrow();
  });
});
