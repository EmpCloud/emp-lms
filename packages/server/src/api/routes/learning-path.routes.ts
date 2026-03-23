// ============================================================================
// LEARNING PATH ROUTES
// /api/v1/learning-paths
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as learningPathService from "../../services/learning-path/learning-path.service";
import { sendSuccess, sendPaginated } from "../../utils/response";

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /learning-paths/my/enrollments — current user's enrollments
// Must be defined before /:id to avoid route conflict
router.get(
  "/my/enrollments",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const { page, limit } = req.query;

      const result = await learningPathService.listUserPathEnrollments(
        orgId,
        userId,
        {
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
        }
      );

      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (err) {
      next(err);
    }
  }
);

// GET /learning-paths — list learning paths
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { page, limit, status, difficulty, is_mandatory, search, sort, order } =
      req.query;

    const result = await learningPathService.listLearningPaths(orgId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status: status as string,
      difficulty: difficulty as string,
      is_mandatory:
        is_mandatory !== undefined ? is_mandatory === "true" : undefined,
      search: search as string,
      sort: sort as string,
      order: order as "asc" | "desc",
    });

    sendPaginated(res, result.data, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
});

// GET /learning-paths/:id — get learning path details
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const path = await learningPathService.getLearningPath(orgId, req.params.id);
    sendSuccess(res, path);
  } catch (err) {
    next(err);
  }
});

// POST /learning-paths — create learning path (hr_admin+)
router.post(
  "/",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const path = await learningPathService.createLearningPath(
        orgId,
        userId,
        req.body
      );
      sendSuccess(res, path, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /learning-paths/:id — update learning path (hr_admin+)
router.put(
  "/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const path = await learningPathService.updateLearningPath(
        orgId,
        req.params.id,
        req.body
      );
      sendSuccess(res, path);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /learning-paths/:id — archive learning path (hr_admin+)
router.delete(
  "/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await learningPathService.deleteLearningPath(
        orgId,
        req.params.id
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /learning-paths/:id/publish — publish learning path (hr_admin+)
router.post(
  "/:id/publish",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const path = await learningPathService.publishLearningPath(
        orgId,
        req.params.id
      );
      sendSuccess(res, path);
    } catch (err) {
      next(err);
    }
  }
);

// POST /learning-paths/:id/courses — add course to path (hr_admin+)
router.post(
  "/:id/courses",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { course_id, sort_order, is_mandatory } = req.body;
      const result = await learningPathService.addCourse(
        orgId,
        req.params.id,
        course_id,
        sort_order,
        is_mandatory
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /learning-paths/:id/courses/:courseId — remove course from path (hr_admin+)
router.delete(
  "/:id/courses/:courseId",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await learningPathService.removeCourse(
        orgId,
        req.params.id,
        req.params.courseId
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /learning-paths/:id/courses/reorder — reorder courses (hr_admin+)
router.post(
  "/:id/courses/reorder",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { course_ids } = req.body;
      const result = await learningPathService.reorderCourses(
        orgId,
        req.params.id,
        course_ids
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /learning-paths/:id/enroll — enroll user (self or hr_admin)
router.post(
  "/:id/enroll",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const role = req.user!.role;
      // Self-enroll by default; hr_admin+ can enroll others
      let userId = req.user!.empcloudUserId;
      if (
        req.body.user_id &&
        ["super_admin", "org_admin", "hr_admin"].includes(role)
      ) {
        userId = req.body.user_id;
      }

      const enrollment = await learningPathService.enrollUser(
        orgId,
        userId,
        req.params.id
      );
      sendSuccess(res, enrollment, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /learning-paths/:id/enrollments — list path enrollments (hr_admin+)
router.get(
  "/:id/enrollments",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { page, limit } = req.query;

      const result = await learningPathService.listPathEnrollments(
        orgId,
        req.params.id,
        {
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
        }
      );

      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (err) {
      next(err);
    }
  }
);

// GET /learning-paths/:id/my-progress — current user's enrollment in path
router.get(
  "/:id/my-progress",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const enrollment = await learningPathService.getEnrollment(
        orgId,
        userId,
        req.params.id
      );
      sendSuccess(res, enrollment);
    } catch (err) {
      next(err);
    }
  }
);

export { router as learningPathRoutes };
