// ============================================================================
// EMP-LMS SHARED VALIDATORS (Zod schemas)
// ============================================================================

import { z } from "zod";
import {
  CourseStatus,
  ContentType,
  EnrollmentStatus,
  QuizType,
  QuestionType,
  DifficultyLevel,
  CompletionCriteria,
  LearningPathStatus,
  ILTSessionStatus,
  ILTAttendanceStatus,
  ComplianceAssignedToType,
  ComplianceType,
} from "../types";

// ---------------------------------------------------------------------------
// Common / Reusable
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  search: z.string().optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Course
// ---------------------------------------------------------------------------

export const createCourseSchema = z.object({
  title: z.string().min(2).max(300),
  slug: z.string().min(2).max(300).optional(),
  description: z.string().optional(),
  short_description: z.string().max(500).optional(),
  thumbnail_url: z.string().url().optional(),
  category_id: z.string().uuid().optional(),
  instructor_id: z.number().int().optional(),
  difficulty: z.nativeEnum(DifficultyLevel).default(DifficultyLevel.BEGINNER),
  duration_minutes: z.number().int().min(0).default(0),
  is_mandatory: z.boolean().default(false),
  is_featured: z.boolean().default(false),
  max_enrollments: z.number().int().positive().optional(),
  tags: z.array(z.string()).default([]),
  prerequisites: z.array(z.string().uuid()).default([]),
  completion_criteria: z.nativeEnum(CompletionCriteria).default(CompletionCriteria.ALL_LESSONS),
  passing_score: z.number().int().min(0).max(100).default(70),
  certificate_template_id: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
  // Compliance fields (Phase 1)
  is_compliance: z.boolean().default(false),
  compliance_type: z.nativeEnum(ComplianceType).nullable().optional(),
  compliance_code: z.string().max(50).nullable().optional(),
});

export const updateCourseSchema = createCourseSchema.partial();

