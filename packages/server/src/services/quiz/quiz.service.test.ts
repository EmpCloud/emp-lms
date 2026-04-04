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

import { getDB } from "../../db/adapters/index";
import { lmsEvents } from "../../events/index";
import {
  listQuizzes,
  listAllQuizzes,
  getQuiz,
  getQuizForAttempt,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  submitQuizAttempt,
  getAttempts,
  getAttempt,
  getQuizStats,
} from "./quiz.service";

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

// ── listQuizzes ─────────────────────────────────────────────────────────

describe("listQuizzes", () => {
  it("should return quizzes for a course", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [{ id: "q1", title: "Quiz 1" }, { id: "q2", title: "Quiz 2" }],
    });

    const result = await listQuizzes("c1");

    expect(result).toHaveLength(2);
    expect(mockDB.findMany).toHaveBeenCalledWith("quizzes", expect.objectContaining({
      filters: { course_id: "c1" },
    }));
  });

  it("should return empty array when no quizzes exist", async () => {
    mockDB.findMany.mockResolvedValue({ data: [] });

    const result = await listQuizzes("c1");

    expect(result).toEqual([]);
  });
});

// ── getQuiz ─────────────────────────────────────────────────────────────

describe("getQuiz", () => {
  it("should return quiz with parsed question options", async () => {
    mockDB.findById.mockResolvedValue({ id: "q1", title: "Quiz 1" });
    mockDB.findMany.mockResolvedValue({
      data: [
        { id: "qn1", quiz_id: "q1", options: JSON.stringify([{ id: "o1", text: "Option A", is_correct: true }]) },
      ],
    });

    const result = await getQuiz("q1");

    expect(result.title).toBe("Quiz 1");
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].options[0].text).toBe("Option A");
  });

  it("should throw NotFoundError when quiz does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(getQuiz("nonexistent")).rejects.toThrow("not found");
  });

  it("should handle options that are already objects", async () => {
    mockDB.findById.mockResolvedValue({ id: "q1", title: "Quiz 1" });
    mockDB.findMany.mockResolvedValue({
      data: [
        { id: "qn1", quiz_id: "q1", options: [{ id: "o1", text: "Option A" }] },
      ],
    });

    const result = await getQuiz("q1");

    expect(result.questions[0].options[0].text).toBe("Option A");
  });
});

// ── getQuizForAttempt ───────────────────────────────────────────────────

describe("getQuizForAttempt", () => {
  it("should return quiz without correct answer indicators", async () => {
    mockDB.findById.mockResolvedValue({ id: "q1", title: "Quiz 1", shuffle_questions: false });
    mockDB.findMany.mockResolvedValue({
      data: [
        {
          id: "qn1", quiz_id: "q1", type: "mcq", text: "Question?", points: 1, sort_order: 0,
          options: JSON.stringify([
            { id: "o1", text: "A", is_correct: true },
            { id: "o2", text: "B", is_correct: false },
          ]),
        },
      ],
    });

    const result = await getQuizForAttempt("q1", 42);

    expect(result.questions).toHaveLength(1);
    // is_correct should NOT be present in sanitized options
    expect(result.questions[0].options[0]).not.toHaveProperty("is_correct");
  });

  it("should throw NotFoundError when quiz does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(getQuizForAttempt("nonexistent", 42)).rejects.toThrow("not found");
  });
});

// ── createQuiz ──────────────────────────────────────────────────────────

