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
    const userId = req.user!.empcloudUserId;
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

    // Enrich with current user's enrollment / progress so the catalog can
    // show progress bars and swap Enroll → Continue without a follow-up
    // request per card.
    const { getDB } = await import("../../db/adapters/index.js");
    const db = getDB();
    const rawRows: any = await db.raw(
      `SELECT learning_path_id, status, progress_percentage FROM learning_path_enrollments WHERE org_id = ? AND user_id = ?`,
      [orgId, userId]
    );
    const enrollmentRows = Array.isArray(rawRows) && Array.isArray(rawRows[0]) ? rawRows[0] : Array.isArray(rawRows) ? rawRows : [];
    const userEnrollments = new Map<string, any>();
    for (const r of enrollmentRows) userEnrollments.set(r.learning_path_id, r);

    const enriched = result.data.map((path: any) => {
      const enrollment = userEnrollments.get(path.id);
      return {
        ...path,
        progress: enrollment ? Number(enrollment.progress_percentage) : null,
        enrolled: !!enrollment,
        enrollment_status: enrollment?.status ?? null,
      };
    });

    sendPaginated(res, enriched, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
});

// GET /learning-paths/:id — get learning path details + user enrollment/progress
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const userId = req.user!.empcloudUserId;
    const path = await learningPathService.getLearningPath(orgId, req.params.id);

    // Enrich with user's path enrollment
    const { getDB } = await import("../../db/adapters/index.js");
    const db = getDB();

    const pathEnrollRaw: any = await db.raw(
      `SELECT status, progress_percentage, enrolled_at, completed_at
       FROM learning_path_enrollments
       WHERE org_id = ? AND user_id = ? AND learning_path_id = ?
       LIMIT 1`,
      [orgId, userId, req.params.id]
    );
    const pathEnroll = (Array.isArray(pathEnrollRaw) && Array.isArray(pathEnrollRaw[0])
      ? pathEnrollRaw[0][0]
      : Array.isArray(pathEnrollRaw) ? pathEnrollRaw[0] : null);

    // Enrich each course with the user's enrollment status so the timeline
    // can show completed / in-progress / available / locked.
    const courseIds = (path.courses || []).map((c: any) => c.id).filter(Boolean);
    let courseStatusMap = new Map<string, any>();
    if (courseIds.length > 0 && pathEnroll) {
      const placeholders = courseIds.map(() => "?").join(",");
      const courseEnrollRaw: any = await db.raw(
        `SELECT course_id, status, progress_percentage
         FROM enrollments
         WHERE org_id = ? AND user_id = ? AND course_id IN (${placeholders})`,
        [orgId, userId, ...courseIds]
      );
      const rows = Array.isArray(courseEnrollRaw) && Array.isArray(courseEnrollRaw[0])
        ? courseEnrollRaw[0]
        : Array.isArray(courseEnrollRaw) ? courseEnrollRaw : [];
      for (const r of rows) courseStatusMap.set(r.course_id, r);
    }

    // Derive per-course status: completed > in_progress > available (first
    // non-completed course) > locked (everything after the first available).
    let firstAvailableSeen = false;
    const enrichedCourses = (path.courses || []).map((course: any) => {
      if (!pathEnroll) {
        // Not enrolled in path — all courses show as available (preview)
        return { ...course, status: "available", course_progress: 0 };
      }
      const enrollment = courseStatusMap.get(course.id);
      if (enrollment) {
        const s = enrollment.status;
        if (s === "completed") {
          return { ...course, status: "completed", course_progress: 100 };
        }
        // in_progress or enrolled
        firstAvailableSeen = true;
        return { ...course, status: "in-progress", course_progress: Number(enrollment.progress_percentage || 0) };
      }
      // No enrollment for this course
      if (!firstAvailableSeen) {
        firstAvailableSeen = true;
        return { ...course, status: "available", course_progress: 0 };
      }
      return { ...course, status: "locked", course_progress: 0 };
    });

    sendSuccess(res, {
      ...path,
      courses: enrichedCourses,
      enrolled: !!pathEnroll,
      progress: pathEnroll ? Number(pathEnroll.progress_percentage) : null,
      enrollment_status: pathEnroll?.status ?? null,
      enrolled_at: pathEnroll?.enrolled_at ?? null,
      completed_at: pathEnroll?.completed_at ?? null,
    });
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
