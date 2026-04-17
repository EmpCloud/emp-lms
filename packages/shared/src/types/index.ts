// ============================================================================
// EMP-LMS SHARED TYPES
// These types are the single source of truth for both server and client.
// ============================================================================

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum CourseStatus {
  DRAFT = "draft",
  PUBLISHED = "published",
  ARCHIVED = "archived",
}

export enum ContentType {
  TEXT = "text",
  VIDEO = "video",
  DOCUMENT = "document",
  SLIDE = "slide",
  SCORM = "scorm",
  XAPI = "xapi",
  LINK = "link",
  EMBED = "embed",
}

export enum EnrollmentStatus {
  ENROLLED = "enrolled",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  FAILED = "failed",
  DROPPED = "dropped",
  EXPIRED = "expired",
}

export enum QuizType {
  GRADED = "graded",
  PRACTICE = "practice",
  SURVEY = "survey",
}

export enum QuestionType {
  MCQ = "mcq",
  MULTI_SELECT = "multi_select",
  TRUE_FALSE = "true_false",
  FILL_BLANK = "fill_blank",
  ESSAY = "essay",
  MATCHING = "matching",
  ORDERING = "ordering",
}

export enum CertificateStatus {
  ACTIVE = "active",
  EXPIRED = "expired",
  REVOKED = "revoked",
}

export enum ComplianceStatus {
  NOT_STARTED = "not_started",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  OVERDUE = "overdue",
}

