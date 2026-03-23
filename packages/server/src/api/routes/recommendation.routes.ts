// ============================================================================
// RECOMMENDATION ROUTES
// AI-powered (rule-based) learning recommendation endpoints.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import * as recommendationService from "../../services/ai-recommendation/ai-recommendation.service";
import { sendSuccess } from "../../utils/response";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /recommendations — Get personalized recommendations (current user)
router.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const limit = parseInt(req.query.limit as string) || 10;

      const recommendations = await recommendationService.getRecommendations(
        orgId,
        userId,
        limit
      );
      sendSuccess(res, recommendations);
    } catch (err) {
      next(err);
    }
  }
);

// GET /recommendations/trending — Trending courses
router.get(
  "/trending",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const limit = parseInt(req.query.limit as string) || 10;

      const courses = await recommendationService.getTrendingCourses(orgId, limit);
      sendSuccess(res, courses);
    } catch (err) {
      next(err);
    }
  }
);

// GET /recommendations/similar/:courseId — Similar courses
router.get(
  "/similar/:courseId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { courseId } = req.params;
      const limit = parseInt(req.query.limit as string) || 5;

      const courses = await recommendationService.getSimilarCourses(
        orgId,
        courseId,
        limit
      );
      sendSuccess(res, courses);
    } catch (err) {
      next(err);
    }
  }
);

// GET /recommendations/skill-gap — Skill gap recommendations (current user)
router.get(
  "/skill-gap",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;

      const recommendations =
        await recommendationService.getSkillGapRecommendations(orgId, userId);
      sendSuccess(res, recommendations);
    } catch (err) {
      next(err);
    }
  }
);

export { router as recommendationRoutes };