describe("createQuiz", () => {
  it("should create a quiz successfully", async () => {
    mockDB.findById.mockResolvedValue({ id: "c1", org_id: 1 }); // course
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", title: "New Quiz", type: "graded" });

    const result = await createQuiz(1, "c1", { course_id: "c1", title: "New Quiz" });

    expect(mockDB.create).toHaveBeenCalledWith("quizzes", expect.objectContaining({
      id: "test-uuid-1234",
      course_id: "c1",
      title: "New Quiz",
      type: "graded",
      passing_score: 70,
      max_attempts: 3,
    }));
    expect(result.title).toBe("New Quiz");
  });

  it("should throw NotFoundError when course does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(createQuiz(1, "nonexistent", { course_id: "nonexistent", title: "Q" })).rejects.toThrow("not found");
  });

  it("should throw ForbiddenError when course belongs to different org", async () => {
    mockDB.findById.mockResolvedValue({ id: "c1", org_id: 999 }); // different org

    await expect(createQuiz(1, "c1", { course_id: "c1", title: "Q" })).rejects.toThrow("does not belong");
  });

  it("should use custom quiz settings when provided", async () => {
    mockDB.findById.mockResolvedValue({ id: "c1", org_id: 1 });
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", title: "Custom Quiz" });

    await createQuiz(1, "c1", {
      course_id: "c1",
      title: "Custom Quiz",
      type: "practice",
      passing_score: 80,
      max_attempts: 5,
      time_limit_minutes: 30,
      shuffle_questions: true,
      show_answers: false,
    });

    expect(mockDB.create).toHaveBeenCalledWith("quizzes", expect.objectContaining({
      type: "practice",
      passing_score: 80,
      max_attempts: 5,
      time_limit_minutes: 30,
      shuffle_questions: true,
      show_answers: false,
    }));
  });
});

// ── updateQuiz ──────────────────────────────────────────────────────────

describe("updateQuiz", () => {
  it("should update quiz successfully", async () => {
    mockDB.findById
      .mockResolvedValueOnce({ id: "q1", course_id: "c1" }) // quiz
      .mockResolvedValueOnce({ id: "c1", org_id: 1 }); // course
    mockDB.update.mockResolvedValue({ id: "q1", title: "Updated Quiz" });

    const result = await updateQuiz(1, "q1", { title: "Updated Quiz" });

    expect(result.title).toBe("Updated Quiz");
  });

  it("should throw NotFoundError when quiz does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(updateQuiz(1, "nonexistent", { title: "X" })).rejects.toThrow("not found");
  });

  it("should throw ForbiddenError when quiz belongs to different org", async () => {
    mockDB.findById
      .mockResolvedValueOnce({ id: "q1", course_id: "c1" })
      .mockResolvedValueOnce({ id: "c1", org_id: 999 });

    await expect(updateQuiz(1, "q1", { title: "X" })).rejects.toThrow("does not belong");
  });
});

// ── deleteQuiz ──────────────────────────────────────────────────────────

describe("deleteQuiz", () => {
  it("should delete quiz successfully", async () => {
    mockDB.findById
      .mockResolvedValueOnce({ id: "q1", course_id: "c1" })
      .mockResolvedValueOnce({ id: "c1", org_id: 1 });
    mockDB.delete.mockResolvedValue(undefined);

    const result = await deleteQuiz(1, "q1");

    expect(result).toEqual({ deleted: true });
    expect(mockDB.delete).toHaveBeenCalledWith("quizzes", "q1");
  });

  it("should throw NotFoundError when quiz does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(deleteQuiz(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should throw ForbiddenError when quiz belongs to different org", async () => {
    mockDB.findById
      .mockResolvedValueOnce({ id: "q1", course_id: "c1" })
      .mockResolvedValueOnce({ id: "c1", org_id: 999 });

    await expect(deleteQuiz(1, "q1")).rejects.toThrow("does not belong");
  });
});

// ── addQuestion ─────────────────────────────────────────────────────────

describe("addQuestion", () => {
  it("should add a question with options", async () => {
    mockDB.findById
      .mockResolvedValueOnce({ id: "q1", course_id: "c1" }) // quiz
      .mockResolvedValueOnce({ id: "c1", org_id: 1 }); // course
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234", quiz_id: "q1", type: "mcq",
      options: JSON.stringify([{ id: "o1", text: "A", is_correct: true }]),
    });

    const result = await addQuestion(1, "q1", {
      type: "mcq",
      text: "What is 1+1?",
      options: [{ id: "o1", text: "A", is_correct: true }],
    });

    expect(mockDB.create).toHaveBeenCalledWith("questions", expect.objectContaining({
      quiz_id: "q1",
      type: "mcq",
      text: "What is 1+1?",
    }));
    expect(result.options).toBeDefined();
  });

  it("should throw NotFoundError when quiz does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(addQuestion(1, "nonexistent", { type: "mcq", text: "Q?" })).rejects.toThrow("not found");
  });

  it("should throw ForbiddenError when quiz belongs to different org", async () => {
    mockDB.findById
      .mockResolvedValueOnce({ id: "q1", course_id: "c1" })
      .mockResolvedValueOnce({ id: "c1", org_id: 999 });

    await expect(addQuestion(1, "q1", { type: "mcq", text: "Q?" })).rejects.toThrow("does not belong");
  });
});

