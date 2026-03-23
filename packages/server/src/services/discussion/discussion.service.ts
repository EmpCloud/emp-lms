// ============================================================================
// DISCUSSION SERVICE
// Course and lesson discussions / Q&A threads.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters/index";
import { logger } from "../../utils/logger";
import { NotFoundError, ForbiddenError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// List discussions for a course
// ---------------------------------------------------------------------------

export async function listDiscussions(
  orgId: number,
  courseId: string,
  opts: { lessonId?: string; page?: number; perPage?: number } = {}
) {
  const db = getDB();
  const page = opts.page ?? 1;
  const perPage = opts.perPage ?? 20;
  const offset = (page - 1) * perPage;

  let query = `SELECT * FROM discussions WHERE org_id = ? AND course_id = ? AND parent_id IS NULL`;
  const params: any[] = [orgId, courseId];

  if (opts.lessonId) {
    query += ` AND lesson_id = ?`;
    params.push(opts.lessonId);
  }

  const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
  const [countResult] = await db.raw<any[]>(countQuery, params);
  const total = countResult?.total ?? 0;

  query += ` ORDER BY is_pinned DESC, created_at DESC LIMIT ? OFFSET ?`;
  params.push(perPage, offset);

  const data = await db.raw<any[]>(query, params);

  return {
    data,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  };
}

// ---------------------------------------------------------------------------
// Get single discussion with replies
// ---------------------------------------------------------------------------

export async function getDiscussion(orgId: number, discussionId: string) {
  const db = getDB();
  const discussion = await db.findOne<any>("discussions", {
    id: discussionId,
    org_id: orgId,
  });

  if (!discussion) {
    throw new NotFoundError("Discussion", discussionId);
  }

  const replies = await db.raw<any[]>(
    `SELECT * FROM discussions WHERE parent_id = ? AND org_id = ? ORDER BY created_at ASC`,
    [discussionId, orgId]
  );

  return { ...discussion, replies };
}

// ---------------------------------------------------------------------------
// Create discussion (top-level post)
// ---------------------------------------------------------------------------

export async function createDiscussion(
  orgId: number,
  userId: number,
  data: {
    course_id: string;
    lesson_id?: string;
    title?: string;
    content: string;
  }
) {
  const db = getDB();
  const id = uuidv4();

  const discussion = await db.create<any>("discussions", {
    id,
    course_id: data.course_id,
    lesson_id: data.lesson_id ?? null,
    user_id: userId,
    org_id: orgId,
    parent_id: null,
    title: data.title ?? null,
    content: data.content,
    is_pinned: false,
    is_resolved: false,
    reply_count: 0,
  });

  logger.info(`Discussion created: ${id} by user ${userId} in course ${data.course_id}`);
  return discussion;
}

// ---------------------------------------------------------------------------
// Reply to a discussion
// ---------------------------------------------------------------------------

export async function replyToDiscussion(
  orgId: number,
  userId: number,
  parentId: string,
  data: { content: string }
) {
  const db = getDB();

  const parent = await db.findOne<any>("discussions", {
    id: parentId,
    org_id: orgId,
  });
  if (!parent) {
    throw new NotFoundError("Discussion", parentId);
  }

  const id = uuidv4();
  const reply = await db.create<any>("discussions", {
    id,
    course_id: parent.course_id,
    lesson_id: parent.lesson_id,
    user_id: userId,
    org_id: orgId,
    parent_id: parentId,
    title: null,
    content: data.content,
    is_pinned: false,
    is_resolved: false,
    reply_count: 0,
  });

  // Increment parent reply count
  await db.raw(
    `UPDATE discussions SET reply_count = reply_count + 1 WHERE id = ?`,
    [parentId]
  );

  return reply;
}

// ---------------------------------------------------------------------------
// Update discussion
// ---------------------------------------------------------------------------

export async function updateDiscussion(
  orgId: number,
  userId: number,
  discussionId: string,
  data: { content?: string; title?: string }
) {
  const db = getDB();
  const discussion = await db.findOne<any>("discussions", {
    id: discussionId,
    org_id: orgId,
  });

  if (!discussion) {
    throw new NotFoundError("Discussion", discussionId);
  }

  if (discussion.user_id !== userId) {
    throw new ForbiddenError("You can only edit your own discussions");
  }

  const updates: Record<string, any> = {};
  if (data.content !== undefined) updates.content = data.content;
  if (data.title !== undefined) updates.title = data.title;

  await db.update("discussions", discussionId, updates);
  return { ...discussion, ...updates };
}

// ---------------------------------------------------------------------------
// Delete discussion
// ---------------------------------------------------------------------------

export async function deleteDiscussion(
  orgId: number,
  userId: number,
  discussionId: string,
  isAdmin: boolean = false
) {
  const db = getDB();
  const discussion = await db.findOne<any>("discussions", {
    id: discussionId,
    org_id: orgId,
  });

  if (!discussion) {
    throw new NotFoundError("Discussion", discussionId);
  }

  if (!isAdmin && discussion.user_id !== userId) {
    throw new ForbiddenError("You can only delete your own discussions");
  }

  await db.delete("discussions", discussionId);

  // Decrement parent reply count if this was a reply
  if (discussion.parent_id) {
    await db.raw(
      `UPDATE discussions SET reply_count = GREATEST(0, reply_count - 1) WHERE id = ?`,
      [discussion.parent_id]
    );
  }

  return true;
}

// ---------------------------------------------------------------------------
// Pin / unpin discussion
// ---------------------------------------------------------------------------

export async function togglePin(orgId: number, discussionId: string) {
  const db = getDB();
  const discussion = await db.findOne<any>("discussions", {
    id: discussionId,
    org_id: orgId,
  });

  if (!discussion) {
    throw new NotFoundError("Discussion", discussionId);
  }

  const isPinned = !discussion.is_pinned;
  await db.update("discussions", discussionId, { is_pinned: isPinned });
  return { ...discussion, is_pinned: isPinned };
}

// ---------------------------------------------------------------------------
// Resolve / unresolve discussion
// ---------------------------------------------------------------------------

export async function toggleResolve(orgId: number, discussionId: string) {
  const db = getDB();
  const discussion = await db.findOne<any>("discussions", {
    id: discussionId,
    org_id: orgId,
  });

  if (!discussion) {
    throw new NotFoundError("Discussion", discussionId);
  }

  const isResolved = !discussion.is_resolved;
  await db.update("discussions", discussionId, { is_resolved: isResolved });
  return { ...discussion, is_resolved: isResolved };
}
