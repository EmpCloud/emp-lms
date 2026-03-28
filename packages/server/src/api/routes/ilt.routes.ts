// ============================================================================
// ILT (INSTRUCTOR-LED TRAINING) ROUTES
// /api/v1/ilt
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as iltService from "../../services/ilt/ilt.service";
import { sendSuccess, sendPaginated } from "../../utils/response";

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /ilt — alias for /ilt/sessions (#898)
router.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const {
        page,
        limit,
        status,
        course_id,
        instructor_id,
        start_date,
        end_date,
        sort,
        order,
      } = req.query;

      const result = await iltService.listSessions(orgId, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        status: status as string,
        course_id: course_id as string,
        instructor_id: instructor_id ? Number(instructor_id) : undefined,
        start_date: start_date as string,
        end_date: end_date as string,
        sort: sort as string,
        order: order as "asc" | "desc",
      });

      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (err) {
      next(err);
    }
  }
);

// ---- Session Queries ----

// GET /ilt/sessions/upcoming — upcoming sessions
// Must be defined before /sessions/:id to avoid route conflict
router.get(
  "/sessions/upcoming",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { limit } = req.query;
      const sessions = await iltService.getUpcomingSessions(
        orgId,
        limit ? Number(limit) : undefined
      );
      sendSuccess(res, sessions);
    } catch (err) {
      next(err);
    }
  }
);

// GET /ilt/my/sessions — current user's sessions
router.get(
  "/my/sessions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const { page, limit } = req.query;

      const result = await iltService.getUserSessions(orgId, userId, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });

      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (err) {
      next(err);
    }
  }
);

// GET /ilt/sessions — list sessions
router.get(
  "/sessions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const {
        page,
        limit,
        status,
        course_id,
        instructor_id,
        start_date,
        end_date,
        sort,
        order,
      } = req.query;

      const result = await iltService.listSessions(orgId, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        status: status as string,
        course_id: course_id as string,
        instructor_id: instructor_id ? Number(instructor_id) : undefined,
        start_date: start_date as string,
        end_date: end_date as string,
        sort: sort as string,
        order: order as "asc" | "desc",
      });

      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (err) {
      next(err);
    }
  }
);

// GET /ilt/sessions/:id — get session details
router.get(
  "/sessions/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const session = await iltService.getSession(orgId, req.params.id);
      sendSuccess(res, session);
    } catch (err) {
      next(err);
    }
  }
);

// ---- Session CRUD (hr_admin+) ----

// POST /ilt/sessions — create session
router.post(
  "/sessions",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const session = await iltService.createSession(orgId, req.body);
      sendSuccess(res, session, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /ilt/sessions/:id — update session
router.put(
  "/sessions/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const session = await iltService.updateSession(
        orgId,
        req.params.id,
        req.body
      );
      sendSuccess(res, session);
    } catch (err) {
      next(err);
    }
  }
);

// POST /ilt/sessions/:id/cancel — cancel session
router.post(
  "/sessions/:id/cancel",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const session = await iltService.cancelSession(orgId, req.params.id);
      sendSuccess(res, session);
    } catch (err) {
      next(err);
    }
  }
);

// POST /ilt/sessions/:id/complete — complete session
router.post(
  "/sessions/:id/complete",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const session = await iltService.completeSession(orgId, req.params.id);
      sendSuccess(res, session);
    } catch (err) {
      next(err);
    }
  }
);

// ---- Registration ----

// POST /ilt/sessions/:id/register — register user (self or hr_admin)
router.post(
  "/sessions/:id/register",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const role = req.user!.role;
      let userId = req.user!.empcloudUserId;

      if (
        req.body.user_id &&
        ["super_admin", "org_admin", "hr_admin"].includes(role)
      ) {
        userId = req.body.user_id;
      }

      const result = await iltService.registerUser(
        orgId,
        req.params.id,
        userId
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  }
);

// POST /ilt/sessions/:id/unregister — unregister user (self or hr_admin)
router.post(
  "/sessions/:id/unregister",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const role = req.user!.role;
      let userId = req.user!.empcloudUserId;

      if (
        req.body.user_id &&
        ["super_admin", "org_admin", "hr_admin"].includes(role)
      ) {
        userId = req.body.user_id;
      }

      const result = await iltService.unregisterUser(
        orgId,
        req.params.id,
        userId
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /ilt/sessions/:id/register-bulk — bulk register (hr_admin+)
router.post(
  "/sessions/:id/register-bulk",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { user_ids } = req.body;
      const result = await iltService.registerBulk(
        orgId,
        req.params.id,
        user_ids
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// ---- Attendance ----

// POST /ilt/sessions/:id/attendance — mark attendance (hr_admin+)
router.post(
  "/sessions/:id/attendance",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { attendance } = req.body;
      const result = await iltService.markAttendance(
        orgId,
        req.params.id,
        attendance
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /ilt/sessions/:id/attendance — get session attendance (hr_admin+)
router.get(
  "/sessions/:id/attendance",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await iltService.getSessionAttendance(
        orgId,
        req.params.id
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /ilt/sessions/:id/stats — get session stats (hr_admin+)
router.get(
  "/sessions/:id/stats",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const stats = await iltService.getSessionStats(orgId, req.params.id);
      sendSuccess(res, stats);
    } catch (err) {
      next(err);
    }
  }
);

export { router as iltRoutes };
