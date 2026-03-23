// ============================================================================
// COMPLIANCE ROUTES
// /api/v1/compliance
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as complianceService from "../../services/compliance/compliance.service";
import { sendSuccess, sendPaginated } from "../../utils/response";

const router = Router();

// All routes require authentication
router.use(authenticate);

// ---- Assignments ----

// GET /compliance/assignments — list assignments (hr_admin+)
router.get(
  "/assignments",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { page, limit, is_active, course_id } = req.query;

      const result = await complianceService.listAssignments(orgId, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        is_active: is_active !== undefined ? is_active === "true" : undefined,
        course_id: course_id as string,
      });

      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (err) {
      next(err);
    }
  }
);

// GET /compliance/assignments/:id — get assignment (hr_admin+)
router.get(
  "/assignments/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const assignment = await complianceService.getAssignment(
        orgId,
        req.params.id
      );
      sendSuccess(res, assignment);
    } catch (err) {
      next(err);
    }
  }
);

// POST /compliance/assignments — create assignment (hr_admin+)
router.post(
  "/assignments",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const assignment = await complianceService.createAssignment(
        orgId,
        userId,
        req.body
      );
      sendSuccess(res, assignment, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /compliance/assignments/:id — update assignment (hr_admin+)
router.put(
  "/assignments/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const assignment = await complianceService.updateAssignment(
        orgId,
        req.params.id,
        req.body
      );
      sendSuccess(res, assignment);
    } catch (err) {
      next(err);
    }
  }
);

// POST /compliance/assignments/:id/deactivate — deactivate assignment (hr_admin+)
router.post(
  "/assignments/:id/deactivate",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const assignment = await complianceService.deactivateAssignment(
        orgId,
        req.params.id
      );
      sendSuccess(res, assignment);
    } catch (err) {
      next(err);
    }
  }
);

// ---- Records ----

// GET /compliance/records/my — current user's compliance records
// Must be defined before /records/:id to avoid route conflict
router.get(
  "/records/my",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const userId = req.user!.empcloudUserId;
      const { page, limit } = req.query;

      const result = await complianceService.getUserComplianceRecords(
        orgId,
        userId,
        {
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
        }
      );

      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (err) {
      next(err);
    }
  }
);

// GET /compliance/records — list records (hr_admin+)
router.get(
  "/records",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { page, limit, status, user_id, assignment_id, course_id } =
        req.query;

      const result = await complianceService.getComplianceRecords(orgId, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        status: status as string,
        user_id: user_id ? Number(user_id) : undefined,
        assignment_id: assignment_id as string,
        course_id: course_id as string,
      });

      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /compliance/records/:id/status — update record status (hr_admin+)
router.put(
  "/records/:id/status",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { status } = req.body;
      const record = await complianceService.updateComplianceStatus(
        orgId,
        req.params.id,
        status
      );
      sendSuccess(res, record);
    } catch (err) {
      next(err);
    }
  }
);

// ---- Dashboard ----

// GET /compliance/dashboard — compliance dashboard (hr_admin+)
router.get(
  "/dashboard",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const dashboard = await complianceService.getComplianceDashboard(orgId);
      sendSuccess(res, dashboard);
    } catch (err) {
      next(err);
    }
  }
);

export { router as complianceRoutes };
