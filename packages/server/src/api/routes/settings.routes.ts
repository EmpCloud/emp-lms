// ============================================================================
// SETTINGS / USER PREFERENCES ROUTES
// PUT /users/me/preferences — save user learning preferences
// GET /users/me/preferences — get user learning preferences
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { authenticate } from "../middleware/auth.middleware";
import { sendSuccess } from "../../utils/response";
import { getDB } from "../../db/adapters";
import { logger } from "../../utils/logger";

const router = Router();
router.use(authenticate);

// GET /users/me/preferences
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const userId = req.user!.empcloudUserId;
    const db = getDB();

    const row = await db.findOne<any>("user_preferences", {
      org_id: orgId,
      user_id: userId,
    });

    if (!row) {
      return sendSuccess(res, {});
    }

    const prefs = typeof row.preferences === "string"
      ? JSON.parse(row.preferences)
      : row.preferences;

    sendSuccess(res, prefs);
  } catch (err) {
    next(err);
  }
});

// PUT /users/me/preferences
router.put("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const userId = req.user!.empcloudUserId;
    const db = getDB();
    const prefs = req.body;

    const existing = await db.findOne<any>("user_preferences", {
      org_id: orgId,
      user_id: userId,
    });

    if (existing) {
      await db.update("user_preferences", existing.id, {
        preferences: JSON.stringify(prefs),
      } as any);
    } else {
      await db.create("user_preferences", {
        id: uuidv4(),
        org_id: orgId,
        user_id: userId,
        preferences: JSON.stringify(prefs),
      } as any);
    }

    logger.info(`User preferences saved: user=${userId} org=${orgId}`);
    sendSuccess(res, prefs);
  } catch (err) {
    next(err);
  }
});

export { router as settingsRoutes };
