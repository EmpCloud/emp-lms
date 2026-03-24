// ============================================================================
// ANALYTICS SERVICE
// Comprehensive LMS analytics and reporting.
// ============================================================================

import { getDB } from "../../db/adapters/index";
import { findUsersByOrgId } from "../../db/empcloud";
import { logger } from "../../utils/logger";
import { NotFoundError, BadRequestError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// Overview Dashboard
// ---------------------------------------------------------------------------

export async function getOverviewDashboard(orgId: number): Promise<any> {
  const db = getDB();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalCoursesResult,
    totalEnrollmentsResult,
    completedEnrollmentsResult,
    activeLearnersResult,
    avgRatingResult,
    totalTimeResult,
    totalCertificatesResult,
  ] = await Promise.all([
    db.raw<any[]>(
      `SELECT COUNT(*) AS total FROM courses WHERE org_id = ? AND status != 'archived'`,
      [orgId]
    ),
    db.raw<any[]>(
      `SELECT COUNT(*) AS total FROM enrollments WHERE org_id = ?`,
      [orgId]
    ),
    db.raw<any[]>(
      `SELECT COUNT(*) AS total FROM enrollments WHERE org_id = ? AND status = 'completed'`,
      [orgId]
    ),
    db.raw<any[]>(
      `SELECT COUNT(DISTINCT user_id) AS total FROM enrollments WHERE org_id = ? AND last_accessed_at >= ?`,
      [orgId, thirtyDaysAgo.toISOString()]
    ),
    db.raw<any[]>(
      `SELECT AVG(cr.rating) AS avg_rating FROM course_ratings cr WHERE cr.org_id = ?`,
      [orgId]
    ),
    db.raw<any[]>(
      `SELECT SUM(time_spent_minutes) AS total_time FROM enrollments WHERE org_id = ?`,
      [orgId]
    ),
    db.raw<any[]>(
      `SELECT COUNT(*) AS total FROM certificates WHERE org_id = ?`,
      [orgId]
    ),
  ]);

  const totalCourses = totalCoursesResult[0]?.total || 0;
  const totalEnrollments = totalEnrollmentsResult[0]?.total || 0;
  const completedEnrollments = completedEnrollmentsResult[0]?.total || 0;
  const completionRate =
    totalEnrollments > 0
      ? Math.round((completedEnrollments / totalEnrollments) * 100)
      : 0;

  return {
    total_courses: totalCourses,
    total_enrollments: totalEnrollments,
    completed_enrollments: completedEnrollments,
    completion_rate: completionRate,
    active_learners_30d: activeLearnersResult[0]?.total || 0,
    avg_course_rating:
      Math.round((avgRatingResult[0]?.avg_rating || 0) * 100) / 100,
    total_time_spent_minutes: totalTimeResult[0]?.total_time || 0,
    total_certificates_issued: totalCertificatesResult[0]?.total || 0,
  };
}

// ---------------------------------------------------------------------------
// Course Analytics
// ---------------------------------------------------------------------------

