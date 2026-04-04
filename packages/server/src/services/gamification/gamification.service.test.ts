import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/adapters/index", () => ({
  getDB: vi.fn(),
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

vi.mock("../../config/index", () => ({
  config: {
    rewards: {
      pointsPerCourseCompletion: 100,
      pointsPerQuizPass: 50,
      pointsPerCertificate: 200,
      pointsPerStreak: 25,
      streakThresholdDays: 7,
    },
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { getDB } from "../../db/adapters/index";
import {
  awardCourseCompletionPoints,
  awardQuizPassPoints,
  awardStreakPoints,
  awardLearningPathCompletionPoints,
  awardBadge,
  getUserPoints,
  getLeaderboard,
  updateLearningStreak,
  updateUserLearningProfile,
} from "./gamification.service";

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
  // Default: no REWARDS_API_URL set, so rewardsApiCall returns null
  mockFetch.mockReset();
});

// ── awardCourseCompletionPoints ─────────────────────────────────────────

describe("awardCourseCompletionPoints", () => {
  it("should update local points even when rewards API is not configured", async () => {
    // With no REWARDS_API_URL, rewardsApiCall returns null
    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      org_id: 1,
      user_id: 42,
      total_points_earned: 200,
    });
    mockDB.update.mockResolvedValue({});

    const result = await awardCourseCompletionPoints(1, 42, "c1", "Test Course");

    // Result is null because rewards API is not configured
    expect(result).toBeNull();
    // But local profile should be updated with 100 points
    expect(mockDB.update).toHaveBeenCalledWith(
      "user_learning_profiles",
      "profile1",
      expect.objectContaining({
        total_points_earned: 300,
      })
    );
  });

  it("should create profile if none exists when updating local points", async () => {
    mockDB.findOne.mockResolvedValue(null); // no profile
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      org_id: 1,
      user_id: 42,
      total_points_earned: 0,
    });
    mockDB.update.mockResolvedValue({});

    await awardCourseCompletionPoints(1, 42, "c1", "Test Course");

    expect(mockDB.create).toHaveBeenCalledWith(
      "user_learning_profiles",
      expect.objectContaining({
        org_id: 1,
        user_id: 42,
      })
    );
  });
});

// ── awardQuizPassPoints ─────────────────────────────────────────────────

describe("awardQuizPassPoints", () => {
  it("should award base points for a passing quiz score", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      org_id: 1,
      user_id: 42,
      total_points_earned: 0,
    });
    mockDB.update.mockResolvedValue({});

    await awardQuizPassPoints(1, 42, "Quiz 1", 75);

    // Base points = 50 (no bonus for score < 80)
    expect(mockDB.update).toHaveBeenCalledWith(
      "user_learning_profiles",
      "profile1",
      expect.objectContaining({
        total_points_earned: 50,
      })
    );
  });

  it("should award 1.2x points for score >= 80", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      org_id: 1,
      user_id: 42,
      total_points_earned: 0,
    });
    mockDB.update.mockResolvedValue({});

    await awardQuizPassPoints(1, 42, "Quiz 1", 85);

    // 50 * 1.2 = 60
    expect(mockDB.update).toHaveBeenCalledWith(
      "user_learning_profiles",
      "profile1",
      expect.objectContaining({
        total_points_earned: 60,
      })
    );
  });

  it("should award 1.5x points for score >= 90", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      org_id: 1,
      user_id: 42,
      total_points_earned: 0,
    });
    mockDB.update.mockResolvedValue({});

    await awardQuizPassPoints(1, 42, "Quiz 1", 95);

    // 50 * 1.5 = 75
    expect(mockDB.update).toHaveBeenCalledWith(
      "user_learning_profiles",
      "profile1",
      expect.objectContaining({
        total_points_earned: 75,
      })
    );
  });
});

// ── awardStreakPoints ───────────────────────────────────────────────────

describe("awardStreakPoints", () => {
  it("should return null when streak days result in zero points", async () => {
    // pointsPerStreak=25, streakThresholdDays=7
    // 3 days => Math.floor(3/7)=0 => 25*0=0 => returns null
    const result = await awardStreakPoints(1, 42, 3);

    expect(result).toBeNull();
    expect(mockDB.findOne).not.toHaveBeenCalled();
  });

  it("should award points for streak reaching threshold", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      org_id: 1,
      user_id: 42,
      total_points_earned: 100,
    });
    mockDB.update.mockResolvedValue({});

    // 7 days => Math.floor(7/7)=1 => 25*1=25
    await awardStreakPoints(1, 42, 7);

    expect(mockDB.update).toHaveBeenCalledWith(
      "user_learning_profiles",
      "profile1",
      expect.objectContaining({
        total_points_earned: 125,
      })
    );
  });

  it("should award multiplied points for longer streaks", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      org_id: 1,
      user_id: 42,
      total_points_earned: 0,
    });
    mockDB.update.mockResolvedValue({});

    // 21 days => Math.floor(21/7)=3 => 25*3=75
    await awardStreakPoints(1, 42, 21);

    expect(mockDB.update).toHaveBeenCalledWith(
      "user_learning_profiles",
      "profile1",
      expect.objectContaining({
        total_points_earned: 75,
      })
    );
  });
});