export enum ILTSessionStatus {
  SCHEDULED = "scheduled",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

export enum LearningPathStatus {
  DRAFT = "draft",
  PUBLISHED = "published",
  ARCHIVED = "archived",
}

export enum DifficultyLevel {
  BEGINNER = "beginner",
  INTERMEDIATE = "intermediate",
  ADVANCED = "advanced",
  EXPERT = "expert",
}

export enum CompletionCriteria {
  ALL_LESSONS = "all_lessons",
  QUIZ_PASS = "quiz_pass",
  MANUAL = "manual",
  TIME_BASED = "time_based",
}

export enum ScormStatus {
  NOT_ATTEMPTED = "not_attempted",
  INCOMPLETE = "incomplete",
  COMPLETED = "completed",
  PASSED = "passed",
  FAILED = "failed",
}

export enum UserRole {
  SUPER_ADMIN = "super_admin",
  ORG_ADMIN = "org_admin",
  HR_ADMIN = "hr_admin",
  HR_MANAGER = "hr_manager",
  MANAGER = "manager",
  EMPLOYEE = "employee",
}

export enum ILTAttendanceStatus {
  REGISTERED = "registered",
  ATTENDED = "attended",
  ABSENT = "absent",
  EXCUSED = "excused",
}

export enum ComplianceType {
  POLICY = "policy",
  TRAINING = "training",
  DOCUMENT_SUBMISSION = "document_submission",
  QUIZ = "quiz",
}

export enum ComplianceAssignedToType {
  ALL = "all",
  DEPARTMENT = "department",
  ROLE = "role",
  USER = "user",
}

// ---------------------------------------------------------------------------
// API Response envelope
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthPayload {
  empcloudUserId: number;
  empcloudOrgId: number;
  role: "super_admin" | "org_admin" | "hr_admin" | "hr_manager" | "manager" | "employee";
  email: string;
  firstName: string;
  lastName: string;
  orgName: string;
}

// ---------------------------------------------------------------------------
// Course
// ---------------------------------------------------------------------------

export interface Course {
  id: string;
  organization_id: number;
  title: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  thumbnail_url: string | null;
  category_id: string | null;
  instructor_id: number | null;
  difficulty: DifficultyLevel;
  duration_minutes: number;
  status: CourseStatus;
  is_mandatory: boolean;
  is_featured: boolean;
  max_enrollments: number | null;
  enrollment_count: number;
  completion_count: number;
  avg_rating: number;
  rating_count: number;
  tags: string[];
  prerequisites: string[];
  completion_criteria: CompletionCriteria;
  passing_score: number;
  certificate_template_id: string | null;
  published_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Course Category
// ---------------------------------------------------------------------------

export interface CourseCategory {
  id: string;
  organization_id: number;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Course Module
// ---------------------------------------------------------------------------

export interface CourseModule {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Lesson
// ---------------------------------------------------------------------------

export interface Lesson {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  content_type: ContentType;
  content_url: string | null;
  content_text: string | null;
  duration_minutes: number;
  sort_order: number;
  is_mandatory: boolean;
  is_preview: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

export interface Enrollment {
  id: string;
  organization_id: number;
  user_id: number;
  course_id: string;
  status: EnrollmentStatus;
  progress_percentage: number;
  enrolled_at: string;
  started_at: string | null;
  completed_at: string | null;
  due_date: string | null;
  last_accessed_at: string | null;
  time_spent_minutes: number;
  score: number | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Lesson Progress
// ---------------------------------------------------------------------------

export interface LessonProgress {
  id: string;
  enrollment_id: string;
  lesson_id: string;
  is_completed: boolean;
  completed_at: string | null;
  time_spent_minutes: number;
  attempts: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Learning Path
// ---------------------------------------------------------------------------

export interface LearningPath {
  id: string;
  organization_id: number;
  title: string;
  slug: string;
  description: string | null;
  thumbnail_url: string | null;
  difficulty: DifficultyLevel;
  estimated_duration_minutes: number;
  status: LearningPathStatus;
  is_mandatory: boolean;
  sort_order: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Learning Path Course
// ---------------------------------------------------------------------------

export interface LearningPathCourse {
  id: string;
  learning_path_id: string;
  course_id: string;
  sort_order: number;
  is_mandatory: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Learning Path Enrollment
// ---------------------------------------------------------------------------

export interface LearningPathEnrollment {
  id: string;
  organization_id: number;
  user_id: number;
  learning_path_id: string;
  status: EnrollmentStatus;
  progress_percentage: number;
  enrolled_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

export interface Quiz {
  id: string;
  course_id: string;
  module_id: string | null;
  title: string;
  description: string | null;
  type: QuizType;
  time_limit_minutes: number | null;
  passing_score: number;
  max_attempts: number;
  shuffle_questions: boolean;
  show_answers: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Question
// ---------------------------------------------------------------------------

export interface QuestionOption {
  id: string;
  text: string;
  is_correct: boolean;
  sort_order: number;
  match_text: string | null;
}

export interface Question {
  id: string;
  quiz_id: string;
  type: QuestionType;
  text: string;
  explanation: string | null;
  points: number;
  sort_order: number;
  options: QuestionOption[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Quiz Attempt
// ---------------------------------------------------------------------------

export interface QuizAnswer {
  question_id: string;
  selected_options: string[];
  text_answer: string | null;
  is_correct: boolean;
  points_earned: number;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  enrollment_id: string;
  user_id: number;
  attempt_number: number;
  score: number;
  passed: boolean;
  started_at: string;
  completed_at: string | null;
  answers: QuizAnswer[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Certificate
// ---------------------------------------------------------------------------

export interface Certificate {
  id: string;
  organization_id: number;
  user_id: number;
  course_id: string;
  enrollment_id: string;
  certificate_number: string;
  issued_at: string;
  expires_at: string | null;
  status: CertificateStatus;
  template_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Certificate Template
// ---------------------------------------------------------------------------

export interface CertificateTemplate {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  html_template: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Compliance Assignment
// ---------------------------------------------------------------------------

export interface ComplianceAssignment {
  id: string;
  organization_id: number;
  course_id: string;
  name: string;
  description: string | null;
  assigned_to_type: ComplianceAssignedToType;
  assigned_to_ids: number[];
  due_date: string;
  is_recurring: boolean;
  recurrence_interval_days: number | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Compliance Record
// ---------------------------------------------------------------------------

export interface ComplianceRecord {
  id: string;
  assignment_id: string;
  user_id: number;
  course_id: string;
  organization_id: number;
  status: ComplianceStatus;
  due_date: string;
  completed_at: string | null;
  last_reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// ILT Session
// ---------------------------------------------------------------------------

export interface ILTSession {
  id: string;
  organization_id: number;
  course_id: string;
  title: string;
  description: string | null;
  instructor_id: number;
  location: string | null;
  meeting_url: string | null;
  start_time: string;
  end_time: string;
  max_attendees: number;
  enrolled_count: number;
  status: ILTSessionStatus;
  materials_url: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// ILT Attendance
// ---------------------------------------------------------------------------

export interface ILTAttendance {
  id: string;
  session_id: string;
  user_id: number;
  status: ILTAttendanceStatus;
  checked_in_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// SCORM Package
// ---------------------------------------------------------------------------

export interface ScormPackage {
  id: string;
  organization_id: number;
  course_id: string;
  lesson_id: string;
  title: string;
  version: "1.2" | "2004";
  entry_point: string;
  package_url: string;
  manifest_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// SCORM Tracking
// ---------------------------------------------------------------------------

export interface ScormTracking {
  id: string;
  package_id: string;
  user_id: number;
  enrollment_id: string;
  status: ScormStatus;
  score: number | null;
  time_spent: string | null;
  suspend_data: string | null;
  location: string | null;
  total_time: string | null;
  completion_status: string | null;
  success_status: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Course Rating
// ---------------------------------------------------------------------------

export interface CourseRating {
  id: string;
  course_id: string;
  user_id: number;
  organization_id: number;
  rating: number;
  review: string | null;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Discussion
// ---------------------------------------------------------------------------

export interface Discussion {
  id: string;
  course_id: string;
  lesson_id: string | null;
  user_id: number;
  organization_id: number;
  parent_id: string | null;
  title: string | null;
  content: string;
  is_pinned: boolean;
  is_resolved: boolean;
  reply_count: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Content Library Item
// ---------------------------------------------------------------------------

export interface ContentLibraryItem {
  id: string;
  organization_id: number;
  title: string;
  description: string | null;
  content_type: ContentType;
  content_url: string;
  thumbnail_url: string | null;
  category: string | null;
  tags: string[];
  is_public: boolean;
  source: string | null;
  external_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// User Learning Profile
// ---------------------------------------------------------------------------

export interface UserLearningProfile {
  id: string;
  organization_id: number;
  user_id: number;
  preferred_categories: string[];
  preferred_difficulty: DifficultyLevel | null;
  total_courses_completed: number;
  total_time_spent_minutes: number;
  total_points_earned: number;
  current_streak_days: number;
  longest_streak_days: number;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  organization_id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}
