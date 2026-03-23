// ============================================================================
// MODULE SERVICE
// CRUD for course modules.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters/index";
import { NotFoundError, BadRequestError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// List modules ordered by sort_order
// ---------------------------------------------------------------------------

export async function listModules(courseId: string) {
  const db = getDB();

  const modules = await db.raw<any[]>(
    `SELECT * FROM course_modules
     WHERE course_id = ?
     ORDER BY sort_order ASC`,
    [courseId]
  );

  return modules;
}

// ---------------------------------------------------------------------------
// Get single module with lessons
// ---------------------------------------------------------------------------

export async function getModule(courseId: string, id: string) {
  const db = getDB();

  const mod = await db.findOne<any>("course_modules", {
    id,
    course_id: courseId,
  });
  if (!mod) {
    throw new NotFoundError("Module", id);
  }

  const lessons = await db.raw<any[]>(
    `SELECT * FROM lessons WHERE module_id = ? ORDER BY sort_order ASC`,
    [id]
  );

  return { ...mod, lessons };
}

// ---------------------------------------------------------------------------
// Create module
// ---------------------------------------------------------------------------

export async function createModule(
  orgId: number,
  courseId: string,
  data: {
    title: string;
    description?: string;
    sort_order?: number;
    is_published?: boolean;
  }
) {
  const db = getDB();

  // Validate course exists and belongs to org
  const course = await db.findOne<any>("courses", {
    id: courseId,
    organization_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", courseId);
  }

  // Auto-set sort_order if not provided
  let sortOrder = data.sort_order;
  if (sortOrder === undefined) {
    const maxOrder = await db.raw<any[]>(
      `SELECT MAX(sort_order) AS max_order FROM course_modules WHERE course_id = ?`,
      [courseId]
    );
    sortOrder = (maxOrder[0]?.max_order ?? -1) + 1;
  }

  const id = uuidv4();

  const mod = await db.create<any>("course_modules", {
    id,
    course_id: courseId,
    title: data.title,
    description: data.description || null,
    sort_order: sortOrder,
    is_published: data.is_published ?? false,
  });

  return mod;
}

// ---------------------------------------------------------------------------
// Update module
// ---------------------------------------------------------------------------

export async function updateModule(
  orgId: number,
  moduleId: string,
  data: Record<string, any>
) {
  const db = getDB();

  const mod = await db.findById<any>("course_modules", moduleId);
  if (!mod) {
    throw new NotFoundError("Module", moduleId);
  }

  // Validate course belongs to org
  const course = await db.findOne<any>("courses", {
    id: mod.course_id,
    organization_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", mod.course_id);
  }

  const updated = await db.update<any>("course_modules", moduleId, data);
  return updated;
}

// ---------------------------------------------------------------------------
// Delete module
// ---------------------------------------------------------------------------

export async function deleteModule(orgId: number, moduleId: string) {
  const db = getDB();

  const mod = await db.findById<any>("course_modules", moduleId);
  if (!mod) {
    throw new NotFoundError("Module", moduleId);
  }

  // Validate course belongs to org
  const course = await db.findOne<any>("courses", {
    id: mod.course_id,
    organization_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", mod.course_id);
  }

  await db.delete("course_modules", moduleId);

  return { deleted: true };
}

// ---------------------------------------------------------------------------
// Reorder modules
// ---------------------------------------------------------------------------

export async function reorderModules(
  orgId: number,
  courseId: string,
  orderedIds: string[]
) {
  const db = getDB();

  // Validate course belongs to org
  const course = await db.findOne<any>("courses", {
    id: courseId,
    organization_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", courseId);
  }

  // Validate all IDs belong to this course
  const existingModules = await db.raw<any[]>(
    `SELECT id FROM course_modules WHERE course_id = ?`,
    [courseId]
  );
  const existingIds = new Set(existingModules.map((m: any) => m.id));

  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      throw new BadRequestError(`Module ${id} does not belong to this course`);
    }
  }

  // Update sort_order for each module
  for (let i = 0; i < orderedIds.length; i++) {
    await db.update("course_modules", orderedIds[i], { sort_order: i });
  }

  return { reordered: true };
}