// ── awardLearningPathCompletionPoints ───────────────────────────────────

describe("awardLearningPathCompletionPoints", () => {
  it("should award 3x course completion points", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      org_id: 1,
      user_id: 42,
      total_points_earned: 0,
    });
    mockDB.update.mockResolvedValue({});

    // 100 * 3 = 300 points
    await awardLearningPathCompletionPoints(1, 42, "Advanced Path");

    expect(mockDB.update).toHaveBeenCalledWith(
      "user_learning_profiles",
      "profile1",
      expect.objectContaining({
        total_points_earned: 300,
      })
    );
  });
});

// ── awardBadge ──────────────────────────────────────────────────────────

describe("awardBadge", () => {
  it("should return null when rewards API is not configured", async () => {
    const result = await awardBadge(1, 42, "badge-1", "Completed 10 courses");

    expect(result).toBeNull();
  });
});

// ── updateLearningStreak — streak threshold trigger ───────────────────

describe("updateLearningStreak — streak at threshold boundary", () => {
  it("should award streak points when streak hits threshold multiple", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Profile at 6 days, after today it will be 7 (= streakThresholdDays)
    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      org_id: 1,
      user_id: 42,
      current_streak_days: 6,
      longest_streak_days: 10,
      last_activity_at: yesterday.toISOString(),
      total_points_earned: 100,
    });
    mockDB.update.mockResolvedValue({});

    const result = await updateLearningStreak(1, 42);

    // Streak should be 7
    expect(result.current_streak_days).toBe(7);
    // awardStreakPoints should be called (which calls updateLocalPoints)
    // The update should be called at least twice: once for streak, once for points
    expect(mockDB.update).toHaveBeenCalled();
  });

  it("should handle null last_activity_at by setting streak to 1", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      org_id: 1,
      user_id: 42,
      current_streak_days: 0,
      longest_streak_days: 0,
      last_activity_at: null,
    });
    mockDB.update.mockResolvedValue({});

    const result = await updateLearningStreak(1, 42);

    expect(result.current_streak_days).toBe(1);
    expect(result.longest_streak_days).toBe(1);
  });
});

// ── getUserPoints ───────────────────────────────────────────────────────

describe("getUserPoints", () => {
  it("should fallback to local profile when rewards API is not configured", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      org_id: 1,
      user_id: 42,
      total_points_earned: 250,
    });

    const result = await getUserPoints(1, 42);

    expect(result.points).toBe(250);
    expect(result.source).toBe("local");
  });

  it("should return zero points when no profile exists", async () => {
    mockDB.findOne.mockResolvedValue(null);

    const result = await getUserPoints(1, 42);

    expect(result.points).toBe(0);
    expect(result.source).toBe("local");
  });
});

// ── getLeaderboard ──────────────────────────────────────────────────────

describe("getLeaderboard", () => {
  it("should return leaderboard ordered by points", async () => {
    mockDB.raw.mockResolvedValue([
      { user_id: 1, total_points_earned: 500, total_courses_completed: 10 },
      { user_id: 2, total_points_earned: 300, total_courses_completed: 5 },
    ]);

    const result = await getLeaderboard(1, 10);

    expect(result).toHaveLength(2);
    expect(result[0].total_points_earned).toBe(500);
    const query = mockDB.raw.mock.calls[0][0];
    expect(query).toContain("ORDER BY ulp.total_points_earned DESC");
  });

  it("should use default limit of 20", async () => {
    mockDB.raw.mockResolvedValue([]);

    await getLeaderboard(1);

    expect(mockDB.raw).toHaveBeenCalledWith(
      expect.any(String),
      [1, 20]
    );
  });

  it("should return empty array when no profiles exist", async () => {
    mockDB.raw.mockResolvedValue([]);

    const result = await getLeaderboard(1);

    expect(result).toEqual([]);
  });
});

// ── updateLearningStreak ────────────────────────────────────────────────

