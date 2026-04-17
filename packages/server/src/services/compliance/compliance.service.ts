// ============================================================================
// COMPLIANCE SERVICE
// Full compliance training management: assignments, records, dashboard, reminders
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters/index";
import {
  findUserById,
  findUsersByOrgId,
  getEmpCloudDB,
} from "../../db/empcloud";
import {
  NotFoundError,
  BadRequestError,
} from "../../utils/errors";
import { lmsEvents } from "../../events/index";
import { logger } from "../../utils/logger";
import type { QueryOptions } from "../../db/adapters/interface";

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export async function createAssignment(
  orgId: number,
  userId: number,
  data: {
    course_id: string;
    name: string;
    description?: string;
    assigned_to_type: "all" | "department" | "role" | "user";
    assigned_to_ids?: number[] | string[];
    due_date: string;
    is_recurring?: boolean;
    recurrence_interval_days?: number;
  }
) {
  const db = getDB();

  if (!data.course_id || !data.name || !data.due_date || !data.assigned_to_type) {
    throw new BadRequestError("course_id, name, due_date, and assigned_to_type are required");
  }

  // Validate course exists
  const course = await db.findOne<any>("courses", {
    id: data.course_id,
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", data.course_id);
  }

  const dueDate = new Date(data.due_date);
  if (isNaN(dueDate.getTime())) {
    throw new BadRequestError("Invalid due_date format");
  }

  const assignmentId = uuidv4();
  const assignment = await db.create<any>("compliance_assignments", {
    id: assignmentId,
    org_id: orgId,
    course_id: data.course_id,
    name: data.name.trim(),
    description: data.description || null,
    assigned_to_type: data.assigned_to_type,
    assigned_to_ids: data.assigned_to_ids
      ? JSON.stringify(data.assigned_to_ids)
      : null,
    due_date: dueDate,
    is_recurring: data.is_recurring ?? false,
    recurrence_interval_days: data.recurrence_interval_days || null,
    is_active: true,
    created_by: userId,
  });

  // Resolve affected users and generate compliance records
  const affectedUserIds = await resolveAffectedUsers(
    orgId,
    data.assigned_to_type,
    data.assigned_to_ids
  );

  for (const targetUserId of affectedUserIds) {
    const recordId = uuidv4();
    await db.create("compliance_records", {
      id: recordId,
      assignment_id: assignmentId,
      user_id: targetUserId,
      course_id: data.course_id,
      org_id: orgId,
      status: "not_started",
      due_date: dueDate,
    });

    lmsEvents.emit("compliance.assigned", {
      complianceId: recordId,
      courseId: data.course_id,
      userId: targetUserId,
      orgId,
      dueDate,
    });
  }

  logger.info(
    `Compliance assignment created: ${assignmentId}, ${affectedUserIds.length} records generated`
  );

  return { ...assignment, records_created: affectedUserIds.length };
}

async function resolveAffectedUsers(
  orgId: number,
  assignedToType: string,
  assignedToIds?: number[] | string[]
): Promise<number[]> {
  const empDb = getEmpCloudDB();

  switch (assignedToType) {
    case "all": {
      const users = await findUsersByOrgId(orgId);
      return users.map((u) => u.id);
    }
    case "department": {
      if (!assignedToIds || assignedToIds.length === 0) {
        throw new BadRequestError(
          "assigned_to_ids required for department assignment type"
        );
      }
      const deptIds = assignedToIds.map(Number);
      const users = await empDb("users")
        .where({ org_id: orgId, status: 1 })
        .whereIn("department_id", deptIds)
        .select("id");
      return users.map((u: any) => u.id);
    }
    case "role": {
      if (!assignedToIds || assignedToIds.length === 0) {
        throw new BadRequestError(
          "assigned_to_ids required for role assignment type"
        );
      }
      const roles = assignedToIds.map(String);
      const users = await empDb("users")
        .where({ org_id: orgId, status: 1 })
        .whereIn("role", roles)
        .select("id");
      return users.map((u: any) => u.id);
    }
    case "user": {
      if (!assignedToIds || assignedToIds.length === 0) {
        throw new BadRequestError(
          "assigned_to_ids required for user assignment type"
        );
      }
      return assignedToIds.map(Number);
    }
    default:
      throw new BadRequestError(`Invalid assigned_to_type: ${assignedToType}`);
  }
}

export async function listAssignments(
  orgId: number,
  filters?: {
    page?: number;
    limit?: number;
    is_active?: boolean;
    course_id?: string;
  }
) {
  const db = getDB();

  const queryOptions: QueryOptions = {
    page: filters?.page || 1,
    limit: filters?.limit || 20,
    filters: { org_id: orgId },
    sort: { field: "created_at", order: "desc" },
  };

  if (filters?.is_active !== undefined) {
    queryOptions.filters!.is_active = filters.is_active;
  }
  if (filters?.course_id) {
    queryOptions.filters!.course_id = filters.course_id;
  }

  return db.findMany<any>("compliance_assignments", queryOptions);
}

export async function getAssignment(orgId: number, id: string) {
  const db = getDB();

  const assignment = await db.findOne<any>("compliance_assignments", {
    id,
    org_id: orgId,
  });
  if (!assignment) {
    throw new NotFoundError("Compliance assignment", id);
  }

  // Completion stats
  const totalAssigned = await db.count("compliance_records", {
    assignment_id: id,
  });
  const completed = await db.count("compliance_records", {
    assignment_id: id,
    status: "completed",
  });
  const overdue = await db.count("compliance_records", {
    assignment_id: id,
    status: "overdue",
  });

  return {
    ...assignment,
    stats: {
      total_assigned: totalAssigned,
      completed,
      overdue,
      completion_rate:
        totalAssigned > 0
          ? Math.round((completed / totalAssigned) * 10000) / 100
          : 0,
    },
  };
}

export async function updateAssignment(
  orgId: number,
  id: string,
  data: {
    name?: string;
    description?: string;
    due_date?: string;
    is_recurring?: boolean;
    recurrence_interval_days?: number;
  }
) {
  const db = getDB();

  const assignment = await db.findOne<any>("compliance_assignments", {
    id,
    org_id: orgId,
  });
  if (!assignment) {
    throw new NotFoundError("Compliance assignment", id);
  }

  const updateData: Record<string, any> = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description;
  if (data.due_date !== undefined) {
    const dueDate = new Date(data.due_date);
    if (isNaN(dueDate.getTime())) {
      throw new BadRequestError("Invalid due_date format");
    }
    updateData.due_date = dueDate;
  }
  if (data.is_recurring !== undefined) updateData.is_recurring = data.is_recurring;
  if (data.recurrence_interval_days !== undefined) {
    updateData.recurrence_interval_days = data.recurrence_interval_days;
  }

  if (Object.keys(updateData).length === 0) {
    return assignment;
  }

  const updated = await db.update<any>("compliance_assignments", id, updateData);
  logger.info(`Compliance assignment updated: ${id}`);
  return updated;
}

export async function deactivateAssignment(orgId: number, id: string) {
  const db = getDB();

  const assignment = await db.findOne<any>("compliance_assignments", {
    id,
    org_id: orgId,
  });
  if (!assignment) {
    throw new NotFoundError("Compliance assignment", id);
  }

  const updated = await db.update<any>("compliance_assignments", id, {
    is_active: false,
  });
  logger.info(`Compliance assignment deactivated: ${id}`);
  return updated;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export async function getComplianceRecords(
  orgId: number,
  filters?: {
    page?: number;
    limit?: number;
    status?: string;
    user_id?: number;
    assignment_id?: string;
    course_id?: string;
  }
) {
  const db = getDB();

  const queryOptions: QueryOptions = {
    page: filters?.page || 1,
    limit: filters?.limit || 20,
    filters: { org_id: orgId },
    sort: { field: "due_date", order: "asc" },
  };

  if (filters?.status) queryOptions.filters!.status = filters.status;
  if (filters?.user_id) queryOptions.filters!.user_id = filters.user_id;
  if (filters?.assignment_id) queryOptions.filters!.assignment_id = filters.assignment_id;
  if (filters?.course_id) queryOptions.filters!.course_id = filters.course_id;

  const result = await db.findMany<any>("compliance_records", queryOptions);

  // Enrich with user name and course title.
  // Adapter camelizes: user_id → userId, course_id → courseId.
  const enriched = await Promise.all(
    result.data.map(async (record: any) => {
      const uid = record.userId ?? record.user_id;
      const cid = record.courseId ?? record.course_id;
      const aid = record.assignmentId ?? record.assignment_id;
      const [user, course] = await Promise.all([
        uid ? findUserById(uid).catch(() => null) : null,
        cid ? db.findById<any>("courses", cid).catch(() => null) : null,
      ]);
      return {
        ...record,
        user_id: uid,
        course_id: cid,
        assignment_id: aid,
        due_date: record.dueDate ?? record.due_date,
        user_name: user
          ? `${user.first_name} ${user.last_name}`
          : "Unknown User",
        userName: user
          ? `${user.first_name} ${user.last_name}`
          : "Unknown User",
        user_email: user?.email || null,
        course_title: course?.title || null,
        courseName: course?.title || null,
        compliance_type: course?.complianceType ?? course?.compliance_type ?? null,
        complianceType: course?.complianceType ?? course?.compliance_type ?? null,
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

export async function getUserComplianceRecords(
  orgId: number,
  userId: number,
  filters?: { page?: number; limit?: number; status?: string }
) {
  const db = getDB();

  const queryFilters: Record<string, any> = { org_id: orgId, user_id: userId };
  if (filters?.status) queryFilters.status = filters.status;

  const result = await db.findMany<any>("compliance_records", {
    page: filters?.page || 1,
    limit: filters?.limit || 20,
    filters: queryFilters,
    sort: { field: "due_date", order: "asc" },
  });

  // Enrich with course title and assignment name.
  // Adapter camelizes: course_id → courseId, assignment_id → assignmentId.
  const enriched = await Promise.all(
    result.data.map(async (record: any) => {
      const cid = record.courseId ?? record.course_id;
      const aid = record.assignmentId ?? record.assignment_id;
      const [course, assignment] = await Promise.all([
        cid ? db.findById<any>("courses", cid) : null,
        aid ? db.findById<any>("compliance_assignments", aid) : null,
      ]);
      // Derive progress from status for the frontend progress bar
      const progress =
        record.status === "completed" ? 100
        : record.status === "in_progress" ? 50
        : 0;

      return {
        ...record,
        course_id: cid,
        assignment_id: aid,
        // The page reads courseName (camelCase) and course_title (snake)
        course_title: course?.title || null,
        courseName: course?.title || null,
        assignment_name: assignment?.name || assignment?.title || null,
        assignmentName: assignment?.name || assignment?.title || null,
        assignment_description: assignment?.description || null,
        due_date: record.dueDate ?? record.due_date,
        completed_at: record.completedAt ?? record.completed_at,
        compliance_type: course?.complianceType ?? course?.compliance_type ?? null,
        complianceType: course?.complianceType ?? course?.compliance_type ?? null,
        progress,
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

export async function updateComplianceStatus(
  orgId: number,
  recordId: string,
  status: string
) {
  const db = getDB();

  const validStatuses = ["not_started", "in_progress", "completed", "overdue"];
  if (!validStatuses.includes(status)) {
    throw new BadRequestError(
      `Invalid status. Must be one of: ${validStatuses.join(", ")}`
    );
  }

  const record = await db.findOne<any>("compliance_records", {
    id: recordId,
    org_id: orgId,
  });
  if (!record) {
    throw new NotFoundError("Compliance record", recordId);
  }

  const updateData: Record<string, any> = { status };
  if (status === "completed") {
    updateData.completed_at = new Date();
  }

  const updated = await db.update<any>("compliance_records", recordId, updateData);
  logger.info(`Compliance record ${recordId} status updated to ${status}`);
  return updated;
}

export async function markCompleted(orgId: number, recordId: string) {
  const db = getDB();

  const record = await db.findOne<any>("compliance_records", {
    id: recordId,
    org_id: orgId,
  });
  if (!record) {
    throw new NotFoundError("Compliance record", recordId);
  }

  const now = new Date();
  const updated = await db.update<any>("compliance_records", recordId, {
    status: "completed",
    completed_at: now,
  });

  lmsEvents.emit("compliance.completed", {
    complianceId: recordId,
    courseId: record.course_id,
    userId: record.user_id,
    orgId,
    completedAt: now,
  });

  logger.info(`Compliance record completed: ${recordId}`);
  return updated;
}

// ---------------------------------------------------------------------------
// Scheduled / Batch Operations
// ---------------------------------------------------------------------------

export async function checkOverdue(orgId: number) {
  const db = getDB();
  const now = new Date();

  const overdueRecords = await db.raw<any[]>(
    `SELECT id, user_id, course_id
     FROM compliance_records
     WHERE org_id = ? AND due_date < ? AND status NOT IN ('completed')`,
    [orgId, now]
  );

  let updatedCount = 0;
  for (const record of overdueRecords) {
    await db.update("compliance_records", record.id, { status: "overdue" });
    updatedCount++;

    lmsEvents.emit("compliance.overdue", {
      complianceId: record.id,
      courseId: record.course_id,
      userId: record.user_id,
      orgId,
      dueDate: now,
    });
  }

  logger.info(`Compliance overdue check: ${updatedCount} records marked overdue for org ${orgId}`);
  return { updated_count: updatedCount };
}

export async function getComplianceDashboard(orgId: number) {
  const db = getDB();

  // MySQL stores boolean as tinyint(1), so pass 1 instead of true
  const totalAssignments = await db.count("compliance_assignments", {
    org_id: orgId,
    is_active: 1,
  });

  const totalRecords = await db.count("compliance_records", { org_id: orgId });
  const completedRecords = await db.count("compliance_records", {
    org_id: orgId,
    status: "completed",
  });
  const overdueRecords = await db.count("compliance_records", {
    org_id: orgId,
    status: "overdue",
  });
  const inProgressRecords = await db.count("compliance_records", {
    org_id: orgId,
    status: "in_progress",
  });
  const notStartedRecords = await db.count("compliance_records", {
    org_id: orgId,
    status: "not_started",
  });

  // Department breakdown using empcloud DB + compliance records.
  // Wrapped in try-catch so a cross-DB permission issue doesn't crash
  // the entire dashboard — the basic stats still show up.
  let departmentBreakdown: any[] = [];
  try {
    departmentBreakdown = await db.raw<any[]>(
      `SELECT u.department_id,
              COUNT(cr.id) as total,
              SUM(CASE WHEN cr.status = 'completed' THEN 1 ELSE 0 END) as completed,
              SUM(CASE WHEN cr.status = 'overdue' THEN 1 ELSE 0 END) as overdue
       FROM compliance_records cr
       LEFT JOIN (SELECT id, department_id FROM ${getEmpCloudDBName()}.users WHERE org_id = ?) u
         ON u.id = cr.user_id
       WHERE cr.org_id = ?
       GROUP BY u.department_id`,
      [orgId, orgId]
    );
  } catch (err) {
    logger.warn("Department breakdown query failed (cross-DB access issue?)", err);
  }

  return {
    total_assignments: totalAssignments,
    total_records: totalRecords,
    completed: completedRecords,
    overdue: overdueRecords,
    in_progress: inProgressRecords,
    not_started: notStartedRecords,
    completion_rate:
      totalRecords > 0
        ? Math.round((completedRecords / totalRecords) * 10000) / 100
        : 0,
    by_department: departmentBreakdown,
  };
}

function getEmpCloudDBName(): string {
  // Fallback: query the empcloud db name from its connection
  // In practice this is configured via environment
  try {
    const empDb = getEmpCloudDB();
    const clientConfig = (empDb as any).client?.config?.connection;
    return clientConfig?.database || "empcloud";
  } catch {
    return "empcloud";
  }
}

// ---------------------------------------------------------------------------
// Policy Acceptance
// ---------------------------------------------------------------------------

export async function acceptPolicy(
  orgId: number,
  userId: number,
  data: {
    course_id: string;
    enrollment_id?: string;
    policy_version?: number;
    ip_address?: string;
    user_agent?: string;
  }
) {
  const db = getDB();

  if (!data.course_id) {
    throw new BadRequestError("course_id is required");
  }

  // Validate course exists and is a policy-type compliance course
  const course = await db.findOne<any>("courses", {
    id: data.course_id,
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", data.course_id);
  }

  const complianceType = course.complianceType ?? course.compliance_type;
  const isCompliance = course.isCompliance ?? course.is_compliance;
  if (!isCompliance || complianceType !== "policy") {
    throw new BadRequestError("This course is not a policy-type compliance course");
  }

  // Check for existing acceptance of this version
  const version = data.policy_version ?? 1;
  const existing = await db.findOne<any>("policy_acceptances", {
    org_id: orgId,
    user_id: userId,
    course_id: data.course_id,
    policy_version: version,
  });
  if (existing) {
    return existing; // Already accepted
  }

  const acceptanceId = uuidv4();
  const now = new Date();
  const acceptance = await db.create<any>("policy_acceptances", {
    id: acceptanceId,
    org_id: orgId,
    user_id: userId,
    course_id: data.course_id,
    enrollment_id: data.enrollment_id || null,
    policy_version: version,
    accepted_at: now,
    ip_address: data.ip_address || null,
    user_agent: data.user_agent || null,
  });

  // If there's a compliance record for this user+course, mark it completed
  const complianceRecord = await db.findOne<any>("compliance_records", {
    org_id: orgId,
    user_id: userId,
    course_id: data.course_id,
  });
  if (complianceRecord) {
    const recordId = complianceRecord.id ?? complianceRecord.id;
    await db.update("compliance_records", recordId, {
      status: "completed",
      completed_at: now,
    });

    lmsEvents.emit("compliance.completed", {
      complianceId: recordId,
      courseId: data.course_id,
      userId,
      orgId,
      completedAt: now,
    });
  }

  logger.info(`Policy accepted: user=${userId}, course=${data.course_id}, version=${version}`);
  return acceptance;
}

export async function getUserPolicyAcceptances(
  orgId: number,
  userId: number,
  courseId?: string
) {
  const db = getDB();
  const filters: Record<string, any> = { org_id: orgId, user_id: userId };
  if (courseId) filters.course_id = courseId;

  const result = await db.findMany<any>("policy_acceptances", {
    filters,
    sort: { field: "accepted_at", order: "desc" },
    limit: 100,
  });
  return result.data;
}

export async function processRecurringAssignments(orgId: number) {
  const db = getDB();

  // Find recurring assignments where all records are completed
  const recurringAssignments = await db.raw<any[]>(
    `SELECT ca.id, ca.course_id, ca.assigned_to_type, ca.assigned_to_ids,
            ca.recurrence_interval_days
     FROM compliance_assignments ca
     WHERE ca.org_id = ? AND ca.is_recurring = true AND ca.is_active = true
       AND ca.recurrence_interval_days IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM compliance_records cr
         WHERE cr.assignment_id = ca.id AND cr.status != 'completed'
       )`,
    [orgId]
  );

  let createdCount = 0;

  for (const assignment of recurringAssignments) {
    // Get the latest completion date for this assignment
    const latestCompletion = await db.raw<any[]>(
      `SELECT MAX(completed_at) as last_completed
       FROM compliance_records
       WHERE assignment_id = ?`,
      [assignment.id]
    );

    const lastCompleted = latestCompletion[0]?.last_completed;
    if (!lastCompleted) continue;

    const newDueDate = new Date(lastCompleted);
    newDueDate.setDate(
      newDueDate.getDate() + assignment.recurrence_interval_days
    );

    // Resolve affected users
    let assignedToIds: any[] | undefined;
    if (assignment.assigned_to_ids) {
      try {
        assignedToIds =
          typeof assignment.assigned_to_ids === "string"
            ? JSON.parse(assignment.assigned_to_ids)
            : assignment.assigned_to_ids;
      } catch {
        assignedToIds = undefined;
      }
    }

    const affectedUserIds = await resolveAffectedUsers(
      orgId,
      assignment.assigned_to_type,
      assignedToIds
    );

    for (const targetUserId of affectedUserIds) {
      // Check if a record already exists for this cycle
      const existing = await db.findOne<any>("compliance_records", {
        assignment_id: assignment.id,
        user_id: targetUserId,
        due_date: newDueDate,
      });
      if (existing) continue;

      // Delete old completed record to allow new one (unique constraint)
      await db.deleteMany("compliance_records", {
        assignment_id: assignment.id,
        user_id: targetUserId,
      });

      const recordId = uuidv4();
      await db.create("compliance_records", {
        id: recordId,
        assignment_id: assignment.id,
        user_id: targetUserId,
        course_id: assignment.course_id,
        org_id: orgId,
        status: "not_started",
        due_date: newDueDate,
      });
      createdCount++;
    }

    // Update assignment due_date
    await db.update("compliance_assignments", assignment.id, {
      due_date: newDueDate,
    });
  }

  logger.info(
    `Recurring assignments processed for org ${orgId}: ${createdCount} new records`
  );
  return { processed_assignments: recurringAssignments.length, new_records: createdCount };
}

export async function sendReminders(orgId: number) {
  const db = getDB();
  const now = new Date();
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  // Find records due within 7 days that are not completed and haven't been reminded today
  const records = await db.raw<any[]>(
    `SELECT cr.id, cr.user_id, cr.course_id, cr.due_date, cr.last_reminder_sent_at,
            c.title as course_title
     FROM compliance_records cr
     INNER JOIN courses c ON c.id = cr.course_id
     WHERE cr.org_id = ?
       AND cr.due_date <= ?
       AND cr.due_date >= ?
       AND cr.status NOT IN ('completed')
       AND (cr.last_reminder_sent_at IS NULL OR cr.last_reminder_sent_at < DATE_SUB(NOW(), INTERVAL 1 DAY))`,
    [orgId, sevenDaysFromNow, now]
  );

  let reminderCount = 0;

  for (const record of records) {
    // In a production system, this would send an actual email/notification
    // For now, create a notification record
    await db.create("notifications", {
      id: uuidv4(),
      org_id: orgId,
      user_id: record.user_id,
      type: "compliance_reminder",
      title: "Compliance Training Reminder",
      message: `Your compliance training "${record.course_title}" is due on ${new Date(record.due_date).toLocaleDateString()}. Please complete it before the deadline.`,
      reference_id: record.id,
      reference_type: "compliance_record",
      is_read: false,
    });

    await db.update("compliance_records", record.id, {
      last_reminder_sent_at: now,
    });

    reminderCount++;
  }

  logger.info(`Compliance reminders sent for org ${orgId}: ${reminderCount} reminders`);
  return { reminders_sent: reminderCount };
}