// ── updateQuestion ──────────────────────────────────────────────────────

describe("updateQuestion", () => {
  it("should update a question successfully", async () => {
    mockDB.findById
      .mockResolvedValueOnce({ id: "qn1", quiz_id: "q1" }) // question
      .mockResolvedValueOnce({ id: "q1", course_id: "c1" }) // quiz
      .mockResolvedValueOnce({ id: "c1", org_id: 1 }); // course
    mockDB.update.mockResolvedValue({
      id: "qn1", text: "Updated?",
      options: JSON.stringify([{ id: "o1", text: "New A" }]),
    });

    const result = await updateQuestion(1, "qn1", { text: "Updated?" });

    expect(result.text).toBe("Updated?");
  });

  it("should throw NotFoundError when question does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(updateQuestion(1, "nonexistent", { text: "X" })).rejects.toThrow("not found");
  });

  it("should throw ForbiddenError when question belongs to different org", async () => {
    mockDB.findById
      .mockResolvedValueOnce({ id: "qn1", quiz_id: "q1" })
      .mockResolvedValueOnce({ id: "q1", course_id: "c1" })
      .mockResolvedValueOnce({ id: "c1", org_id: 999 });

    await expect(updateQuestion(1, "qn1", { text: "X" })).rejects.toThrow("does not belong");
  });
});

// ── deleteQuestion ──────────────────────────────────────────────────────

describe("deleteQuestion", () => {
  it("should delete a question successfully", async () => {
    mockDB.findById
      .mockResolvedValueOnce({ id: "qn1", quiz_id: "q1" })
      .mockResolvedValueOnce({ id: "q1", course_id: "c1" })
      .mockResolvedValueOnce({ id: "c1", org_id: 1 });
    mockDB.delete.mockResolvedValue(undefined);

    const result = await deleteQuestion(1, "qn1");

    expect(result).toEqual({ deleted: true });
  });

  it("should throw NotFoundError when question does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(deleteQuestion(1, "nonexistent")).rejects.toThrow("not found");
  });
});

// ── reorderQuestions ────────────────────────────────────────────────────

describe("reorderQuestions", () => {
  it("should reorder questions by updating sort_order", async () => {
    mockDB.findById.mockResolvedValue({ id: "q1" }); // quiz exists
    mockDB.update.mockResolvedValue({});

    const result = await reorderQuestions("q1", ["qn3", "qn1", "qn2"]);

    expect(result).toEqual({ reordered: true });
    expect(mockDB.update).toHaveBeenCalledWith("questions", "qn3", { sort_order: 0 });
    expect(mockDB.update).toHaveBeenCalledWith("questions", "qn1", { sort_order: 1 });
    expect(mockDB.update).toHaveBeenCalledWith("questions", "qn2", { sort_order: 2 });
  });

  it("should throw NotFoundError when quiz does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(reorderQuestions("nonexistent", ["q1"])).rejects.toThrow("not found");
  });
});

// ── submitQuizAttempt ───────────────────────────────────────────────────

