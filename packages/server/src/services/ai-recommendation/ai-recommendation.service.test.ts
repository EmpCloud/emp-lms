import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/adapters/index", () => ({
  getDB: vi.fn(),
}));

vi.mock("../../db/empcloud", () => ({
  findUserById: vi.fn(),
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "test-uuid-1234"),
}));

import { getDB } from "../../db/adapters/index";
import { findUserById } from "../../db/empcloud";
import {
  getRecommendations,
  getSkillGapRecommendations,
  getTrendingCourses,
  getSimilarCourses,
  updatePreferences,
} from "./ai-recommendation.service";

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
  (findUserById as any).mockResolvedValue(null);
  delete (process.env as any).PERFORMANCE_API_URL;
  delete (process.env as any).PERFORMANCE_API_KEY;
});

// -- getRecommendations --------------------------------------------------------

describe("getRecommendations", () => {
  it("should return scored courses when no profile exists", async () => {
    mockDB.findOne.mockResolvedValue(null); // no profile
    (findUserById as any).mockResolvedValue(null);
    mockDB.raw.mockResolvedValueOnce([]); // enrolled courses
    mockDB.raw.mockResolvedValueOnce([
      {
        id: "c1",
        title: "Course 1",
        slug: "course-1",
        description: null,
        short_description: null,
        thumbnail_url: null,
        category_id: null,
        category_name: null,
        difficulty: "beginner",
        duration_minutes: 60,
        enrollment_count: 100,
        avg_rating: "4.5",
        tags: null,
        is_mandatory: false,
        is_featured: false,
      },
    ]);

    const result = await getRecommendations(1, 42, 10);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
    expect(result[0].score).toBeGreaterThan(0);
  });

  it("should boost score for category match", async () => {
    mockDB.findOne.mockResolvedValue({
      preferred_categories: JSON.stringify(["cat-1"]),
      preferred_difficulty: null,
    });
    (findUserById as any).mockResolvedValue(null);
    mockDB.raw.mockResolvedValueOnce([]); // enrolled
    mockDB.raw.mockResolvedValueOnce([
      {
        id: "c1",
        title: "Matched",
        slug: "matched",
        description: null,
        short_description: null,
        thumbnail_url: null,
        category_id: "cat-1",
        category_name: "Tech",
        difficulty: null,
        duration_minutes: 30,
        enrollment_count: 0,
        avg_rating: "0",
        tags: null,
        is_mandatory: false,
        is_featured: false,
      },
      {
        id: "c2",
        title: "Unmatched",
        slug: "unmatched",
        description: null,
        short_description: null,
        thumbnail_url: null,
        category_id: "cat-99",
        category_name: "Other",
        difficulty: null,
        duration_minutes: 30,
        enrollment_count: 0,
        avg_rating: "0",
        tags: null,
        is_mandatory: false,
        is_featured: false,
      },
    ]);

    const result = await getRecommendations(1, 42, 10);

    expect(result[0].id).toBe("c1");
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("should boost score for difficulty match", async () => {
    mockDB.findOne.mockResolvedValue({
      preferred_categories: "[]",
      preferred_difficulty: "intermediate",
    });
    (findUserById as any).mockResolvedValue(null);
    mockDB.raw.mockResolvedValueOnce([]);
    mockDB.raw.mockResolvedValueOnce([
      {
        id: "c1",
        title: "Advanced",
        slug: "advanced",
        description: null,
        short_description: null,
        thumbnail_url: null,
        category_id: null,
        category_name: null,
        difficulty: "advanced",
        duration_minutes: 60,
        enrollment_count: 0,
        avg_rating: "0",
        tags: null,
        is_mandatory: false,
        is_featured: false,
      },
    ]);

    const result = await getRecommendations(1, 42, 10);

    expect(result[0].reason).toContain("Next difficulty level");
  });

  it("should boost score for popular courses", async () => {
    mockDB.findOne.mockResolvedValue(null);
    (findUserById as any).mockResolvedValue(null);
    mockDB.raw.mockResolvedValueOnce([]);
    mockDB.raw.mockResolvedValueOnce([
      {
        id: "c1",
        title: "Popular",
        slug: "popular",
        description: null,
        short_description: null,
        thumbnail_url: null,
        category_id: null,
        category_name: null,
        difficulty: null,
        duration_minutes: 60,
        enrollment_count: 200,
        avg_rating: "0",
        tags: null,
        is_mandatory: false,
        is_featured: false,
      },
    ]);

    const result = await getRecommendations(1, 42, 10);

    expect(result[0].reason).toContain("Popular among learners");
  });

  it("should boost score for highly rated courses", async () => {
    mockDB.findOne.mockResolvedValue(null);
    (findUserById as any).mockResolvedValue(null);
    mockDB.raw.mockResolvedValueOnce([]);
    mockDB.raw.mockResolvedValueOnce([
      {
        id: "c1",
        title: "Highly Rated",
        slug: "highly-rated",
        description: null,
        short_description: null,
        thumbnail_url: null,
        category_id: null,
        category_name: null,
        difficulty: null,
        duration_minutes: 60,
        enrollment_count: 0,
        avg_rating: "4.8",
        tags: null,
        is_mandatory: false,
        is_featured: false,
      },
    ]);

    const result = await getRecommendations(1, 42, 10);

    expect(result[0].reason).toContain("Highly rated");
  });

  it("should boost score for featured courses", async () => {
    mockDB.findOne.mockResolvedValue(null);
    (findUserById as any).mockResolvedValue(null);
    mockDB.raw.mockResolvedValueOnce([]);
    mockDB.raw.mockResolvedValueOnce([
      {
        id: "c1",
        title: "Featured",
        slug: "featured",
        description: null,
        short_description: null,
        thumbnail_url: null,
        category_id: null,
        category_name: null,
        difficulty: null,
        duration_minutes: 60,
        enrollment_count: 0,
        avg_rating: "0",
        tags: null,
        is_mandatory: false,
        is_featured: true,
      },
    ]);

    const result = await getRecommendations(1, 42, 10);

    expect(result[0].reason).toContain("Featured course");
  });

  it("should boost mandatory courses when user has department", async () => {
    mockDB.findOne.mockResolvedValue(null);
    (findUserById as any).mockResolvedValue({ department_id: 5, role: "employee" });
    mockDB.raw.mockResolvedValueOnce([]);
    mockDB.raw.mockResolvedValueOnce([
      {
        id: "c1",
        title: "Mandatory",
        slug: "mandatory",
        description: null,
        short_description: null,
        thumbnail_url: null,
        category_id: null,
        category_name: null,
        difficulty: null,
        duration_minutes: 30,
        enrollment_count: 0,
        avg_rating: "0",
        tags: null,
        is_mandatory: true,
        is_featured: false,
      },
    ]);

    const result = await getRecommendations(1, 42, 10);

    expect(result[0].reason).toContain("Recommended for your department");
  });

  it("should exclude already enrolled courses", async () => {
    mockDB.findOne.mockResolvedValue(null);
    (findUserById as any).mockResolvedValue(null);
    mockDB.raw.mockResolvedValueOnce([{ course_id: "c1" }]); // enrolled
    mockDB.raw.mockResolvedValueOnce([]);

    const result = await getRecommendations(1, 42, 10);

    const query = mockDB.raw.mock.calls[1][0];
    expect(query).toContain("NOT IN");
    expect(result).toHaveLength(0);
  });

  it("should respect the limit parameter", async () => {
    mockDB.findOne.mockResolvedValue(null);
    (findUserById as any).mockResolvedValue(null);
    mockDB.raw.mockResolvedValueOnce([]);
    mockDB.raw.mockResolvedValueOnce([
      { id: "c1", title: "A", slug: "a", description: null, short_description: null, thumbnail_url: null, category_id: null, category_name: null, difficulty: null, duration_minutes: 10, enrollment_count: 0, avg_rating: "0", tags: null, is_mandatory: false, is_featured: false },
      { id: "c2", title: "B", slug: "b", description: null, short_description: null, thumbnail_url: null, category_id: null, category_name: null, difficulty: null, duration_minutes: 10, enrollment_count: 0, avg_rating: "0", tags: null, is_mandatory: false, is_featured: false },
      { id: "c3", title: "C", slug: "c", description: null, short_description: null, thumbnail_url: null, category_id: null, category_name: null, difficulty: null, duration_minutes: 10, enrollment_count: 0, avg_rating: "0", tags: null, is_mandatory: false, is_featured: false },
    ]);

    const result = await getRecommendations(1, 42, 2);

    expect(result).toHaveLength(2);
  });

  it("should return default reason when no specific reasons match", async () => {
    mockDB.findOne.mockResolvedValue(null);
    (findUserById as any).mockResolvedValue(null);
    mockDB.raw.mockResolvedValueOnce([]);
    mockDB.raw.mockResolvedValueOnce([
      {
        id: "c1",
        title: "Basic",
        slug: "basic",
        description: null,
        short_description: null,
        thumbnail_url: null,
        category_id: null,
        category_name: null,
        difficulty: "expert",
        duration_minutes: 10,
        enrollment_count: 0,
        avg_rating: "0",
        tags: null,
        is_mandatory: false,
        is_featured: false,
      },
    ]);

    const result = await getRecommendations(1, 42, 10);

    expect(result[0].reason).toBe("Recommended for you");
  });
});

// -- getSkillGapRecommendations ------------------------------------------------

describe("getSkillGapRecommendations", () => {
  it("should fallback to unexplored categories when no performance API", async () => {
    mockDB.raw
      .mockResolvedValueOnce([{ category_id: "cat-1" }]) // enrolled categories
      .mockResolvedValueOnce([
        {
          id: "c1",
          title: "New Topic",
          slug: "new-topic",
          description: null,
          short_description: null,
          thumbnail_url: null,
          category_id: "cat-2",
          category_name: "Design",
          difficulty: "beginner",
          duration_minutes: 45,
          enrollment_count: 20,
          avg_rating: "3.5",
          tags: null,
        },
      ]);

    const result = await getSkillGapRecommendations(1, 42);

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("Explore a new topic area");
    expect(result[0].score).toBe(50);
  });

  it("should return empty array when no unexplored categories", async () => {
    mockDB.raw
      .mockResolvedValueOnce([]) // no enrolled categories
      .mockResolvedValueOnce([]); // no courses found

    const result = await getSkillGapRecommendations(1, 42);

    expect(result).toEqual([]);
  });

  it("should use performance API when configured", async () => {
    process.env.PERFORMANCE_API_URL = "http://perf-api.test";
    process.env.PERFORMANCE_API_KEY = "test-key";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          skills: [{ skill_name: "React" }, { skill_name: "Node.js" }],
        },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    mockDB.raw.mockResolvedValueOnce([
      {
        id: "c1",
        title: "React Course",
        slug: "react-course",
        description: null,
        short_description: null,
        thumbnail_url: null,
        category_id: null,
        category_name: null,
        difficulty: "intermediate",
        duration_minutes: 120,
        enrollment_count: 50,
        avg_rating: "4.0",
        tags: '["React"]',
      },
    ]);

    const result = await getSkillGapRecommendations(1, 42);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/skills/gaps"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("Addresses your skill gap");
    expect(result[0].score).toBe(70);

    vi.unstubAllGlobals();
  });

  it("should fallback when performance API fails", async () => {
    process.env.PERFORMANCE_API_URL = "http://perf-api.test";

    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    mockDB.raw
      .mockResolvedValueOnce([]) // enrolled categories
      .mockResolvedValueOnce([]); // courses

    const result = await getSkillGapRecommendations(1, 42);

    expect(result).toEqual([]);

    vi.unstubAllGlobals();
  });

  it("should fallback when performance API returns non-ok response", async () => {
    process.env.PERFORMANCE_API_URL = "http://perf-api.test";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal("fetch", mockFetch);

    mockDB.raw
      .mockResolvedValueOnce([]) // enrolled categories
      .mockResolvedValueOnce([]); // courses

    const result = await getSkillGapRecommendations(1, 42);

    expect(result).toEqual([]);

    vi.unstubAllGlobals();
  });
});

// -- getTrendingCourses --------------------------------------------------------

describe("getTrendingCourses", () => {
  it("should return trending courses ordered by recent enrollments", async () => {
    mockDB.raw.mockResolvedValueOnce([
      { id: "c1", title: "Trending A", recent_enrollments: 50 },
      { id: "c2", title: "Trending B", recent_enrollments: 30 },
    ]);

    const result = await getTrendingCourses(1, 10);

    expect(result).toHaveLength(2);
    const query = mockDB.raw.mock.calls[0][0];
    expect(query).toContain("recent_enrollments DESC");
  });

  it("should return empty array when no trending courses", async () => {
    mockDB.raw.mockResolvedValueOnce([]);

    const result = await getTrendingCourses(1, 5);

    expect(result).toEqual([]);
  });
});

// -- getSimilarCourses ---------------------------------------------------------

describe("getSimilarCourses", () => {
  it("should return similar courses by category and difficulty", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "c1",
      category_id: "cat-1",
      difficulty: "intermediate",
      tags: null,
      organization_id: 1,
    });
    mockDB.raw.mockResolvedValueOnce([
      { id: "c2", title: "Similar Course" },
    ]);

    const result = await getSimilarCourses(1, "c1", 5);

    expect(result).toHaveLength(1);
    const query = mockDB.raw.mock.calls[0][0];
    expect(query).toContain("c.id != ?");
  });

  it("should throw NotFoundError when course not found", async () => {
    mockDB.findOne.mockResolvedValue(null);

    await expect(getSimilarCourses(1, "nonexistent")).rejects.toThrow("not found");
  });

  it("should match on tags when available", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "c1",
      category_id: null,
      difficulty: null,
      tags: JSON.stringify(["react", "frontend"]),
      organization_id: 1,
    });
    mockDB.raw.mockResolvedValueOnce([]);

    await getSimilarCourses(1, "c1", 5);

    const query = mockDB.raw.mock.calls[0][0];
    expect(query).toContain("JSON_CONTAINS(c.tags, ?)");
  });

  it("should return empty when no similar courses found", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "c1",
      category_id: null,
      difficulty: null,
      tags: null,
      organization_id: 1,
    });
    mockDB.raw.mockResolvedValueOnce([]);

    const result = await getSimilarCourses(1, "c1", 5);

    expect(result).toEqual([]);
  });
});