export async function getCourseAnalytics(
  orgId: number,
  courseId: string
): Promise<any> {
  const db = getDB();

  const course = await db.findOne<any>("courses", {
    id: courseId,
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", courseId);
  }

  const [
    enrollmentTrend,
    enrollmentCount,
    completionResult,
    avgScoreResult,
    avgTimeResult,
    ratingDistribution,
    moduleDropOff,
  ] = await Promise.all([
    // Enrollment trend by month (last 12 months)
    db.raw<any[]>(
      `SELECT DATE_FORMAT(enrolled_at, '%Y-%m') AS month, COUNT(*) AS count
       FROM enrollments
       WHERE course_id = ? AND org_id = ?
       GROUP BY month
       ORDER BY month DESC
       LIMIT 12`,
      [courseId, orgId]
    ),
    db.count("enrollments", { course_id: courseId, org_id: orgId }),
    db.raw<any[]>(
      `SELECT COUNT(*) AS total FROM enrollments WHERE course_id = ? AND org_id = ? AND status = 'completed'`,
      [courseId, orgId]
    ),
    db.raw<any[]>(
      `SELECT AVG(score) AS avg_score FROM enrollments WHERE course_id = ? AND org_id = ? AND score IS NOT NULL`,
      [courseId, orgId]
    ),
    db.raw<any[]>(
      `SELECT AVG(time_spent_minutes) AS avg_time FROM enrollments WHERE course_id = ? AND org_id = ?`,
      [courseId, orgId]
    ),
    // Rating distribution (1-5)
    db.raw<any[]>(
      `SELECT rating, COUNT(*) AS count FROM course_ratings WHERE course_id = ? AND org_id = ? GROUP BY rating ORDER BY rating`,
      [courseId, orgId]
    ),
    // Drop-off by module: count of users who completed each module's lessons
    db.raw<any[]>(
      `SELECT
         m.id AS module_id,
         m.title AS module_title,
         m.sort_order,
         COUNT(DISTINCT lp.enrollment_id) AS completions
       FROM course_modules m
       LEFT JOIN lessons l ON l.module_id = m.id
       LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.is_completed = 1
       WHERE m.course_id = ?
       GROUP BY m.id, m.title, m.sort_order
       ORDER BY m.sort_order`,
      [courseId]
    ),
  ]);

  const completedCount = completionResult[0]?.total || 0;
  const completionRate =
    enrollmentCount > 0
      ? Math.round((completedCount / enrollmentCount) * 100)
      : 0;

  return {
    course_id: courseId,
    course_title: course.title,
    enrollment_count: enrollmentCount,
    completion_count: completedCount,
    completion_rate: completionRate,
    avg_score: Math.round((avgScoreResult[0]?.avg_score || 0) * 100) / 100,
    avg_time_spent_minutes:
      Math.round((avgTimeResult[0]?.avg_time || 0) * 100) / 100,
    enrollment_trend: enrollmentTrend.reverse(),
    rating_distribution: ratingDistribution,
    module_drop_off: moduleDropOff,
  };
}

// ---------------------------------------------------------------------------
// User Analytics
// ---------------------------------------------------------------------------

export async function getUserAnalytics(
  orgId: number,
  userId: number
): Promise<any> {
  const db = getDB();

  const [
    enrolledResult,
    completedResult,
    inProgressResult,
    avgScoreResult,
    totalTimeResult,
    certificatesResult,
    complianceResult,
    profileResult,
  ] = await Promise.all([
    db.count("enrollments", { org_id: orgId, user_id: userId }),
    db.count("enrollments", {
      org_id: orgId,
      user_id: userId,
      status: "completed",
    }),
    db.count("enrollments", {
      org_id: orgId,
      user_id: userId,
      status: "in_progress",
    }),
    db.raw<any[]>(
      `SELECT AVG(score) AS avg_score FROM enrollments WHERE org_id = ? AND user_id = ? AND score IS NOT NULL`,
      [orgId, userId]
    ),
    db.raw<any[]>(
      `SELECT SUM(time_spent_minutes) AS total_time FROM enrollments WHERE org_id = ? AND user_id = ?`,
      [orgId, userId]
    ),
    db.raw<any[]>(
      `SELECT COUNT(*) AS total FROM certificates WHERE org_id = ? AND user_id = ?`,
      [orgId, userId]
    ),
    db.raw<any[]>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdue
       FROM compliance_records
       WHERE org_id = ? AND user_id = ?`,
      [orgId, userId]
    ),
    db.findOne<any>("user_learning_profiles", {
      org_id: orgId,
      user_id: userId,
    }),
  ]);

  const compliance = complianceResult[0] || {
    total: 0,
    completed: 0,
    overdue: 0,
  };
  const complianceRate =
    compliance.total > 0
      ? Math.round((compliance.completed / compliance.total) * 100)
      : 100;

  return {
    user_id: userId,
    courses_enrolled: enrolledResult,
    courses_completed: completedResult,
    courses_in_progress: inProgressResult,
    avg_score: Math.round((avgScoreResult[0]?.avg_score || 0) * 100) / 100,
    total_time_spent_minutes: totalTimeResult[0]?.total_time || 0,
    certificates_earned: certificatesResult[0]?.total || 0,
    compliance_total: compliance.total || 0,
    compliance_completed: compliance.completed || 0,
    compliance_overdue: compliance.overdue || 0,
    compliance_rate: complianceRate,
    current_streak_days: profileResult?.current_streak_days || 0,
    longest_streak_days: profileResult?.longest_streak_days || 0,
    total_points: profileResult?.total_points_earned || 0,
  };
}

// ---------------------------------------------------------------------------
// Org Analytics
// ---------------------------------------------------------------------------

export async function getOrgAnalytics(
  orgId: number,
  dateRange?: { start?: string; end?: string }
): Promise<any> {
  const db = getDB();

  let dateFilter = "";
  const dateParams: any[] = [];
  if (dateRange?.start) {
    dateFilter += " AND e.enrolled_at >= ?";
    dateParams.push(dateRange.start);
  }
  if (dateRange?.end) {
    dateFilter += " AND e.enrolled_at <= ?";
    dateParams.push(dateRange.end);
  }

  const [
    enrollmentTrend,
    completionTrend,
    topCourses,
    totalEnrollments,
    totalCompletions,
  ] = await Promise.all([
    // Enrollment trend by month
    db.raw<any[]>(
      `SELECT DATE_FORMAT(e.enrolled_at, '%Y-%m') AS month, COUNT(*) AS enrollments
       FROM enrollments e
       WHERE e.org_id = ? ${dateFilter}
       GROUP BY month
       ORDER BY month`,
      [orgId, ...dateParams]
    ),
    // Completion trend by month
    db.raw<any[]>(
      `SELECT DATE_FORMAT(e.completed_at, '%Y-%m') AS month, COUNT(*) AS completions
       FROM enrollments e
       WHERE e.org_id = ? AND e.status = 'completed' AND e.completed_at IS NOT NULL ${dateFilter}
       GROUP BY month
       ORDER BY month`,
      [orgId, ...dateParams]
    ),
    // Top courses by enrollment
    db.raw<any[]>(
      `SELECT c.id, c.title, c.enrollment_count, c.completion_count, c.avg_rating
       FROM courses c
       WHERE c.org_id = ? AND c.status = 'published'
       ORDER BY c.enrollment_count DESC
       LIMIT 10`,
      [orgId]
    ),
    db.raw<any[]>(
      `SELECT COUNT(*) AS total FROM enrollments e WHERE e.org_id = ? ${dateFilter}`,
      [orgId, ...dateParams]
    ),
    db.raw<any[]>(
      `SELECT COUNT(*) AS total FROM enrollments e WHERE e.org_id = ? AND e.status = 'completed' ${dateFilter}`,
      [orgId, ...dateParams]
    ),
  ]);

  return {
    total_enrollments: totalEnrollments[0]?.total || 0,
    total_completions: totalCompletions[0]?.total || 0,
    enrollment_trend: enrollmentTrend,
    completion_trend: completionTrend,
    top_courses: topCourses,
  };
}

// ---------------------------------------------------------------------------
// Department Analytics
// ---------------------------------------------------------------------------

export async function getDepartmentAnalytics(
  orgId: number,
  departmentId: number
): Promise<any> {
  const db = getDB();

  // Get department users from EmpCloud
  let departmentUserIds: number[] = [];
  try {
    const users = await findUsersByOrgId(orgId);
    departmentUserIds = users
      .filter((u) => u.department_id === departmentId)
      .map((u) => u.id);
  } catch (err: any) {
    logger.warn(`Failed to fetch department users: ${err.message}`);
  }

  if (departmentUserIds.length === 0) {
    return {
      department_id: departmentId,
      user_count: 0,
      courses_completed: 0,
      avg_completion_rate: 0,
      compliance_rate: 0,
    };
  }

  const placeholders = departmentUserIds.map(() => "?").join(",");

  const [completedResult, totalEnrolled, complianceResult] = await Promise.all([
    db.raw<any[]>(
      `SELECT COUNT(*) AS total FROM enrollments WHERE org_id = ? AND user_id IN (${placeholders}) AND status = 'completed'`,
      [orgId, ...departmentUserIds]
    ),
    db.raw<any[]>(
      `SELECT COUNT(*) AS total FROM enrollments WHERE org_id = ? AND user_id IN (${placeholders})`,
      [orgId, ...departmentUserIds]
    ),
    db.raw<any[]>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM compliance_records
       WHERE org_id = ? AND user_id IN (${placeholders})`,
      [orgId, ...departmentUserIds]
    ),
  ]);

  const totalEnrollments = totalEnrolled[0]?.total || 0;
  const completedCount = completedResult[0]?.total || 0;
  const avgCompletionRate =
    totalEnrollments > 0
      ? Math.round((completedCount / totalEnrollments) * 100)
      : 0;

  const compliance = complianceResult[0] || { total: 0, completed: 0 };
  const complianceRate =
    compliance.total > 0
      ? Math.round((compliance.completed / compliance.total) * 100)
      : 100;

  return {
    department_id: departmentId,
    user_count: departmentUserIds.length,
    total_enrollments: totalEnrollments,
    courses_completed: completedCount,
    avg_completion_rate: avgCompletionRate,
    compliance_total: compliance.total || 0,
    compliance_completed: compliance.completed || 0,
    compliance_rate: complianceRate,
  };
}

