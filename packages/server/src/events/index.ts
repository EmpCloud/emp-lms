// ============================================================================
// TYPED EVENT EMITTER FOR LMS EVENTS
// Provides a strongly-typed pub/sub system for decoupled communication
// between LMS modules (courses, enrollments, quizzes, certificates, etc.).
// ============================================================================

import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------

export interface CourseCreatedEvent {
  courseId: string;
  orgId: number;
  title: string;
  createdBy: number;
}

export interface CoursePublishedEvent {
  courseId: string;
  orgId: number;
  title: string;
  publishedBy: number;
}

export interface CourseArchivedEvent {
  courseId: string;
  orgId: number;
  archivedBy: number;
}

export interface EnrollmentCreatedEvent {
  enrollmentId: string;
  courseId: string;
  userId: number;
  orgId: number;
}

export interface EnrollmentCompletedEvent {
  enrollmentId: string;
  courseId: string;
  userId: number;
  orgId: number;
  completedAt: Date;
  score?: number;
}

export interface EnrollmentFailedEvent {
  enrollmentId: string;
  courseId: string;
  userId: number;
  orgId: number;
  reason: string;
}

export interface QuizSubmittedEvent {
  quizAttemptId: string;
  quizId: string;
  courseId: string;
  userId: number;
  orgId: number;
  score: number;
  totalScore: number;
}

export interface QuizPassedEvent {
  quizAttemptId: string;
  quizId: string;
  courseId: string;
  userId: number;
  orgId: number;
  score: number;
  passingScore: number;
}

export interface QuizFailedEvent {
  quizAttemptId: string;
  quizId: string;
  courseId: string;
  userId: number;
  orgId: number;
  score: number;
  passingScore: number;
}

export interface CertificateIssuedEvent {
  certificateId: string;
  courseId: string;
  userId: number;
  orgId: number;
  issuedAt: Date;
  expiresAt?: Date;
}

export interface CertificateExpiredEvent {
  certificateId: string;
  courseId: string;
  userId: number;
  orgId: number;
  expiredAt: Date;
}

export interface ComplianceAssignedEvent {
  complianceId: string;
  courseId: string;
  userId: number;
  orgId: number;
  dueDate: Date;
}

export interface ComplianceCompletedEvent {
  complianceId: string;
  courseId: string;
  userId: number;
  orgId: number;
  completedAt: Date;
}

export interface ComplianceOverdueEvent {
  complianceId: string;
  courseId: string;
  userId: number;
  orgId: number;
  dueDate: Date;
}

export interface LearningPathCompletedEvent {
  learningPathId: string;
  userId: number;
  orgId: number;
  completedAt: Date;
}

export interface ILTSessionCreatedEvent {
  sessionId: string;
  courseId: string;
  orgId: number;
  instructorId: number;
  scheduledAt: Date;
  location?: string;
}

export interface ILTAttendanceMarkedEvent {
  sessionId: string;
  courseId: string;
  orgId: number;
  attendees: { userId: number; status: "present" | "absent" | "late" }[];
  markedBy: number;
}

// ---------------------------------------------------------------------------
// Event map
// ---------------------------------------------------------------------------

export interface LMSEventMap {
  "course.created": CourseCreatedEvent;
  "course.published": CoursePublishedEvent;
  "course.archived": CourseArchivedEvent;
  "enrollment.created": EnrollmentCreatedEvent;
  "enrollment.completed": EnrollmentCompletedEvent;
  "enrollment.failed": EnrollmentFailedEvent;
  "quiz.submitted": QuizSubmittedEvent;
  "quiz.passed": QuizPassedEvent;
  "quiz.failed": QuizFailedEvent;
  "certificate.issued": CertificateIssuedEvent;
  "certificate.expired": CertificateExpiredEvent;
  "compliance.assigned": ComplianceAssignedEvent;
  "compliance.completed": ComplianceCompletedEvent;
  "compliance.overdue": ComplianceOverdueEvent;
  "learning_path.completed": LearningPathCompletedEvent;
  "ilt.session_created": ILTSessionCreatedEvent;
  "ilt.attendance_marked": ILTAttendanceMarkedEvent;
}

// ---------------------------------------------------------------------------
// Typed event emitter
// ---------------------------------------------------------------------------

class LMSEventEmitter {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof LMSEventMap>(event: K, listener: (data: LMSEventMap[K]) => void): this {
    this.emitter.on(event, listener as (...args: any[]) => void);
    return this;
  }

  once<K extends keyof LMSEventMap>(event: K, listener: (data: LMSEventMap[K]) => void): this {
    this.emitter.once(event, listener as (...args: any[]) => void);
    return this;
  }

  off<K extends keyof LMSEventMap>(event: K, listener: (data: LMSEventMap[K]) => void): this {
    this.emitter.off(event, listener as (...args: any[]) => void);
    return this;
  }

  emit<K extends keyof LMSEventMap>(event: K, data: LMSEventMap[K]): boolean {
    return this.emitter.emit(event, data);
  }

  removeAllListeners<K extends keyof LMSEventMap>(event?: K): this {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
    return this;
  }

  listenerCount<K extends keyof LMSEventMap>(event: K): number {
    return this.emitter.listenerCount(event);
  }
}

// Singleton event bus
export const lmsEvents = new LMSEventEmitter();
