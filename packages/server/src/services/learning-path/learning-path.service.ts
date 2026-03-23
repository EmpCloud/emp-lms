// ============================================================================
// LEARNING PATH SERVICE
// Full learning path management: CRUD, course management, enrollment, progress
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters/index";
import { findUserById, findUsersByOrgId } from "../../db/empcloud";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "../../utils/errors";
import { lmsEvents } from "../../events/index";
import { logger } from "../../utils/logger";
import type { QueryOptions } from "../../db/adapters/interface";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Learning Path CRUD
// ---------------------------------------------------------------------------

export async function listLearningPaths(
  orgId: number,
  filters?: {
    page?: number;
    limit?: number;
    status?: string;
    difficulty?: string;
    is_mandatory?: boolean;
    search?: string;
    sort?: string;
    order?: "asc" | "desc";
  }
) {
  const db = getDB();
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;

  const queryOptions: QueryOptions = {
    page,
    limit,
    filters: { org_id: orgId },
    sort: {
      field: filters?.sort || "created_at",
      order: filters?.order || "desc",
    },
  };

  if (filters?.status) {
    queryOptions.filters!.status = filters.status;
  }
  if (filters?.difficulty) {
    queryOptions.filters!.difficulty = filters.difficulty;
  }
  if (filters?.is_mandatory !== undefined) {
    queryOptions.filters!.is_mandatory = filters.is_mandatory;
  }
  if (filters?.search) {
    queryOptions.search = { fields: ["title", "description"], term: filters.search };
  }

  const result = await db.findMany<any>("learning_paths", queryOptions);

  // Attach course count for each path
  const pathsWithCounts = await Promise.all(
    result.data.map(async (path: any) => {
      const courseCount = await db.count("learning_path_courses", {
        learning_path_id: path.id,
      });
      return { ...path, course_count: courseCount };
    })
  );

  return {
    data: pathsWithCounts,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  };
}

export async function getLearningPath(orgId: number, id: string) {
  const db = getDB();
  const path = await db.findOne<any>("learning_paths", { id, org_id: orgId });
  if (!path) {
    throw new NotFoundError("Learning path", id);
  }

  // Get courses with details via join
  const courses = await db.raw<any[]>(
    `SELECT lpc.id as learning_path_course_id, lpc.sort_order, lpc.is_mandatory,
            c.id, c.title, c.slug, c.description, c.thumbnail_url, c.difficulty,
            c.duration_minutes, c.status
     FROM learning_path_courses lpc
     INNER JOIN courses c ON c.id = lpc.course_id
     WHERE lpc.learning_path_id = ?
     ORDER BY lpc.sort_order ASC`,
    [id]
  );

  const totalDuration = courses.reduce(
    (sum: number, c: any) => sum + (c.duration_minutes || 0),
    0
  );

  return {
    ...path,
    courses,
    total_duration_minutes: totalDuration,
  };
}

export async function createLearningPath(
  orgId: number,
  userId: number,
  data: {
    title: string;
    description?: string;
    thumbnail_url?: string;
    difficulty?: string;
    is_mandatory?: boolean;
    sort_order?: number;
  }
) {
  const db = getDB();

  if (!data.title || !data.title.trim()) {
    throw new BadRequestError("Title is required");
  }

  let slug = slugify(data.title);

  // Ensure slug uniqueness within org
  const existing = await db.findOne<any>("learning_paths", {
    org_id: orgId,
    slug,
  });
  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }

  const id = uuidv4();
  const learningPath = await db.create<any>("learning_paths", {
    id,
    org_id: orgId,
    title: data.title.trim(),
    slug,
    description: data.description || null,
    thumbnail_url: data.thumbnail_url || null,
    difficulty: data.difficulty || null,
    is_mandatory: data.is_mandatory ?? false,
    sort_order: data.sort_order ?? 0,
    status: "draft",
    estimated_duration_minutes: 0,
    created_by: userId,
  });

  logger.info(`Learning path created: ${id} by user ${userId} in org ${orgId}`);
  return learningPath;
}

