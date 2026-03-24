// ============================================================================
// COURSE SERVICE
// Full CRUD + business logic for courses.
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
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// List courses (paginated, filterable)
// ---------------------------------------------------------------------------

export async function listCourses(
  orgId: number,
  filters: {
    page?: number;
    perPage?: number;
    sort?: string;
    order?: "asc" | "desc";
    search?: string;
    status?: string;
    category_id?: string;
    difficulty?: string;
    is_mandatory?: boolean;
    is_featured?: boolean;
    instructor_id?: number;
    tags?: string;
  }
) {
  const db = getDB();
  const page = filters.page || 1;
  const perPage = filters.perPage || 20;
  const offset = (page - 1) * perPage;
  const sortField = filters.sort || "created_at";
  const sortOrder = filters.order || "desc";

  let whereClause = "c.org_id = ?";
  const params: any[] = [orgId];

  if (filters.status) {
    whereClause += " AND c.status = ?";
    params.push(filters.status);
  }

  if (filters.category_id) {
    whereClause += " AND c.category_id = ?";
    params.push(filters.category_id);
  }

  if (filters.difficulty) {
    whereClause += " AND c.difficulty = ?";
    params.push(filters.difficulty);
  }

  if (filters.is_mandatory !== undefined) {
    whereClause += " AND c.is_mandatory = ?";
    params.push(filters.is_mandatory);
  }

  if (filters.is_featured !== undefined) {
    whereClause += " AND c.is_featured = ?";
    params.push(filters.is_featured);
  }

  if (filters.instructor_id) {
    whereClause += " AND c.instructor_id = ?";
    params.push(filters.instructor_id);
  }

  if (filters.search) {
    whereClause += " AND (c.title LIKE ? OR c.description LIKE ?)";
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  if (filters.tags) {
    const tagList = filters.tags.split(",").map((t) => t.trim());
    for (const tag of tagList) {
      whereClause += " AND JSON_CONTAINS(c.tags, ?)";
      params.push(JSON.stringify(tag));
    }
  }

  const countParams = [...params];

  const dataQuery = `
    SELECT c.*, cat.name AS category_name
    FROM courses c
    LEFT JOIN course_categories cat ON cat.id = c.category_id
    WHERE ${whereClause}
    ORDER BY c.${sortField} ${sortOrder}
    LIMIT ? OFFSET ?
  `;
  params.push(perPage, offset);

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM courses c
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
// Get single course with aggregated counts
// ---------------------------------------------------------------------------

export async function getCourse(orgId: number, id: string) {
  const db = getDB();

  const course = await db.findOne<any>("courses", {
    id,
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", id);
  }

  const [modulesCount, lessonsCount, quizzesCount, enrollmentCount] =
    await Promise.all([
      db.count("course_modules", { course_id: id }),
      db.raw<any[]>(
        `SELECT COUNT(*) AS total FROM lessons l
         JOIN course_modules m ON m.id = l.module_id
         WHERE m.course_id = ?`,
        [id]
      ),
      db.count("quizzes", { course_id: id }),
      db.count("enrollments", { course_id: id }),
    ]);

  return {
    ...course,
    modules_count: modulesCount,
    lessons_count: lessonsCount[0]?.total || 0,
    quizzes_count: quizzesCount,
    enrollment_count: enrollmentCount,
  };
}

// ---------------------------------------------------------------------------
// Create course
// ---------------------------------------------------------------------------

export async function createCourse(
  orgId: number,
  userId: number,
  data: {
    title: string;
    slug?: string;
    description?: string;
    short_description?: string;
    thumbnail_url?: string;
    category_id?: string;
    instructor_id?: number;
    difficulty?: string;
    duration_minutes?: number;
    is_mandatory?: boolean;
    is_featured?: boolean;
    max_enrollments?: number;
    tags?: string[];
    prerequisites?: string[];
    completion_criteria?: string;
    passing_score?: number;
    certificate_template_id?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const db = getDB();

  // Validate category exists if provided
  if (data.category_id) {
    const category = await db.findOne<any>("course_categories", {
      id: data.category_id,
      org_id: orgId,
    });
    if (!category) {
      throw new NotFoundError("Category", data.category_id);
    }
  }

  const id = uuidv4();
  const slug = data.slug || slugify(data.title);

  // Check slug uniqueness within org
  const existingSlug = await db.findOne<any>("courses", {
    slug,
    org_id: orgId,
  });
  if (existingSlug) {
    throw new ConflictError(`A course with slug '${slug}' already exists`);
  }

  const course = await db.create<any>("courses", {
    id,
    org_id: orgId,
    created_by: userId,
    title: data.title,
    slug,
    description: data.description || null,
    short_description: data.short_description || null,
    thumbnail_url: data.thumbnail_url || null,
    category_id: data.category_id || null,
    instructor_id: data.instructor_id || null,
    difficulty: data.difficulty || "beginner",
    duration_minutes: data.duration_minutes || 0,
    status: "draft",
    is_mandatory: data.is_mandatory || false,
    is_featured: data.is_featured || false,
    max_enrollments: data.max_enrollments || null,
    enrollment_count: 0,
    completion_count: 0,
    avg_rating: 0,
    rating_count: 0,
    tags: JSON.stringify(data.tags || []),
    prerequisites: JSON.stringify(data.prerequisites || []),
    completion_criteria: data.completion_criteria || "all_lessons",
    passing_score: data.passing_score ?? 70,
    certificate_template_id: data.certificate_template_id || null,
    metadata: JSON.stringify(data.metadata || {}),
    published_at: null,
  });

  lmsEvents.emit("course.created", {
    courseId: id,
    orgId,
    title: data.title,
    createdBy: userId,
  });

  logger.info(`Course created: ${data.title} (${id}) by user ${userId}`);

  return course;
}

// ---------------------------------------------------------------------------
// Update course
// ---------------------------------------------------------------------------

export async function updateCourse(
  orgId: number,
  id: string,
  data: Record<string, any>
) {
  const db = getDB();

  const course = await db.findOne<any>("courses", {
    id,
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", id);
  }

  const updateData: Record<string, any> = { ...data };

  // Regenerate slug if title changed
  if (data.title && data.title !== course.title) {
    const newSlug = data.slug || slugify(data.title);
    const existingSlug = await db.findOne<any>("courses", {
      slug: newSlug,
      org_id: orgId,
    });
    if (existingSlug && existingSlug.id !== id) {
      throw new ConflictError(`A course with slug '${newSlug}' already exists`);
    }
    updateData.slug = newSlug;
  }

  // Validate category if changed
  if (data.category_id && data.category_id !== course.category_id) {
    const category = await db.findOne<any>("course_categories", {
      id: data.category_id,
      org_id: orgId,
    });
    if (!category) {
      throw new NotFoundError("Category", data.category_id);
    }
  }

  if (updateData.tags) {
    updateData.tags = JSON.stringify(updateData.tags);
  }
  if (updateData.prerequisites) {
    updateData.prerequisites = JSON.stringify(updateData.prerequisites);
  }
  if (updateData.metadata) {
    updateData.metadata = JSON.stringify(updateData.metadata);
  }

  const updated = await db.update<any>("courses", id, updateData);
  return updated;
}

// ---------------------------------------------------------------------------
// Delete (soft delete → archive)
// ---------------------------------------------------------------------------

export async function deleteCourse(orgId: number, id: string) {
  const db = getDB();

  const course = await db.findOne<any>("courses", {
    id,
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", id);
  }

  // Check for active enrollments
  const activeEnrollments = await db.count("enrollments", {
    course_id: id,
    status: "enrolled",
  });
  const inProgressEnrollments = await db.count("enrollments", {
    course_id: id,
    status: "in_progress",
  });

  if (activeEnrollments > 0 || inProgressEnrollments > 0) {
    throw new BadRequestError(
      "Cannot archive course with active enrollments. Drop or complete enrollments first."
    );
  }

  const updated = await db.update<any>("courses", id, { status: "archived" });

  lmsEvents.emit("course.archived", {
    courseId: id,
    orgId,
    archivedBy: 0, // caller should set this
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Publish course
// ---------------------------------------------------------------------------

export async function publishCourse(orgId: number, id: string) {
  const db = getDB();

  const course = await db.findOne<any>("courses", {
    id,
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", id);
  }

  if (course.status === "published") {
    throw new BadRequestError("Course is already published");
  }

  // Validate: at least 1 module with 1 lesson
  const modules = await db.raw<any[]>(
    `SELECT m.id FROM course_modules m WHERE m.course_id = ?`,
    [id]
  );
  if (!modules || modules.length === 0) {
    throw new BadRequestError(
      "Course must have at least one module before publishing"
    );
  }

  const lessonsCount = await db.raw<any[]>(
    `SELECT COUNT(*) AS total FROM lessons l
     WHERE l.module_id IN (
       SELECT m.id FROM course_modules m WHERE m.course_id = ?
     )`,
    [id]
  );
  if (!lessonsCount[0]?.total || lessonsCount[0].total === 0) {
    throw new BadRequestError(
      "Course must have at least one lesson before publishing"
    );
  }

  const updated = await db.update<any>("courses", id, {
    status: "published",
    published_at: new Date().toISOString(),
  });

  lmsEvents.emit("course.published", {
    courseId: id,
    orgId,
    title: course.title,
    publishedBy: 0,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Unpublish course
// ---------------------------------------------------------------------------

export async function unpublishCourse(orgId: number, id: string) {
  const db = getDB();

  const course = await db.findOne<any>("courses", {
    id,
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", id);
  }

  if (course.status !== "published") {
    throw new BadRequestError("Course is not published");
  }

  const updated = await db.update<any>("courses", id, { status: "draft" });
  return updated;
}

// ---------------------------------------------------------------------------
// Duplicate course (deep copy)
// ---------------------------------------------------------------------------

export async function duplicateCourse(
  orgId: number,
  userId: number,
  id: string
) {
  const db = getDB();

  const course = await db.findOne<any>("courses", {
    id,
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", id);
  }

  const newCourseId = uuidv4();
  const newSlug = slugify(course.title) + "-copy";

  // Create duplicate course
  await db.create<any>("courses", {
    id: newCourseId,
    org_id: orgId,
    created_by: userId,
    title: `${course.title} (Copy)`,
    slug: newSlug,
    description: course.description,
    short_description: course.short_description,
    thumbnail_url: course.thumbnail_url,
    category_id: course.category_id,
    instructor_id: course.instructor_id,
    difficulty: course.difficulty,
    duration_minutes: course.duration_minutes,
    status: "draft",
    is_mandatory: course.is_mandatory,
    is_featured: false,
    max_enrollments: course.max_enrollments,
    enrollment_count: 0,
    completion_count: 0,
    avg_rating: 0,
    rating_count: 0,
    tags: course.tags,
    prerequisites: course.prerequisites,
    completion_criteria: course.completion_criteria,
    passing_score: course.passing_score,
    certificate_template_id: course.certificate_template_id,
    metadata: course.metadata,
    published_at: null,
  });

  // Duplicate modules, lessons, quizzes, questions
  const modules = await db.raw<any[]>(
    `SELECT * FROM course_modules WHERE course_id = ? ORDER BY sort_order`,
    [id]
  );

  for (const mod of modules) {
    const newModuleId = uuidv4();
    await db.create<any>("course_modules", {
      id: newModuleId,
      course_id: newCourseId,
      title: mod.title,
      description: mod.description,
      sort_order: mod.sort_order,
      is_published: false,
    });

    // Duplicate lessons
    const lessons = await db.raw<any[]>(
      `SELECT * FROM lessons WHERE module_id = ? ORDER BY sort_order`,
      [mod.id]
    );
    for (const lesson of lessons) {
      await db.create<any>("lessons", {
        id: uuidv4(),
        module_id: newModuleId,
        title: lesson.title,
        description: lesson.description,
        content_type: lesson.content_type,
        content_url: lesson.content_url,
        content_text: lesson.content_text,
        duration_minutes: lesson.duration_minutes,
        sort_order: lesson.sort_order,
        is_mandatory: lesson.is_mandatory,
        is_preview: lesson.is_preview,
      });
    }

    // Duplicate quizzes for this module
    const quizzes = await db.raw<any[]>(
      `SELECT * FROM quizzes WHERE course_id = ? AND module_id = ? ORDER BY sort_order`,
      [id, mod.id]
    );
    for (const quiz of quizzes) {
      const newQuizId = uuidv4();
      await db.create<any>("quizzes", {
        id: newQuizId,
        course_id: newCourseId,
        module_id: newModuleId,
        title: quiz.title,
        description: quiz.description,
        type: quiz.type,
        time_limit_minutes: quiz.time_limit_minutes,
        passing_score: quiz.passing_score,
        max_attempts: quiz.max_attempts,
        shuffle_questions: quiz.shuffle_questions,
        show_answers: quiz.show_answers,
        sort_order: quiz.sort_order,
      });

      // Duplicate questions
      const questions = await db.raw<any[]>(
        `SELECT * FROM questions WHERE quiz_id = ? ORDER BY sort_order`,
        [quiz.id]
      );
      for (const question of questions) {
        await db.create<any>("questions", {
          id: uuidv4(),
          quiz_id: newQuizId,
          type: question.type,
          text: question.text,
          explanation: question.explanation,
          points: question.points,
          sort_order: question.sort_order,
          options: question.options,
        });
      }
    }
  }

  // Duplicate course-level quizzes (module_id IS NULL)
  const courseQuizzes = await db.raw<any[]>(
    `SELECT * FROM quizzes WHERE course_id = ? AND module_id IS NULL ORDER BY sort_order`,
    [id]
  );
  for (const quiz of courseQuizzes) {
    const newQuizId = uuidv4();
    await db.create<any>("quizzes", {
      id: newQuizId,
      course_id: newCourseId,
      module_id: null,
      title: quiz.title,
      description: quiz.description,
      type: quiz.type,
      time_limit_minutes: quiz.time_limit_minutes,
      passing_score: quiz.passing_score,
      max_attempts: quiz.max_attempts,
      shuffle_questions: quiz.shuffle_questions,
      show_answers: quiz.show_answers,
      sort_order: quiz.sort_order,
    });

    const questions = await db.raw<any[]>(
      `SELECT * FROM questions WHERE quiz_id = ? ORDER BY sort_order`,
      [quiz.id]
    );
    for (const question of questions) {
      await db.create<any>("questions", {
        id: uuidv4(),
        quiz_id: newQuizId,
        type: question.type,
        text: question.text,
        explanation: question.explanation,
        points: question.points,
        sort_order: question.sort_order,
        options: question.options,
      });
    }
  }

  const newCourse = await db.findById<any>("courses", newCourseId);

  logger.info(`Course duplicated: ${course.title} -> ${newCourseId} by user ${userId}`);

  return newCourse;
}

// ---------------------------------------------------------------------------
// Course stats
// ---------------------------------------------------------------------------

export async function getCourseStats(orgId: number, id: string) {
  const db = getDB();

  const course = await db.findOne<any>("courses", {
    id,
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", id);
  }

  const [enrollmentCount, completionResult, avgScoreResult, avgRatingResult, timeSpentResult] =
    await Promise.all([
      db.count("enrollments", { course_id: id }),
      db.raw<any[]>(
        `SELECT COUNT(*) AS total FROM enrollments WHERE course_id = ? AND status = 'completed'`,
        [id]
      ),
      db.raw<any[]>(
        `SELECT AVG(score) AS avg_score FROM enrollments WHERE course_id = ? AND score IS NOT NULL`,
        [id]
      ),
      db.raw<any[]>(
        `SELECT AVG(rating) AS avg_rating FROM course_ratings WHERE course_id = ?`,
        [id]
      ),
      db.raw<any[]>(
        `SELECT SUM(time_spent_minutes) AS total_time FROM enrollments WHERE course_id = ?`,
        [id]
      ),
    ]);

  const completionCount = completionResult[0]?.total || 0;
  const completionRate =
    enrollmentCount > 0
      ? Math.round((completionCount / enrollmentCount) * 100)
      : 0;

  return {
    enrollment_count: enrollmentCount,
    completion_count: completionCount,
    completion_rate: completionRate,
    avg_score: Math.round((avgScoreResult[0]?.avg_score || 0) * 100) / 100,
    avg_rating: Math.round((avgRatingResult[0]?.avg_rating || 0) * 100) / 100,
    total_time_spent_minutes: timeSpentResult[0]?.total_time || 0,
  };
}

// ---------------------------------------------------------------------------
// Popular courses
// ---------------------------------------------------------------------------

export async function getPopularCourses(orgId: number, limit: number = 10) {
  const db = getDB();

  const courses = await db.raw<any[]>(
    `SELECT c.*, cat.name AS category_name
     FROM courses c
     LEFT JOIN course_categories cat ON cat.id = c.category_id
     WHERE c.org_id = ? AND c.status = 'published'
     ORDER BY c.enrollment_count DESC
     LIMIT ?`,
    [orgId, limit]
  );

  return courses;
}

// ---------------------------------------------------------------------------
// Recommended courses
// ---------------------------------------------------------------------------

export async function getRecommendedCourses(
  orgId: number,
  userId: number,
  limit: number = 10
) {
  const db = getDB();

  // Get user's preferred categories from learning profile
  const profile = await db.findOne<any>("user_learning_profiles", {
    user_id: userId,
    org_id: orgId,
  });

  let courses: any[];

  if (profile && profile.preferred_categories && profile.preferred_categories.length > 0) {
    const categories =
      typeof profile.preferred_categories === "string"
        ? JSON.parse(profile.preferred_categories)
        : profile.preferred_categories;

    if (categories.length > 0) {
      const placeholders = categories.map(() => "?").join(",");
      courses = await db.raw<any[]>(
        `SELECT c.*, cat.name AS category_name
         FROM courses c
         LEFT JOIN course_categories cat ON cat.id = c.category_id
         WHERE c.org_id = ?
           AND c.status = 'published'
           AND c.id NOT IN (
             SELECT e.course_id FROM enrollments e WHERE e.user_id = ?
           )
           AND c.category_id IN (${placeholders})
         ORDER BY c.enrollment_count DESC, c.avg_rating DESC
         LIMIT ?`,
        [orgId, userId, ...categories, limit]
      );
    } else {
      courses = await db.raw<any[]>(
        `SELECT c.*, cat.name AS category_name
         FROM courses c
         LEFT JOIN course_categories cat ON cat.id = c.category_id
         WHERE c.org_id = ?
           AND c.status = 'published'
           AND c.id NOT IN (
             SELECT e.course_id FROM enrollments e WHERE e.user_id = ?
           )
         ORDER BY c.enrollment_count DESC, c.avg_rating DESC
         LIMIT ?`,
        [orgId, userId, limit]
      );
    }
  } else {
    // No profile — return popular courses user hasn't enrolled in
    courses = await db.raw<any[]>(
      `SELECT c.*, cat.name AS category_name
       FROM courses c
       LEFT JOIN course_categories cat ON cat.id = c.category_id
       WHERE c.org_id = ?
         AND c.status = 'published'
         AND c.id NOT IN (
           SELECT e.course_id FROM enrollments e WHERE e.user_id = ?
         )
       ORDER BY c.enrollment_count DESC, c.avg_rating DESC
       LIMIT ?`,
      [orgId, userId, limit]
    );
  }

  return courses;
}
