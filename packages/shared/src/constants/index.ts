// ============================================================================
// EMP-LMS CONSTANTS
// ============================================================================

import {
  CourseStatus,
  EnrollmentStatus,
  DifficultyLevel,
  CompletionCriteria,
  ComplianceStatus,
  CertificateStatus,
  ILTSessionStatus,
  LearningPathStatus,
  ScormStatus,
} from "../types";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const MAX_QUIZ_ATTEMPTS_DEFAULT = 3;

export const DEFAULT_PASSING_SCORE = 70;

export const MAX_COURSE_RATING = 5;

export const COMPLETION_CRITERIA_DEFAULT = "all_lessons";

export const SCORM_VERSIONS = ["1.2", "2004"] as const;

export const DEFAULT_PAGE_SIZE = 20;

export const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Course Categories (Default)
// ---------------------------------------------------------------------------

export const COURSE_CATEGORIES_DEFAULT = [
  "Technical",
  "Soft Skills",
  "Compliance",
  "Leadership",
  "Product",
  "Sales",
  "Customer Service",
  "Safety",
  "Other",
] as const;

// ---------------------------------------------------------------------------
// Difficulty Levels
// ---------------------------------------------------------------------------

export const DIFFICULTY_LEVELS = [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
] as const;

// ---------------------------------------------------------------------------
// Course Statuses
// ---------------------------------------------------------------------------

export const COURSE_STATUSES = [
  { key: CourseStatus.DRAFT, label: "Draft", color: "#6B7280" },
  { key: CourseStatus.PUBLISHED, label: "Published", color: "#22C55E" },
  { key: CourseStatus.ARCHIVED, label: "Archived", color: "#9CA3AF" },
] as const;

// ---------------------------------------------------------------------------
// Enrollment Statuses
// ---------------------------------------------------------------------------

export const ENROLLMENT_STATUSES = [
  { key: EnrollmentStatus.ENROLLED, label: "Enrolled", color: "#3B82F6" },
  { key: EnrollmentStatus.IN_PROGRESS, label: "In Progress", color: "#F59E0B" },
  { key: EnrollmentStatus.COMPLETED, label: "Completed", color: "#22C55E" },
  { key: EnrollmentStatus.FAILED, label: "Failed", color: "#EF4444" },
  { key: EnrollmentStatus.DROPPED, label: "Dropped", color: "#9CA3AF" },
  { key: EnrollmentStatus.EXPIRED, label: "Expired", color: "#6B7280" },
] as const;

// ---------------------------------------------------------------------------
// Difficulty Level Labels
// ---------------------------------------------------------------------------

export const DIFFICULTY_LEVEL_LABELS = [
  { key: DifficultyLevel.BEGINNER, label: "Beginner", color: "#22C55E" },
  { key: DifficultyLevel.INTERMEDIATE, label: "Intermediate", color: "#3B82F6" },
  { key: DifficultyLevel.ADVANCED, label: "Advanced", color: "#F59E0B" },
  { key: DifficultyLevel.EXPERT, label: "Expert", color: "#EF4444" },
] as const;

// ---------------------------------------------------------------------------
// Completion Criteria Labels
// ---------------------------------------------------------------------------

export const COMPLETION_CRITERIA_LABELS = [
  { key: CompletionCriteria.ALL_LESSONS, label: "All Lessons Completed" },
  { key: CompletionCriteria.QUIZ_PASS, label: "Quiz Pass Required" },
  { key: CompletionCriteria.MANUAL, label: "Manual Approval" },
  { key: CompletionCriteria.TIME_BASED, label: "Time-Based Completion" },
] as const;

// ---------------------------------------------------------------------------
// Compliance Statuses
// ---------------------------------------------------------------------------

export const COMPLIANCE_STATUSES = [
  { key: ComplianceStatus.NOT_STARTED, label: "Not Started", color: "#6B7280" },
  { key: ComplianceStatus.IN_PROGRESS, label: "In Progress", color: "#F59E0B" },
  { key: ComplianceStatus.COMPLETED, label: "Completed", color: "#22C55E" },
  { key: ComplianceStatus.OVERDUE, label: "Overdue", color: "#EF4444" },
] as const;

// ---------------------------------------------------------------------------
// Certificate Statuses
// ---------------------------------------------------------------------------

export const CERTIFICATE_STATUSES = [
  { key: CertificateStatus.ACTIVE, label: "Active", color: "#22C55E" },
  { key: CertificateStatus.EXPIRED, label: "Expired", color: "#F59E0B" },
  { key: CertificateStatus.REVOKED, label: "Revoked", color: "#EF4444" },
] as const;

// ---------------------------------------------------------------------------
// ILT Session Statuses
// ---------------------------------------------------------------------------