describe("submitQuizAttempt", () => {
  const setupSubmitMocks = (opts?: { maxAttempts?: number; existingAttempts?: number; passingScore?: number; showAnswers?: boolean; completionCriteria?: string }) => {
    const quiz = {
      id: "q1", course_id: "c1",
      max_attempts: opts?.maxAttempts ?? 3,
      passing_score: opts?.passingScore ?? 70,
      show_answers: opts?.showAnswers ?? true,
    };
    const enrollment = { id: "e1", user_id: 42, org_id: 1 };
    const course = { id: "c1", completion_criteria: opts?.completionCriteria ?? "lessons" };

    mockDB.findById.mockImplementation((table: string, id: string) => {
      if (table === "quizzes") return Promise.resolve(quiz);
      if (table === "enrollments") return Promise.resolve(enrollment);
      if (table === "courses") return Promise.resolve(course);
      return Promise.resolve(null);
    });
    mockDB.count.mockResolvedValue(opts?.existingAttempts ?? 0);
    mockDB.findMany.mockResolvedValue({
      data: [
        {
          id: "qn1", quiz_id: "q1", type: "mcq", points: 1, text: "Q1?",
          options: JSON.stringify([
            { id: "o1", text: "A", is_correct: true },
            { id: "o2", text: "B", is_correct: false },
          ]),
        },
      ],
    });
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", completed_at: new Date().toISOString() });
    mockDB.update.mockResolvedValue({});
  };

  it("should submit and grade a correct MCQ answer as passing", async () => {
    setupSubmitMocks();

    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", selected_options: ["o1"] },
    ]);

    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.total_points_earned).toBe(1);
    expect(result.total_points_possible).toBe(1);
    expect(lmsEvents.emit).toHaveBeenCalledWith("quiz.submitted", expect.any(Object));
    expect(lmsEvents.emit).toHaveBeenCalledWith("quiz.passed", expect.any(Object));
  });

  it("should submit and grade an incorrect MCQ answer as failing", async () => {
    setupSubmitMocks();

    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", selected_options: ["o2"] },
    ]);

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(lmsEvents.emit).toHaveBeenCalledWith("quiz.failed", expect.any(Object));
  });

  it("should throw NotFoundError when quiz does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(submitQuizAttempt(1, 42, "nonexistent", "e1", [])).rejects.toThrow("not found");
  });

  it("should throw NotFoundError when enrollment does not exist", async () => {
    mockDB.findById
      .mockResolvedValueOnce({ id: "q1", course_id: "c1", max_attempts: 3 }) // quiz
      .mockResolvedValueOnce(null); // enrollment

    await expect(submitQuizAttempt(1, 42, "q1", "nonexistent", [])).rejects.toThrow("not found");
  });

  it("should throw BadRequestError when max attempts reached", async () => {
    setupSubmitMocks({ maxAttempts: 2, existingAttempts: 2 });

    await expect(submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", selected_options: ["o1"] },
    ])).rejects.toThrow("Maximum attempts");
  });

  it("should not include answers when show_answers is false", async () => {
    setupSubmitMocks({ showAnswers: false });

    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", selected_options: ["o1"] },
    ]);

    expect(result.answers).toBeUndefined();
  });

  it("should include answers when show_answers is true", async () => {
    setupSubmitMocks({ showAnswers: true });

    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", selected_options: ["o1"] },
    ]);

    expect(result.answers).toBeDefined();
    expect(result.answers).toHaveLength(1);
  });

  it("should complete enrollment when course completion_criteria is quiz_pass and quiz passed", async () => {
    setupSubmitMocks({ completionCriteria: "quiz_pass" });

    await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", selected_options: ["o1"] },
    ]);

    expect(mockDB.update).toHaveBeenCalledWith("enrollments", "e1", expect.objectContaining({
      status: "completed",
    }));
    expect(lmsEvents.emit).toHaveBeenCalledWith("enrollment.completed", expect.any(Object));
  });
});

// ── getAttempts ──────────────────────────────────────────────────────────

describe("getAttempts", () => {
  it("should return parsed attempts for a user", async () => {
    mockDB.findById.mockResolvedValueOnce({ id: "q1" });
    mockDB.findMany.mockResolvedValueOnce({
      data: [
        { id: "a1", score: 85, answers: JSON.stringify([{ question_id: "qn1", is_correct: true }]) },
      ],
    });

    const result = await getAttempts("q1", 42);

    expect(result).toHaveLength(1);
    expect(result[0].answers[0].is_correct).toBe(true);
  });

  it("should throw NotFoundError when quiz does not exist", async () => {
    mockDB.findById.mockResolvedValueOnce(null);

    await expect(getAttempts("nonexistent", 42)).rejects.toThrow("not found");
  });
});