// ---------------------------------------------------------------------------
// Compliance Analytics
// ---------------------------------------------------------------------------

export async function getComplianceAnalytics(orgId: number): Promise<any> {
  const db = getDB();

  const [overallResult, byStatusResult, byCourseResult] = await Promise.all([
    db.raw<any[]>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdue,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status = 'not_started' THEN 1 ELSE 0 END) AS not_started
       FROM compliance_records
       WHERE org_id = ?`,
      [orgId]
    ),
    // Compliance by assignment
    db.raw<any[]>(
      `SELECT
         ca.id AS assignment_id,
         ca.name AS assignment_name,
         ca.course_id,
         ca.due_date,
         COUNT(cr.id) AS total_records,
         SUM(CASE WHEN cr.status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN cr.status = 'overdue' THEN 1 ELSE 0 END) AS overdue
       FROM compliance_assignments ca
       LEFT JOIN compliance_records cr ON cr.assignment_id = ca.id
       WHERE ca.org_id = ? AND ca.is_active = 1
       GROUP BY ca.id, ca.name, ca.course_id, ca.due_date
       ORDER BY ca.due_date`,
      [orgId]
    ),
    // By course
    db.raw<any[]>(
      `SELECT
         c.id AS course_id,
         c.title AS course_title,
         COUNT(cr.id) AS total_records,
         SUM(CASE WHEN cr.status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN cr.status = 'overdue' THEN 1 ELSE 0 END) AS overdue
       FROM compliance_records cr
       JOIN courses c ON c.id = cr.course_id
       WHERE cr.org_id = ?
       GROUP BY c.id, c.title`,
      [orgId]
    ),
  ]);

  const overall = overallResult[0] || {
    total: 0,
    completed: 0,
    overdue: 0,
    in_progress: 0,
    not_started: 0,
  };

  const completionRate =
    overall.total > 0
      ? Math.round((overall.completed / overall.total) * 100)
      : 0;

  return {
    total_assignments: overall.total || 0,
    completed: overall.completed || 0,
    overdue: overall.overdue || 0,
    in_progress: overall.in_progress || 0,
    not_started: overall.not_started || 0,
    completion_rate: completionRate,
    by_assignment: byStatusResult,
    by_course: byCourseResult,
  };
}

// ---------------------------------------------------------------------------
// Certificate Analytics
// ---------------------------------------------------------------------------

export async function getCertificateAnalytics(orgId: number): Promise<any> {
  const db = getDB();

  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const [overallResult, expiringResult, byCourseResult] = await Promise.all([
    db.raw<any[]>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired,
         SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END) AS revoked
       FROM certificates
       WHERE org_id = ?`,
      [orgId]
    ),
    db.raw<any[]>(
      `SELECT COUNT(*) AS total FROM certificates
       WHERE org_id = ? AND status = 'active'
         AND expires_at IS NOT NULL
         AND expires_at <= ?
         AND expires_at > NOW()`,
      [orgId, thirtyDaysFromNow.toISOString()]
    ),
    db.raw<any[]>(
      `SELECT
         c.id AS course_id,
         c.title AS course_title,
         COUNT(cert.id) AS total_issued,
         SUM(CASE WHEN cert.status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN cert.status = 'expired' THEN 1 ELSE 0 END) AS expired
       FROM certificates cert
       JOIN courses c ON c.id = cert.course_id
       WHERE cert.org_id = ?
       GROUP BY c.id, c.title
       ORDER BY total_issued DESC`,
      [orgId]
    ),
  ]);

  const overall = overallResult[0] || {
    total: 0,
    active: 0,
    expired: 0,
    revoked: 0,
  };

  return {
    total_issued: overall.total || 0,
    active: overall.active || 0,
    expired: overall.expired || 0,
    revoked: overall.revoked || 0,
    expiring_soon: expiringResult[0]?.total || 0,
    by_course: byCourseResult,
  };
}

