// ============================================================================
// MARKETPLACE SERVICE
// Content library and marketplace for reusable learning content.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters/index";
import { logger } from "../../utils/logger";
import { NotFoundError, BadRequestError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContentLibraryItem {
  id: string;
  org_id: number;
  title: string;
  description: string | null;
  content_type: string;
  content_url: string | null;
  thumbnail_url: string | null;
  category: string | null;
  tags: string | null;
  is_public: boolean;
  source: string | null;
  external_id: string | null;
  metadata: string | null;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}

interface ListFilters {
  page?: number;
  perPage?: number;
  content_type?: string;
  category?: string;
  is_public?: boolean;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
}

// ---------------------------------------------------------------------------
// List Items (paginated, filterable)
// ---------------------------------------------------------------------------

export async function listItems(
  orgId: number,
  filters: ListFilters = {}
): Promise<{ data: ContentLibraryItem[]; total: number; page: number; perPage: number }> {
  const db = getDB();

  const page = filters.page || 1;
  const perPage = filters.perPage || 20;
  const offset = (page - 1) * perPage;
  const sortField = filters.sort || "created_at";
  const sortOrder = filters.order || "desc";

  let whereClause = "cl.org_id = ?";
  const params: any[] = [orgId];

  if (filters.content_type) {
    whereClause += " AND cl.content_type = ?";
    params.push(filters.content_type);
  }

  if (filters.category) {
    whereClause += " AND cl.category = ?";
    params.push(filters.category);
  }

  if (filters.is_public !== undefined) {
    whereClause += " AND cl.is_public = ?";
    params.push(filters.is_public);
  }

  if (filters.search) {
    whereClause += " AND (cl.title LIKE ? OR cl.description LIKE ?)";
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  const countParams = [...params];

  const dataQuery = `
    SELECT cl.*
    FROM content_library cl
    WHERE ${whereClause}
    ORDER BY cl.${sortField} ${sortOrder}
    LIMIT ? OFFSET ?
  `;
  params.push(perPage, offset);

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM content_library cl
    WHERE ${whereClause}
  `;

  const [data, countResult] = await Promise.all([
    db.raw<ContentLibraryItem[]>(dataQuery, params),
    db.raw<any[]>(countQuery, countParams),
  ]);

  const total = countResult[0]?.total || 0;

  return { data, total, page, perPage };
}

// ---------------------------------------------------------------------------
// Get Item
// ---------------------------------------------------------------------------

export async function getItem(
  orgId: number,
  id: string
): Promise<ContentLibraryItem> {
  const db = getDB();

  const item = await db.findOne<ContentLibraryItem>("content_library", {
    id,
    org_id: orgId,
  });

  if (!item) {
    throw new NotFoundError("Content Library Item", id);
  }

  return item;
}

// ---------------------------------------------------------------------------
// Create Item
// ---------------------------------------------------------------------------

export async function createItem(
  orgId: number,
  userId: number,
  data: {
    title: string;
    description?: string;
    content_type: string;
    content_url?: string;
    thumbnail_url?: string;
    category?: string;
    tags?: string[];
    is_public?: boolean;
    source?: string;
    external_id?: string;
    metadata?: Record<string, any>;
  }
): Promise<ContentLibraryItem> {
  const db = getDB();

  if (!data.title) {
    throw new BadRequestError("Title is required.");
  }

  if (!data.content_type) {
    throw new BadRequestError("Content type is required.");
  }

  const id = uuidv4();

  const item = await db.create<ContentLibraryItem>("content_library", {
    id,
    org_id: orgId,
    title: data.title,
    description: data.description || null,
    content_type: data.content_type,
    content_url: data.content_url || null,
    thumbnail_url: data.thumbnail_url || null,
    category: data.category || null,
    tags: data.tags ? JSON.stringify(data.tags) : JSON.stringify([]),
    is_public: data.is_public || false,
    source: data.source || null,
    external_id: data.external_id || null,
    metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    created_by: userId,
  } as any);

  logger.info(`Content library item created: ${data.title} (${id}) by user ${userId}`);

  return item;
}

// ---------------------------------------------------------------------------
// Update Item
// ---------------------------------------------------------------------------

export async function updateItem(
  orgId: number,
  id: string,
  data: {
    title?: string;
    description?: string;
    content_type?: string;
    content_url?: string;
    thumbnail_url?: string;
    category?: string;
    tags?: string[];
    is_public?: boolean;
    source?: string;
    external_id?: string;
    metadata?: Record<string, any>;
  }
): Promise<ContentLibraryItem> {
  const db = getDB();

  const existing = await db.findOne<ContentLibraryItem>("content_library", {
    id,
    org_id: orgId,
  });

  if (!existing) {
    throw new NotFoundError("Content Library Item", id);
  }

  const updateData: Record<string, any> = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.content_type !== undefined) updateData.content_type = data.content_type;
  if (data.content_url !== undefined) updateData.content_url = data.content_url;
  if (data.thumbnail_url !== undefined) updateData.thumbnail_url = data.thumbnail_url;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.tags !== undefined) updateData.tags = JSON.stringify(data.tags);
  if (data.is_public !== undefined) updateData.is_public = data.is_public;
  if (data.source !== undefined) updateData.source = data.source;
  if (data.external_id !== undefined) updateData.external_id = data.external_id;
  if (data.metadata !== undefined) updateData.metadata = JSON.stringify(data.metadata);

  const updated = await db.update<ContentLibraryItem>("content_library", id, updateData);

  logger.info(`Content library item updated: ${id}`);

  return updated;
}

// ---------------------------------------------------------------------------
// Delete Item
// ---------------------------------------------------------------------------

export async function deleteItem(
  orgId: number,
  id: string
): Promise<void> {
  const db = getDB();

  const existing = await db.findOne<ContentLibraryItem>("content_library", {
    id,
    org_id: orgId,
  });

  if (!existing) {
    throw new NotFoundError("Content Library Item", id);
  }

  await db.delete("content_library", id);

  logger.info(`Content library item deleted: ${id}`);
}

// ---------------------------------------------------------------------------
// Import to Course
// ---------------------------------------------------------------------------

export async function importToCourse(
  orgId: number,
  itemId: string,
  courseId: string,
  moduleId: string
): Promise<any> {
  const db = getDB();

  // Verify item exists and belongs to org (or is public)
  const item = await db.raw<any[]>(
    `SELECT * FROM content_library WHERE id = ? AND (org_id = ? OR is_public = 1)`,
    [itemId, orgId]
  );

  if (!item || item.length === 0) {
    throw new NotFoundError("Content Library Item", itemId);
  }

  const contentItem = item[0];

  // Verify course exists
  const course = await db.findOne<any>("courses", {
    id: courseId,
    organization_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", courseId);
  }

  // Verify module exists and belongs to the course
  const module = await db.findOne<any>("course_modules", {
    id: moduleId,
    course_id: courseId,
  });
  if (!module) {
    throw new NotFoundError("Module", moduleId);
  }

  // Get the highest sort_order in the module
  const maxSortResult = await db.raw<any[]>(
    `SELECT MAX(sort_order) AS max_sort FROM lessons WHERE module_id = ?`,
    [moduleId]
  );
  const nextSort = (maxSortResult[0]?.max_sort || 0) + 1;

  // Create a lesson from the library item
  const lessonId = uuidv4();
  const lesson = await db.create<any>("lessons", {
    id: lessonId,
    module_id: moduleId,
    title: contentItem.title,
    description: contentItem.description || null,
    content_type: contentItem.content_type,
    content_url: contentItem.content_url || null,
    content_text: null,
    duration_minutes: 0,
    sort_order: nextSort,
    is_mandatory: true,
    is_preview: false,
  });

  logger.info(
    `Content library item ${itemId} imported as lesson ${lessonId} to course ${courseId} / module ${moduleId}`
  );

  return lesson;
}

// ---------------------------------------------------------------------------
// Get Public Items (cross-org marketplace)
// ---------------------------------------------------------------------------

export async function getPublicItems(
  filters: ListFilters = {}
): Promise<{ data: ContentLibraryItem[]; total: number; page: number; perPage: number }> {
  const db = getDB();

  const page = filters.page || 1;
  const perPage = filters.perPage || 20;
  const offset = (page - 1) * perPage;
  const sortField = filters.sort || "created_at";
  const sortOrder = filters.order || "desc";

  let whereClause = "cl.is_public = 1";
  const params: any[] = [];

  if (filters.content_type) {
    whereClause += " AND cl.content_type = ?";
    params.push(filters.content_type);
  }

  if (filters.category) {
    whereClause += " AND cl.category = ?";
    params.push(filters.category);
  }

  if (filters.search) {
    whereClause += " AND (cl.title LIKE ? OR cl.description LIKE ?)";
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  const countParams = [...params];

  const dataQuery = `
    SELECT cl.*
    FROM content_library cl
    WHERE ${whereClause}
    ORDER BY cl.${sortField} ${sortOrder}
    LIMIT ? OFFSET ?
  `;
  params.push(perPage, offset);

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM content_library cl
    WHERE ${whereClause}
  `;

  const [data, countResult] = await Promise.all([
    db.raw<ContentLibraryItem[]>(dataQuery, params),
    db.raw<any[]>(countQuery, countParams),
  ]);

  const total = countResult[0]?.total || 0;

  return { data, total, page, perPage };
}
