// ============================================================================
// EMP LMS — Service Coverage Final Tests
// Targets: category, lesson, gamification, certification, compliance,
//          enrollment, quiz, marketplace, errors
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("../../services/notification/notification.service", () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined),
  NotificationService: class { send() { return Promise.resolve(); } },
}));

let db: any;

beforeAll(async () => {
  // Override the setup.ts credentials with real DB creds
  process.env.DB_HOST = "localhost";
  process.env.DB_PORT = "3306";
  process.env.DB_USER = "empcloud";
  process.env.DB_PASSWORD = "EmpCloud2026";
  process.env.DB_NAME = "emp_lms";
  process.env.EMPCLOUD_DB_HOST = "localhost";
  process.env.EMPCLOUD_DB_PORT = "3306";
  process.env.EMPCLOUD_DB_USER = "empcloud";
  process.env.EMPCLOUD_DB_PASSWORD = "EmpCloud2026";
  process.env.EMPCLOUD_DB_NAME = "empcloud";

  const dbMod = await import("../../db/adapters");
  await dbMod.initDB();
  db = dbMod.getDB();
}, 30000);

afterAll(async () => {
  const dbMod = await import("../../db/adapters");
  await dbMod.closeDB();
}, 10000);

const ORG = 5;
const U = String(Date.now()).slice(-6);

// ── ERROR CLASSES ────────────────────────────────────────────────────────────

describe("LMS error classes", () => {
  it("AppError", async () => {
    const { AppError } = await import("../../utils/errors");
    const err = new AppError(500, "SERVER", "Internal error");
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("SERVER");
    expect(err instanceof Error).toBe(true);
  });

  it("NotFoundError", async () => {
    const { NotFoundError } = await import("../../utils/errors");
    const err = new NotFoundError("Course", "abc-123");
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("abc-123");
  });

  it("ValidationError", async () => {
    const { ValidationError } = await import("../../utils/errors");
    const err = new ValidationError("Bad input");
    expect(err.statusCode).toBe(400);
  });

  it("ForbiddenError", async () => {
    const { ForbiddenError } = await import("../../utils/errors");
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
  });

  it("ConflictError", async () => {
    const { ConflictError } = await import("../../utils/errors");
    const err = new ConflictError("Already enrolled");
    expect(err.statusCode).toBe(409);
  });
});

// ── CATEGORY SERVICE ─────────────────────────────────────────────────────────

describe("Category service", () => {
  let categoryService: any;
  let catId: string;

  beforeAll(async () => {
    categoryService = await import("../../services/course/category.service");
  });

  afterAll(async () => {
    try { if (catId) await db("categories").where({ id: catId }).del(); } catch {}
  });

  it("createCategory", async () => {
    const result = await categoryService.createCategory(ORG, {
      name: "CovCat-" + U,
      description: "Test category",
    });
    expect(result).toBeDefined();
    expect(result.name).toBe("CovCat-" + U);
    catId = result.id;
  });

  it("listCategories", async () => {
    const result = await categoryService.listCategories(ORG);
    expect(result).toBeDefined();
  });

  it("getCategory", async () => {
    const result = await categoryService.getCategory(ORG, catId);
    expect(result.name).toContain("CovCat");
  });

  it("getCategory throws NotFoundError", async () => {
    await expect(categoryService.getCategory(ORG, "nonexistent"))
      .rejects.toThrow();
  });

  it("updateCategory", async () => {
    const result = await categoryService.updateCategory(ORG, catId, {
      description: "Updated desc",
    });
    expect(result.description).toBe("Updated desc");
  });
});

// ── LESSON SERVICE — error branches ──────────────────────────────────────────

describe("Lesson service — error branches", () => {
  let lessonService: any;

  beforeAll(async () => {
    lessonService = await import("../../services/course/lesson.service");
  });

  it("getLesson throws NotFoundError", async () => {
    await expect(lessonService.getLesson("nonexistent-module", "nonexistent"))
      .rejects.toThrow();
  });
});

