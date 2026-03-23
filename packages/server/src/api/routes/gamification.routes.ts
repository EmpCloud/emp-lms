// ============================================================================
// GAMIFICATION ROUTES
// Leaderboard, points, streaks, and preference endpoints.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import * as gamificationService from "../../services/gamification/gamification.service";
import * as recommendationService from "../../services/ai-recommendation/ai-recommendation.service";
import { sendSuccess } from "../../utils/response";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /gamification/leaderboard — Get top learners
router.get(
  "/leaderboard",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const limit = parseInt(req.query.limit as string) || 20;

      const leaderboard = await gamificationService.getLeaderboard(orgId, limit);
      sendSuccess(res, leaderboard);
    } catch (err) {
      next(err);
    }
  }
);

// GET /gamification/my/points — Get current user's points
router.get(
  "/my/points",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;

      const result = await gamificationService.getUserPoints(orgId, userId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /gamification/my/streak — Get current user's learning streak
router.get(
  "/my/streak",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;

      const { getDB } = require("../../db/adapters/index") as { getDB: () => any };
      const db = getDB();

      const profile = await db.findOne("user_learning_profiles", {
        org_id: orgId,
        user_id: userId,
      });

      sendSuccess(res, {
        current_streak_days: profile?.current_streak_days || 0,
        longest_streak_days: profile?.longest_streak_days || 0,
        last_activity_at: profile?.last_activity_at || null,
      });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /gamification/my/preferences — Update learning preferences
router.put(
  "/my/preferences",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;

      const result = await recommendationService.updatePreferences(
        orgId,
        userId,
        req.body
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

export { router as gamificationRoutes };
