// ============================================================================
// QUIZ SERVICE
// Full quiz management: CRUD for quizzes/questions, attempt submission,
// auto-grading, stats, and reordering.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters/index";
import { lmsEvents } from "../../events/index";
import { logger } from "../../utils/logger";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from "../../utils/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuizData {
  course_id: string;
  module_id?: string | null;
  title: string;
  description?: string | null;
  type?: "graded" | "practice" | "survey";
  time_limit_minutes?: number | null;
  passing_score?: number;
  max_attempts?: number;
  shuffle_questions?: boolean;
  show_answers?: boolean;
  sort_order?: number;
}

interface QuestionOption {
  id: string;
  text: string;
  is_correct?: boolean;
  match_target?: string;
  sort_order?: number;
}

interface QuestionData {
  type: "mcq" | "multi_select" | "true_false" | "fill_blank" | "essay" | "matching" | "ordering";
  text: string;
  explanation?: string | null;
  points?: number;
  sort_order?: number;
  options?: QuestionOption[];
}

interface SubmittedAnswer {
  question_id: string;
  selected_options?: string[];
  text_answer?: string;
  matching_pairs?: Record<string, string>;
  ordered_ids?: string[];
}

interface GradedAnswer extends SubmittedAnswer {
  is_correct: boolean | null;
  points_earned: number;
  points_possible: number;
  correct_options?: string[];
}

// ---------------------------------------------------------------------------
// Quiz CRUD
// ---------------------------------------------------------------------------

export async function listQuizzes(courseId: string) {
  const db = getDB();
  const result = await db.findMany<any>("quizzes", {
    filters: { course_id: courseId },
    sort: { field: "sort_order", order: "asc" },
    limit: 1000,
  });
  return result.data;
}

export async function listAllQuizzes(
  orgId: number,
  options?: { page?: number; limit?: number; course_id?: string }
) {
  const db = getDB();
  const filters: Record<string, any> = { org_id: orgId };
  if (options?.course_id) {
    filters.course_id = options.course_id;
  }
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const result = await db.findMany<any>("quizzes", {
    filters,
    sort: { field: "created_at", order: "desc" },
    limit,
    offset: (page - 1) * limit,
  });
  const total = await db.count("quizzes", filters);
  return { data: result.data, total, page, limit };
}

export async function getQuiz(quizId: string) {
  const db = getDB();
  const quiz = await db.findById<any>("quizzes", quizId);
  if (!quiz) {
    throw new NotFoundError("Quiz", quizId);
  }

  const questionsResult = await db.findMany<any>("questions", {
    filters: { quiz_id: quizId },
    sort: { field: "sort_order", order: "asc" },
    limit: 1000,
  });

  const questions = questionsResult.data.map((q: any) => ({
    ...q,
    options: typeof q.options === "string" ? JSON.parse(q.options) : q.options,
  }));

  return { ...quiz, questions };
}

export async function getQuizForAttempt(quizId: string, userId: number) {
  const db = getDB();
  const quiz = await db.findById<any>("quizzes", quizId);
  if (!quiz) {
    throw new NotFoundError("Quiz", quizId);
  }

  const questionsResult = await db.findMany<any>("questions", {
    filters: { quiz_id: quizId },
    sort: { field: "sort_order", order: "asc" },
    limit: 1000,
  });

  let questions = questionsResult.data.map((q: any) => {
    const options: QuestionOption[] =
      typeof q.options === "string" ? JSON.parse(q.options) : q.options || [];

    // Strip correct-answer indicators (is_correct, match_target) from options
    const sanitizedOptions = options.map((opt: QuestionOption) => {
      const sanitized: Record<string, any> = {
        id: opt.id,
        text: opt.text,
      };
      if (opt.sort_order !== undefined) {
        sanitized.sort_order = opt.sort_order;
      }
      return sanitized;
    });

    return {
      id: q.id,
      quiz_id: q.quiz_id,
      type: q.type,
      text: q.text,
      points: q.points,
      sort_order: q.sort_order,
      options: sanitizedOptions,
    };
  });

  // Shuffle questions if configured
  if (quiz.shuffle_questions) {
    questions = shuffleArray(questions);
  }

  return {
    id: quiz.id,
    course_id: quiz.course_id,
    title: quiz.title,
    description: quiz.description,
    type: quiz.type,
    time_limit_minutes: quiz.time_limit_minutes,
    passing_score: quiz.passing_score,
    max_attempts: quiz.max_attempts,
    questions,
  };
}

