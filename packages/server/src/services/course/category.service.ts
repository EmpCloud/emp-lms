// ============================================================================
// CATEGORY SERVICE
// CRUD for course categories.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters/index";
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
// List categories with course count
// ---------------------------------------------------------------------------

export async function listCategories(orgId: number) {
  // Use Knex's query builder (via the raw instance) so the return value is
  // always an unwrapped array of rows instead of the driver-specific
  // [rows, fields] tuple. The previous db.raw() path leaked the tuple
  // through sendSuccess and broke the client select dropdown.
  const { getKnex } = await import("../../db/adapters/knex.adapter");
  const knex = getKnex();

  const categories = await knex("course_categories as cat")
    .leftJoin("courses as c", function () {
      this.on("c.category_id", "=", "cat.id").andOn(
        knex.raw("c.status != ?", ["archived"])
      );
    })
    .where("cat.org_id", orgId)
    .groupBy("cat.id")
    .orderBy([
      { column: "cat.sort_order", order: "asc" },
      { column: "cat.name", order: "asc" },
    ])
    .select("cat.*", knex.raw("COUNT(c.id) AS course_count"));

  return categories;
}

// ---------------------------------------------------------------------------
// Get single category with subcategories
// ---------------------------------------------------------------------------

export async function getCategory(orgId: number, id: string) {
  const db = getDB();

  const category = await db.findOne<any>("course_categories", {
    id,
    org_id: orgId,
  });
  if (!category) {
    throw new NotFoundError("Category", id);
  }

  const subcategories = await db.raw<any[]>(
    `SELECT * FROM course_categories
     WHERE parent_id = ? AND org_id = ?
     ORDER BY sort_order ASC, name ASC`,
    [id, orgId]
  );

  return { ...category, subcategories };
}

// ---------------------------------------------------------------------------
// Create category
// ---------------------------------------------------------------------------

export async function createCategory(
  orgId: number,
  data: {
    name: string;
    slug?: string;
    description?: string;
    parent_id?: string;
    sort_order?: number;
    is_active?: boolean;
  }
) {
  const db = getDB();

  // Validate parent exists if provided
  if (data.parent_id) {
    const parent = await db.findOne<any>("course_categories", {
      id: data.parent_id,
      org_id: orgId,
    });
    if (!parent) {
      throw new NotFoundError("Parent category", data.parent_id);
    }
  }

  const id = uuidv4();
  const slug = data.slug || slugify(data.name);

  // Check slug uniqueness within org
  const existingSlug = await db.findOne<any>("course_categories", {
    slug,
    org_id: orgId,
  });
  if (existingSlug) {
    throw new ConflictError(`A category with slug '${slug}' already exists`);
  }

  const category = await db.create<any>("course_categories", {
    id,
    org_id: orgId,
    name: data.name,
    slug,
    description: data.description || null,
    parent_id: data.parent_id || null,
    sort_order: data.sort_order ?? 0,
    is_active: data.is_active ?? true,
  });

  return category;
}

// ---------------------------------------------------------------------------
// Update category
// ---------------------------------------------------------------------------

export async function updateCategory(
  orgId: number,
  id: string,
  data: Record<string, any>
) {
  const db = getDB();

  const category = await db.findOne<any>("course_categories", {
    id,
    org_id: orgId,
  });
  if (!category) {
    throw new NotFoundError("Category", id);
  }

  const updateData: Record<string, any> = { ...data };

  // Regenerate slug if name changed
  if (data.name && data.name !== category.name) {
    const newSlug = data.slug || slugify(data.name);
    const existingSlug = await db.findOne<any>("course_categories", {
      slug: newSlug,
      org_id: orgId,
    });
    if (existingSlug && existingSlug.id !== id) {
      throw new ConflictError(`A category with slug '${newSlug}' already exists`);
    }
    updateData.slug = newSlug;
  }

  // Validate parent if changed
  if (data.parent_id && data.parent_id !== category.parent_id) {
    if (data.parent_id === id) {
      throw new BadRequestError("Category cannot be its own parent");
    }
    const parent = await db.findOne<any>("course_categories", {
      id: data.parent_id,
      org_id: orgId,
    });
    if (!parent) {
      throw new NotFoundError("Parent category", data.parent_id);
    }
  }

  const updated = await db.update<any>("course_categories", id, updateData);
  return updated;
}

// ---------------------------------------------------------------------------
// Delete category
// ---------------------------------------------------------------------------

export async function deleteCategory(orgId: number, id: string) {
  const db = getDB();

  const category = await db.findOne<any>("course_categories", {
    id,
    org_id: orgId,
  });
  if (!category) {
    throw new NotFoundError("Category", id);
  }

  // Check for courses assigned to this category
  const courseCount = await db.count("courses", { category_id: id });
  if (courseCount > 0) {
    // Reassign courses to parent category (or null if no parent)
    await db.updateMany(
      "courses",
      { category_id: id },
      { category_id: category.parent_id || null }
    );
  }

  // Reassign subcategories to parent
  await db.updateMany(
    "course_categories",
    { parent_id: id, org_id: orgId },
    { parent_id: category.parent_id || null }
  );

  await db.delete("course_categories", id);

  return { deleted: true };
}
