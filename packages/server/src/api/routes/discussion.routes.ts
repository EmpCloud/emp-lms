// ============================================================================
// DISCUSSION ROUTES
// Course discussion forums and Q&A threads.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import * as discussionService from "../../services/discussion/discussion.service";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { createDiscussionSchema } from "@emp-lms/shared";

const router = Router();

router.use(authenticate);

// GET /discussions?course_id=xxx — List discussions for a course
router.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const courseId = req.query.course_id as string;

      if (!courseId) {
        return res.status(400).json({
          success: false,
          error: { code: "MISSING_PARAM", message: "course_id is required" },
        });
      }

      const page = parseInt(req.query.page as string) || 1;
      const perPage = parseInt(req.query.perPage as string) || 20;
      const lessonId = req.query.lesson_id as string | undefined;

      const result = await discussionService.listDiscussions(orgId, courseId, {
        lessonId,
        page,
        perPage,
      });
      sendPaginated(res, result.data, result.total, result.page, result.perPage);
    } catch (err) {
      next(err);
    }
  }
);

// GET /discussions/:id — Get discussion with replies
router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await discussionService.getDiscussion(orgId, req.params.id);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /discussions — Create a new discussion
router.post(
  "/",
  validateBody(createDiscussionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const result = await discussionService.createDiscussion(orgId, userId, req.body);
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

// POST /discussions/:id/replies — Reply to a discussion
router.post(
  "/:id/replies",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const result = await discussionService.replyToDiscussion(
        orgId,
        userId,
        req.params.id,
        req.body
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /discussions/:id — Update a discussion
router.put(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const result = await discussionService.updateDiscussion(
        orgId,
        userId,
        req.params.id,
        req.body
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /discussions/:id — Delete a discussion
router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const isAdmin = ["super_admin", "org_admin", "hr_admin"].includes(req.user!.role);
      await discussionService.deleteDiscussion(orgId, userId, req.params.id, isAdmin);
      sendSuccess(res, null, 204);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /discussions/:id/pin — Toggle pin
router.patch(
  "/:id/pin",
  authorize("org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await discussionService.togglePin(orgId, req.params.id);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /discussions/:id/resolve — Toggle resolve
router.patch(
  "/:id/resolve",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await discussionService.toggleResolve(orgId, req.params.id);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

export { router as discussionRoutes };