export async function createQuiz(orgId: number, courseId: string, data: QuizData) {
  const db = getDB();

  // Validate course exists and belongs to org
  const course = await db.findById<any>("courses", courseId);
  if (!course) {
    throw new NotFoundError("Course", courseId);
  }
  if (course.org_id !== orgId) {
    throw new ForbiddenError("Course does not belong to your organization");
  }

  const quizId = uuidv4();
  const quiz = await db.create<any>("quizzes", {
    id: quizId,
    course_id: courseId,
    module_id: data.module_id || null,
    title: data.title,
    description: data.description || null,
    type: data.type || "graded",
    time_limit_minutes: data.time_limit_minutes || null,
    passing_score: data.passing_score ?? 70,
    max_attempts: data.max_attempts ?? 3,
    shuffle_questions: data.shuffle_questions ?? false,
    show_answers: data.show_answers ?? true,
    sort_order: data.sort_order ?? 0,
  });

  logger.info(`Quiz created: ${quizId} for course ${courseId}`);
  return quiz;
}

export async function updateQuiz(orgId: number, quizId: string, data: Partial<QuizData>) {
  const db = getDB();

  const quiz = await db.findById<any>("quizzes", quizId);
  if (!quiz) {
    throw new NotFoundError("Quiz", quizId);
  }

  // Verify org ownership through course
  const course = await db.findById<any>("courses", quiz.course_id);
  if (!course || course.org_id !== orgId) {
    throw new ForbiddenError("Quiz does not belong to your organization");
  }

  const updated = await db.update<any>("quizzes", quizId, {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.type !== undefined && { type: data.type }),
    ...(data.time_limit_minutes !== undefined && { time_limit_minutes: data.time_limit_minutes }),
    ...(data.passing_score !== undefined && { passing_score: data.passing_score }),
    ...(data.max_attempts !== undefined && { max_attempts: data.max_attempts }),
    ...(data.shuffle_questions !== undefined && { shuffle_questions: data.shuffle_questions }),
    ...(data.show_answers !== undefined && { show_answers: data.show_answers }),
    ...(data.sort_order !== undefined && { sort_order: data.sort_order }),
    ...(data.module_id !== undefined && { module_id: data.module_id }),
  });

  logger.info(`Quiz updated: ${quizId}`);
  return updated;
}

export async function deleteQuiz(orgId: number, quizId: string) {
  const db = getDB();

  const quiz = await db.findById<any>("quizzes", quizId);
  if (!quiz) {
    throw new NotFoundError("Quiz", quizId);
  }

  const course = await db.findById<any>("courses", quiz.course_id);
  if (!course || course.org_id !== orgId) {
    throw new ForbiddenError("Quiz does not belong to your organization");
  }

  await db.delete("quizzes", quizId);
  logger.info(`Quiz deleted: ${quizId}`);
  return { deleted: true };
}

// ---------------------------------------------------------------------------
// Question CRUD
// ---------------------------------------------------------------------------