// -- updatePreferences ---------------------------------------------------------

describe("updatePreferences", () => {
  it("should create new profile when none exists", async () => {
    mockDB.findOne.mockResolvedValue(null);
    mockDB.create.mockResolvedValue({
      id: "new-profile-id",
      org_id: 1,
      user_id: 42,
      preferred_categories: JSON.stringify(["cat-1"]),
      preferred_difficulty: "intermediate",
    });

    const result = await updatePreferences(1, 42, {
      preferred_categories: ["cat-1"],
      preferred_difficulty: "intermediate",
    });

    expect(mockDB.create).toHaveBeenCalledWith(
      "user_learning_profiles",
      expect.objectContaining({
        org_id: 1,
        user_id: 42,
        preferred_categories: JSON.stringify(["cat-1"]),
        preferred_difficulty: "intermediate",
        total_courses_completed: 0,
        total_time_spent_minutes: 0,
      })
    );
    expect(result).toBeDefined();
  });

  it("should update existing profile", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "profile-1",
      org_id: 1,
      user_id: 42,
      preferred_categories: "[]",
      preferred_difficulty: null,
    });
    mockDB.update.mockResolvedValue({
      id: "profile-1",
      preferred_categories: JSON.stringify(["cat-2"]),
      preferred_difficulty: "advanced",
    });

    const result = await updatePreferences(1, 42, {
      preferred_categories: ["cat-2"],
      preferred_difficulty: "advanced",
    });

    expect(mockDB.update).toHaveBeenCalledWith(
      "user_learning_profiles",
      "profile-1",
      expect.objectContaining({
        preferred_categories: JSON.stringify(["cat-2"]),
        preferred_difficulty: "advanced",
      })
    );
    expect(result).toBeDefined();
  });

  it("should handle partial preference updates", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "profile-1",
      org_id: 1,
      user_id: 42,
    });
    mockDB.update.mockResolvedValue({ id: "profile-1" });

    await updatePreferences(1, 42, {
      preferred_difficulty: "beginner",
    });

    expect(mockDB.update).toHaveBeenCalledWith(
      "user_learning_profiles",
      "profile-1",
      expect.objectContaining({
        preferred_difficulty: "beginner",
      })
    );
  });
});