// ---------------------------------------------------------------------------
// Instructor Analytics
// ---------------------------------------------------------------------------

export async function getInstructorAnalytics(
  orgId: number,
  instructorId: number
): Promise<any> {
  const db = getDB();

  const [sessionsResult, attendanceResult, coursesResult] = await Promise.all([
    // ILT sessions conducted
    db.raw<any[]>(
      `SELECT
         COUNT(*) AS total_sessions,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions
       FROM ilt_sessions
       WHERE org_id = ? AND instructor_id = ?`,
      [orgId, instructorId]
    ),
    // Total attendees and attendance rate
    db.raw<any[]>(
      `SELECT
         COUNT(ia.id) AS total_registrations,
         SUM(CASE WHEN ia.status = 'attended' THEN 1 ELSE 0 END) AS total_attended
       FROM ilt_attendance ia
       JOIN ilt_sessions s ON s.id = ia.session_id
       WHERE s.org_id = ? AND s.instructor_id = ?`,
      [orgId, instructorId]
    ),
    // Courses taught (as instructor)
    db.raw<any[]>(
      `SELECT c.id, c.title, c.enrollment_count, c.avg_rating
       FROM courses c
       WHERE c.org_id = ? AND c.instructor_id = ?
       ORDER BY c.enrollment_count DESC`,
      [orgId, instructorId]
    ),
  ]);

  const sessions = sessionsResult[0] || {
    total_sessions: 0,
    completed_sessions: 0,
  };
  const attendance = attendanceResult[0] || {
    total_registrations: 0,
    total_attended: 0,
  };

  const avgAttendanceRate =
    attendance.total_registrations > 0
      ? Math.round(
          (attendance.total_attended / attendance.total_registrations) * 100
        )
      : 0;

  return {
    instructor_id: instructorId,
    total_sessions: sessions.total_sessions || 0,
    completed_sessions: sessions.completed_sessions || 0,
    total_registrations: attendance.total_registrations || 0,
    total_attended: attendance.total_attended || 0,
    avg_attendance_rate: avgAttendanceRate,
    courses_taught: coursesResult,
  };
}