export async function addQuestion(orgId: number, quizId: string, data: QuestionData) {
  const db = getDB();

  const quiz = await db.findById<any>("quizzes", quizId);
  if (!quiz) {
    throw new NotFoundError("Quiz", quizId);
  }

  const course = await db.findById<any>("courses", quiz.course_id);
  if (!course || course.org_id !== orgId) {
    throw new ForbiddenError("Quiz does not belong to your organization");
  }

  // Assign IDs to options if not present
  const options = (data.options || []).map((opt: QuestionOption, index: number) => ({
    id: opt.id || uuidv4(),
    text: opt.text,
    is_correct: opt.is_correct ?? false,
    match_target: opt.match_target || null,
    sort_order: opt.sort_order ?? index,
  }));

  const questionId = uuidv4();
  const question = await db.create<any>("questions", {
    id: questionId,
    quiz_id: quizId,
    type: data.type,
    text: data.text,
    explanation: data.explanation || null,
    points: data.points ?? 1,
    sort_order: data.sort_order ?? 0,
    options: JSON.stringify(options),
  });

  logger.info(`Question added: ${questionId} to quiz ${quizId}`);
  return {
    ...question,
    options: typeof question.options === "string" ? JSON.parse(question.options) : question.options,
  };
}

export async function updateQuestion(orgId: number, questionId: string, data: Partial<QuestionData>) {
  const db = getDB();

  const question = await db.findById<any>("questions", questionId);
  if (!question) {
    throw new NotFoundError("Question", questionId);
  }

  const quiz = await db.findById<any>("quizzes", question.quiz_id);
  if (!quiz) {
    throw new NotFoundError("Quiz", question.quiz_id);
  }

  const course = await db.findById<any>("courses", quiz.course_id);
  if (!course || course.org_id !== orgId) {
    throw new ForbiddenError("Question does not belong to your organization");
  }

  const updateData: Record<string, any> = {};
  if (data.type !== undefined) updateData.type = data.type;
  if (data.text !== undefined) updateData.text = data.text;
  if (data.explanation !== undefined) updateData.explanation = data.explanation;
  if (data.points !== undefined) updateData.points = data.points;
  if (data.sort_order !== undefined) updateData.sort_order = data.sort_order;
  if (data.options !== undefined) {
    const options = data.options.map((opt: QuestionOption, index: number) => ({
      id: opt.id || uuidv4(),
      text: opt.text,
      is_correct: opt.is_correct ?? false,
      match_target: opt.match_target || null,
      sort_order: opt.sort_order ?? index,
    }));
    updateData.options = JSON.stringify(options);
  }

  const updated = await db.update<any>("questions", questionId, updateData);

  logger.info(`Question updated: ${questionId}`);
  return {
    ...updated,
    options: typeof updated.options === "string" ? JSON.parse(updated.options) : updated.options,
  };
}

export async function deleteQuestion(orgId: number, questionId: string) {
  const db = getDB();

  const question = await db.findById<any>("questions", questionId);
  if (!question) {
    throw new NotFoundError("Question", questionId);
  }

  const quiz = await db.findById<any>("quizzes", question.quiz_id);
  if (!quiz) {
    throw new NotFoundError("Quiz", question.quiz_id);
  }

  const course = await db.findById<any>("courses", quiz.course_id);
  if (!course || course.org_id !== orgId) {
    throw new ForbiddenError("Question does not belong to your organization");
  }

  await db.delete("questions", questionId);
  logger.info(`Question deleted: ${questionId}`);
  return { deleted: true };
}

export async function reorderQuestions(quizId: string, orderedIds: string[]) {
  const db = getDB();

  const quiz = await db.findById<any>("quizzes", quizId);
  if (!quiz) {
    throw new NotFoundError("Quiz", quizId);
  }

  for (let i = 0; i < orderedIds.length; i++) {
    await db.update("questions", orderedIds[i], { sort_order: i });
  }

  logger.info(`Questions reordered for quiz ${quizId}`);
  return { reordered: true };
}

// ---------------------------------------------------------------------------
// Quiz Attempt Submission & Grading
// ---------------------------------------------------------------------------

