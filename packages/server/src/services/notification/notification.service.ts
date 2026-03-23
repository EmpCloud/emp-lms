// ============================================================================
// NOTIFICATION SERVICE
// Manages in-app notifications for LMS events (enrollment, completion, etc.).
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters/index";
import { logger } from "../../utils/logger";
import { NotFoundError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// List notifications for a user
// ---------------------------------------------------------------------------

export async function listNotifications(
  orgId: number,
  userId: number,
  opts: { page?: number; perPage?: number; unreadOnly?: boolean } = {}
) {
  const db = getDB();
  const page = opts.page ?? 1;
  const perPage = opts.perPage ?? 20;
  const offset = (page - 1) * perPage;

  let query = `SELECT * FROM notifications WHERE org_id = ? AND user_id = ?`;
  const params: any[] = [orgId, userId];

  if (opts.unreadOnly) {
    query += ` AND is_read = false`;
  }

  const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
  const [countResult] = await db.raw<any[]>(countQuery, params);
  const total = countResult?.total ?? 0;

  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
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
// Get unread count
// ---------------------------------------------------------------------------

export async function getUnreadCount(orgId: number, userId: number): Promise<number> {
  const db = getDB();
  const [result] = await db.raw<any[]>(
    `SELECT COUNT(*) as count FROM notifications WHERE org_id = ? AND user_id = ? AND is_read = false`,
    [orgId, userId]
  );
  return result?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Create notification
// ---------------------------------------------------------------------------

export async function createNotification(data: {
  orgId: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  referenceId?: string;
  referenceType?: string;
}) {
  const db = getDB();
  const id = uuidv4();

  const notification = await db.create<any>("notifications", {
    id,
    org_id: data.orgId,
    user_id: data.userId,
    type: data.type,
    title: data.title,
    message: data.message,
    reference_id: data.referenceId ?? null,
    reference_type: data.referenceType ?? null,
    is_read: false,
    read_at: null,
  });

  return notification;
}

// ---------------------------------------------------------------------------
// Mark notification as read
// ---------------------------------------------------------------------------

export async function markAsRead(orgId: number, userId: number, notificationId: string) {
  const db = getDB();
  const notification = await db.findOne<any>("notifications", {
    id: notificationId,
    org_id: orgId,
    user_id: userId,
  });

  if (!notification) {
    throw new NotFoundError("Notification", notificationId);
  }

  await db.update("notifications", notificationId, {
    is_read: true,
    read_at: new Date().toISOString(),
  });

  return { ...notification, is_read: true, read_at: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Mark all as read
// ---------------------------------------------------------------------------

export async function markAllAsRead(orgId: number, userId: number): Promise<number> {
  const db = getDB();
  const count = await db.updateMany(
    "notifications",
    { org_id: orgId, user_id: userId, is_read: false },
    { is_read: true, read_at: new Date().toISOString() }
  );
  return count;
}

// ---------------------------------------------------------------------------
// Delete notification
// ---------------------------------------------------------------------------

export async function deleteNotification(orgId: number, userId: number, notificationId: string) {
  const db = getDB();
  const notification = await db.findOne<any>("notifications", {
    id: notificationId,
    org_id: orgId,
    user_id: userId,
  });

  if (!notification) {
    throw new NotFoundError("Notification", notificationId);
  }

  await db.delete("notifications", notificationId);
  return true;
}

// ---------------------------------------------------------------------------
// Bulk create notifications (for compliance assignments etc.)
// ---------------------------------------------------------------------------

export async function createBulkNotifications(
  notifications: {
    orgId: number;
    userId: number;
    type: string;
    title: string;
    message: string;
    referenceId?: string;
    referenceType?: string;
  }[]
): Promise<number> {
  const db = getDB();
  const rows = notifications.map((n) => ({
    id: uuidv4(),
    org_id: n.orgId,
    user_id: n.userId,
    type: n.type,
    title: n.title,
    message: n.message,
    reference_id: n.referenceId ?? null,
    reference_type: n.referenceType ?? null,
    is_read: false,
    read_at: null,
  }));

  await db.createMany("notifications", rows);
  logger.info(`Created ${rows.length} bulk notifications`);
  return rows.length;
}