// ---------------------------------------------------------------------------
// Time Spent Analytics
// ---------------------------------------------------------------------------

export async function getTimeSpentAnalytics(
  orgId: number,
  dateRange?: { start?: string; end?: string }
): Promise<any> {
  const db = getDB();

  let dateFilter = "";
  const dateParams: any[] = [];
  if (dateRange?.start) {
    dateFilter += " AND e.enrolled_at >= ?";
    dateParams.push(dateRange.start);
  }
  if (dateRange?.end) {
    dateFilter += " AND e.enrolled_at <= ?";
    dateParams.push(dateRange.end);
  }

  const [totalTimeResult, avgPerUserResult, byCategoryResult, byDayResult] =
    await Promise.all([
      db.raw<any[]>(
        `SELECT SUM(e.time_spent_minutes) AS total_time
         FROM enrollments e
         WHERE e.org_id = ? ${dateFilter}`,
        [orgId, ...dateParams]
      ),
      db.raw<any[]>(
        `SELECT AVG(user_time.total_time) AS avg_per_user
         FROM (
           SELECT e.user_id, SUM(e.time_spent_minutes) AS total_time
           FROM enrollments e
           WHERE e.org_id = ? ${dateFilter}
           GROUP BY e.user_id
         ) AS user_time`,
        [orgId, ...dateParams]
      ),
      // Time by course category
      db.raw<any[]>(
        `SELECT
           cat.name AS category,
           SUM(e.time_spent_minutes) AS total_time
         FROM enrollments e
         JOIN courses c ON c.id = e.course_id
         LEFT JOIN course_categories cat ON cat.id = c.category_id
         WHERE e.org_id = ? ${dateFilter}
         GROUP BY cat.name
         ORDER BY total_time DESC`,
        [orgId, ...dateParams]
      ),
      // Time by day of week
      db.raw<any[]>(
        `SELECT
           DAYOFWEEK(e.last_accessed_at) AS day_of_week,
           SUM(e.time_spent_minutes) AS total_time
         FROM enrollments e
         WHERE e.org_id = ? AND e.last_accessed_at IS NOT NULL ${dateFilter}
         GROUP BY day_of_week
         ORDER BY day_of_week`,
        [orgId, ...dateParams]
      ),
    ]);

  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const byDayFormatted = byDayResult.map((row: any) => ({
    day: dayNames[(row.day_of_week || 1) - 1] || "Unknown",
    total_time_minutes: row.total_time || 0,
  }));

  return {
    total_time_minutes: totalTimeResult[0]?.total_time || 0,
    avg_time_per_user_minutes:
      Math.round((avgPerUserResult[0]?.avg_per_user || 0) * 100) / 100,
    by_category: byCategoryResult,
    by_day_of_week: byDayFormatted,
  };
}

// ---------------------------------------------------------------------------
// Export Analytics
// ---------------------------------------------------------------------------

