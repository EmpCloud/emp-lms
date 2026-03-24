// ============================================================================
// AI RECOMMENDATION SERVICE
// Rule-based learning recommendations engine. No external AI dependency.
// ============================================================================

import { getDB } from "../../db/adapters/index";
import { findUserById } from "../../db/empcloud";
import { logger } from "../../utils/logger";
import { NotFoundError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecommendedCourse {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  thumbnail_url: string | null;
  category_id: string | null;
  category_name: string | null;
  difficulty: string | null;
  duration_minutes: number;
  enrollment_count: number;
  avg_rating: number;
  tags: string | null;
  score: number;
  reason: string;
}

const DIFFICULTY_ORDER: Record<string, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
};

function getNextDifficulty(current: string | null): string[] {
  if (!current) return ["beginner", "intermediate"];
  const currentLevel = DIFFICULTY_ORDER[current] || 1;
  const result: string[] = [current];
  for (const [key, val] of Object.entries(DIFFICULTY_ORDER)) {
    if (val === currentLevel + 1) {
      result.push(key);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Get Recommendations
// ---------------------------------------------------------------------------

export async function getRecommendations(
  orgId: number,
  userId: number,
  limit: number = 10
): Promise<RecommendedCourse[]> {
  const db = getDB();

  // 1. Get user's learning profile
  const profile = await db.findOne<any>("user_learning_profiles", {
    org_id: orgId,
    user_id: userId,
  });

  // 2. Get user's role/department from EmpCloud
  let userDepartmentId: number | null = null;
  let userRole: string | null = null;
  try {
    const empUser = await findUserById(userId);
    if (empUser) {
      userDepartmentId = empUser.department_id;
      userRole = empUser.role;
    }
  } catch (err: any) {
    logger.warn(`Failed to fetch EmpCloud user ${userId}: ${err.message}`);
  }

  // 3. Get user's already-enrolled course IDs
  const enrolledCourses = await db.raw<any[]>(
    `SELECT course_id FROM enrollments WHERE user_id = ? AND org_id = ?`,
    [userId, orgId]
  );
  const enrolledIds = enrolledCourses.map((e: any) => e.course_id);

  // 4. Parse user preferences
  let preferredCategories: string[] = [];
  let preferredDifficulty: string | null = null;

  if (profile) {
    preferredDifficulty = profile.preferred_difficulty || null;
    if (profile.preferred_categories) {
      try {
        preferredCategories =
          typeof profile.preferred_categories === "string"
            ? JSON.parse(profile.preferred_categories)
            : profile.preferred_categories;
      } catch {
        preferredCategories = [];
      }
    }
  }

  const targetDifficulties = getNextDifficulty(preferredDifficulty);

  // 5. Get all published courses not yet enrolled
  let excludeClause = "";
  const params: any[] = [orgId];

  if (enrolledIds.length > 0) {
    const placeholders = enrolledIds.map(() => "?").join(",");
    excludeClause = `AND c.id NOT IN (${placeholders})`;
    params.push(...enrolledIds);
  }

  const courses = await db.raw<any[]>(
    `SELECT c.*, cat.name AS category_name
     FROM courses c
     LEFT JOIN course_categories cat ON cat.id = c.category_id
     WHERE c.org_id = ? ${excludeClause}
       AND c.status = 'published'
     ORDER BY c.enrollment_count DESC, c.avg_rating DESC`,
    params
  );

  // 6. Score and rank each course
  const scoredCourses: RecommendedCourse[] = courses.map((course: any) => {
    let score = 0;
    const reasons: string[] = [];

    // Category match
    if (
      preferredCategories.length > 0 &&
      course.category_id &&
      preferredCategories.includes(course.category_id)
    ) {
      score += 30;
      reasons.push("Matches your preferred categories");
    }

    // Difficulty match
    if (course.difficulty && targetDifficulties.includes(course.difficulty)) {
      score += 20;
      if (
        preferredDifficulty &&
        course.difficulty !== preferredDifficulty
      ) {
        reasons.push("Next difficulty level for you");
      } else {
        reasons.push("Matches your skill level");
      }
    }

    // Popularity score (normalized)
    if (course.enrollment_count > 0) {
      const popularityScore = Math.min(course.enrollment_count / 100, 1) * 15;
      score += popularityScore;
      if (course.enrollment_count >= 50) {
        reasons.push("Popular among learners");
      }
    }

    // Rating score
    if (course.avg_rating > 0) {
      const ratingScore = (course.avg_rating / 5) * 15;
      score += ratingScore;
      if (course.avg_rating >= 4) {
        reasons.push("Highly rated");
      }
    }

    // Department popularity: check if colleagues from same department enrolled
    if (userDepartmentId) {
      // We can't easily do a sub-query here, so we give a small bonus
      // based on whether the course is mandatory (which often targets departments)
      if (course.is_mandatory) {
        score += 10;
        reasons.push("Recommended for your department");
      }
    }

    // Tags match with user's completed course tags
    if (course.tags) {
      try {
        const tags =
          typeof course.tags === "string"
            ? JSON.parse(course.tags)
            : course.tags;
        if (Array.isArray(tags) && tags.length > 0) {
          score += 5;
        }
      } catch {
        // Ignore
      }
    }

    // Featured courses get a small boost
    if (course.is_featured) {
      score += 10;
      reasons.push("Featured course");
    }

    return {
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description,
      short_description: course.short_description,
      thumbnail_url: course.thumbnail_url,
      category_id: course.category_id,
      category_name: course.category_name,
      difficulty: course.difficulty,
      duration_minutes: course.duration_minutes,
      enrollment_count: course.enrollment_count,
      avg_rating: parseFloat(course.avg_rating) || 0,
      tags: course.tags,
      score: Math.round(score * 100) / 100,
      reason: reasons.length > 0 ? reasons.join("; ") : "Recommended for you",
    };
  });

  // Sort by score descending
  scoredCourses.sort((a, b) => b.score - a.score);

  return scoredCourses.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Skill Gap Recommendations
// ---------------------------------------------------------------------------

export async function getSkillGapRecommendations(
  orgId: number,
  userId: number
): Promise<RecommendedCourse[]> {
  const db = getDB();

  // Check if emp-performance integration is configured
  const performanceApiUrl = process.env.PERFORMANCE_API_URL || "";

  let skillGapTags: string[] = [];

  if (performanceApiUrl) {
    try {
      const response = await fetch(
        `${performanceApiUrl}/api/skills/gaps?user_id=${userId}&org_id=${orgId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PERFORMANCE_API_KEY || ""}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const data: any = await response.json();
        if (data && data.data && Array.isArray(data.data.skills)) {
          skillGapTags = data.data.skills.map(
            (s: any) => s.skill_name || s.name
          );
        }
      }
    } catch (err: any) {
      logger.warn(`Failed to fetch skill gaps from performance API: ${err.message}`);
    }
  }

  // If no skill gaps from API, look at user's completed course tags and find gaps
  if (skillGapTags.length === 0) {
    // Fallback: recommend courses in categories the user hasn't explored
    const enrolledCategories = await db.raw<any[]>(
      `SELECT DISTINCT c.category_id
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.user_id = ? AND e.org_id = ? AND c.category_id IS NOT NULL`,
      [userId, orgId]
    );
    const enrolledCatIds = enrolledCategories.map((r: any) => r.category_id);

    let excludeClause = "";
    const params: any[] = [orgId, userId, orgId];
    if (enrolledCatIds.length > 0) {
      const placeholders = enrolledCatIds.map(() => "?").join(",");
      excludeClause = `AND c.category_id NOT IN (${placeholders})`;
      params.push(...enrolledCatIds);
    }

    const courses = await db.raw<any[]>(
      `SELECT c.*, cat.name AS category_name
       FROM courses c
       LEFT JOIN course_categories cat ON cat.id = c.category_id
       WHERE c.org_id = ?
         AND c.status = 'published'
         AND c.id NOT IN (SELECT course_id FROM enrollments WHERE user_id = ? AND org_id = ?)
         ${excludeClause}
       ORDER BY c.enrollment_count DESC
       LIMIT 10`,
      params
    );

    return courses.map((course: any) => ({
      id: course.id,
      title: course.title,
      slug: course.slug,
      description: course.description,
      short_description: course.short_description,
      thumbnail_url: course.thumbnail_url,
      category_id: course.category_id,
      category_name: course.category_name,
      difficulty: course.difficulty,
      duration_minutes: course.duration_minutes,
      enrollment_count: course.enrollment_count,
      avg_rating: parseFloat(course.avg_rating) || 0,
      tags: course.tags,
      score: 50,
      reason: "Explore a new topic area",
    }));
  }

  // Search courses matching skill gap tags
  let tagConditions = "";
  const tagParams: any[] = [orgId, userId, orgId];
  for (const tag of skillGapTags) {
    tagConditions += ` OR JSON_CONTAINS(c.tags, ?)`;
    tagParams.push(JSON.stringify(tag));
  }

  // Remove leading " OR "
  if (tagConditions.startsWith(" OR ")) {
    tagConditions = tagConditions.substring(4);
  }

  const courses = await db.raw<any[]>(
    `SELECT c.*, cat.name AS category_name
     FROM courses c
     LEFT JOIN course_categories cat ON cat.id = c.category_id
     WHERE c.org_id = ?
       AND c.status = 'published'
       AND c.id NOT IN (SELECT course_id FROM enrollments WHERE user_id = ? AND org_id = ?)
       AND (${tagConditions || "1=0"})
     ORDER BY c.enrollment_count DESC
     LIMIT 10`,
    tagParams
  );

  return courses.map((course: any) => ({
    id: course.id,
    title: course.title,
    slug: course.slug,
    description: course.description,
    short_description: course.short_description,
    thumbnail_url: course.thumbnail_url,
    category_id: course.category_id,
    category_name: course.category_name,
    difficulty: course.difficulty,
    duration_minutes: course.duration_minutes,
    enrollment_count: course.enrollment_count,
    avg_rating: parseFloat(course.avg_rating) || 0,
    tags: course.tags,
    score: 70,
    reason: "Addresses your skill gap",
  }));
}

// ---------------------------------------------------------------------------
// Trending Courses
// ---------------------------------------------------------------------------

export async function getTrendingCourses(
  orgId: number,
  limit: number = 10
): Promise<any[]> {
  const db = getDB();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const courses = await db.raw<any[]>(
    `SELECT c.*, cat.name AS category_name, COUNT(e.id) AS recent_enrollments
     FROM courses c
     LEFT JOIN course_categories cat ON cat.id = c.category_id
     LEFT JOIN enrollments e ON e.course_id = c.id AND e.enrolled_at >= ?
     WHERE c.org_id = ? AND c.status = 'published'
     GROUP BY c.id
     ORDER BY recent_enrollments DESC, c.avg_rating DESC
     LIMIT ?`,
    [thirtyDaysAgo.toISOString(), orgId, limit]
  );

  return courses;
}

// ---------------------------------------------------------------------------
// Similar Courses
// ---------------------------------------------------------------------------

export async function getSimilarCourses(
  orgId: number,
  courseId: string,
  limit: number = 5
): Promise<any[]> {
  const db = getDB();

  const course = await db.findOne<any>("courses", {
    id: courseId,
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", courseId);
  }

  // Find courses with same category, difficulty, or overlapping tags
  const params: any[] = [orgId, courseId];
  let conditions: string[] = [];

  if (course.category_id) {
    conditions.push("c.category_id = ?");
    params.push(course.category_id);
  }

  if (course.difficulty) {
    conditions.push("c.difficulty = ?");
    params.push(course.difficulty);
  }

  // Also match on tags if available
  let tagCondition = "";
  if (course.tags) {
    try {
      const tags =
        typeof course.tags === "string"
          ? JSON.parse(course.tags)
          : course.tags;
      if (Array.isArray(tags)) {
        for (const tag of tags) {
          conditions.push("JSON_CONTAINS(c.tags, ?)");
          params.push(JSON.stringify(tag));
        }
      }
    } catch {
      // Ignore
    }
  }

  let whereExtra = "";
  if (conditions.length > 0) {
    whereExtra = `AND (${conditions.join(" OR ")})`;
  }

  params.push(limit);

  const courses = await db.raw<any[]>(
    `SELECT c.*, cat.name AS category_name
     FROM courses c
     LEFT JOIN course_categories cat ON cat.id = c.category_id
     WHERE c.org_id = ?
       AND c.id != ?
       AND c.status = 'published'
       ${whereExtra}
     ORDER BY c.enrollment_count DESC, c.avg_rating DESC
     LIMIT ?`,
    params
  );

  return courses;
}

// ---------------------------------------------------------------------------
// Update Preferences
// ---------------------------------------------------------------------------

export async function updatePreferences(
  orgId: number,
  userId: number,
  preferences: {
    preferred_categories?: string[];
    preferred_difficulty?: string;
  }
): Promise<any> {
  const db = getDB();

  let profile = await db.findOne<any>("user_learning_profiles", {
    org_id: orgId,
    user_id: userId,
  });

  const updateData: Record<string, any> = {};

  if (preferences.preferred_categories !== undefined) {
    updateData.preferred_categories = JSON.stringify(
      preferences.preferred_categories
    );
  }

  if (preferences.preferred_difficulty !== undefined) {
    updateData.preferred_difficulty = preferences.preferred_difficulty;
  }

  if (!profile) {
    const { v4: uuidv4 } = require("uuid");
    profile = await db.create<any>("user_learning_profiles", {
      id: uuidv4(),
      org_id: orgId,
      user_id: userId,
      preferred_categories: updateData.preferred_categories || JSON.stringify([]),
      preferred_difficulty: updateData.preferred_difficulty || null,
      total_courses_completed: 0,
      total_time_spent_minutes: 0,
      total_points_earned: 0,
      current_streak_days: 0,
      longest_streak_days: 0,
      last_activity_at: null,
    });

    return profile;
  }

  const updated = await db.update("user_learning_profiles", profile.id, updateData);

  return updated;
}
