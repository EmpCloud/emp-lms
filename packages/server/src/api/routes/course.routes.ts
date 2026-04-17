// ============================================================================
// COURSE ROUTES
// All course-related routes under /api/v1/courses
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, optionalAuth, authorize } from "../middleware/auth.middleware";
import { validateBody, validateQuery } from "../middleware/validate.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import {
  createCourseSchema,
  updateCourseSchema,
  courseFilterSchema,
  createCourseCategorySchema,
  updateCourseCategorySchema,
  createCourseModuleSchema,
  updateCourseModuleSchema,
  createLessonSchema,
  updateLessonSchema,
} from "@emp-lms/shared";
import * as courseService from "../../services/course/course.service";
import * as categoryService from "../../services/course/category.service";
import * as moduleService from "../../services/course/module.service";
import * as lessonService from "../../services/course/lesson.service";
import { z } from "zod";

const router = Router();

const adminRoles: Parameters<typeof authorize>[0][] = [
  "super_admin",
  "org_admin",
  "hr_admin",
];

const reorderSchema = z.object({
  ordered_ids: z.array(z.string().uuid()).min(1),
});

// ============================================================================
// COURSE ROUTES
// ============================================================================

// GET /courses — list courses (paginated, filterable)
router.get(
  "/",
  authenticate,
  validateQuery(courseFilterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await courseService.listCourses(orgId, req.query as any);
      sendPaginated(res, result.data, result.total, result.page, result.perPage);
    } catch (err) {
      next(err);
    }
  }
);

// GET /courses/popular
router.get(
  "/popular",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const limit = parseInt(req.query.limit as string) || 10;
      const courses = await courseService.getPopularCourses(orgId, limit);
      sendSuccess(res, courses);
    } catch (err) {
      next(err);
    }
  }
);

// GET /courses/recommended
router.get(
  "/recommended",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const limit = parseInt(req.query.limit as string) || 10;
      const courses = await courseService.getRecommendedCourses(orgId, userId, limit);
      sendSuccess(res, courses);
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// CATEGORY ROUTES
// ============================================================================

// GET /courses/categories
router.get(
  "/categories",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const categories = await categoryService.listCategories(orgId);
      sendSuccess(res, categories);
    } catch (err) {
      next(err);
    }
  }
);

