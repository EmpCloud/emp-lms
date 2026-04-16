// ============================================================================
// LESSON SERVICE
// CRUD for lessons within course modules.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters/index";
import { NotFoundError, BadRequestError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// List lessons ordered by sort_order
// ---------------------------------------------------------------------------

export async function listLessons(moduleId: string) {
  const db = getDB();

  const lessons = await db.raw<any[]>(
    `SELECT * FROM lessons WHERE module_id = ? ORDER BY sort_order ASC`,
    [moduleId]
  );

  return lessons;
}

// ---------------------------------------------------------------------------
// Get single lesson
// ---------------------------------------------------------------------------

export async function getLesson(moduleId: string, id: string) {
  const db = getDB();

  const lesson = await db.findOne<any>("lessons", {
    id,
    module_id: moduleId,
  });
  if (!lesson) {
    throw new NotFoundError("Lesson", id);
  }

  return lesson;
}

// ---------------------------------------------------------------------------
// Create lesson
// ---------------------------------------------------------------------------

export async function createLesson(
  orgId: number,
  moduleId: string,
  data: {
    title: string;
    description?: string;
    content_type: string;
    content_url?: string;
    content_text?: string;
    duration_minutes?: number;
    sort_order?: number;
    is_mandatory?: boolean;
    is_preview?: boolean;
  }
) {
  const db = getDB();

  // Validate module exists and belongs to org
  const mod = await db.findById<any>("course_modules", moduleId);
  if (!mod) {
    throw new NotFoundError("Module", moduleId);
  }

  const course = await db.findOne<any>("courses", {
    id: (mod.courseId ?? mod.course_id),
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", (mod.courseId ?? mod.course_id));
  }

  // Auto-set sort_order if not provided
  let sortOrder = data.sort_order;
  if (sortOrder === undefined) {
    const maxOrder = await db.raw<any[]>(
      `SELECT MAX(sort_order) AS max_order FROM lessons WHERE module_id = ?`,
      [moduleId]
    );
    sortOrder = (maxOrder[0]?.max_order ?? -1) + 1;
  }

  const id = uuidv4();

  const lesson = await db.create<any>("lessons", {
    id,
    module_id: moduleId,
    title: data.title,
    description: data.description || null,
    content_type: data.content_type,
    content_url: data.content_url || null,
    content_text: data.content_text || null,
    duration_minutes: data.duration_minutes || 0,
    sort_order: sortOrder,
    is_mandatory: data.is_mandatory ?? true,
    is_preview: data.is_preview ?? false,
  });

  return lesson;
}

// ---------------------------------------------------------------------------
// Update lesson
// ---------------------------------------------------------------------------

export async function updateLesson(
  orgId: number,
  lessonId: string,
  data: Record<string, any>
) {
  const db = getDB();

  const lesson = await db.findById<any>("lessons", lessonId);
  if (!lesson) {
    throw new NotFoundError("Lesson", lessonId);
  }

  // Validate ownership via module -> course -> org
  const mod = await db.findById<any>("course_modules", (lesson.moduleId ?? lesson.module_id));
  if (!mod) {
    throw new NotFoundError("Module", (lesson.moduleId ?? lesson.module_id));
  }

  const course = await db.findOne<any>("courses", {
    id: (mod.courseId ?? mod.course_id),
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", (mod.courseId ?? mod.course_id));
  }

  const updated = await db.update<any>("lessons", lessonId, data);
  return updated;
}

// ---------------------------------------------------------------------------
// Delete lesson
// ---------------------------------------------------------------------------

export async function deleteLesson(orgId: number, lessonId: string) {
  const db = getDB();

  const lesson = await db.findById<any>("lessons", lessonId);
  if (!lesson) {
    throw new NotFoundError("Lesson", lessonId);
  }

  // Validate ownership
  const mod = await db.findById<any>("course_modules", (lesson.moduleId ?? lesson.module_id));
  if (!mod) {
    throw new NotFoundError("Module", (lesson.moduleId ?? lesson.module_id));
  }

  const course = await db.findOne<any>("courses", {
    id: (mod.courseId ?? mod.course_id),
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", (mod.courseId ?? mod.course_id));
  }

  await db.delete("lessons", lessonId);

  return { deleted: true };
}

// ---------------------------------------------------------------------------
// Reorder lessons
// ---------------------------------------------------------------------------

export async function reorderLessons(
  orgId: number,
  moduleId: string,
  orderedIds: string[]
) {
  const db = getDB();

  // Validate module belongs to org
  const mod = await db.findById<any>("course_modules", moduleId);
  if (!mod) {
    throw new NotFoundError("Module", moduleId);
  }

  const course = await db.findOne<any>("courses", {
    id: (mod.courseId ?? mod.course_id),
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", (mod.courseId ?? mod.course_id));
  }

  // Validate all IDs belong to this module
  const existingLessons = await db.raw<any[]>(
    `SELECT id FROM lessons WHERE module_id = ?`,
    [moduleId]
  );
  const existingIds = new Set(existingLessons.map((l: any) => l.id));

  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      throw new BadRequestError(`Lesson ${id} does not belong to this module`);
    }
  }

  for (let i = 0; i < orderedIds.length; i++) {
    await db.update("lessons", orderedIds[i], { sort_order: i });
  }

  return { reordered: true };
}

// ---------------------------------------------------------------------------
// Get preview lessons (is_preview = true) for a course
// ---------------------------------------------------------------------------

export async function getPreviewLessons(courseId: string) {
  const db = getDB();

  const lessons = await db.raw<any[]>(
    `SELECT l.*, m.title AS module_title
     FROM lessons l
     JOIN course_modules m ON m.id = l.module_id
     WHERE m.course_id = ? AND l.is_preview = true
     ORDER BY m.sort_order ASC, l.sort_order ASC`,
    [courseId]
  );

  return lessons;
}