export const courseFilterSchema = paginationSchema.extend({
  status: z.nativeEnum(CourseStatus).optional(),
  category_id: z.string().uuid().optional(),
  difficulty: z.nativeEnum(DifficultyLevel).optional(),
  is_mandatory: z.coerce.boolean().optional(),
  is_featured: z.coerce.boolean().optional(),
  instructor_id: z.coerce.number().int().optional(),
  tags: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Course Category
// ---------------------------------------------------------------------------

export const createCourseCategorySchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  parent_id: z.string().uuid().optional(),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export const updateCourseCategorySchema = createCourseCategorySchema.partial();

// ---------------------------------------------------------------------------
// Course Module
// ---------------------------------------------------------------------------

export const createCourseModuleSchema = z.object({
  course_id: z.string().uuid(),
  title: z.string().min(2).max(300),
  description: z.string().optional(),
  sort_order: z.number().int().min(0).default(0),
  is_published: z.boolean().default(false),
});

export const updateCourseModuleSchema = createCourseModuleSchema.partial().omit({ course_id: true });

// ---------------------------------------------------------------------------
// Lesson
// ---------------------------------------------------------------------------

export const createLessonSchema = z.object({
  module_id: z.string().uuid(),
  title: z.string().min(2).max(300),
  description: z.string().optional(),
  content_type: z.nativeEnum(ContentType),
  content_url: z.string().url().optional(),
  content_text: z.string().optional(),
  duration_minutes: z.number().int().min(0).default(0),
  sort_order: z.number().int().min(0).default(0),
  is_mandatory: z.boolean().default(true),
  is_preview: z.boolean().default(false),
});

export const updateLessonSchema = createLessonSchema.partial().omit({ module_id: true });

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

export const enrollCourseSchema = z.object({
  user_id: z.number().int(),
  course_id: z.string().uuid(),
  due_date: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Learning Path
// ---------------------------------------------------------------------------

export const createLearningPathSchema = z.object({
  title: z.string().min(2).max(300),
  slug: z.string().min(2).max(300).optional(),
  description: z.string().optional(),
  thumbnail_url: z.string().url().optional(),
  difficulty: z.nativeEnum(DifficultyLevel).default(DifficultyLevel.BEGINNER),
  estimated_duration_minutes: z.number().int().min(0).default(0),
  is_mandatory: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
});

export const updateLearningPathSchema = createLearningPathSchema.partial();

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

export const createQuizSchema = z.object({
  course_id: z.string().uuid(),
  module_id: z.string().uuid().optional(),
  title: z.string().min(2).max(300),
  description: z.string().optional(),
  type: z.nativeEnum(QuizType).default(QuizType.GRADED),
  time_limit_minutes: z.number().int().positive().optional(),
  passing_score: z.number().int().min(0).max(100).default(70),
  max_attempts: z.number().int().min(1).default(3),
  shuffle_questions: z.boolean().default(false),
  show_answers: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
});

export const updateQuizSchema = createQuizSchema.partial().omit({ course_id: true });

// ---------------------------------------------------------------------------
// Question
// ---------------------------------------------------------------------------

export const questionOptionSchema = z.object({
  text: z.string().min(1),
  is_correct: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
  match_text: z.string().optional(),
});

export const createQuestionSchema = z.object({
  quiz_id: z.string().uuid(),
  type: z.nativeEnum(QuestionType),
  text: z.string().min(1),
  explanation: z.string().optional(),
  points: z.number().int().min(0).default(1),
  sort_order: z.number().int().min(0).default(0),
  options: z.array(questionOptionSchema).default([]),
});

export const updateQuestionSchema = createQuestionSchema.partial().omit({ quiz_id: true });

// ---------------------------------------------------------------------------
// Quiz Attempt
// ---------------------------------------------------------------------------

export const quizAnswerSchema = z.object({
  question_id: z.string().uuid(),
  selected_options: z.array(z.string()).default([]),
  text_answer: z.string().optional(),
});

export const submitQuizAttemptSchema = z.object({
  quiz_id: z.string().uuid(),
  answers: z.array(quizAnswerSchema).min(1),
});

// ---------------------------------------------------------------------------
// Certificate Template
// ---------------------------------------------------------------------------

export const createCertificateTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  html_template: z.string().min(1),
  is_default: z.boolean().default(false),
});

export const updateCertificateTemplateSchema = createCertificateTemplateSchema.partial();

// ---------------------------------------------------------------------------
// Compliance Assignment
// ---------------------------------------------------------------------------

export const createComplianceAssignmentSchema = z.object({
  course_id: z.string().uuid(),
  name: z.string().min(2).max(300),
  description: z.string().optional(),
  assigned_to_type: z.nativeEnum(ComplianceAssignedToType),
  assigned_to_ids: z.array(z.number().int()).default([]),
  due_date: z.string(),
  is_recurring: z.boolean().default(false),
  recurrence_interval_days: z.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// ILT Session
// ---------------------------------------------------------------------------

export const createILTSessionSchema = z.object({
  course_id: z.string().uuid(),
  title: z.string().min(2).max(300),
  description: z.string().optional(),
  instructor_id: z.number().int(),
  location: z.string().max(500).optional(),
  meeting_url: z.string().url().optional(),
  start_time: z.string(),
  end_time: z.string(),
  max_attendees: z.number().int().positive(),
  materials_url: z.string().url().optional(),
});

export const updateILTSessionSchema = createILTSessionSchema.partial().omit({ course_id: true });

// ---------------------------------------------------------------------------
// ILT Attendance
// ---------------------------------------------------------------------------

export const markILTAttendanceSchema = z.object({
  session_id: z.string().uuid(),
  attendees: z.array(
    z.object({
      user_id: z.number().int(),
      status: z.nativeEnum(ILTAttendanceStatus),
      checked_in_at: z.string().optional(),
    })
  ).min(1),
});

// ---------------------------------------------------------------------------
// SCORM Package
// ---------------------------------------------------------------------------

export const uploadScormPackageSchema = z.object({
  course_id: z.string().uuid(),
  lesson_id: z.string().uuid(),
  title: z.string().min(1).max(300),
  version: z.enum(["1.2", "2004"]),
  entry_point: z.string().min(1),
  package_url: z.string().url(),
  manifest_data: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Course Rating
// ---------------------------------------------------------------------------

export const createCourseRatingSchema = z.object({
  course_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  review: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// Discussion
// ---------------------------------------------------------------------------

export const createDiscussionSchema = z.object({
  course_id: z.string().uuid(),
  lesson_id: z.string().uuid().optional(),
  parent_id: z.string().uuid().optional(),
  title: z.string().max(300).optional(),
  content: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Content Library Item
// ---------------------------------------------------------------------------

export const createContentLibraryItemSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  content_type: z.nativeEnum(ContentType),
  content_url: z.string().url(),
  thumbnail_url: z.string().url().optional(),
  category: z.string().max(200).optional(),
  tags: z.array(z.string()).default([]),
  is_public: z.boolean().default(false),
  source: z.string().max(200).optional(),
  external_id: z.string().max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
});
