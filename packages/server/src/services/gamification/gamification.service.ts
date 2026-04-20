// ============================================================================
// GAMIFICATION SERVICE
// Points, badges, streaks, and leaderboards via emp-rewards integration.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters/index";
import { getEmpCloudDB } from "../../db/empcloud";
import { config } from "../../config/index";
import { logger } from "../../utils/logger";
import { NotFoundError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// Rewards API config
// ---------------------------------------------------------------------------

const REWARDS_API_URL = process.env.REWARDS_API_URL || "";
const REWARDS_API_KEY = process.env.REWARDS_API_KEY || "";

async function rewardsApiCall(
  method: string,
  endpoint: string,
  body?: any
): Promise<any> {
  if (!REWARDS_API_URL) {
    logger.warn("Rewards API not configured (REWARDS_API_URL is empty). Skipping reward action.");
    return null;
  }

  try {
    const url = `${REWARDS_API_URL}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(REWARDS_API_KEY ? { Authorization: `Bearer ${REWARDS_API_KEY}` } : {}),
      },
    };

    if (body && (method === "POST" || method === "PUT")) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
      const errorText = await response.text();
      logger.warn(`Rewards API error: ${response.status} ${errorText}`);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (err: any) {
    logger.warn(`Rewards API call failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Award Course Completion Points
// ---------------------------------------------------------------------------

export async function awardCourseCompletionPoints(
  orgId: number,
  userId: number,
  courseId: string,
  courseName: string
): Promise<any> {
  const points = config.rewards.pointsPerCourseCompletion;

  const result = await rewardsApiCall("POST", "/api/points/award", {
    org_id: orgId,
    user_id: userId,
    points,
    reason: `Completed course: ${courseName}`,
    reference_type: "course_completion",
    reference_id: courseId,
  });

  if (result) {
    logger.info(`Awarded ${points} points to user ${userId} for completing course ${courseName}`);
  }

  // Update local learning profile points
  await updateLocalPoints(orgId, userId, points);

  return result;
}

// ---------------------------------------------------------------------------
// Award Quiz Pass Points
// ---------------------------------------------------------------------------

export async function awardQuizPassPoints(
  orgId: number,
  userId: number,
  quizTitle: string,
  score: number
): Promise<any> {
  const basePoints = config.rewards.pointsPerQuizPass;
  // Bonus points for high scores
  let points = basePoints;
  if (score >= 90) {
    points = Math.round(basePoints * 1.5);
  } else if (score >= 80) {
    points = Math.round(basePoints * 1.2);
  }

  const result = await rewardsApiCall("POST", "/api/points/award", {
    org_id: orgId,
    user_id: userId,
    points,
    reason: `Passed quiz: ${quizTitle} (Score: ${score}%)`,
    reference_type: "quiz_pass",
    reference_id: quizTitle,
  });

  if (result) {
    logger.info(`Awarded ${points} points to user ${userId} for passing quiz ${quizTitle}`);
  }

  await updateLocalPoints(orgId, userId, points);

  return result;
}

// ---------------------------------------------------------------------------
// Award Streak Points
// ---------------------------------------------------------------------------

export async function awardStreakPoints(
  orgId: number,
  userId: number,
  streakDays: number
): Promise<any> {
  const points = config.rewards.pointsPerStreak * Math.floor(streakDays / config.rewards.streakThresholdDays);

  if (points <= 0) {
    return null;
  }

  const result = await rewardsApiCall("POST", "/api/points/award", {
    org_id: orgId,
    user_id: userId,
    points,
    reason: `Learning streak: ${streakDays} days`,
    reference_type: "learning_streak",
    reference_id: `streak_${streakDays}`,
  });

  if (result) {
    logger.info(`Awarded ${points} streak points to user ${userId} for ${streakDays}-day streak`);
  }

  await updateLocalPoints(orgId, userId, points);

  return result;
}

// ---------------------------------------------------------------------------
// Award Learning Path Completion Points
// ---------------------------------------------------------------------------

export async function awardLearningPathCompletionPoints(
  orgId: number,
  userId: number,
  pathName: string
): Promise<any> {
  // Learning path completion gets 3x course completion points
  const points = config.rewards.pointsPerCourseCompletion * 3;

  const result = await rewardsApiCall("POST", "/api/points/award", {
    org_id: orgId,
    user_id: userId,
    points,
    reason: `Completed learning path: ${pathName}`,
    reference_type: "learning_path_completion",
    reference_id: pathName,
  });

  if (result) {
    logger.info(`Awarded ${points} points to user ${userId} for completing learning path ${pathName}`);
  }

  await updateLocalPoints(orgId, userId, points);

  return result;
}

// ---------------------------------------------------------------------------
// Award Badge
// ---------------------------------------------------------------------------

export async function awardBadge(
  orgId: number,
  userId: number,
  badgeId: string,
  reason: string
): Promise<any> {
  const result = await rewardsApiCall("POST", "/api/badges/award", {
    org_id: orgId,
    user_id: userId,
    badge_id: badgeId,
    reason,
  });

  if (result) {
    logger.info(`Awarded badge ${badgeId} to user ${userId}: ${reason}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Get User Points
// ---------------------------------------------------------------------------

export async function getUserPoints(
  orgId: number,
  userId: number
): Promise<{ points: number; source: string }> {
  // Try rewards API first
  const apiResult = await rewardsApiCall(
    "GET",
    `/api/points/balance?org_id=${orgId}&user_id=${userId}`
  );

  if (apiResult && apiResult.data && typeof apiResult.data.points === "number") {
    return { points: apiResult.data.points, source: "rewards_api" };
  }

  // Fallback to local learning profile
  const db = getDB();
  const profile = await db.findOne<any>("user_learning_profiles", {
    org_id: orgId,
    user_id: userId,
  });

  const localPoints = profile
    ? profile.totalPointsEarned ?? profile.total_points_earned ?? 0
    : 0;
  return {
    points: localPoints,
    source: "local",
  };
}

// ---------------------------------------------------------------------------
// Get Leaderboard
// ---------------------------------------------------------------------------

export async function getLeaderboard(
  orgId: number,
  limit: number = 20
): Promise<any[]> {
  const db = getDB();

  const leaders = await db.raw<any[]>(
    `SELECT
       ulp.user_id,
       ulp.total_courses_completed,
       ulp.total_points_earned,
       ulp.total_time_spent_minutes,
       ulp.current_streak_days,
       ulp.longest_streak_days
     FROM user_learning_profiles ulp
     WHERE ulp.org_id = ?
     ORDER BY ulp.total_points_earned DESC, ulp.total_courses_completed DESC
     LIMIT ?`,
    [orgId, limit]
  );

  if (!leaders.length) return [];

  // Enrich with user names/photos from EmpCloud DB (cross-DB, can't JOIN)
  const userIds = leaders.map((l) => l.user_id);
  let userMap = new Map<number, { first_name: string; last_name: string; email: string; photo_path: string | null }>();
  try {
    const empDb = getEmpCloudDB();
    const users = await empDb("users")
      .select("id", "first_name", "last_name", "email", "photo_path")
      .whereIn("id", userIds);
    userMap = new Map(users.map((u: any) => [u.id, u]));
  } catch (err: any) {
    logger.warn(`Leaderboard: EmpCloud user lookup failed: ${err.message}`);
  }

  return leaders.map((l, idx) => {
    const u = userMap.get(l.user_id);
    const name = u
      ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || `User #${l.user_id}`
      : `User #${l.user_id}`;
    return {
      rank: idx + 1,
      userId: l.user_id,
      name,
      email: u?.email ?? null,
      photoPath: u?.photo_path ?? null,
      points: l.total_points_earned || 0,
      coursesCompleted: l.total_courses_completed || 0,
      timeSpentMinutes: l.total_time_spent_minutes || 0,
      streak: l.current_streak_days || 0,
      longestStreak: l.longest_streak_days || 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Get Current User's Leaderboard Stats (points + rank + streak)
// ---------------------------------------------------------------------------

export async function getMyLeaderboardStats(
  orgId: number,
  userId: number
): Promise<{
  totalPoints: number;
  points: number;
  rank: number | null;
  streak: number;
  longestStreak: number;
  coursesCompleted: number;
  source: string;
}> {
  const db = getDB();

  const pts = await getUserPoints(orgId, userId);

  const profile = await db.findOne<any>("user_learning_profiles", {
    org_id: orgId,
    user_id: userId,
  });

  // Rank = 1 + count of users in the same org with strictly more points
  let rank: number | null = null;
  if (profile) {
    const [countRow] = await db.raw<any[]>(
      `SELECT COUNT(*) AS ahead
         FROM user_learning_profiles
         WHERE org_id = ? AND total_points_earned > ?`,
      [orgId, pts.points || 0]
    );
    rank = Number(countRow?.ahead ?? 0) + 1;
  }

  return {
    totalPoints: pts.points,
    points: pts.points,
    rank,
    streak: profile?.currentStreakDays ?? profile?.current_streak_days ?? 0,
    longestStreak: profile?.longestStreakDays ?? profile?.longest_streak_days ?? 0,
    coursesCompleted: profile?.totalCoursesCompleted ?? profile?.total_courses_completed ?? 0,
    source: pts.source,
  };
}

// ---------------------------------------------------------------------------
// Update Learning Streak
// ---------------------------------------------------------------------------

export async function updateLearningStreak(
  orgId: number,
  userId: number
): Promise<{ current_streak_days: number; longest_streak_days: number }> {
  const db = getDB();

  let profile = await db.findOne<any>("user_learning_profiles", {
    org_id: orgId,
    user_id: userId,
  });

  if (!profile) {
    profile = await db.create<any>("user_learning_profiles", {
      id: uuidv4(),
      org_id: orgId,
      user_id: userId,
      preferred_categories: JSON.stringify([]),
      preferred_difficulty: null,
      total_courses_completed: 0,
      total_time_spent_minutes: 0,
      total_points_earned: 0,
      current_streak_days: 1,
      longest_streak_days: 1,
      last_activity_at: new Date().toISOString(),
    });

    return {
      current_streak_days: 1,
      longest_streak_days: 1,
    };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let lastActivity: Date | null = null;
  if (profile.last_activity_at) {
    lastActivity = new Date(profile.last_activity_at);
  }

  let currentStreak = profile.current_streak_days || 0;
  let longestStreak = profile.longest_streak_days || 0;

  if (lastActivity) {
    const lastActivityDate = new Date(
      lastActivity.getFullYear(),
      lastActivity.getMonth(),
      lastActivity.getDate()
    );

    const diffMs = today.getTime() - lastActivityDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      // Already recorded activity today, no change
    } else if (diffDays === 1) {
      // Consecutive day
      currentStreak += 1;
    } else {
      // Gap > 1 day, reset streak
      currentStreak = 1;
    }
  } else {
    currentStreak = 1;
  }

  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
  }

  await db.update("user_learning_profiles", profile.id, {
    current_streak_days: currentStreak,
    longest_streak_days: longestStreak,
    last_activity_at: now.toISOString(),
  });

  // Check if streak deserves points
  if (
    currentStreak > 0 &&
    currentStreak % config.rewards.streakThresholdDays === 0
  ) {
    await awardStreakPoints(orgId, userId, currentStreak);
  }

  return {
    current_streak_days: currentStreak,
    longest_streak_days: longestStreak,
  };
}

// ---------------------------------------------------------------------------
// Update User Learning Profile
// ---------------------------------------------------------------------------

export async function updateUserLearningProfile(
  orgId: number,
  userId: number,
  event: {
    type: "course_completed" | "time_spent" | "points_earned";
    value?: number;
  }
): Promise<void> {
  const db = getDB();

  let profile = await db.findOne<any>("user_learning_profiles", {
    org_id: orgId,
    user_id: userId,
  });

  if (!profile) {
    profile = await db.create<any>("user_learning_profiles", {
      id: uuidv4(),
      org_id: orgId,
      user_id: userId,
      preferred_categories: JSON.stringify([]),
      preferred_difficulty: null,
      total_courses_completed: 0,
      total_time_spent_minutes: 0,
      total_points_earned: 0,
      current_streak_days: 0,
      longest_streak_days: 0,
      last_activity_at: new Date().toISOString(),
    });
  }

  const updateData: Record<string, any> = {
    last_activity_at: new Date().toISOString(),
  };

  switch (event.type) {
    case "course_completed":
      updateData.total_courses_completed =
        (profile.total_courses_completed || 0) + 1;
      break;
    case "time_spent":
      updateData.total_time_spent_minutes =
        (profile.total_time_spent_minutes || 0) + (event.value || 0);
      break;
    case "points_earned":
      updateData.total_points_earned =
        (profile.total_points_earned || 0) + (event.value || 0);
      break;
  }

  await db.update("user_learning_profiles", profile.id, updateData);
}

// ---------------------------------------------------------------------------
// Internal: Update local points
// ---------------------------------------------------------------------------

async function updateLocalPoints(
  orgId: number,
  userId: number,
  points: number
): Promise<void> {
  try {
    await updateUserLearningProfile(orgId, userId, {
      type: "points_earned",
      value: points,
    });
  } catch (err: any) {
    logger.warn(`Failed to update local points for user ${userId}: ${err.message}`);
  }
}
