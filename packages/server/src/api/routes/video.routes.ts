// ============================================================================
// VIDEO ROUTES
// Video upload and management endpoints.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import * as videoService from "../../services/video/video.service";
import { sendSuccess } from "../../utils/response";
import { BadRequestError } from "../../utils/errors";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { uploadVideo as uploadVideoMiddleware } from "../middleware/upload.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

// POST /video/upload — Upload video (hr_admin+)
router.post(
  "/upload",
  authorize("super_admin", "org_admin", "hr_admin"),
  uploadVideoMiddleware("videoFile"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;

      if (!req.file) {
        throw new BadRequestError("Video file is required.");
      }

      const result = await videoService.uploadVideo(orgId, req.file);
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /video/:path — Delete video (hr_admin+)
router.delete(
  "/:path(*)",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const videoPath = req.params.path;

      if (!videoPath) {
        throw new BadRequestError("Video path is required.");
      }

      await videoService.deleteVideo(orgId, videoPath);
      sendSuccess(res, { message: "Video deleted successfully." });
    } catch (err) {
      next(err);
    }
  }
);

export { router as videoRoutes };
