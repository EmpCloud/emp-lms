// ============================================================================
// SCORM ROUTES
// SCORM package management and tracking endpoints.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import * as scormService from "../../services/scorm/scorm.service";
import { sendSuccess } from "../../utils/response";
import { BadRequestError } from "../../utils/errors";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { uploadScorm } from "../middleware/upload.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /scorm/upload — Upload SCORM package (hr_admin+)
router.post(
  "/upload",
  authorize("super_admin", "org_admin", "hr_admin"),
  uploadScorm("scormFile"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { courseId, lessonId, version } = req.body;

      if (!courseId) {
        throw new BadRequestError("courseId is required.");
      }
      if (!version || !["1.2", "2004"].includes(version)) {
        throw new BadRequestError("version must be '1.2' or '2004'.");
      }
      if (!req.file) {
        throw new BadRequestError("SCORM ZIP file is required.");
      }

      const result = await scormService.uploadPackage(
        orgId,
        courseId,
        lessonId || null,
        req.file,
        version
      );

      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /scorm/course/:courseId — Get packages by course
router.get(
  "/course/:courseId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { courseId } = req.params;

      const packages = await scormService.getPackagesByCourse(orgId, courseId);
      sendSuccess(res, packages);
    } catch (err) {
      next(err);
    }
  }
);

// GET /scorm/:id — Get single package
router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = req.params;

      const pkg = await scormService.getPackage(orgId, id);
      sendSuccess(res, pkg);
    } catch (err) {
      next(err);
    }
  }
);

// GET /scorm/:id/launch — Get launch URL (enrolled users)
router.get(
  "/:id/launch",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const result = await scormService.getLaunchUrl(id);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /scorm/:id — Delete package (hr_admin+)
router.delete(
  "/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = req.params;

      await scormService.deletePackage(orgId, id);
      sendSuccess(res, { message: "SCORM package deleted successfully." });
    } catch (err) {
      next(err);
    }
  }
);

// POST /scorm/:id/tracking/init — Initialize tracking (enrolled users)
router.post(
  "/:id/tracking/init",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.empcloudUserId;
      const { id } = req.params;
      const { enrollmentId } = req.body;

      if (!enrollmentId) {
        throw new BadRequestError("enrollmentId is required.");
      }

      const tracking = await scormService.initTracking(id, userId, enrollmentId);
      sendSuccess(res, tracking, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /scorm/:id/tracking — Update tracking (enrolled users)
router.put(
  "/:id/tracking",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.empcloudUserId;
      const { id } = req.params;

      const tracking = await scormService.updateTracking(id, userId, req.body);
      sendSuccess(res, tracking);
    } catch (err) {
      next(err);
    }
  }
);

// POST /scorm/:id/tracking/commit — Commit tracking (enrolled users)
router.post(
  "/:id/tracking/commit",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.empcloudUserId;
      const { id } = req.params;

      const tracking = await scormService.commitTracking(id, userId, req.body);
      sendSuccess(res, tracking);
    } catch (err) {
      next(err);
    }
  }
);

// GET /scorm/:id/tracking — Get tracking data (enrolled users)
router.get(
  "/:id/tracking",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.empcloudUserId;
      const { id } = req.params;

      const tracking = await scormService.getTracking(id, userId);
      sendSuccess(res, tracking);
    } catch (err) {
      next(err);
    }
  }
);

export { router as scormRoutes };