export async function submitQuizAttempt(
  orgId: number,
  userId: number,
  quizId: string,
  enrollmentId: string,
  answers: SubmittedAnswer[]
) {
  const db = getDB();

  // Load quiz
  const quiz = await db.findById<any>("quizzes", quizId);
  if (!quiz) {
    throw new NotFoundError("Quiz", quizId);
  }

  // Verify enrollment
  const enrollment = await db.findById<any>("enrollments", enrollmentId);
  if (!enrollment) {
    throw new NotFoundError("Enrollment", enrollmentId);
  }
  if (enrollment.user_id !== userId || enrollment.org_id !== orgId) {
    throw new ForbiddenError("Enrollment does not belong to this user");
  }

  // Check max attempts
  const existingAttempts = await db.count("quiz_attempts", {
    quiz_id: quizId,
    user_id: userId,
  });
  if (quiz.max_attempts && existingAttempts >= quiz.max_attempts) {
    throw new BadRequestError(
      `Maximum attempts (${quiz.max_attempts}) reached for this quiz`
    );
  }

  // Load questions
  const questionsResult = await db.findMany<any>("questions", {
    filters: { quiz_id: quizId },
    limit: 1000,
  });
  const questions = questionsResult.data;
  const questionMap = new Map<string, any>();
  for (const q of questions) {
    questionMap.set(q.id, {
      ...q,
      options: typeof q.options === "string" ? JSON.parse(q.options) : q.options || [],
    });
  }

  // Grade each answer
  let totalPointsEarned = 0;
  let totalPointsPossible = 0;
  let hasEssay = false;

  const gradedAnswers: GradedAnswer[] = answers.map((answer) => {
    const question = questionMap.get(answer.question_id);
    if (!question) {
      return {
        ...answer,
        is_correct: false,
        points_earned: 0,
        points_possible: 0,
      };
    }

    const points = question.points || 1;
    totalPointsPossible += points;

    const result = gradeAnswer(question, answer);
    totalPointsEarned += result.points_earned;

    if (question.type === "essay") {
      hasEssay = true;
    }

    return {
      ...answer,
      is_correct: result.is_correct,
      points_earned: result.points_earned,
      points_possible: points,
      correct_options: result.correct_options,
    };
  });

  // Include points for unanswered questions in total
  for (const question of questions) {
    const wasAnswered = answers.some((a) => a.question_id === question.id);
    if (!wasAnswered) {
      totalPointsPossible += question.points || 1;
    }
  }

  // Calculate score as percentage
  const scorePercentage =
    totalPointsPossible > 0
      ? Math.round((totalPointsEarned / totalPointsPossible) * 10000) / 100
      : 0;

  const passed = scorePercentage >= (quiz.passing_score || 70);

  // Save attempt
  const attemptId = uuidv4();
  const attempt = await db.create<any>("quiz_attempts", {
    id: attemptId,
    quiz_id: quizId,
    enrollment_id: enrollmentId,
    user_id: userId,
    attempt_number: existingAttempts + 1,
    score: scorePercentage,
    passed,
    started_at: new Date(),
    completed_at: new Date(),
    answers: JSON.stringify(gradedAnswers),
  });

  // Load course for events
  const course = await db.findById<any>("courses", quiz.course_id);
  const courseId = course ? course.id : quiz.course_id;

  // Emit events
  lmsEvents.emit("quiz.submitted", {
    quizAttemptId: attemptId,
    quizId,
    courseId,
    userId,
    orgId,
    score: scorePercentage,
    totalScore: totalPointsPossible,
  });

  if (passed) {
    lmsEvents.emit("quiz.passed", {
      quizAttemptId: attemptId,
      quizId,
      courseId,
      userId,
      orgId,
      score: scorePercentage,
      passingScore: quiz.passing_score || 70,
    });

    // If course completion criteria is quiz_pass, check enrollment completion
    if (course && course.completion_criteria === "quiz_pass") {
      await db.update("enrollments", enrollmentId, {
        status: "completed",
        completed_at: new Date(),
        score: scorePercentage,
      });

      lmsEvents.emit("enrollment.completed", {
        enrollmentId,
        courseId,
        userId,
        orgId,
        completedAt: new Date(),
        score: scorePercentage,
      });
    }
  } else {
    lmsEvents.emit("quiz.failed", {
      quizAttemptId: attemptId,
      quizId,
      courseId,
      userId,
      orgId,
      score: scorePercentage,
      passingScore: quiz.passing_score || 70,
    });
  }

  // Build response
  const response: Record<string, any> = {
    id: attemptId,
    quiz_id: quizId,
    attempt_number: existingAttempts + 1,
    score: scorePercentage,
    total_points_earned: totalPointsEarned,
    total_points_possible: totalPointsPossible,
    passed,
    has_essay_questions: hasEssay,
    completed_at: attempt.completed_at,
  };

  // Include correct answers if show_answers is enabled
  if (quiz.show_answers) {
    response.answers = gradedAnswers;
  }

  return response;
}

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

