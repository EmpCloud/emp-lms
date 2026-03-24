// ============================================================================
// ENROLLMENT SERVICE
// Full enrollment management: enroll, progress tracking, completion.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters/index";
import { lmsEvents } from "../../events/index";
import { logger } from "../../utils/logger";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "../../utils/errors";

// ---------------------------------------------------------------------------
// Enroll a single user
// ---------------------------------------------------------------------------

export async function enrollUser(
  orgId: number,
  userId: number,
  courseId: string,
  dueDate?: string
) {
  const db = getDB();

  // Validate course exists and is published
  const course = await db.findOne<any>("courses", {
    id: courseId,
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", courseId);
  }
  if (course.status !== "published") {
    throw new BadRequestError("Cannot enroll in an unpublished course");
  }

  // Check max enrollments
  if (course.max_enrollments && course.enrollment_count >= course.max_enrollments) {
    throw new BadRequestError("Course has reached maximum enrollment capacity");
  }

  // Check not already enrolled
  const existing = await db.findOne<any>("enrollments", {
    user_id: userId,
    course_id: courseId,
  });
  if (existing && existing.status !== "dropped") {
    throw new ConflictError("User is already enrolled in this course");
  }

  // If previously dropped, re-enroll
  if (existing && existing.status === "dropped") {
    const updated = await db.update<any>("enrollments", existing.id, {
      status: "enrolled",
      progress_percentage: 0,
      enrolled_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      due_date: dueDate || null,
      last_accessed_at: null,
      time_spent_minutes: 0,
      score: null,
    });

    // Increment enrollment count
    await db.raw(
      `UPDATE courses SET enrollment_count = enrollment_count + 1 WHERE id = ?`,
      [courseId]
    );

    lmsEvents.emit("enrollment.created", {
      enrollmentId: existing.id,
      courseId,
      userId,
      orgId,
    });

    return updated;
  }

  const id = uuidv4();

  const enrollment = await db.create<any>("enrollments", {
    id,
    org_id: orgId,
    user_id: userId,
    course_id: courseId,
    status: "enrolled",
    progress_percentage: 0,
    enrolled_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    due_date: dueDate || null,
    last_accessed_at: null,
    time_spent_minutes: 0,
    score: null,
  });

  // Increment enrollment count on course
  await db.raw(
    `UPDATE courses SET enrollment_count = enrollment_count + 1 WHERE id = ?`,
    [courseId]
  );

  lmsEvents.emit("enrollment.created", {
    enrollmentId: id,
    courseId,
    userId,
    orgId,
  });

  logger.info(`User ${userId} enrolled in course ${courseId}`);

  return enrollment;
}

// ---------------------------------------------------------------------------
// Bulk enroll
// ---------------------------------------------------------------------------

export async function enrollBulk(
  orgId: number,
  userIds: number[],
  courseId: string,
  dueDate?: string
) {
  const results: { userId: number; enrollmentId?: string; error?: string }[] = [];

  for (const userId of userIds) {
    try {
      const enrollment = await enrollUser(orgId, userId, courseId, dueDate);
      results.push({ userId, enrollmentId: enrollment.id });
    } catch (err: any) {
      results.push({ userId, error: err.message });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Get enrollment with lesson progress
// ---------------------------------------------------------------------------

export async function getEnrollment(
  orgId: number,
  userId: number,
  courseId: string
) {
  const db = getDB();

  const enrollment = await db.findOne<any>("enrollments", {
    org_id: orgId,
    user_id: userId,
    course_id: courseId,
  });
  if (!enrollment) {
    throw new NotFoundError("Enrollment");
  }

  const lessonProgress = await db.raw<any[]>(
    `SELECT lp.*, l.title AS lesson_title, l.sort_order
     FROM lesson_progress lp
     JOIN lessons l ON l.id = lp.lesson_id
     WHERE lp.enrollment_id = ?
     ORDER BY l.sort_order ASC`,
    [enrollment.id]
  );

  return { ...enrollment, lesson_progress: lessonProgress };
}

// ---------------------------------------------------------------------------
// List enrollments for a user (paginated)
// ---------------------------------------------------------------------------

export async function listUserEnrollments(
  orgId: number,
  userId: number,
  filters?: {
    page?: number;
    perPage?: number;
    status?: string;
    search?: string;
  }
) {
  const db = getDB();

  const page = filters?.page || 1;
  const perPage = filters?.perPage || 20;
  const offset = (page - 1) * perPage;

  let whereClause = "e.org_id = ? AND e.user_id = ?";
  const params: any[] = [orgId, userId];

  if (filters?.status) {
    whereClause += " AND e.status = ?";
    params.push(filters.status);
  }

  if (filters?.search) {
    whereClause += " AND c.title LIKE ?";
    params.push(`%${filters.search}%`);
  }

  const countParams = [...params];

  const dataQuery = `
    SELECT e.*, c.title AS course_title, c.thumbnail_url AS course_thumbnail,
           c.slug AS course_slug, c.difficulty AS course_difficulty
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE ${whereClause}
    ORDER BY e.enrolled_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(perPage, offset);

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE ${whereClause}
  `;

  const [data, countResult] = await Promise.all([
    db.raw<any[]>(dataQuery, params),
    db.raw<any[]>(countQuery, countParams),
  ]);

  const total = countResult[0]?.total || 0;

  return { data, total, page, perPage };
}

// ---------------------------------------------------------------------------
// List enrollments for a course (admin view)
// ---------------------------------------------------------------------------

export async function listCourseEnrollments(
  orgId: number,
  courseId: string,
  filters?: {
    page?: number;
    perPage?: number;
    status?: string;
  }
) {
  const db = getDB();

  const page = filters?.page || 1;
  const perPage = filters?.perPage || 20;
  const offset = (page - 1) * perPage;

  let whereClause = "e.org_id = ? AND e.course_id = ?";
  const params: any[] = [orgId, courseId];

  if (filters?.status) {
    whereClause += " AND e.status = ?";
    params.push(filters.status);
  }

  const countParams = [...params];

  const dataQuery = `
    SELECT e.*
    FROM enrollments e
    WHERE ${whereClause}
    ORDER BY e.enrolled_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(perPage, offset);

  const countQuery = `
    SELECT COUNT(*) AS total FROM enrollments e WHERE ${whereClause}
  `;

  const [data, countResult] = await Promise.all([
    db.raw<any[]>(dataQuery, params),
    db.raw<any[]>(countQuery, countParams),
  ]);

  const total = countResult[0]?.total || 0;

  return { data, total, page, perPage };
}

// ---------------------------------------------------------------------------
// Mark lesson complete
// ---------------------------------------------------------------------------

export async function markLessonComplete(
  orgId: number,
  enrollmentId: string,
  lessonId: string,
  timeSpent?: number
) {
  const db = getDB();

  // Validate enrollment
  const enrollment = await db.findOne<any>("enrollments", {
    id: enrollmentId,
    org_id: orgId,
  });
  if (!enrollment) {
    throw new NotFoundError("Enrollment", enrollmentId);
  }

  if (enrollment.status === "completed" || enrollment.status === "dropped") {
    throw new BadRequestError(
      `Cannot update progress on a ${enrollment.status} enrollment`
    );
  }

  // Validate lesson exists in the enrolled course
  const lesson = await db.raw<any[]>(
    `SELECT l.* FROM lessons l
     JOIN course_modules m ON m.id = l.module_id
     WHERE l.id = ? AND m.course_id = ?`,
    [lessonId, enrollment.course_id]
  );
  if (!lesson || lesson.length === 0) {
    throw new NotFoundError("Lesson", lessonId);
  }

  // Upsert lesson progress
  const existingProgress = await db.findOne<any>("lesson_progress", {
    enrollment_id: enrollmentId,
    lesson_id: lessonId,
  });

  if (existingProgress) {
    await db.update("lesson_progress", existingProgress.id, {
      is_completed: true,
      completed_at: new Date().toISOString(),
      time_spent_minutes: (existingProgress.time_spent_minutes || 0) + (timeSpent || 0),
      attempts: (existingProgress.attempts || 0) + 1,
    });
  } else {
    await db.create("lesson_progress", {
      id: uuidv4(),
      enrollment_id: enrollmentId,
      lesson_id: lessonId,
      is_completed: true,
      completed_at: new Date().toISOString(),
      time_spent_minutes: timeSpent || 0,
      attempts: 1,
    });
  }

  // Update enrollment status to in_progress if still enrolled
  if (enrollment.status === "enrolled") {
    await db.update("enrollments", enrollmentId, {
      status: "in_progress",
      started_at: enrollment.started_at || new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
    });
  } else {
    await db.update("enrollments", enrollmentId, {
      last_accessed_at: new Date().toISOString(),
    });
  }

  // Recalculate progress
  const progress = await calculateProgress(enrollmentId);

  // Update time spent
  if (timeSpent) {
    await updateTimeSpent(enrollmentId, timeSpent);
  }

  // Check if course is now complete
  if (progress >= 100) {
    await completeEnrollment(orgId, enrollmentId);
  }

  return {
    enrollment_id: enrollmentId,
    lesson_id: lessonId,
    progress_percentage: progress,
    is_course_completed: progress >= 100,
  };
}

// ---------------------------------------------------------------------------
// Calculate progress
// ---------------------------------------------------------------------------

export async function calculateProgress(enrollmentId: string): Promise<number> {
  const db = getDB();

  const enrollment = await db.findById<any>("enrollments", enrollmentId);
  if (!enrollment) {
    return 0;
  }

  // Count total mandatory lessons
  const totalResult = await db.raw<any[]>(
    `SELECT COUNT(*) AS total FROM lessons l
     JOIN course_modules m ON m.id = l.module_id
     WHERE m.course_id = ? AND l.is_mandatory = true`,
    [enrollment.course_id]
  );
  const totalLessons = totalResult[0]?.total || 0;

  if (totalLessons === 0) {
    return 100; // No mandatory lessons means complete
  }

  // Count completed mandatory lessons
  const completedResult = await db.raw<any[]>(
    `SELECT COUNT(*) AS total FROM lesson_progress lp
     JOIN lessons l ON l.id = lp.lesson_id
     JOIN course_modules m ON m.id = l.module_id
     WHERE lp.enrollment_id = ?
       AND lp.is_completed = true
       AND l.is_mandatory = true
       AND m.course_id = ?`,
    [enrollmentId, enrollment.course_id]
  );
  const completedLessons = completedResult[0]?.total || 0;

  const progress = Math.round((completedLessons / totalLessons) * 100);

  // Update enrollment progress
  await db.update("enrollments", enrollmentId, {
    progress_percentage: progress,
  });

  return progress;
}

// ---------------------------------------------------------------------------
// Complete enrollment
// ---------------------------------------------------------------------------

export async function completeEnrollment(orgId: number, enrollmentId: string) {
  const db = getDB();

  const enrollment = await db.findOne<any>("enrollments", {
    id: enrollmentId,
    org_id: orgId,
  });
  if (!enrollment) {
    throw new NotFoundError("Enrollment", enrollmentId);
  }

  if (enrollment.status === "completed") {
    throw new BadRequestError("Enrollment is already completed");
  }

  const completedAt = new Date();

  await db.update("enrollments", enrollmentId, {
    status: "completed",
    completed_at: completedAt.toISOString(),
    progress_percentage: 100,
  });

  // Increment course completion count
  await db.raw(
    `UPDATE courses SET completion_count = completion_count + 1 WHERE id = ?`,
    [enrollment.course_id]
  );

  lmsEvents.emit("enrollment.completed", {
    enrollmentId,
    courseId: enrollment.course_id,
    userId: enrollment.user_id,
    orgId,
    completedAt,
    score: enrollment.score || undefined,
  });

  logger.info(
    `Enrollment ${enrollmentId} completed for user ${enrollment.user_id} in course ${enrollment.course_id}`
  );

  // Check if course has a certificate template configured
  const course = await db.findById<any>("courses", enrollment.course_id);
  if (course?.certificate_template_id) {
    // Certificate generation is handled by the certificate service via the event
    logger.info(
      `Certificate generation triggered for enrollment ${enrollmentId}`
    );
  }

  return await db.findById<any>("enrollments", enrollmentId);
}

// ---------------------------------------------------------------------------
// Drop enrollment
// ---------------------------------------------------------------------------

export async function dropEnrollment(orgId: number, enrollmentId: string) {
  const db = getDB();

  const enrollment = await db.findOne<any>("enrollments", {
    id: enrollmentId,
    org_id: orgId,
  });
  if (!enrollment) {
    throw new NotFoundError("Enrollment", enrollmentId);
  }

  if (enrollment.status === "completed") {
    throw new BadRequestError("Cannot drop a completed enrollment");
  }

  if (enrollment.status === "dropped") {
    throw new BadRequestError("Enrollment is already dropped");
  }

  await db.update("enrollments", enrollmentId, {
    status: "dropped",
  });

  // Decrement enrollment count
  await db.raw(
    `UPDATE courses SET enrollment_count = GREATEST(enrollment_count - 1, 0) WHERE id = ?`,
    [enrollment.course_id]
  );

  logger.info(`Enrollment ${enrollmentId} dropped`);

  return await db.findById<any>("enrollments", enrollmentId);
}

// ---------------------------------------------------------------------------
// Get detailed progress for a user in a course
// ---------------------------------------------------------------------------

export async function getMyProgress(
  orgId: number,
  userId: number,
  courseId: string
) {
  const db = getDB();

  const enrollment = await db.findOne<any>("enrollments", {
    org_id: orgId,
    user_id: userId,
    course_id: courseId,
  });
  if (!enrollment) {
    throw new NotFoundError("Enrollment");
  }

  // Get all lessons with their progress status
  const lessons = await db.raw<any[]>(
    `SELECT l.id, l.title, l.module_id, l.content_type, l.duration_minutes,
            l.sort_order, l.is_mandatory, l.is_preview,
            m.title AS module_title, m.sort_order AS module_sort_order,
            lp.is_completed, lp.completed_at, lp.time_spent_minutes AS lesson_time_spent,
            lp.attempts
     FROM lessons l
     JOIN course_modules m ON m.id = l.module_id
     LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.enrollment_id = ?
     WHERE m.course_id = ?
     ORDER BY m.sort_order ASC, l.sort_order ASC`,
    [enrollment.id, courseId]
  );

  return {
    enrollment,
    lessons,
  };
}

// ---------------------------------------------------------------------------
// Update time spent
// ---------------------------------------------------------------------------

export async function updateTimeSpent(
  enrollmentId: string,
  minutes: number
) {
  const db = getDB();

  await db.raw(
    `UPDATE enrollments SET time_spent_minutes = time_spent_minutes + ? WHERE id = ?`,
    [minutes, enrollmentId]
  );
}

// ---------------------------------------------------------------------------
// Get recent activity
// ---------------------------------------------------------------------------

export async function getRecentActivity(
  orgId: number,
  userId: number,
  limit: number = 10
) {
  const db = getDB();

  const activity = await db.raw<any[]>(
    `SELECT lp.*, l.title AS lesson_title, l.content_type,
            c.title AS course_title, c.id AS course_id, c.slug AS course_slug,
            e.id AS enrollment_id
     FROM lesson_progress lp
     JOIN lessons l ON l.id = lp.lesson_id
     JOIN course_modules m ON m.id = l.module_id
     JOIN courses c ON c.id = m.course_id
     JOIN enrollments e ON e.id = lp.enrollment_id
     WHERE e.user_id = ? AND e.org_id = ?
     ORDER BY lp.updated_at DESC
     LIMIT ?`,
    [userId, orgId, limit]
  );

  return activity;
}

// ---------------------------------------------------------------------------
// Update progress (legacy / alias)
// ---------------------------------------------------------------------------

export async function updateProgress(
  orgId: number,
  enrollmentId: string,
  lessonId: string
) {
  return markLessonComplete(orgId, enrollmentId, lessonId);
}
