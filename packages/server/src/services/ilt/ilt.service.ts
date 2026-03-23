// ============================================================================
// ILT (INSTRUCTOR-LED TRAINING) SERVICE
// Full ILT session management: CRUD, registration, attendance, reporting
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters/index";
import { findUserById } from "../../db/empcloud";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "../../utils/errors";
import { lmsEvents } from "../../events/index";
import { logger } from "../../utils/logger";
import type { QueryOptions } from "../../db/adapters/interface";

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

export async function listSessions(
  orgId: number,
  filters?: {
    page?: number;
    limit?: number;
    status?: string;
    course_id?: string;
    instructor_id?: number;
    start_date?: string;
    end_date?: string;
    sort?: string;
    order?: "asc" | "desc";
  }
) {
  const db = getDB();

  const queryOptions: QueryOptions = {
    page: filters?.page || 1,
    limit: filters?.limit || 20,
    filters: { org_id: orgId },
    sort: {
      field: filters?.sort || "start_time",
      order: filters?.order || "asc",
    },
  };

  if (filters?.status) queryOptions.filters!.status = filters.status;
  if (filters?.course_id) queryOptions.filters!.course_id = filters.course_id;
  if (filters?.instructor_id) queryOptions.filters!.instructor_id = filters.instructor_id;

  const result = await db.findMany<any>("ilt_sessions", queryOptions);

  // If date range filtering is needed, use raw query
  if (filters?.start_date || filters?.end_date) {
    const conditions: string[] = ["org_id = ?"];
    const params: any[] = [orgId];

    if (filters?.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }
    if (filters?.course_id) {
      conditions.push("course_id = ?");
      params.push(filters.course_id);
    }
    if (filters?.instructor_id) {
      conditions.push("instructor_id = ?");
      params.push(filters.instructor_id);
    }
    if (filters?.start_date) {
      conditions.push("start_time >= ?");
      params.push(new Date(filters.start_date));
    }
    if (filters?.end_date) {
      conditions.push("end_time <= ?");
      params.push(new Date(filters.end_date));
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;
    const sortField = filters?.sort || "start_time";
    const sortOrder = filters?.order || "asc";

    const countResult = await db.raw<any[]>(
      `SELECT COUNT(*) as total FROM ilt_sessions WHERE ${conditions.join(" AND ")}`,
      params
    );
    const total = countResult[0]?.total || 0;

    const data = await db.raw<any[]>(
      `SELECT * FROM ilt_sessions WHERE ${conditions.join(" AND ")} ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  return result;
}

export async function getSession(orgId: number, id: string) {
  const db = getDB();

  const session = await db.findOne<any>("ilt_sessions", {
    id,
    org_id: orgId,
  });
  if (!session) {
    throw new NotFoundError("ILT session", id);
  }

  // Get attendance list with user names
  const attendanceRecords = await db.raw<any[]>(
    `SELECT ia.id, ia.user_id, ia.status, ia.checked_in_at
     FROM ilt_attendance ia
     WHERE ia.session_id = ?
     ORDER BY ia.created_at ASC`,
    [id]
  );

  const attendance = await Promise.all(
    attendanceRecords.map(async (record: any) => {
      const user = await findUserById(record.user_id);
      return {
        ...record,
        user_name: user
          ? `${user.first_name} ${user.last_name}`
          : "Unknown User",
        user_email: user?.email || null,
      };
    })
  );

  // Get instructor name
  const instructor = await findUserById(session.instructor_id);

  return {
    ...session,
    instructor_name: instructor
      ? `${instructor.first_name} ${instructor.last_name}`
      : "Unknown Instructor",
    attendance,
  };
}

export async function createSession(
  orgId: number,
  data: {
    course_id?: string;
    title: string;
    description?: string;
    instructor_id: number;
    location?: string;
    meeting_url?: string;
    start_time: string;
    end_time: string;
    max_attendees?: number;
    materials_url?: string;
  }
) {
  const db = getDB();

  if (!data.title || !data.instructor_id || !data.start_time || !data.end_time) {
    throw new BadRequestError(
      "title, instructor_id, start_time, and end_time are required"
    );
  }

  // Validate instructor exists
  const instructor = await findUserById(data.instructor_id);
  if (!instructor) {
    throw new NotFoundError("Instructor", String(data.instructor_id));
  }

  const startTime = new Date(data.start_time);
  const endTime = new Date(data.end_time);

  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    throw new BadRequestError("Invalid start_time or end_time format");
  }
  if (endTime <= startTime) {
    throw new BadRequestError("end_time must be after start_time");
  }

  // Validate course exists if provided
  if (data.course_id) {
    const course = await db.findOne<any>("courses", {
      id: data.course_id,
      org_id: orgId,
    });
    if (!course) {
      throw new NotFoundError("Course", data.course_id);
    }
  }

  // Validate time slot: check instructor doesn't have overlapping session
  const overlap = await db.raw<any[]>(
    `SELECT id FROM ilt_sessions
     WHERE org_id = ? AND instructor_id = ? AND status = 'scheduled'
       AND start_time < ? AND end_time > ?`,
    [orgId, data.instructor_id, endTime, startTime]
  );
  if (overlap.length > 0) {
    throw new ConflictError(
      "Instructor has an overlapping session at this time"
    );
  }

  const id = uuidv4();
  const session = await db.create<any>("ilt_sessions", {
    id,
    org_id: orgId,
    course_id: data.course_id || null,
    title: data.title.trim(),
    description: data.description || null,
    instructor_id: data.instructor_id,
    location: data.location || null,
    meeting_url: data.meeting_url || null,
    start_time: startTime,
    end_time: endTime,
    max_attendees: data.max_attendees || null,
    enrolled_count: 0,
    status: "scheduled",
    materials_url: data.materials_url || null,
  });

  lmsEvents.emit("ilt.session_created", {
    sessionId: id,
    courseId: data.course_id || "",
    orgId,
    instructorId: data.instructor_id,
    scheduledAt: startTime,
    location: data.location,
  });

  logger.info(`ILT session created: ${id}`);
  return session;
}

export async function updateSession(
  orgId: number,
  id: string,
  data: {
    title?: string;
    description?: string;
    instructor_id?: number;
    location?: string;
    meeting_url?: string;
    start_time?: string;
    end_time?: string;
    max_attendees?: number;
    materials_url?: string;
  }
) {
  const db = getDB();

  const session = await db.findOne<any>("ilt_sessions", {
    id,
    org_id: orgId,
  });
  if (!session) {
    throw new NotFoundError("ILT session", id);
  }

  if (session.status === "cancelled" || session.status === "completed") {
    throw new BadRequestError(
      `Cannot update a ${session.status} session`
    );
  }

  const updateData: Record<string, any> = {};

  if (data.title !== undefined) updateData.title = data.title.trim();
  if (data.description !== undefined) updateData.description = data.description;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.meeting_url !== undefined) updateData.meeting_url = data.meeting_url;
  if (data.materials_url !== undefined) updateData.materials_url = data.materials_url;
  if (data.max_attendees !== undefined) updateData.max_attendees = data.max_attendees;

  if (data.instructor_id !== undefined) {
    const instructor = await findUserById(data.instructor_id);
    if (!instructor) {
      throw new NotFoundError("Instructor", String(data.instructor_id));
    }
    updateData.instructor_id = data.instructor_id;
  }

  if (data.start_time !== undefined) {
    const startTime = new Date(data.start_time);
    if (isNaN(startTime.getTime())) {
      throw new BadRequestError("Invalid start_time format");
    }
    updateData.start_time = startTime;
  }

  if (data.end_time !== undefined) {
    const endTime = new Date(data.end_time);
    if (isNaN(endTime.getTime())) {
      throw new BadRequestError("Invalid end_time format");
    }
    updateData.end_time = endTime;
  }

  // Validate end_time > start_time if either changed
  const finalStartTime = updateData.start_time || session.start_time;
  const finalEndTime = updateData.end_time || session.end_time;
  if (new Date(finalEndTime) <= new Date(finalStartTime)) {
    throw new BadRequestError("end_time must be after start_time");
  }

  if (Object.keys(updateData).length === 0) {
    return session;
  }

  const updated = await db.update<any>("ilt_sessions", id, updateData);
  logger.info(`ILT session updated: ${id}`);
  return updated;
}

export async function cancelSession(orgId: number, id: string) {
  const db = getDB();

  const session = await db.findOne<any>("ilt_sessions", {
    id,
    org_id: orgId,
  });
  if (!session) {
    throw new NotFoundError("ILT session", id);
  }

  if (session.status === "cancelled") {
    throw new BadRequestError("Session is already cancelled");
  }

  const updated = await db.update<any>("ilt_sessions", id, {
    status: "cancelled",
  });

  // Notify all registered attendees via notifications
  const attendees = await db.raw<any[]>(
    `SELECT user_id FROM ilt_attendance WHERE session_id = ?`,
    [id]
  );

  for (const attendee of attendees) {
    await db.create("notifications", {
      id: uuidv4(),
      org_id: orgId,
      user_id: attendee.user_id,
      type: "ilt_session_cancelled",
      title: "Session Cancelled",
      message: `The training session "${session.title}" scheduled for ${new Date(session.start_time).toLocaleString()} has been cancelled.`,
      reference_id: id,
      reference_type: "ilt_session",
      is_read: false,
    });
  }

  logger.info(`ILT session cancelled: ${id}, ${attendees.length} attendees notified`);
  return updated;
}

export async function completeSession(orgId: number, id: string) {
  const db = getDB();

  const session = await db.findOne<any>("ilt_sessions", {
    id,
    org_id: orgId,
  });
  if (!session) {
    throw new NotFoundError("ILT session", id);
  }

  if (session.status !== "scheduled" && session.status !== "in_progress") {
    throw new BadRequestError(
      `Cannot complete a ${session.status} session`
    );
  }

  const updated = await db.update<any>("ilt_sessions", id, {
    status: "completed",
  });

  logger.info(`ILT session completed: ${id}`);
  return updated;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function registerUser(
  orgId: number,
  sessionId: string,
  userId: number
) {
  const db = getDB();

  const session = await db.findOne<any>("ilt_sessions", {
    id: sessionId,
    org_id: orgId,
  });
  if (!session) {
    throw new NotFoundError("ILT session", sessionId);
  }

  if (session.status !== "scheduled") {
    throw new BadRequestError("Can only register for scheduled sessions");
  }

  // Check max_attendees
  if (
    session.max_attendees &&
    session.enrolled_count >= session.max_attendees
  ) {
    throw new BadRequestError("Session is full");
  }

  // Check not already registered
  const existing = await db.findOne<any>("ilt_attendance", {
    session_id: sessionId,
    user_id: userId,
  });
  if (existing) {
    throw new ConflictError("User is already registered for this session");
  }

  // Verify user exists
  const user = await findUserById(userId);
  if (!user || user.organization_id !== orgId) {
    throw new NotFoundError("User", String(userId));
  }

  const attendanceId = uuidv4();
  const attendance = await db.create<any>("ilt_attendance", {
    id: attendanceId,
    session_id: sessionId,
    user_id: userId,
    status: "registered",
  });

  // Increment enrolled_count
  await db.update("ilt_sessions", sessionId, {
    enrolled_count: session.enrolled_count + 1,
  });

  logger.info(`User ${userId} registered for ILT session ${sessionId}`);
  return attendance;
}

export async function unregisterUser(
  orgId: number,
  sessionId: string,
  userId: number
) {
  const db = getDB();

  const session = await db.findOne<any>("ilt_sessions", {
    id: sessionId,
    org_id: orgId,
  });
  if (!session) {
    throw new NotFoundError("ILT session", sessionId);
  }

  const attendance = await db.findOne<any>("ilt_attendance", {
    session_id: sessionId,
    user_id: userId,
  });
  if (!attendance) {
    throw new NotFoundError("Registration for this session");
  }

  await db.delete("ilt_attendance", attendance.id);

  // Decrement enrolled_count
  const newCount = Math.max(0, session.enrolled_count - 1);
  await db.update("ilt_sessions", sessionId, {
    enrolled_count: newCount,
  });

  logger.info(`User ${userId} unregistered from ILT session ${sessionId}`);
  return { sessionId, userId, unregistered: true };
}

export async function registerBulk(
  orgId: number,
  sessionId: string,
  userIds: number[]
) {
  const db = getDB();

  const session = await db.findOne<any>("ilt_sessions", {
    id: sessionId,
    org_id: orgId,
  });
  if (!session) {
    throw new NotFoundError("ILT session", sessionId);
  }

  if (session.status !== "scheduled") {
    throw new BadRequestError("Can only register for scheduled sessions");
  }

  if (!userIds || userIds.length === 0) {
    throw new BadRequestError("userIds array is required and cannot be empty");
  }

  // Check capacity
  if (
    session.max_attendees &&
    session.enrolled_count + userIds.length > session.max_attendees
  ) {
    throw new BadRequestError(
      `Not enough capacity. Available spots: ${session.max_attendees - session.enrolled_count}`
    );
  }

  const results: { userId: number; status: string; error?: string }[] = [];
  let registeredCount = 0;

  for (const userId of userIds) {
    // Check not already registered
    const existing = await db.findOne<any>("ilt_attendance", {
      session_id: sessionId,
      user_id: userId,
    });
    if (existing) {
      results.push({
        userId,
        status: "skipped",
        error: "Already registered",
      });
      continue;
    }

    // Verify user exists in org
    const user = await findUserById(userId);
    if (!user || user.organization_id !== orgId) {
      results.push({
        userId,
        status: "skipped",
        error: "User not found",
      });
      continue;
    }

    await db.create("ilt_attendance", {
      id: uuidv4(),
      session_id: sessionId,
      user_id: userId,
      status: "registered",
    });

    results.push({ userId, status: "registered" });
    registeredCount++;
  }

  // Update enrolled_count
  await db.update("ilt_sessions", sessionId, {
    enrolled_count: session.enrolled_count + registeredCount,
  });

  logger.info(
    `Bulk registration for ILT session ${sessionId}: ${registeredCount} registered`
  );
  return { sessionId, results, registered_count: registeredCount };
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export async function markAttendance(
  orgId: number,
  sessionId: string,
  attendanceData: { user_id: number; status: "attended" | "absent" | "excused" }[]
) {
  const db = getDB();

  const session = await db.findOne<any>("ilt_sessions", {
    id: sessionId,
    org_id: orgId,
  });
  if (!session) {
    throw new NotFoundError("ILT session", sessionId);
  }

  if (!attendanceData || attendanceData.length === 0) {
    throw new BadRequestError("attendanceData array is required");
  }

  const results: { userId: number; status: string; updated: boolean }[] = [];
  const now = new Date();

  for (const entry of attendanceData) {
    const record = await db.findOne<any>("ilt_attendance", {
      session_id: sessionId,
      user_id: entry.user_id,
    });

    if (!record) {
      results.push({
        userId: entry.user_id,
        status: entry.status,
        updated: false,
      });
      continue;
    }

    const updateData: Record<string, any> = { status: entry.status };
    if (entry.status === "attended") {
      updateData.checked_in_at = now;
    }

    await db.update("ilt_attendance", record.id, updateData);
    results.push({
      userId: entry.user_id,
      status: entry.status,
      updated: true,
    });
  }

  // Emit attendance marked event
  lmsEvents.emit("ilt.attendance_marked", {
    sessionId,
    courseId: session.course_id || "",
    orgId,
    attendees: attendanceData.map((a) => ({
      userId: a.user_id,
      status: a.status === "attended"
        ? "present"
        : a.status === "absent"
          ? "absent"
          : "late",
    })),
    markedBy: 0, // Will be set by the route handler
  });

  logger.info(`Attendance marked for ILT session ${sessionId}: ${results.length} entries`);
  return { sessionId, results };
}

export async function getSessionAttendance(orgId: number, sessionId: string) {
  const db = getDB();

  const session = await db.findOne<any>("ilt_sessions", {
    id: sessionId,
    org_id: orgId,
  });
  if (!session) {
    throw new NotFoundError("ILT session", sessionId);
  }

  const attendanceRecords = await db.raw<any[]>(
    `SELECT ia.id, ia.user_id, ia.status, ia.checked_in_at, ia.created_at
     FROM ilt_attendance ia
     WHERE ia.session_id = ?
     ORDER BY ia.created_at ASC`,
    [sessionId]
  );

  const attendance = await Promise.all(
    attendanceRecords.map(async (record: any) => {
      const user = await findUserById(record.user_id);
      return {
        ...record,
        user_name: user
          ? `${user.first_name} ${user.last_name}`
          : "Unknown User",
        user_email: user?.email || null,
      };
    })
  );

  return {
    session_id: sessionId,
    session_title: session.title,
    attendance,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getUserSessions(
  orgId: number,
  userId: number,
  filters?: { page?: number; limit?: number }
) {
  const db = getDB();
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const offset = (page - 1) * limit;

  const countResult = await db.raw<any[]>(
    `SELECT COUNT(*) as total
     FROM ilt_attendance ia
     INNER JOIN ilt_sessions s ON s.id = ia.session_id
     WHERE ia.user_id = ? AND s.org_id = ?`,
    [userId, orgId]
  );
  const total = countResult[0]?.total || 0;

  const sessions = await db.raw<any[]>(
    `SELECT s.*, ia.status as attendance_status, ia.checked_in_at
     FROM ilt_attendance ia
     INNER JOIN ilt_sessions s ON s.id = ia.session_id
     WHERE ia.user_id = ? AND s.org_id = ?
     ORDER BY s.start_time DESC
     LIMIT ? OFFSET ?`,
    [userId, orgId, limit, offset]
  );

  return {
    data: sessions,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getUpcomingSessions(
  orgId: number,
  limit?: number
) {
  const db = getDB();
  const now = new Date();
  const sessionLimit = limit || 10;

  const sessions = await db.raw<any[]>(
    `SELECT * FROM ilt_sessions
     WHERE org_id = ? AND start_time > ? AND status = 'scheduled'
     ORDER BY start_time ASC
     LIMIT ?`,
    [orgId, now, sessionLimit]
  );

  return sessions;
}

export async function getSessionStats(orgId: number, sessionId: string) {
  const db = getDB();

  const session = await db.findOne<any>("ilt_sessions", {
    id: sessionId,
    org_id: orgId,
  });
  if (!session) {
    throw new NotFoundError("ILT session", sessionId);
  }

  const registered = await db.count("ilt_attendance", {
    session_id: sessionId,
  });
  const attended = await db.count("ilt_attendance", {
    session_id: sessionId,
    status: "attended",
  });
  const absent = await db.count("ilt_attendance", {
    session_id: sessionId,
    status: "absent",
  });
  const excused = await db.count("ilt_attendance", {
    session_id: sessionId,
    status: "excused",
  });

  return {
    session_id: sessionId,
    registered_count: registered,
    attended_count: attended,
    absent_count: absent,
    excused_count: excused,
    attendance_rate:
      registered > 0
        ? Math.round((attended / registered) * 10000) / 100
        : 0,
    max_attendees: session.max_attendees,
    capacity_utilization:
      session.max_attendees
        ? Math.round((registered / session.max_attendees) * 10000) / 100
        : null,
  };
}
