// ============================================================================
// MARKETPLACE ROUTES
// Content library and marketplace endpoints.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import * as marketplaceService from "../../services/marketplace/marketplace.service";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { BadRequestError } from "../../utils/errors";
import { authenticate, authorize, optionalAuth } from "../middleware/auth.middleware";

const router = Router();

// GET /marketplace/public — Public marketplace (optional auth)
router.get(
  "/public",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = {
        page: parseInt(req.query.page as string) || 1,
        perPage: parseInt(req.query.perPage as string) || 20,
        content_type: req.query.content_type as string | undefined,
        category: req.query.category as string | undefined,
        search: req.query.search as string | undefined,
        sort: req.query.sort as string | undefined,
        order: req.query.order as "asc" | "desc" | undefined,
      };

      const result = await marketplaceService.getPublicItems(filters);
      sendPaginated(res, result.data, result.total, result.page, result.perPage);
    } catch (err) {
      next(err);
    }
  }
);

// All remaining routes require authentication
router.use(authenticate);

// GET /marketplace — List items
router.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;

      const filters = {
        page: parseInt(req.query.page as string) || 1,
        perPage: parseInt(req.query.perPage as string) || 20,
        content_type: req.query.content_type as string | undefined,
        category: req.query.category as string | undefined,
        is_public:
          req.query.is_public !== undefined
            ? req.query.is_public === "true"
            : undefined,
        search: req.query.search as string | undefined,
        sort: req.query.sort as string | undefined,
        order: req.query.order as "asc" | "desc" | undefined,
      };

      const result = await marketplaceService.listItems(orgId, filters);
      sendPaginated(res, result.data, result.total, result.page, result.perPage);
    } catch (err) {
      next(err);
    }
  }
);

// GET /marketplace/:id — Get single item
router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = req.params;

      const item = await marketplaceService.getItem(orgId, id);
      sendSuccess(res, item);
    } catch (err) {
      next(err);
    }
  }
);

// POST /marketplace — Create item (hr_admin+)
router.post(
  "/",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;

      const item = await marketplaceService.createItem(orgId, userId, req.body);
      sendSuccess(res, item, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /marketplace/:id — Update item (hr_admin+)
router.put(
  "/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = req.params;

      const item = await marketplaceService.updateItem(orgId, id, req.body);
      sendSuccess(res, item);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /marketplace/:id — Delete item (hr_admin+)
router.delete(
  "/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = req.params;

      await marketplaceService.deleteItem(orgId, id);
      sendSuccess(res, { message: "Content library item deleted successfully." });
    } catch (err) {
      next(err);
    }
  }
);

// POST /marketplace/:id/import — Import item to course (hr_admin+)
router.post(
  "/:id/import",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = req.params;
      const { courseId, moduleId } = req.body;

      if (!courseId) {
        throw new BadRequestError("courseId is required.");
      }
      if (!moduleId) {
        throw new BadRequestError("moduleId is required.");
      }

      const lesson = await marketplaceService.importToCourse(
        orgId,
        id,
        courseId,
        moduleId
      );
      sendSuccess(res, lesson, 201);
    } catch (err) {
      next(err);
    }
  }
);

export { router as marketplaceRoutes };
