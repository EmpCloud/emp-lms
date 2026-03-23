// ============================================================================
// NOTIFICATION ROUTES
// In-app notification management endpoints.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import * as notificationService from "../../services/notification/notification.service";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.use(authenticate);

// GET /notifications — List user's notifications
router.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const page = parseInt(req.query.page as string) || 1;
      const perPage = parseInt(req.query.perPage as string) || 20;
      const unreadOnly = req.query.unreadOnly === "true";

      const result = await notificationService.listNotifications(orgId, userId, {
        page,
        perPage,
        unreadOnly,
      });
      sendPaginated(res, result.data, result.total, result.page, result.perPage);
    } catch (err) {
      next(err);
    }
  }
);

// GET /notifications/unread-count — Get unread notification count
router.get(
  "/unread-count",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const count = await notificationService.getUnreadCount(orgId, userId);
      sendSuccess(res, { count });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /notifications/:id/read — Mark a notification as read
router.patch(
  "/:id/read",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const result = await notificationService.markAsRead(orgId, userId, req.params.id);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /notifications/mark-all-read — Mark all notifications as read
router.post(
  "/mark-all-read",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const count = await notificationService.markAllAsRead(orgId, userId);
      sendSuccess(res, { marked: count });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /notifications/:id — Delete a notification
router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      await notificationService.deleteNotification(orgId, userId, req.params.id);
      sendSuccess(res, null, 204);
    } catch (err) {
      next(err);
    }
  }
);

export { router as notificationRoutes };