// ── getAttempt ───────────────────────────────────────────────────────────

describe("getAttempt", () => {
  it("should return a single parsed attempt", async () => {
    mockDB.findById.mockResolvedValueOnce({
      id: "a1", score: 90,
      answers: JSON.stringify([{ question_id: "qn1", is_correct: true }]),
    });

    const result = await getAttempt("a1");

    expect(result.score).toBe(90);
    expect(result.answers[0].is_correct).toBe(true);
  });

  it("should throw NotFoundError when attempt does not exist", async () => {
    mockDB.findById.mockResolvedValueOnce(null);

    await expect(getAttempt("nonexistent")).rejects.toThrow("not found");
  });
});

// ── submitQuizAttempt — grading branches ───────────────────────────────

describe("submitQuizAttempt — grading branches", () => {
  const setupGradingMocks = (questions: any[], opts?: { passingScore?: number; showAnswers?: boolean; completionCriteria?: string }) => {
    const quiz = {
      id: "q1", course_id: "c1",
      max_attempts: 10,
      passing_score: opts?.passingScore ?? 70,
      show_answers: opts?.showAnswers ?? true,
    };
    const enrollment = { id: "e1", user_id: 42, org_id: 1 };
    const course = { id: "c1", completion_criteria: opts?.completionCriteria ?? "lessons" };

    mockDB.findById.mockImplementation((table: string, id: string) => {
      if (table === "quizzes") return Promise.resolve(quiz);
      if (table === "enrollments") return Promise.resolve(enrollment);
      if (table === "courses") return Promise.resolve(course);
      return Promise.resolve(null);
    });
    mockDB.count.mockResolvedValue(0);
    mockDB.findMany.mockResolvedValue({ data: questions });
    mockDB.create.mockResolvedValue({ id: "test-uuid-1234", completed_at: new Date().toISOString() });
    mockDB.update.mockResolvedValue({});
  };

  it("should grade multi_select: all correct = full points", async () => {
    setupGradingMocks([
      {
        id: "qn1", quiz_id: "q1", type: "multi_select", points: 2, text: "Q?",
        options: JSON.stringify([
          { id: "a", text: "A", is_correct: true },
          { id: "b", text: "B", is_correct: true },
          { id: "c", text: "C", is_correct: false },
        ]),
      },
    ]);

    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", selected_options: ["a", "b"] },
    ]);

    expect(result.total_points_earned).toBe(2);
    expect(result.passed).toBe(true);
  });

  it("should grade multi_select: partial selection = 0 points", async () => {
    setupGradingMocks([
      {
        id: "qn1", quiz_id: "q1", type: "multi_select", points: 2, text: "Q?",
        options: JSON.stringify([
          { id: "a", text: "A", is_correct: true },
          { id: "b", text: "B", is_correct: true },
          { id: "c", text: "C", is_correct: false },
        ]),
      },
    ]);

    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", selected_options: ["a"] },
    ]);

    expect(result.total_points_earned).toBe(0);
  });

  it("should grade fill_blank: case-insensitive match", async () => {
    setupGradingMocks([
      {
        id: "qn1", quiz_id: "q1", type: "fill_blank", points: 1, text: "Capital of France?",
        options: JSON.stringify([
          { id: "a", text: "Paris", is_correct: true },
        ]),
      },
    ]);

    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", text_answer: "  paris  " },
    ]);

    expect(result.total_points_earned).toBe(1);
    expect(result.passed).toBe(true);
  });

  it("should grade fill_blank: wrong answer = 0 points", async () => {
    setupGradingMocks([
      {
        id: "qn1", quiz_id: "q1", type: "fill_blank", points: 1, text: "Capital of France?",
        options: JSON.stringify([
          { id: "a", text: "Paris", is_correct: true },
        ]),
      },
    ]);

    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", text_answer: "London" },
    ]);

    expect(result.total_points_earned).toBe(0);
  });

  it("should grade essay: not auto-graded, is_correct=null, 0 points", async () => {
    setupGradingMocks([
      {
        id: "qn1", quiz_id: "q1", type: "essay", points: 5, text: "Explain...",
        options: JSON.stringify([]),
      },
    ]);

    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", text_answer: "My long essay answer here." },
    ]);

    expect(result.total_points_earned).toBe(0);
    expect(result.has_essay_questions).toBe(true);
    expect(result.answers[0].is_correct).toBeNull();
  });

  it("should grade matching: all pairs correct = full points", async () => {
    setupGradingMocks([
      {
        id: "qn1", quiz_id: "q1", type: "matching", points: 3, text: "Match:",
        options: JSON.stringify([
          { id: "a", text: "A", match_target: "1" },
          { id: "b", text: "B", match_target: "2" },
        ]),
      },
    ]);

    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", matching_pairs: { a: "1", b: "2" } },
    ]);

    expect(result.total_points_earned).toBe(3);
    expect(result.passed).toBe(true);
  });

  it("should grade matching: wrong pairs = 0 points", async () => {
    setupGradingMocks([
      {
        id: "qn1", quiz_id: "q1", type: "matching", points: 3, text: "Match:",
        options: JSON.stringify([
          { id: "a", text: "A", match_target: "1" },
          { id: "b", text: "B", match_target: "2" },
        ]),
      },
    ]);

    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", matching_pairs: { a: "2", b: "1" } },
    ]);

    expect(result.total_points_earned).toBe(0);
  });

  it("should grade ordering: correct order = full points", async () => {
    setupGradingMocks([
      {
        id: "qn1", quiz_id: "q1", type: "ordering", points: 2, text: "Order these:",
        options: JSON.stringify([
          { id: "c", text: "C", sort_order: 2 },
          { id: "a", text: "A", sort_order: 0 },
          { id: "b", text: "B", sort_order: 1 },
        ]),
      },
    ]);

    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", ordered_ids: ["a", "b", "c"] },
    ]);

    expect(result.total_points_earned).toBe(2);
  });

  it("should grade ordering: wrong order = 0 points", async () => {
    setupGradingMocks([
      {
        id: "qn1", quiz_id: "q1", type: "ordering", points: 2, text: "Order these:",
        options: JSON.stringify([
          { id: "a", text: "A", sort_order: 0 },
          { id: "b", text: "B", sort_order: 1 },
        ]),
      },
    ]);

    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", ordered_ids: ["b", "a"] },
    ]);

    expect(result.total_points_earned).toBe(0);
  });

  it("should handle unknown question type as incorrect", async () => {
    setupGradingMocks([
      {
        id: "qn1", quiz_id: "q1", type: "unknown_type", points: 1, text: "Q?",
        options: JSON.stringify([]),
      },
    ]);

    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", selected_options: ["anything"] },
    ]);

    expect(result.total_points_earned).toBe(0);
  });

  it("should handle answer for nonexistent question gracefully", async () => {
    setupGradingMocks([
      {
        id: "qn1", quiz_id: "q1", type: "mcq", points: 1, text: "Q?",
        options: JSON.stringify([{ id: "o1", text: "A", is_correct: true }]),
      },
    ]);

    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "nonexistent", selected_options: ["o1"] },
    ]);

    // Unanswered qn1 adds to total but earns 0
    expect(result.total_points_possible).toBe(1);
    expect(result.total_points_earned).toBe(0);
  });

  it("should count unanswered questions in total points possible", async () => {
    setupGradingMocks([
      {
        id: "qn1", quiz_id: "q1", type: "mcq", points: 2, text: "Q1?",
        options: JSON.stringify([{ id: "o1", text: "A", is_correct: true }]),
      },
      {
        id: "qn2", quiz_id: "q1", type: "mcq", points: 3, text: "Q2?",
        options: JSON.stringify([{ id: "o2", text: "B", is_correct: true }]),
      },
    ]);

    // Only answer qn1, skip qn2
    const result = await submitQuizAttempt(1, 42, "q1", "e1", [
      { question_id: "qn1", selected_options: ["o1"] },
    ]);

    expect(result.total_points_earned).toBe(2);
    expect(result.total_points_possible).toBe(5); // 2 + 3
  });

  it("should throw ForbiddenError when enrollment belongs to different user", async () => {
    mockDB.findById.mockImplementation((table: string) => {
      if (table === "quizzes") return Promise.resolve({ id: "q1", course_id: "c1", max_attempts: 3 });
      if (table === "enrollments") return Promise.resolve({ id: "e1", user_id: 99, org_id: 1 });
      return Promise.resolve(null);
    });
    mockDB.count.mockResolvedValue(0);

    await expect(submitQuizAttempt(1, 42, "q1", "e1", [])).rejects.toThrow("does not belong");
  });
});