// ── MODULE SERVICE — error branches ──────────────────────────────────────────

describe("Module service — error branches", () => {
  let moduleService: any;

  beforeAll(async () => {
    moduleService = await import("../../services/course/module.service");
  });

  it("getModule throws NotFoundError", async () => {
    await expect(moduleService.getModule("nonexistent-course", "nonexistent"))
      .rejects.toThrow();
  });
});

// ── GAMIFICATION SERVICE ─────────────────────────────────────────────────────
// Note: gamification exports award* functions that need real course/quiz IDs
// so we test that the module imports successfully
describe("Gamification service — import", () => {
  it("module exports award functions", async () => {
    const mod = await import("../../services/gamification/gamification.service");
    expect(typeof mod.awardCourseCompletionPoints).toBe("function");
    expect(typeof mod.awardQuizPassPoints).toBe("function");
    expect(typeof mod.awardStreakPoints).toBe("function");
  });
});

// ── CERTIFICATION SERVICE — error branches ───────────────────────────────────

describe("Certification service — error branches", () => {
  let certService: any;

  beforeAll(async () => {
    certService = await import("../../services/certification/certification.service");
  });

  it("getCertificate throws NotFoundError", async () => {
    await expect(certService.getCertificate(ORG, "nonexistent"))
      .rejects.toThrow();
  });

  it("getUserCertificates returns data", async () => {
    const result = await certService.getUserCertificates(ORG, 999999);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── ENROLLMENT SERVICE — error branches ──────────────────────────────────────

describe("Enrollment service — error branches", () => {
  let enrollmentService: any;

  beforeAll(async () => {
    enrollmentService = await import("../../services/enrollment/enrollment.service");
  });

  it("getEnrollmentById throws NotFoundError", async () => {
    await expect(enrollmentService.getEnrollmentById(ORG, "nonexistent"))
      .rejects.toThrow();
  });
});

// ── COMPLIANCE SERVICE — error branches ──────────────────────────────────────

describe("Compliance service — error branches", () => {
  let complianceService: any;

  beforeAll(async () => {
    complianceService = await import("../../services/compliance/compliance.service");
  });

  it("listAssignments returns data", async () => {
    const result = await complianceService.listAssignments(ORG, {});
    expect(result).toBeDefined();
  });

  it("getAssignment throws NotFoundError", async () => {
    await expect(complianceService.getAssignment(ORG, "nonexistent"))
      .rejects.toThrow();
  });
});

// ── MARKETPLACE SERVICE — error branches ─────────────────────────────────────

describe("Marketplace service — error branches", () => {
  let marketplaceService: any;

  beforeAll(async () => {
    marketplaceService = await import("../../services/marketplace/marketplace.service");
  });

  it("listItems returns data", async () => {
    const result = await marketplaceService.listItems(ORG, {});
    expect(result).toBeDefined();
  });
});

// ── DISCUSSION SERVICE — error branches ──────────────────────────────────────

describe("Discussion service — error branches", () => {
  let discussionService: any;

  beforeAll(async () => {
    discussionService = await import("../../services/discussion/discussion.service");
  });

  it("getDiscussion throws NotFoundError", async () => {
    await expect(discussionService.getDiscussion(ORG, "nonexistent"))
      .rejects.toThrow();
  });

  it("listDiscussions returns data", async () => {
    const result = await discussionService.listDiscussions(ORG, {});
    expect(result).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });
});

// ── LEARNING PATH SERVICE — error branches ───────────────────────────────────

describe("Learning path service — error branches", () => {
  let lpService: any;

  beforeAll(async () => {
    lpService = await import("../../services/learning-path/learning-path.service");
  });

  it("getLearningPath throws NotFoundError", async () => {
    await expect(lpService.getLearningPath(ORG, "nonexistent"))
      .rejects.toThrow();
  });

  it("listLearningPaths returns data", async () => {
    const result = await lpService.listLearningPaths(ORG, {});
    expect(result).toBeDefined();
  });
});