export async function updateLearningPath(
  orgId: number,
  id: string,
  data: {
    title?: string;
    description?: string;
    thumbnail_url?: string;
    difficulty?: string;
    is_mandatory?: boolean;
    sort_order?: number;
  }
) {
  const db = getDB();

  const path = await db.findOne<any>("learning_paths", { id, org_id: orgId });
  if (!path) {
    throw new NotFoundError("Learning path", id);
  }

  const updateData: Record<string, any> = {};

  if (data.title !== undefined) {
    updateData.title = data.title.trim();
    let slug = slugify(data.title);
    const existing = await db.findOne<any>("learning_paths", {
      org_id: orgId,
      slug,
    });
    if (existing && existing.id !== id) {
      slug = `${slug}-${Date.now()}`;
    }
    updateData.slug = slug;
  }
  if (data.description !== undefined) updateData.description = data.description;
  if (data.thumbnail_url !== undefined) updateData.thumbnail_url = data.thumbnail_url;
  if (data.difficulty !== undefined) updateData.difficulty = data.difficulty;
  if (data.is_mandatory !== undefined) updateData.is_mandatory = data.is_mandatory;
  if (data.sort_order !== undefined) updateData.sort_order = data.sort_order;

  if (Object.keys(updateData).length === 0) {
    return path;
  }

  const updated = await db.update<any>("learning_paths", id, updateData);
  logger.info(`Learning path updated: ${id}`);
  return updated;
}

export async function deleteLearningPath(orgId: number, id: string) {
  const db = getDB();

  const path = await db.findOne<any>("learning_paths", { id, org_id: orgId });
  if (!path) {
    throw new NotFoundError("Learning path", id);
  }

  await db.update<any>("learning_paths", id, { status: "archived" });
  logger.info(`Learning path archived: ${id}`);
  return { id, status: "archived" };
}

export async function publishLearningPath(orgId: number, id: string) {
  const db = getDB();

  const path = await db.findOne<any>("learning_paths", { id, org_id: orgId });
  if (!path) {
    throw new NotFoundError("Learning path", id);
  }

  const courseCount = await db.count("learning_path_courses", {
    learning_path_id: id,
  });
  if (courseCount === 0) {
    throw new BadRequestError(
      "Cannot publish a learning path with no courses"
    );
  }

  const duration = await calculatePathDuration(id);

  const updated = await db.update<any>("learning_paths", id, {
    status: "published",
    estimated_duration_minutes: duration,
  });

  logger.info(`Learning path published: ${id}`);
  return updated;
}

// ---------------------------------------------------------------------------
// Course Management
// ---------------------------------------------------------------------------

