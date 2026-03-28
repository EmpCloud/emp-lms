// ============================================================================
// ANALYTICS ROUTES
// Comprehensive LMS analytics and reporting endpoints.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import * as analyticsService from "../../services/analytics/analytics.service";
import { sendSuccess } from "../../utils/response";
import { BadRequestError, ForbiddenError } from "../../utils/errors";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /analytics/overview — Overview dashboard (hr_admin+)
router.get(
  "/overview",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;

      const dashboard = await analyticsService.getOverviewDashboard(orgId);
      sendSuccess(res, dashboard);
    } catch (err) {
      next(err);
    }
  }
);

// GET /analytics/course/:courseId — Course analytics (hr_admin+)
router.get(
  "/course/:courseId",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { courseId } = req.params;

      const analytics = await analyticsService.getCourseAnalytics(orgId, courseId);
      sendSuccess(res, analytics);
    } catch (err) {
      next(err);
    }
  }
);

// GET /analytics/courses/:courseId — alias for /analytics/course/:courseId (#903)
router.get(
  "/courses/:courseId",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { courseId } = req.params;

      const analytics = await analyticsService.getCourseAnalytics(orgId, courseId);
      sendSuccess(res, analytics);
    } catch (err) {
      next(err);
    }
  }
);

// GET /analytics/users — list user-level analytics (hr_admin+) (#902)
router.get(
  "/users",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;

      const analytics = await analyticsService.getOrgAnalytics(orgId, {
        start: req.query.start as string | undefined,
        end: req.query.end as string | undefined,
      });
      sendSuccess(res, analytics);
    } catch (err) {
      next(err);
    }
  }
);

// GET /analytics/user/:userId — User analytics (self or hr_admin)
router.get(
  "/user/:userId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const currentUserId = req.user!.empcloudUserId;
      const targetUserId = parseInt(req.params.userId);

      // Allow self or admin
      const adminRoles = ["super_admin", "org_admin", "hr_admin"];
      if (targetUserId !== currentUserId && !adminRoles.includes(req.user!.role)) {
        throw new ForbiddenError("You can only view your own analytics.");
      }

      const analytics = await analyticsService.getUserAnalytics(orgId, targetUserId);
      sendSuccess(res, analytics);
    } catch (err) {
      next(err);
    }
  }
);

// GET /analytics/org — Org-wide analytics (hr_admin+)
router.get(
  "/org",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const dateRange = {
        start: req.query.start as string | undefined,
        end: req.query.end as string | undefined,
      };

      const analytics = await analyticsService.getOrgAnalytics(orgId, dateRange);
      sendSuccess(res, analytics);
    } catch (err) {
      next(err);
    }
  }
);

// GET /analytics/department/:deptId — Department analytics (hr_admin+)
router.get(
  "/department/:deptId",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const departmentId = parseInt(req.params.deptId);

      if (isNaN(departmentId)) {
        throw new BadRequestError("Invalid department ID.");
      }

      const analytics = await analyticsService.getDepartmentAnalytics(
        orgId,
        departmentId
      );
      sendSuccess(res, analytics);
    } catch (err) {
      next(err);
    }
  }
);

// GET /analytics/compliance — Compliance analytics (hr_admin+)
router.get(
  "/compliance",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;

      const analytics = await analyticsService.getComplianceAnalytics(orgId);
      sendSuccess(res, analytics);
    } catch (err) {
      next(err);
    }
  }
);

// GET /analytics/certificates — Certificate analytics (hr_admin+)
router.get(
  "/certificates",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;

      const analytics = await analyticsService.getCertificateAnalytics(orgId);
      sendSuccess(res, analytics);
    } catch (err) {
      next(err);
    }
  }
);

// GET /analytics/instructor/:instructorId — Instructor analytics (hr_admin+)
router.get(
  "/instructor/:instructorId",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const instructorId = parseInt(req.params.instructorId);

      if (isNaN(instructorId)) {
        throw new BadRequestError("Invalid instructor ID.");
      }

      const analytics = await analyticsService.getInstructorAnalytics(
        orgId,
        instructorId
      );
      sendSuccess(res, analytics);
    } catch (err) {
      next(err);
    }
  }
);

// GET /analytics/time-spent — Time spent analytics (hr_admin+)
router.get(
  "/time-spent",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const dateRange = {
        start: req.query.start as string | undefined,
        end: req.query.end as string | undefined,
      };

      const analytics = await analyticsService.getTimeSpentAnalytics(
        orgId,
        dateRange
      );
      sendSuccess(res, analytics);
    } catch (err) {
      next(err);
    }
  }
);

// POST /analytics/export — Export analytics data (hr_admin+)
router.post(
  "/export",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { type, format } = req.body;

      if (!type) {
        throw new BadRequestError("Export type is required.");
      }

      const result = await analyticsService.exportAnalytics(
        orgId,
        type,
        format || "csv"
      );

      res.setHeader("Content-Type", result.contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.filename}"`
      );
      res.send(result.data);
    } catch (err) {
      next(err);
    }
  }
);

export { router as analyticsRoutes };
