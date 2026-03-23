import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/adapters/index", () => ({
  getDB: vi.fn(),
}));

vi.mock("../../db/empcloud", () => ({
  findUsersByOrgId: vi.fn(),
}));

vi.mock("../../events/index", () => ({
  lmsEvents: { emit: vi.fn() },
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-uuid-1234"),
}));

import { getDB } from "../../db/adapters/index";
import { findUsersByOrgId } from "../../db/empcloud";
import {
  getOverviewDashboard,
  getCourseAnalytics,
  getUserAnalytics,
  getOrgAnalytics,
  getDepartmentAnalytics,
  getComplianceAnalytics,
  getCertificateAnalytics,
  getInstructorAnalytics,
  getTimeSpentAnalytics,
  exportAnalytics,
} from "./analytics.service";

const mockDB = {
  findById: vi.fn(),
  findOne: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
  sum: vi.fn(),
  raw: vi.fn(),
  transaction: vi.fn((fn: any) => fn(mockDB)),
  updateMany: vi.fn(),
  createMany: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (getDB as any).mockReturnValue(mockDB);
});

// ── getOverviewDashboard ────────────────────────────────────────────────

describe("getOverviewDashboard", () => {
  it("should return all dashboard metrics", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 15 }])   // totalCourses
      .mockResolvedValueOnce([{ total: 200 }])   // totalEnrollments
      .mockResolvedValueOnce([{ total: 120 }])   // completedEnrollments
      .mockResolvedValueOnce([{ total: 45 }])    // activeLearners
      .mockResolvedValueOnce([{ avg_rating: 4.35 }]) // avgRating
      .mockResolvedValueOnce([{ total_time: 5000 }]) // totalTime
      .mockResolvedValueOnce([{ total: 80 }]);   // totalCertificates

    const result = await getOverviewDashboard(1);

    expect(result.total_courses).toBe(15);
    expect(result.total_enrollments).toBe(200);
    expect(result.completed_enrollments).toBe(120);
    expect(result.completion_rate).toBe(60);
    expect(result.active_learners_30d).toBe(45);
    expect(result.avg_course_rating).toBe(4.35);
    expect(result.total_time_spent_minutes).toBe(5000);
    expect(result.total_certificates_issued).toBe(80);
  });

  it("should handle zero enrollments with 0 completion rate", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ avg_rating: null }])
      .mockResolvedValueOnce([{ total_time: null }])
      .mockResolvedValueOnce([{ total: 0 }]);

    const result = await getOverviewDashboard(1);

    expect(result.completion_rate).toBe(0);
    expect(result.avg_course_rating).toBe(0);
    expect(result.total_time_spent_minutes).toBe(0);
  });
});

// ── getCourseAnalytics ──────────────────────────────────────────────────

describe("getCourseAnalytics", () => {
  it("should return course analytics with all metrics", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", title: "Test Course", organization_id: 1 });
    mockDB.count.mockResolvedValue(50);
    mockDB.raw
      .mockResolvedValueOnce([{ month: "2025-01", count: 10 }]) // enrollmentTrend
      .mockResolvedValueOnce([{ total: 30 }])                    // completionResult
      .mockResolvedValueOnce([{ avg_score: 82.5 }])              // avgScoreResult
      .mockResolvedValueOnce([{ avg_time: 120.7 }])              // avgTimeResult
      .mockResolvedValueOnce([{ rating: 5, count: 10 }])         // ratingDistribution
      .mockResolvedValueOnce([{ module_id: "m1", module_title: "Intro", completions: 40 }]); // moduleDropOff

    const result = await getCourseAnalytics(1, "c1");

    expect(result.course_id).toBe("c1");
    expect(result.course_title).toBe("Test Course");
    expect(result.enrollment_count).toBe(50);
    expect(result.completion_count).toBe(30);
    expect(result.completion_rate).toBe(60);
    expect(result.avg_score).toBe(82.5);
  });

  it("should throw NotFoundError when course does not exist", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getCourseAnalytics(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should handle zero enrollments gracefully", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", title: "Empty Course", organization_id: 1 });
    mockDB.count.mockResolvedValue(0);
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ avg_score: null }])
      .mockResolvedValueOnce([{ avg_time: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getCourseAnalytics(1, "c1");

    expect(result.completion_rate).toBe(0);
    expect(result.avg_score).toBe(0);
    expect(result.avg_time_spent_minutes).toBe(0);
  });
});

// ── getUserAnalytics ────────────────────────────────────────────────────