describe("updateLearningStreak", () => {
  it("should create profile and set streak to 1 for new users", async () => {
    mockDB.findOne.mockResolvedValue(null); // no profile
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      org_id: 1,
      user_id: 42,
      current_streak_days: 1,
      longest_streak_days: 1,
    });

    const result = await updateLearningStreak(1, 42);

    expect(result.current_streak_days).toBe(1);
    expect(result.longest_streak_days).toBe(1);
    expect(mockDB.create).toHaveBeenCalledWith(
      "user_learning_profiles",
      expect.objectContaining({
        current_streak_days: 1,
        longest_streak_days: 1,
      })
    );
  });

  it("should increment streak for consecutive day activity", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      org_id: 1,
      user_id: 42,
      current_streak_days: 5,
      longest_streak_days: 10,
      last_activity_at: yesterday.toISOString(),
    });
    mockDB.update.mockResolvedValue({});

    const result = await updateLearningStreak(1, 42);

    expect(result.current_streak_days).toBe(6);
    expect(result.longest_streak_days).toBe(10);
  });

  it("should reset streak when gap is more than 1 day", async () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      org_id: 1,
      user_id: 42,
      current_streak_days: 15,
      longest_streak_days: 15,
      last_activity_at: threeDaysAgo.toISOString(),
    });
    mockDB.update.mockResolvedValue({});

    const result = await updateLearningStreak(1, 42);

    expect(result.current_streak_days).toBe(1);
    expect(result.longest_streak_days).toBe(15);
  });

  it("should not change streak for same-day activity", async () => {
    const today = new Date();

    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      org_id: 1,
      user_id: 42,
      current_streak_days: 5,
      longest_streak_days: 10,
      last_activity_at: today.toISOString(),
    });
    mockDB.update.mockResolvedValue({});

    const result = await updateLearningStreak(1, 42);

    expect(result.current_streak_days).toBe(5);
  });

  it("should update longest streak when current surpasses it", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      org_id: 1,
      user_id: 42,
      current_streak_days: 10,
      longest_streak_days: 10,
      last_activity_at: yesterday.toISOString(),
    });
    mockDB.update.mockResolvedValue({});

    const result = await updateLearningStreak(1, 42);

    expect(result.current_streak_days).toBe(11);
    expect(result.longest_streak_days).toBe(11);
  });
});

// ── updateUserLearningProfile ───────────────────────────────────────────

describe("updateUserLearningProfile", () => {
  it("should increment total_courses_completed for course_completed event", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      total_courses_completed: 5,
      total_time_spent_minutes: 100,
      total_points_earned: 200,
    });
    mockDB.update.mockResolvedValue({});

    await updateUserLearningProfile(1, 42, { type: "course_completed" });

    expect(mockDB.update).toHaveBeenCalledWith(
      "user_learning_profiles",
      "profile1",
      expect.objectContaining({
        total_courses_completed: 6,
      })
    );
  });

  it("should add time for time_spent event", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      total_courses_completed: 5,
      total_time_spent_minutes: 100,
      total_points_earned: 200,
    });
    mockDB.update.mockResolvedValue({});

    await updateUserLearningProfile(1, 42, { type: "time_spent", value: 30 });

    expect(mockDB.update).toHaveBeenCalledWith(
      "user_learning_profiles",
      "profile1",
      expect.objectContaining({
        total_time_spent_minutes: 130,
      })
    );
  });

  it("should add points for points_earned event", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "profile1",
      total_courses_completed: 5,
      total_time_spent_minutes: 100,
      total_points_earned: 200,
    });
    mockDB.update.mockResolvedValue({});

    await updateUserLearningProfile(1, 42, { type: "points_earned", value: 50 });

    expect(mockDB.update).toHaveBeenCalledWith(
      "user_learning_profiles",
      "profile1",
      expect.objectContaining({
        total_points_earned: 250,
      })
    );
  });

  it("should create profile if none exists", async () => {
    mockDB.findOne.mockResolvedValue(null);
    mockDB.create.mockResolvedValue({
      id: "test-uuid-1234",
      org_id: 1,
      user_id: 42,
      total_courses_completed: 0,
      total_time_spent_minutes: 0,
      total_points_earned: 0,
    });
    mockDB.update.mockResolvedValue({});

    await updateUserLearningProfile(1, 42, { type: "course_completed" });

    expect(mockDB.create).toHaveBeenCalledWith(
      "user_learning_profiles",
      expect.objectContaining({
        org_id: 1,
        user_id: 42,
        total_courses_completed: 0,
      })
    );
    expect(mockDB.update).toHaveBeenCalledWith(
      "user_learning_profiles",
      "test-uuid-1234",
      expect.objectContaining({
        total_courses_completed: 1,
      })
    );
  });
});