export async function exportAnalytics(
  orgId: number,
  type: string,
  format: string
): Promise<{ data: string; contentType: string; filename: string }> {
  const db = getDB();

  let rows: any[] = [];
  let headers: string[] = [];
  let filename = "";

  switch (type) {
    case "enrollments": {
      rows = await db.raw<any[]>(
        `SELECT
           e.id, e.user_id, e.course_id, c.title AS course_title,
           e.status, e.progress_percentage, e.score,
           e.time_spent_minutes, e.enrolled_at, e.completed_at
         FROM enrollments e
         JOIN courses c ON c.id = e.course_id
         WHERE e.org_id = ?
         ORDER BY e.enrolled_at DESC`,
        [orgId]
      );
      headers = [
        "ID",
        "User ID",
        "Course ID",
        "Course Title",
        "Status",
        "Progress %",
        "Score",
        "Time Spent (min)",
        "Enrolled At",
        "Completed At",
      ];
      filename = "enrollments_export";
      break;
    }

    case "courses": {
      rows = await db.raw<any[]>(
        `SELECT
           c.id, c.title, c.status, c.difficulty,
           c.enrollment_count, c.completion_count, c.avg_rating,
           c.duration_minutes, c.created_at, c.published_at
         FROM courses c
         WHERE c.org_id = ?
         ORDER BY c.created_at DESC`,
        [orgId]
      );
      headers = [
        "ID",
        "Title",
        "Status",
        "Difficulty",
        "Enrollments",
        "Completions",
        "Avg Rating",
        "Duration (min)",
        "Created At",
        "Published At",
      ];
      filename = "courses_export";
      break;
    }

    case "compliance": {
      rows = await db.raw<any[]>(
        `SELECT
           cr.id, cr.user_id, cr.course_id, c.title AS course_title,
           cr.status, cr.due_date, cr.completed_at
         FROM compliance_records cr
         JOIN courses c ON c.id = cr.course_id
         WHERE cr.org_id = ?
         ORDER BY cr.due_date`,
        [orgId]
      );
      headers = [
        "ID",
        "User ID",
        "Course ID",
        "Course Title",
        "Status",
        "Due Date",
        "Completed At",
      ];
      filename = "compliance_export";
      break;
    }

    case "certificates": {
      rows = await db.raw<any[]>(
        `SELECT
           cert.id, cert.certificate_number, cert.user_id,
           cert.course_id, c.title AS course_title,
           cert.status, cert.issued_at, cert.expires_at
         FROM certificates cert
         JOIN courses c ON c.id = cert.course_id
         WHERE cert.org_id = ?
         ORDER BY cert.issued_at DESC`,
        [orgId]
      );
      headers = [
        "ID",
        "Certificate Number",
        "User ID",
        "Course ID",
        "Course Title",
        "Status",
        "Issued At",
        "Expires At",
      ];
      filename = "certificates_export";
      break;
    }

    case "users": {
      rows = await db.raw<any[]>(
        `SELECT
           ulp.user_id,
           ulp.total_courses_completed,
           ulp.total_time_spent_minutes,
           ulp.total_points_earned,
           ulp.current_streak_days,
           ulp.longest_streak_days,
           ulp.last_activity_at
         FROM user_learning_profiles ulp
         WHERE ulp.org_id = ?
         ORDER BY ulp.total_points_earned DESC`,
        [orgId]
      );
      headers = [
        "User ID",
        "Courses Completed",
        "Time Spent (min)",
        "Points Earned",
        "Current Streak",
        "Longest Streak",
        "Last Activity",
      ];
      filename = "users_export";
      break;
    }

    default:
      throw new BadRequestError(
        `Unknown export type: ${type}. Supported types: enrollments, courses, compliance, certificates, users`
      );
  }

  // Generate CSV
  if (format !== "csv") {
    throw new BadRequestError(
      `Unsupported export format: ${format}. Supported formats: csv`
    );
  }

  const csvLines: string[] = [];

  // Header row
  csvLines.push(headers.map(escapeCsvField).join(","));

  // Data rows
  for (const row of rows) {
    const values = Object.values(row).map((v) =>
      escapeCsvField(v === null || v === undefined ? "" : String(v))
    );
    csvLines.push(values.join(","));
  }

  const csvData = csvLines.join("\n");

  return {
    data: csvData,
    contentType: "text/csv",
    filename: `${filename}_${new Date().toISOString().split("T")[0]}.csv`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeCsvField(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