describe("getUserAnalytics", () => {
  it("should return user analytics with all metrics", async () => {
    mockDB.count
      .mockResolvedValueOnce(10)  // enrolled
      .mockResolvedValueOnce(7)   // completed
      .mockResolvedValueOnce(2);  // in_progress
    mockDB.raw
      .mockResolvedValueOnce([{ avg_score: 91.3 }])
      .mockResolvedValueOnce([{ total_time: 300 }])
      .mockResolvedValueOnce([{ total: 5 }])
      .mockResolvedValueOnce([{ total: 3, completed: 2, overdue: 1 }]);
    mockDB.findOne.mockResolvedValue({
      current_streak_days: 14,
      longest_streak_days: 30,
      total_points_earned: 1500,
    });

    const result = await getUserAnalytics(1, 42);

    expect(result.user_id).toBe(42);
    expect(result.courses_enrolled).toBe(10);
    expect(result.courses_completed).toBe(7);
    expect(result.courses_in_progress).toBe(2);
    expect(result.avg_score).toBe(91.3);
    expect(result.total_time_spent_minutes).toBe(300);
    expect(result.certificates_earned).toBe(5);
    expect(result.compliance_rate).toBe(67);
    expect(result.current_streak_days).toBe(14);
    expect(result.total_points).toBe(1500);
  });

  it("should handle user with no data", async () => {
    mockDB.count.mockResolvedValue(0);
    mockDB.raw
      .mockResolvedValueOnce([{ avg_score: null }])
      .mockResolvedValueOnce([{ total_time: null }])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ total: 0, completed: 0, overdue: 0 }]);
    mockDB.findOne.mockResolvedValue(null);

    const result = await getUserAnalytics(1, 42);

    expect(result.courses_enrolled).toBe(0);
    expect(result.compliance_rate).toBe(100);
    expect(result.current_streak_days).toBe(0);
    expect(result.total_points).toBe(0);
  });
});

// ── getOrgAnalytics ─────────────────────────────────────────────────────

describe("getOrgAnalytics", () => {
  it("should return org-level analytics", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ month: "2025-01", enrollments: 20 }])
      .mockResolvedValueOnce([{ month: "2025-01", completions: 10 }])
      .mockResolvedValueOnce([{ id: "c1", title: "Top Course", enrollment_count: 100 }])
      .mockResolvedValueOnce([{ total: 200 }])
      .mockResolvedValueOnce([{ total: 120 }]);

    const result = await getOrgAnalytics(1);

    expect(result.total_enrollments).toBe(200);
    expect(result.total_completions).toBe(120);
    expect(result.enrollment_trend).toHaveLength(1);
    expect(result.top_courses).toHaveLength(1);
  });

  it("should apply date range filters", async () => {
    mockDB.raw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ total: 0 }]);

    await getOrgAnalytics(1, { start: "2025-01-01", end: "2025-06-30" });

    const enrollmentTrendQuery = mockDB.raw.mock.calls[0][0];
    expect(enrollmentTrendQuery).toContain("e.enrolled_at >= ?");
    expect(enrollmentTrendQuery).toContain("e.enrolled_at <= ?");
  });
});

// ── getDepartmentAnalytics ──────────────────────────────────────────────

describe("getDepartmentAnalytics", () => {
  it("should return department analytics", async () => {
    (findUsersByOrgId as any).mockResolvedValue([
      { id: 10, department_id: 5 },
      { id: 11, department_id: 5 },
      { id: 12, department_id: 99 },
    ]);
    mockDB.raw
      .mockResolvedValueOnce([{ total: 8 }])   // completed
      .mockResolvedValueOnce([{ total: 15 }])  // totalEnrolled
      .mockResolvedValueOnce([{ total: 4, completed: 3 }]); // compliance

    const result = await getDepartmentAnalytics(1, 5);

    expect(result.department_id).toBe(5);
    expect(result.user_count).toBe(2);
    expect(result.courses_completed).toBe(8);
    expect(result.avg_completion_rate).toBe(53);
    expect(result.compliance_rate).toBe(75);
  });

  it("should return empty results when no users in department", async () => {
    (findUsersByOrgId as any).mockResolvedValue([
      { id: 10, department_id: 99 },
    ]);

    const result = await getDepartmentAnalytics(1, 5);

    expect(result.user_count).toBe(0);
    expect(result.courses_completed).toBe(0);
    expect(result.avg_completion_rate).toBe(0);
  });

  it("should handle findUsersByOrgId failure gracefully", async () => {
    (findUsersByOrgId as any).mockRejectedValue(new Error("DB connection failed"));

    const result = await getDepartmentAnalytics(1, 5);

    expect(result.user_count).toBe(0);
    expect(result.compliance_rate).toBe(0);
  });
});

// ── getComplianceAnalytics ──────────────────────────────────────────────

