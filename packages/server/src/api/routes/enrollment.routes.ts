// ============================================================================
// ENROLLMENT ROUTES
// All enrollment routes under /api/v1/enrollments
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { enrollCourseSchema } from "@emp-lms/shared";
import * as enrollmentService from "../../services/enrollment/enrollment.service";
import { z } from "zod";

const router = Router();

const adminRoles: Parameters<typeof authorize>[0][] = [
  "super_admin",
  "org_admin",
  "hr_admin",
];

const bulkEnrollSchema = z.object({
  user_ids: z.array(z.number().int()).min(1),
  course_id: z.string().uuid(),
  due_date: z.string().optional(),
});

const lessonCompleteSchema = z.object({
  time_spent: z.number().int().min(0).optional(),
});

const enrollmentFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  search: z.string().optional(),
});

// ============================================================================
// ENROLLMENT ROUTES
// ============================================================================

// POST /enrollments — enroll user (self-enroll or admin-enroll)
router.post(
  "/",
  authenticate,
  validateBody(enrollCourseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const currentUserId = req.user!.empcloudUserId;
      const { user_id, course_id, due_date } = req.body;

      // Non-admin users can only self-enroll
      const isAdmin = ["super_admin", "org_admin", "hr_admin"].includes(req.user!.role);
      const targetUserId = isAdmin ? user_id : currentUserId;

      if (!isAdmin && user_id !== currentUserId) {
        return sendSuccess(res, null, 403);
      }

      const enrollment = await enrollmentService.enrollUser(
        orgId,
        targetUserId,
        course_id,
        due_date
      );
      sendSuccess(res, enrollment, 201);
    } catch (err) {
      next(err);
    }
  }
);

// POST /enrollments/bulk — batch enroll (admin only)
router.post(
  "/bulk",
  authenticate,
  authorize(...adminRoles),
  validateBody(bulkEnrollSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { user_ids, course_id, due_date } = req.body;
      const results = await enrollmentService.enrollBulk(orgId, user_ids, course_id, due_date);
      sendSuccess(res, results, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /enrollments/my — list current user's enrollments
router.get(
  "/my",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const filters = enrollmentFilterSchema.parse(req.query);
      const result = await enrollmentService.listUserEnrollments(orgId, userId, filters);
      sendPaginated(res, result.data, result.total, result.page, result.perPage);
    } catch (err) {
      next(err);
    }
  }
);

// GET /enrollments/course/:courseId — list course enrollments (admin)
router.get(
  "/course/:courseId",
  authenticate,
  authorize(...adminRoles),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const filters = enrollmentFilterSchema.parse(req.query);
      const result = await enrollmentService.listCourseEnrollments(
        orgId,
        req.params.courseId,
        filters
      );
      sendPaginated(res, result.data, result.total, result.page, result.perPage);
    } catch (err) {
      next(err);
    }
  }
);

// GET /enrollments/my/:courseId — get my progress for a course
router.get(
  "/my/:courseId",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const progress = await enrollmentService.getMyProgress(orgId, userId, req.params.courseId);
      sendSuccess(res, progress);
    } catch (err) {
      next(err);
    }
  }
);

// POST /enrollments/:id/lessons/:lessonId/complete — mark lesson complete
router.post(
  "/:id/lessons/:lessonId/complete",
  authenticate,
  validateBody(lessonCompleteSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const isAdmin = ["super_admin", "org_admin", "hr_admin"].includes(req.user!.role);

      // Verify the requesting user owns this enrollment (or is admin).
      // The DB adapter camelizes keys, so user_id → userId. Number()
      // cast handles mysql2 BigInt vs JWT number mismatch.
      if (!isAdmin) {
        const enrollment = await enrollmentService.getEnrollmentById(orgId, req.params.id);
        const enrollUserId = Number(enrollment.userId ?? enrollment.user_id);
        if (enrollUserId !== Number(userId)) {
          return res.status(403).json({ success: false, error: "You can only complete lessons on your own enrollment" });
        }
      }

      const result = await enrollmentService.markLessonComplete(
        orgId,
        req.params.id,
        req.params.lessonId,
        req.body.time_spent
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /enrollments/:id/complete — manual completion (admin)
router.post(
  "/:id/complete",
  authenticate,
  authorize(...adminRoles),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const enrollment = await enrollmentService.completeEnrollment(orgId, req.params.id);
      sendSuccess(res, enrollment);
    } catch (err) {
      next(err);
    }
  }
);

// POST /enrollments/:id/drop — drop enrollment (self or admin)
router.post(
  "/:id/drop",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const isAdmin = ["super_admin", "org_admin", "hr_admin"].includes(req.user!.role);

      // Verify the requesting user owns this enrollment (or is admin)
      if (!isAdmin) {
        const existing = await enrollmentService.getEnrollmentById(orgId, req.params.id);
        if (existing.user_id !== userId) {
          return res.status(403).json({ success: false, error: "You can only drop your own enrollment" });
        }
      }

      const enrollment = await enrollmentService.dropEnrollment(orgId, req.params.id);
      sendSuccess(res, enrollment);
    } catch (err) {
      next(err);
    }
  }
);

// GET /enrollments/recent — recent activity for current user
router.get(
  "/recent",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const limit = parseInt(req.query.limit as string) || 10;
      const activity = await enrollmentService.getRecentActivity(orgId, userId, limit);
      sendSuccess(res, activity);
    } catch (err) {
      next(err);
    }
  }
);

export { router as enrollmentRoutes };
