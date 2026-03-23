// ============================================================================
// RATING ROUTES
// Course ratings and reviews.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters/index";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { createCourseRatingSchema } from "@emp-lms/shared/validators";
import { NotFoundError, ConflictError } from "../../utils/errors";

const router = Router();

router.use(authenticate);

// GET /ratings?course_id=xxx — List ratings for a course
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

      const db = getDB();
      const page = parseInt(req.query.page as string) || 1;
      const perPage = parseInt(req.query.perPage as string) || 20;
      const offset = (page - 1) * perPage;

      const [countResult] = await db.raw<any[]>(
        `SELECT COUNT(*) as total FROM course_ratings WHERE org_id = ? AND course_id = ?`,
        [orgId, courseId]
      );
      const total = countResult?.total ?? 0;

      const data = await db.raw<any[]>(
        `SELECT * FROM course_ratings WHERE org_id = ? AND course_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [orgId, courseId, perPage, offset]
      );

      sendPaginated(res, data, total, page, perPage);
    } catch (err) {
      next(err);
    }
  }
);

// GET /ratings/summary?course_id=xxx — Get rating summary for a course
router.get(
  "/summary",
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

      const db = getDB();
      const [summary] = await db.raw<any[]>(
        `SELECT
          COUNT(*) as total_ratings,
          COALESCE(AVG(rating), 0) as average_rating,
          SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star,
          SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star,
          SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star,
          SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star,
          SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
        FROM course_ratings
        WHERE org_id = ? AND course_id = ?`,
        [orgId, courseId]
      );

      sendSuccess(res, summary);
    } catch (err) {
      next(err);
    }
  }
);

// POST /ratings — Submit a rating
router.post(
  "/",
  validateBody(createCourseRatingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const { course_id, rating, review } = req.body;

      const db = getDB();

      // Check if user already rated this course
      const existing = await db.findOne<any>("course_ratings", {
        course_id,
        user_id: userId,
      });

      if (existing) {
        throw new ConflictError("You have already rated this course. Use PUT to update.");
      }

      const id = uuidv4();
      const created = await db.create<any>("course_ratings", {
        id,
        course_id,
        user_id: userId,
        org_id: orgId,
        rating,
        review: review ?? null,
        is_approved: true,
      });

      // Update course average rating
      const [avg] = await db.raw<any[]>(
        `SELECT AVG(rating) as avg_rating, COUNT(*) as rating_count FROM course_ratings WHERE course_id = ?`,
        [course_id]
      );
      await db.raw(
        `UPDATE courses SET avg_rating = ?, rating_count = ? WHERE id = ?`,
        [Math.round((avg?.avg_rating ?? 0) * 10) / 10, avg?.rating_count ?? 0, course_id]
      );

      sendSuccess(res, created, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /ratings/:id — Update a rating
router.put(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const db = getDB();

      const existing = await db.findOne<any>("course_ratings", {
        id: req.params.id,
        org_id: orgId,
        user_id: userId,
      });

      if (!existing) {
        throw new NotFoundError("Rating", req.params.id);
      }

      const updates: Record<string, any> = {};
      if (req.body.rating !== undefined) updates.rating = req.body.rating;
      if (req.body.review !== undefined) updates.review = req.body.review;

      await db.update("course_ratings", req.params.id, updates);

      // Update course average rating
      const [avg] = await db.raw<any[]>(
        `SELECT AVG(rating) as avg_rating, COUNT(*) as rating_count FROM course_ratings WHERE course_id = ?`,
        [existing.course_id]
      );
      await db.raw(
        `UPDATE courses SET avg_rating = ?, rating_count = ? WHERE id = ?`,
        [Math.round((avg?.avg_rating ?? 0) * 10) / 10, avg?.rating_count ?? 0, existing.course_id]
      );

      sendSuccess(res, { ...existing, ...updates });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /ratings/:id — Delete a rating
router.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const db = getDB();

      const existing = await db.findOne<any>("course_ratings", {
        id: req.params.id,
        org_id: orgId,
      });

      if (!existing) {
        throw new NotFoundError("Rating", req.params.id);
      }

      const isAdmin = ["super_admin", "org_admin", "hr_admin"].includes(req.user!.role);
      if (!isAdmin && existing.user_id !== userId) {
        return res.status(403).json({
          success: false,
          error: { code: "FORBIDDEN", message: "You can only delete your own ratings" },
        });
      }

      await db.delete("course_ratings", req.params.id);

      // Update course average rating
      const [avg] = await db.raw<any[]>(
        `SELECT AVG(rating) as avg_rating, COUNT(*) as rating_count FROM course_ratings WHERE course_id = ?`,
        [existing.course_id]
      );
      await db.raw(
        `UPDATE courses SET avg_rating = ?, rating_count = ? WHERE id = ?`,
        [Math.round((avg?.avg_rating ?? 0) * 10) / 10, avg?.rating_count ?? 0, existing.course_id]
      );

      sendSuccess(res, null, 204);
    } catch (err) {
      next(err);
    }
  }
);

export { router as ratingRoutes };