describe("getComplianceAnalytics", () => {
  it("should return compliance analytics", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 100, completed: 70, overdue: 10, in_progress: 15, not_started: 5 }])
      .mockResolvedValueOnce([{ assignment_id: "a1", assignment_name: "Safety Training", completed: 50, overdue: 5 }])
      .mockResolvedValueOnce([{ course_id: "c1", course_title: "Safety 101", completed: 50, overdue: 5 }]);

    const result = await getComplianceAnalytics(1);

    expect(result.total_assignments).toBe(100);
    expect(result.completed).toBe(70);
    expect(result.overdue).toBe(10);
    expect(result.completion_rate).toBe(70);
    expect(result.by_assignment).toHaveLength(1);
    expect(result.by_course).toHaveLength(1);
  });

  it("should handle no compliance records", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 0, completed: 0, overdue: 0, in_progress: 0, not_started: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getComplianceAnalytics(1);

    expect(result.total_assignments).toBe(0);
    expect(result.completion_rate).toBe(0);
  });
});

// ── getCertificateAnalytics ─────────────────────────────────────────────

describe("getCertificateAnalytics", () => {
  it("should return certificate analytics", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total: 50, active: 40, expired: 8, revoked: 2 }])
      .mockResolvedValueOnce([{ total: 5 }])
      .mockResolvedValueOnce([{ course_id: "c1", course_title: "Test", total_issued: 30, active: 25, expired: 5 }]);

    const result = await getCertificateAnalytics(1);

    expect(result.total_issued).toBe(50);
    expect(result.active).toBe(40);
    expect(result.expired).toBe(8);
    expect(result.revoked).toBe(2);
    expect(result.expiring_soon).toBe(5);
    expect(result.by_course).toHaveLength(1);
  });
});

// ── getInstructorAnalytics ──────────────────────────────────────────────

describe("getInstructorAnalytics", () => {
  it("should return instructor analytics", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total_sessions: 20, completed_sessions: 18 }])
      .mockResolvedValueOnce([{ total_registrations: 100, total_attended: 85 }])
      .mockResolvedValueOnce([{ id: "c1", title: "Course A", enrollment_count: 50, avg_rating: 4.5 }]);

    const result = await getInstructorAnalytics(1, 42);

    expect(result.instructor_id).toBe(42);
    expect(result.total_sessions).toBe(20);
    expect(result.completed_sessions).toBe(18);
    expect(result.avg_attendance_rate).toBe(85);
    expect(result.courses_taught).toHaveLength(1);
  });

  it("should handle instructor with no sessions", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ total_sessions: 0, completed_sessions: 0 }])
      .mockResolvedValueOnce([{ total_registrations: 0, total_attended: 0 }])
      .mockResolvedValueOnce([]);

    const result = await getInstructorAnalytics(1, 42);

    expect(result.total_sessions).toBe(0);
    expect(result.avg_attendance_rate).toBe(0);
    expect(result.courses_taught).toEqual([]);
  });
});

// ── exportAnalytics ─────────────────────────────────────────────────────

describe("exportAnalytics", () => {
  it("should export enrollments as CSV", async () => {
    mockDB.raw.mockResolvedValue([
      { id: "e1", user_id: 1, course_id: "c1", course_title: "Test", status: "completed", progress_percentage: 100, score: 95, time_spent_minutes: 60, enrolled_at: "2025-01-01", completed_at: "2025-01-15" },
    ]);

    const result = await exportAnalytics(1, "enrollments", "csv");

    expect(result.contentType).toBe("text/csv");
    expect(result.filename).toContain("enrollments_export");
    expect(result.filename).toContain(".csv");
    expect(result.data).toContain("ID,User ID,Course ID");
  });

  it("should throw BadRequestError for unknown export type", async () => {
    await expect(exportAnalytics(1, "unknown_type", "csv")).rejects.toThrow("Unknown export type");
  });

  it("should throw BadRequestError for unsupported format", async () => {
    mockDB.raw.mockResolvedValue([]);

    await expect(exportAnalytics(1, "enrollments", "pdf")).rejects.toThrow("Unsupported export format");
  });

  it("should export courses as CSV", async () => {
    mockDB.raw.mockResolvedValue([
      { id: "c1", title: "Course 1", status: "published", difficulty: "beginner", enrollment_count: 50, completion_count: 30, avg_rating: 4.2, duration_minutes: 120, created_at: "2025-01-01", published_at: "2025-01-05" },
    ]);

    const result = await exportAnalytics(1, "courses", "csv");

    expect(result.filename).toContain("courses_export");
    expect(result.data).toContain("Title");
  });

  it("should handle CSV fields with commas and quotes", async () => {
    mockDB.raw.mockResolvedValue([
      { id: "c1", title: 'Course "Advanced, Topics"', status: "published", difficulty: "advanced", enrollment_count: 10, completion_count: 5, avg_rating: 4.0, duration_minutes: 60, created_at: "2025-01-01", published_at: "2025-01-02" },
    ]);

    const result = await exportAnalytics(1, "courses", "csv");

    // Should escape quotes and commas in CSV
    expect(result.data).toContain('"');
  });
});