export async function addCourse(
  orgId: number,
  pathId: string,
  courseId: string,
  sortOrder?: number,
  isMandatory?: boolean
) {
  const db = getDB();

  const path = await db.findOne<any>("learning_paths", {
    id: pathId,
    org_id: orgId,
  });
  if (!path) {
    throw new NotFoundError("Learning path", pathId);
  }

  const course = await db.findOne<any>("courses", {
    id: courseId,
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", courseId);
  }

  const existing = await db.findOne<any>("learning_path_courses", {
    learning_path_id: pathId,
    course_id: courseId,
  });
  if (existing) {
    throw new ConflictError("Course is already in this learning path");
  }

  // If no sort_order provided, append to end
  if (sortOrder === undefined) {
    const maxOrder = await db.raw<any[]>(
      `SELECT COALESCE(MAX(sort_order), -1) as max_order
       FROM learning_path_courses
       WHERE learning_path_id = ?`,
      [pathId]
    );
    sortOrder = (maxOrder[0]?.max_order ?? -1) + 1;
  }

  const id = uuidv4();
  const record = await db.create<any>("learning_path_courses", {
    id,
    learning_path_id: pathId,
    course_id: courseId,
    sort_order: sortOrder,
    is_mandatory: isMandatory ?? true,
  });

  // Recalculate duration
  const duration = await calculatePathDuration(pathId);
  await db.update("learning_paths", pathId, {
    estimated_duration_minutes: duration,
  });

  logger.info(`Course ${courseId} added to learning path ${pathId}`);
  return record;
}

export async function removeCourse(
  orgId: number,
  pathId: string,
  courseId: string
) {
  const db = getDB();

  const path = await db.findOne<any>("learning_paths", {
    id: pathId,
    org_id: orgId,
  });
  if (!path) {
    throw new NotFoundError("Learning path", pathId);
  }

  const record = await db.findOne<any>("learning_path_courses", {
    learning_path_id: pathId,
    course_id: courseId,
  });
  if (!record) {
    throw new NotFoundError("Course in learning path");
  }

  await db.delete("learning_path_courses", record.id);

  // Recalculate duration
  const duration = await calculatePathDuration(pathId);
  await db.update("learning_paths", pathId, {
    estimated_duration_minutes: duration,
  });

  logger.info(`Course ${courseId} removed from learning path ${pathId}`);
  return { pathId, courseId, removed: true };
}

export async function reorderCourses(
  orgId: number,
  pathId: string,
  orderedCourseIds: string[]
) {
  const db = getDB();

  const path = await db.findOne<any>("learning_paths", {
    id: pathId,
    org_id: orgId,
  });
  if (!path) {
    throw new NotFoundError("Learning path", pathId);
  }

  for (let i = 0; i < orderedCourseIds.length; i++) {
    const record = await db.findOne<any>("learning_path_courses", {
      learning_path_id: pathId,
      course_id: orderedCourseIds[i],
    });
    if (record) {
      await db.update("learning_path_courses", record.id, {
        sort_order: i,
      });
    }
  }

  logger.info(`Courses reordered for learning path ${pathId}`);
  return { pathId, order: orderedCourseIds };
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

export async function enrollUser(
  orgId: number,
  userId: number,
  pathId: string
) {
  const db = getDB();

  const path = await db.findOne<any>("learning_paths", {
    id: pathId,
    org_id: orgId,
  });
  if (!path) {
    throw new NotFoundError("Learning path", pathId);
  }

  if (path.status !== "published") {
    throw new BadRequestError("Cannot enroll in an unpublished learning path");
  }

  // Check user exists
  const user = await findUserById(userId);
  if (!user || user.organization_id !== orgId) {
    throw new NotFoundError("User", String(userId));
  }

  // Check not already enrolled
  const existing = await db.findOne<any>("learning_path_enrollments", {
    user_id: userId,
    learning_path_id: pathId,
  });
  if (existing) {
    throw new ConflictError("User is already enrolled in this learning path");
  }

  const enrollmentId = uuidv4();
  const enrollment = await db.create<any>("learning_path_enrollments", {
    id: enrollmentId,
    org_id: orgId,
    user_id: userId,
    learning_path_id: pathId,
    status: "enrolled",
    progress_percentage: 0,
    enrolled_at: new Date(),
  });

  // Auto-enroll user in all courses in this path
  const pathCourses = await db.raw<any[]>(
    `SELECT course_id FROM learning_path_courses
     WHERE learning_path_id = ?
     ORDER BY sort_order ASC`,
    [pathId]
  );

  for (const pc of pathCourses) {
    const existingEnrollment = await db.findOne<any>("enrollments", {
      user_id: userId,
      course_id: pc.course_id,
    });
    if (!existingEnrollment) {
      await db.create("enrollments", {
        id: uuidv4(),
        org_id: orgId,
        user_id: userId,
        course_id: pc.course_id,
        status: "enrolled",
        progress_percentage: 0,
        enrolled_at: new Date(),
        time_spent_minutes: 0,
      });
    }
  }

  logger.info(`User ${userId} enrolled in learning path ${pathId}`);
  return enrollment;
}

export async function getEnrollment(
  orgId: number,
  userId: number,
  pathId: string
) {
  const db = getDB();

  const enrollment = await db.findOne<any>("learning_path_enrollments", {
    user_id: userId,
    learning_path_id: pathId,
    org_id: orgId,
  });
  if (!enrollment) {
    throw new NotFoundError("Learning path enrollment");
  }

  // Get per-course progress
  const courseProgress = await db.raw<any[]>(
    `SELECT lpc.course_id, lpc.sort_order, lpc.is_mandatory,
            c.title as course_title,
            e.status as enrollment_status, e.progress_percentage, e.completed_at
     FROM learning_path_courses lpc
     INNER JOIN courses c ON c.id = lpc.course_id
     LEFT JOIN enrollments e ON e.course_id = lpc.course_id AND e.user_id = ?
     WHERE lpc.learning_path_id = ?
     ORDER BY lpc.sort_order ASC`,
    [userId, pathId]
  );

  return {
    ...enrollment,
    courses: courseProgress,
  };
}

export async function listPathEnrollments(
  orgId: number,
  pathId: string,
  filters?: { page?: number; limit?: number }
) {
  const db = getDB();

  const path = await db.findOne<any>("learning_paths", {
    id: pathId,
    org_id: orgId,
  });
  if (!path) {
    throw new NotFoundError("Learning path", pathId);
  }

  const result = await db.findMany<any>("learning_path_enrollments", {
    page: filters?.page || 1,
    limit: filters?.limit || 20,
    filters: { learning_path_id: pathId, org_id: orgId },
    sort: { field: "enrolled_at", order: "desc" },
  });

  // Enrich with user names
  const enriched = await Promise.all(
    result.data.map(async (enrollment: any) => {
      const user = await findUserById(enrollment.user_id);
      return {
        ...enrollment,
        user_name: user
          ? `${user.first_name} ${user.last_name}`
          : "Unknown User",
        user_email: user?.email || null,
      };
    })
  );

  return {
    data: enriched,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  };
}

export async function listUserPathEnrollments(
  orgId: number,
  userId: number,
  filters?: { page?: number; limit?: number }
) {
  const db = getDB();

  const result = await db.findMany<any>("learning_path_enrollments", {
    page: filters?.page || 1,
    limit: filters?.limit || 20,
    filters: { user_id: userId, org_id: orgId },
    sort: { field: "enrolled_at", order: "desc" },
  });

  // Enrich with path details
  const enriched = await Promise.all(
    result.data.map(async (enrollment: any) => {
      const path = await db.findById<any>(
        "learning_paths",
        enrollment.learning_path_id
      );
      return {
        ...enrollment,
        learning_path_title: path?.title || null,
        learning_path_status: path?.status || null,
      };
    })
  );

  return {
    data: enriched,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
  };
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export async function updatePathProgress(
  orgId: number,
  userId: number,
  pathId: string
) {
  const db = getDB();

  const enrollment = await db.findOne<any>("learning_path_enrollments", {
    user_id: userId,
    learning_path_id: pathId,
    org_id: orgId,
  });
  if (!enrollment) {
    throw new NotFoundError("Learning path enrollment");
  }

  // Get all courses in path with their enrollment progress
  const courseProgress = await db.raw<any[]>(
    `SELECT lpc.course_id, lpc.is_mandatory,
            e.progress_percentage, e.status as enrollment_status
     FROM learning_path_courses lpc
     LEFT JOIN enrollments e ON e.course_id = lpc.course_id AND e.user_id = ?
     WHERE lpc.learning_path_id = ?`,
    [userId, pathId]
  );

  if (courseProgress.length === 0) {
    return enrollment;
  }

  // Calculate overall progress as average of all course progress percentages
  const totalProgress = courseProgress.reduce(
    (sum: number, cp: any) => sum + (parseFloat(cp.progress_percentage) || 0),
    0
  );
  const overallProgress = totalProgress / courseProgress.length;

  // Check if all mandatory courses are completed
  const mandatoryCourses = courseProgress.filter((cp: any) => cp.is_mandatory);
  const allMandatoryCompleted =
    mandatoryCourses.length > 0 &&
    mandatoryCourses.every(
      (cp: any) => cp.enrollment_status === "completed"
    );

  // Check if all courses completed
  const allCoursesCompleted = courseProgress.every(
    (cp: any) => cp.enrollment_status === "completed"
  );

  let newStatus = enrollment.status;
  const updateData: Record<string, any> = {
    progress_percentage: Math.round(overallProgress * 100) / 100,
  };

  if (overallProgress > 0 && newStatus === "enrolled") {
    newStatus = "in_progress";
    updateData.status = "in_progress";
  }

  if (allMandatoryCompleted && allCoursesCompleted) {
    newStatus = "completed";
    updateData.status = "completed";
    updateData.completed_at = new Date();

    lmsEvents.emit("learning_path.completed", {
      learningPathId: pathId,
      userId,
      orgId,
      completedAt: updateData.completed_at,
    });

    logger.info(
      `User ${userId} completed learning path ${pathId}`
    );
  }

  const updated = await db.update<any>(
    "learning_path_enrollments",
    enrollment.id,
    updateData
  );

  return updated;
}

export async function calculatePathDuration(pathId: string): Promise<number> {
  const db = getDB();

  const result = await db.raw<any[]>(
    `SELECT COALESCE(SUM(c.duration_minutes), 0) as total_duration
     FROM learning_path_courses lpc
     INNER JOIN courses c ON c.id = lpc.course_id
     WHERE lpc.learning_path_id = ?`,
    [pathId]
  );

  return result[0]?.total_duration || 0;
}