export async function getAttempts(quizId: string, userId: number) {
  const db = getDB();

  const quiz = await db.findById<any>("quizzes", quizId);
  if (!quiz) {
    throw new NotFoundError("Quiz", quizId);
  }

  const result = await db.findMany<any>("quiz_attempts", {
    filters: { quiz_id: quizId, user_id: userId },
    sort: { field: "attempt_number", order: "desc" },
    limit: 100,
  });

  return result.data.map((attempt: any) => ({
    ...attempt,
    answers: typeof attempt.answers === "string" ? JSON.parse(attempt.answers) : attempt.answers,
  }));
}

export async function getAttempt(attemptId: string) {
  const db = getDB();

  const attempt = await db.findById<any>("quiz_attempts", attemptId);
  if (!attempt) {
    throw new NotFoundError("Quiz Attempt", attemptId);
  }

  return {
    ...attempt,
    answers: typeof attempt.answers === "string" ? JSON.parse(attempt.answers) : attempt.answers,
  };
}

// ---------------------------------------------------------------------------
// Quiz Stats
// ---------------------------------------------------------------------------

export async function getQuizStats(quizId: string) {
  const db = getDB();

  const quiz = await db.findById<any>("quizzes", quizId);
  if (!quiz) {
    throw new NotFoundError("Quiz", quizId);
  }

  const attemptsResult = await db.findMany<any>("quiz_attempts", {
    filters: { quiz_id: quizId },
    limit: 10000,
  });
  const attempts = attemptsResult.data;

  if (attempts.length === 0) {
    return {
      quiz_id: quizId,
      total_attempts: 0,
      unique_users: 0,
      average_score: 0,
      pass_rate: 0,
      highest_score: 0,
      lowest_score: 0,
      question_stats: [],
    };
  }

  const scores = attempts.map((a: any) => Number(a.score) || 0);
  const passedCount = attempts.filter((a: any) => a.passed).length;
  const uniqueUsers = new Set(attempts.map((a: any) => a.user_id)).size;

  const averageScore =
    Math.round((scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length) * 100) / 100;

  // Question-level stats
  const questionsResult = await db.findMany<any>("questions", {
    filters: { quiz_id: quizId },
    sort: { field: "sort_order", order: "asc" },
    limit: 1000,
  });

  const questionStats = questionsResult.data.map((question: any) => {
    let correctCount = 0;
    let totalAnswered = 0;

    for (const attempt of attempts) {
      const answers: GradedAnswer[] =
        typeof attempt.answers === "string"
          ? JSON.parse(attempt.answers)
          : attempt.answers || [];

      const answer = answers.find((a: GradedAnswer) => a.question_id === question.id);
      if (answer) {
        totalAnswered++;
        if (answer.is_correct === true) {
          correctCount++;
        }
      }
    }

    return {
      question_id: question.id,
      question_text: question.text,
      question_type: question.type,
      total_answered: totalAnswered,
      correct_count: correctCount,
      accuracy_rate: totalAnswered > 0
        ? Math.round((correctCount / totalAnswered) * 10000) / 100
        : 0,
    };
  });

  // Sort by accuracy to identify hardest/easiest
  const sortedByAccuracy = [...questionStats].sort(
    (a, b) => a.accuracy_rate - b.accuracy_rate
  );

  return {
    quiz_id: quizId,
    total_attempts: attempts.length,
    unique_users: uniqueUsers,
    average_score: averageScore,
    pass_rate: Math.round((passedCount / attempts.length) * 10000) / 100,
    highest_score: Math.max(...scores),
    lowest_score: Math.min(...scores),
    hardest_question: sortedByAccuracy[0] || null,
    easiest_question: sortedByAccuracy[sortedByAccuracy.length - 1] || null,
    question_stats: questionStats,
  };
}