export const ILT_SESSION_STATUSES = [
  { key: ILTSessionStatus.SCHEDULED, label: "Scheduled", color: "#3B82F6" },
  { key: ILTSessionStatus.IN_PROGRESS, label: "In Progress", color: "#F59E0B" },
  { key: ILTSessionStatus.COMPLETED, label: "Completed", color: "#22C55E" },
  { key: ILTSessionStatus.CANCELLED, label: "Cancelled", color: "#9CA3AF" },
] as const;

// ---------------------------------------------------------------------------
// Learning Path Statuses
// ---------------------------------------------------------------------------

export const LEARNING_PATH_STATUSES = [
  { key: LearningPathStatus.DRAFT, label: "Draft", color: "#6B7280" },
  { key: LearningPathStatus.PUBLISHED, label: "Published", color: "#22C55E" },
  { key: LearningPathStatus.ARCHIVED, label: "Archived", color: "#9CA3AF" },
] as const;

// ---------------------------------------------------------------------------
// SCORM Statuses
// ---------------------------------------------------------------------------

export const SCORM_STATUSES = [
  { key: ScormStatus.NOT_ATTEMPTED, label: "Not Attempted", color: "#6B7280" },
  { key: ScormStatus.INCOMPLETE, label: "Incomplete", color: "#F59E0B" },
  { key: ScormStatus.COMPLETED, label: "Completed", color: "#22C55E" },
  { key: ScormStatus.PASSED, label: "Passed", color: "#10B981" },
  { key: ScormStatus.FAILED, label: "Failed", color: "#EF4444" },
] as const;

// ---------------------------------------------------------------------------
// Event Names (for event system / webhooks)
// ---------------------------------------------------------------------------

export const LMS_EVENTS = {
  // Course events
  COURSE_CREATED: "course.created",
  COURSE_UPDATED: "course.updated",
  COURSE_PUBLISHED: "course.published",
  COURSE_ARCHIVED: "course.archived",
  COURSE_DELETED: "course.deleted",

  // Enrollment events
  ENROLLMENT_CREATED: "enrollment.created",
  ENROLLMENT_STARTED: "enrollment.started",
  ENROLLMENT_COMPLETED: "enrollment.completed",
  ENROLLMENT_FAILED: "enrollment.failed",
  ENROLLMENT_DROPPED: "enrollment.dropped",
  ENROLLMENT_EXPIRED: "enrollment.expired",

  // Lesson events
  LESSON_COMPLETED: "lesson.completed",
  LESSON_STARTED: "lesson.started",

  // Quiz events
  QUIZ_STARTED: "quiz.started",
  QUIZ_SUBMITTED: "quiz.submitted",
  QUIZ_PASSED: "quiz.passed",
  QUIZ_FAILED: "quiz.failed",

  // Certificate events
  CERTIFICATE_ISSUED: "certificate.issued",
  CERTIFICATE_EXPIRED: "certificate.expired",
  CERTIFICATE_REVOKED: "certificate.revoked",

  // Compliance events
  COMPLIANCE_ASSIGNED: "compliance.assigned",
  COMPLIANCE_COMPLETED: "compliance.completed",
  COMPLIANCE_OVERDUE: "compliance.overdue",
  COMPLIANCE_REMINDER_SENT: "compliance.reminder_sent",

  // Learning path events
  LEARNING_PATH_CREATED: "learning_path.created",
  LEARNING_PATH_PUBLISHED: "learning_path.published",
  LEARNING_PATH_ENROLLED: "learning_path.enrolled",
  LEARNING_PATH_COMPLETED: "learning_path.completed",

  // ILT events
  ILT_SESSION_CREATED: "ilt_session.created",
  ILT_SESSION_STARTED: "ilt_session.started",
  ILT_SESSION_COMPLETED: "ilt_session.completed",
  ILT_SESSION_CANCELLED: "ilt_session.cancelled",
  ILT_ATTENDANCE_MARKED: "ilt_session.attendance_marked",

  // Discussion events
  DISCUSSION_CREATED: "discussion.created",
  DISCUSSION_REPLIED: "discussion.replied",
  DISCUSSION_RESOLVED: "discussion.resolved",

  // Rating events
  COURSE_RATED: "course.rated",

  // SCORM events
  SCORM_PACKAGE_UPLOADED: "scorm.package_uploaded",
  SCORM_COMPLETED: "scorm.completed",
  SCORM_PASSED: "scorm.passed",
  SCORM_FAILED: "scorm.failed",

  // Content library events
  CONTENT_LIBRARY_ITEM_CREATED: "content_library.item_created",
  CONTENT_LIBRARY_ITEM_DELETED: "content_library.item_deleted",

  // User learning profile events
  STREAK_UPDATED: "profile.streak_updated",
  POINTS_EARNED: "profile.points_earned",
} as const;