// ── listAllQuizzes ────────────────────────────────────────────────────

describe("listAllQuizzes", () => {
  it("should return paginated quizzes for an org", async () => {
    mockDB.findMany.mockResolvedValue({ data: [{ id: "q1" }] });
    mockDB.count.mockResolvedValue(5);

    const result = await listAllQuizzes(1, { page: 2, limit: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(5);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });

  it("should filter by course_id when provided", async () => {
    mockDB.findMany.mockResolvedValue({ data: [] });
    mockDB.count.mockResolvedValue(0);

    await listAllQuizzes(1, { course_id: "c1" });

    expect(mockDB.findMany).toHaveBeenCalledWith("quizzes", expect.objectContaining({
      filters: expect.objectContaining({ course_id: "c1" }),
    }));
  });
});

// ── getQuizForAttempt — shuffle ───────────────────────────────────────

describe("getQuizForAttempt — shuffle", () => {
  it("should shuffle questions when shuffle_questions is true", async () => {
    mockDB.findById.mockResolvedValue({ id: "q1", title: "Quiz", shuffle_questions: true });
    const questionData = Array.from({ length: 20 }, (_, i) => ({
      id: `qn${i}`, quiz_id: "q1", type: "mcq", text: `Q${i}?`, points: 1, sort_order: i,
      options: JSON.stringify([{ id: "o1", text: "A", is_correct: true }]),
    }));
    mockDB.findMany.mockResolvedValue({ data: questionData });

    const result = await getQuizForAttempt("q1", 42);

    // With 20 questions, the probability of the shuffled order matching the original is 1/20! which is negligible
    expect(result.questions).toHaveLength(20);
    // At least the sanitized options should not have is_correct
    expect(result.questions[0].options[0]).not.toHaveProperty("is_correct");
  });
});

// ── getQuizStats ────────────────────────────────────────────────────────

describe("getQuizStats", () => {
  it("should return statistics for a quiz with attempts", async () => {
    mockDB.findById.mockResolvedValue({ id: "q1" });
    mockDB.findMany
      .mockResolvedValueOnce({
        data: [
          { id: "a1", user_id: 42, score: 80, passed: true, answers: JSON.stringify([{ question_id: "qn1", is_correct: true }]) },
          { id: "a2", user_id: 43, score: 60, passed: false, answers: JSON.stringify([{ question_id: "qn1", is_correct: false }]) },
        ],
      }) // attempts
      .mockResolvedValueOnce({
        data: [{ id: "qn1", text: "Q1?", type: "mcq", sort_order: 0 }],
      }); // questions

    const result = await getQuizStats("q1");

    expect(result.total_attempts).toBe(2);
    expect(result.unique_users).toBe(2);
    expect(result.average_score).toBe(70);
    expect(result.pass_rate).toBe(50);
    expect(result.highest_score).toBe(80);
    expect(result.lowest_score).toBe(60);
    expect(result.question_stats).toHaveLength(1);
    expect(result.question_stats[0].accuracy_rate).toBe(50);
  });

  it("should return zero stats when no attempts exist", async () => {
    mockDB.findById.mockResolvedValue({ id: "q1" });
    mockDB.findMany.mockResolvedValue({ data: [] });

    const result = await getQuizStats("q1");

    expect(result.total_attempts).toBe(0);
    expect(result.unique_users).toBe(0);
    expect(result.average_score).toBe(0);
    expect(result.pass_rate).toBe(0);
    expect(result.question_stats).toEqual([]);
  });

  it("should throw NotFoundError when quiz does not exist", async () => {
    mockDB.findById.mockResolvedValue(null);

    await expect(getQuizStats("nonexistent")).rejects.toThrow("not found");
  });
});