// ---------------------------------------------------------------------------
// Grading Logic
// ---------------------------------------------------------------------------

function gradeAnswer(
  question: any,
  answer: SubmittedAnswer
): { is_correct: boolean | null; points_earned: number; correct_options: string[] } {
  const options: QuestionOption[] = question.options || [];
  const points = question.points || 1;

  switch (question.type) {
    case "mcq":
    case "true_false": {
      const correctOption = options.find((o: QuestionOption) => o.is_correct);
      const correctId = correctOption ? correctOption.id : null;
      const selectedId =
        answer.selected_options && answer.selected_options.length > 0
          ? answer.selected_options[0]
          : null;
      const isCorrect = selectedId !== null && selectedId === correctId;
      return {
        is_correct: isCorrect,
        points_earned: isCorrect ? points : 0,
        correct_options: correctId ? [correctId] : [],
      };
    }

    case "multi_select": {
      const correctIds = options
        .filter((o: QuestionOption) => o.is_correct)
        .map((o: QuestionOption) => o.id)
        .sort();
      const selectedIds = (answer.selected_options || []).slice().sort();

      const isCorrect =
        correctIds.length === selectedIds.length &&
        correctIds.every((id: string, index: number) => id === selectedIds[index]);

      return {
        is_correct: isCorrect,
        points_earned: isCorrect ? points : 0,
        correct_options: correctIds,
      };
    }

    case "fill_blank": {
      const correctOption = options.find((o: QuestionOption) => o.is_correct);
      const correctText = correctOption ? correctOption.text.trim().toLowerCase() : "";
      const userText = (answer.text_answer || "").trim().toLowerCase();
      const isCorrect = userText !== "" && userText === correctText;
      return {
        is_correct: isCorrect,
        points_earned: isCorrect ? points : 0,
        correct_options: correctOption ? [correctOption.id] : [],
      };
    }

    case "essay": {
      // Essay questions are not auto-graded; flag for manual review
      return {
        is_correct: null,
        points_earned: 0,
        correct_options: [],
      };
    }

    case "matching": {
      // matching_pairs is a map of option_id -> match_target
      const correctPairs: Record<string, string> = {};
      for (const opt of options) {
        if (opt.match_target) {
          correctPairs[opt.id] = opt.match_target;
        }
      }

      const userPairs = answer.matching_pairs || {};
      const allPairsCorrect =
        Object.keys(correctPairs).length > 0 &&
        Object.keys(correctPairs).length === Object.keys(userPairs).length &&
        Object.entries(correctPairs).every(
          ([key, value]) => userPairs[key] === value
        );

      return {
        is_correct: allPairsCorrect,
        points_earned: allPairsCorrect ? points : 0,
        correct_options: Object.keys(correctPairs),
      };
    }

    case "ordering": {
      // Correct order is determined by the sort_order of options
      const correctOrder = options
        .slice()
        .sort((a: QuestionOption, b: QuestionOption) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((o: QuestionOption) => o.id);

      const userOrder = answer.ordered_ids || [];
      const isCorrect =
        correctOrder.length > 0 &&
        correctOrder.length === userOrder.length &&
        correctOrder.every((id: string, index: number) => id === userOrder[index]);

      return {
        is_correct: isCorrect,
        points_earned: isCorrect ? points : 0,
        correct_options: correctOrder,
      };
    }

    default:
      return {
        is_correct: false,
        points_earned: 0,
        correct_options: [],
      };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