// POST /courses/categories
router.post(
  "/categories",
  authenticate,
  authorize(...adminRoles),
  validateBody(createCourseCategorySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const category = await categoryService.createCategory(orgId, req.body);
      sendSuccess(res, category, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /courses/categories/:id
router.put(
  "/categories/:id",
  authenticate,
  authorize(...adminRoles),
  validateBody(updateCourseCategorySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const category = await categoryService.updateCategory(orgId, req.params.id, req.body);
      sendSuccess(res, category);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /courses/categories/:id
router.delete(
  "/categories/:id",
  authenticate,
  authorize(...adminRoles),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await categoryService.deleteCategory(orgId, req.params.id);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// SINGLE COURSE ROUTES
// ============================================================================

// GET /courses/:id — enriched with the caller's enrollment status so the
// detail page can show "Continue Learning" vs "Enroll Now".
router.get(
  "/:id",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const course = await courseService.getCourse(orgId, req.params.id);

      // Look up the caller's enrollment for this course
      const { getDB } = await import("../../db/adapters/index.js");
      const db = getDB();
      const enrollRaw: any = await db.raw(
        `SELECT id, status, progress_percentage, enrolled_at, started_at, completed_at, time_spent_minutes, score
         FROM enrollments
         WHERE org_id = ? AND user_id = ? AND course_id = ?
         LIMIT 1`,
        [orgId, userId, req.params.id]
      );
      const enrollRow = Array.isArray(enrollRaw) && Array.isArray(enrollRaw[0])
        ? enrollRaw[0][0]
        : Array.isArray(enrollRaw) ? enrollRaw[0] : null;

      // Enrich lessons with per-user completion status so the detail page
      // can show green checks next to completed lessons.
      let lessonProgressMap = new Map<string, boolean>();
      if (enrollRow) {
        const lpRaw: any = await db.raw(
          `SELECT lesson_id, is_completed FROM lesson_progress WHERE enrollment_id = ?`,
          [enrollRow.id]
        );
        const lpRows = Array.isArray(lpRaw) && Array.isArray(lpRaw[0]) ? lpRaw[0] : Array.isArray(lpRaw) ? lpRaw : [];
        for (const r of lpRows) {
          if (r.is_completed) lessonProgressMap.set(r.lesson_id, true);
        }
      }

      // Stamp is_completed on each lesson inside each module
      const enrichedModules = (course.modules || []).map((mod: any) => ({
        ...mod,
        lessons: (mod.lessons || []).map((lesson: any) => ({
          ...lesson,
          is_completed: lessonProgressMap.has(lesson.id),
        })),
      }));

      sendSuccess(res, {
        ...course,
        modules: enrichedModules,
        enrollment: enrollRow
          ? {
              id: enrollRow.id,
              status: enrollRow.status,
              progress: Number(enrollRow.progress_percentage || 0),
              enrolled_at: enrollRow.enrolled_at,
              started_at: enrollRow.started_at,
              completed_at: enrollRow.completed_at,
              time_spent_minutes: enrollRow.time_spent_minutes,
              score: enrollRow.score,
            }
          : null,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /courses
router.post(
  "/",
  authenticate,
  authorize(...adminRoles),
  validateBody(createCourseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const course = await courseService.createCourse(orgId, userId, req.body);
      sendSuccess(res, course, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /courses/:id
router.put(
  "/:id",
  authenticate,
  authorize(...adminRoles),
  validateBody(updateCourseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const course = await courseService.updateCourse(orgId, req.params.id, req.body);
      sendSuccess(res, course);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /courses/:id
router.delete(
  "/:id",
  authenticate,
  authorize(...adminRoles),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await courseService.deleteCourse(orgId, req.params.id);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /courses/:id/publish
router.post(
  "/:id/publish",
  authenticate,
  authorize(...adminRoles),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const course = await courseService.publishCourse(orgId, req.params.id);
      sendSuccess(res, course);
    } catch (err) {
      next(err);
    }
  }
);

// POST /courses/:id/unpublish
router.post(
  "/:id/unpublish",
  authenticate,
  authorize(...adminRoles),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const course = await courseService.unpublishCourse(orgId, req.params.id);
      sendSuccess(res, course);
    } catch (err) {
      next(err);
    }
  }
);

// POST /courses/:id/duplicate
router.post(
  "/:id/duplicate",
  authenticate,
  authorize(...adminRoles),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const course = await courseService.duplicateCourse(orgId, userId, req.params.id);
      sendSuccess(res, course, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /courses/:id/stats
router.get(
  "/:id/stats",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const stats = await courseService.getCourseStats(orgId, req.params.id);
      sendSuccess(res, stats);
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// MODULE ROUTES
// ============================================================================

// GET /courses/:id/modules
router.get(
  "/:id/modules",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const modules = await moduleService.listModules(req.params.id);
      sendSuccess(res, modules);
    } catch (err) {
      next(err);
    }
  }
);

// POST /courses/:id/modules
router.post(
  "/:id/modules",
  authenticate,
  authorize(...adminRoles),
  validateBody(createCourseModuleSchema.omit({ course_id: true })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const mod = await moduleService.createModule(orgId, req.params.id, req.body);
      sendSuccess(res, mod, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /courses/:id/modules/:moduleId
router.put(
  "/:id/modules/:moduleId",
  authenticate,
  authorize(...adminRoles),
  validateBody(updateCourseModuleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const mod = await moduleService.updateModule(orgId, req.params.moduleId, req.body);
      sendSuccess(res, mod);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /courses/:id/modules/:moduleId
router.delete(
  "/:id/modules/:moduleId",
  authenticate,
  authorize(...adminRoles),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await moduleService.deleteModule(orgId, req.params.moduleId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /courses/:id/modules/reorder
router.post(
  "/:id/modules/reorder",
  authenticate,
  authorize(...adminRoles),
  validateBody(reorderSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await moduleService.reorderModules(
        orgId,
        req.params.id,
        req.body.ordered_ids
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// LESSON ROUTES
// ============================================================================

// GET /courses/:id/modules/:moduleId/lessons
router.get(
  "/:id/modules/:moduleId/lessons",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lessons = await lessonService.listLessons(req.params.moduleId);
      sendSuccess(res, lessons);
    } catch (err) {
      next(err);
    }
  }
);

// POST /courses/:id/modules/:moduleId/lessons
router.post(
  "/:id/modules/:moduleId/lessons",
  authenticate,
  authorize(...adminRoles),
  validateBody(createLessonSchema.omit({ module_id: true })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const lesson = await lessonService.createLesson(orgId, req.params.moduleId, req.body);
      sendSuccess(res, lesson, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /courses/:id/lessons/:lessonId
router.put(
  "/:id/lessons/:lessonId",
  authenticate,
  authorize(...adminRoles),
  validateBody(updateLessonSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const lesson = await lessonService.updateLesson(orgId, req.params.lessonId, req.body);
      sendSuccess(res, lesson);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /courses/:id/lessons/:lessonId
router.delete(
  "/:id/lessons/:lessonId",
  authenticate,
  authorize(...adminRoles),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await lessonService.deleteLesson(orgId, req.params.lessonId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /courses/:id/modules/:moduleId/lessons/reorder
router.post(
  "/:id/modules/:moduleId/lessons/reorder",
  authenticate,
  authorize(...adminRoles),
  validateBody(reorderSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await lessonService.reorderLessons(
        orgId,
        req.params.moduleId,
        req.body.ordered_ids
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /courses/:id/preview — preview lessons (optional auth)
router.get(
  "/:id/preview",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lessons = await lessonService.getPreviewLessons(req.params.id);
      sendSuccess(res, lessons);
    } catch (err) {
      next(err);
    }
  }
);

export { router as courseRoutes };
