// ============================================================================
// CERTIFICATION ROUTES
// All certificate endpoints under /api/v1/certificates
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import * as certService from "../../services/certification/certification.service";
import { sendSuccess } from "../../utils/response";
import { authenticate, authorize, optionalAuth } from "../middleware/auth.middleware";
import { BadRequestError, NotFoundError } from "../../utils/errors";

const router = Router();

const ADMIN_ROLES = ["super_admin", "org_admin", "hr_admin"] as const;

// ---------------------------------------------------------------------------
// Public Verification (no auth required) — must be before /:id routes
// ---------------------------------------------------------------------------

// GET /certificates/verify/:number — public verification
router.get(
  "/verify/:number",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await certService.verifyCertificate(req.params.number);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Template Routes — must be before /:id to avoid matching "templates" as an id
// ---------------------------------------------------------------------------

// GET /certificates/templates — list templates
router.get(
  "/templates",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const templates = await certService.listTemplates(req.user!.empcloudOrgId);
      sendSuccess(res, templates);
    } catch (err) {
      next(err);
    }
  }
);

// GET /certificates/templates/:id — get single template
router.get(
  "/templates/:id",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const template = await certService.getTemplate(
        req.user!.empcloudOrgId,
        req.params.id
      );
      sendSuccess(res, template);
    } catch (err) {
      next(err);
    }
  }
);

// POST /certificates/templates — create template
router.post(
  "/templates",
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, html_template, is_default } = req.body;
      if (!name) {
        throw new BadRequestError("name is required");
      }
      const template = await certService.createTemplate(req.user!.empcloudOrgId, {
        name,
        description,
        html_template,
        is_default,
      });
      sendSuccess(res, template, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /certificates/templates/:id — update template
router.put(
  "/templates/:id",
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const template = await certService.updateTemplate(
        req.user!.empcloudOrgId,
        req.params.id,
        req.body
      );
      sendSuccess(res, template);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /certificates/templates/:id — delete template
router.delete(
  "/templates/:id",
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await certService.deleteTemplate(
        req.user!.empcloudOrgId,
        req.params.id
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// User Certificates
// ---------------------------------------------------------------------------

// GET /certificates/my — current user's certificates
router.get(
  "/my",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const certificates = await certService.getUserCertificates(
        req.user!.empcloudOrgId,
        req.user!.empcloudUserId
      );
      sendSuccess(res, certificates);
    } catch (err) {
      next(err);
    }
  }
);

// GET /certificates/course/:courseId — all certificates for a course
router.get(
  "/course/:courseId",
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const certificates = await certService.getCourseCertificates(
        req.user!.empcloudOrgId,
        req.params.courseId
      );
      sendSuccess(res, certificates);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Certificate Operations
// ---------------------------------------------------------------------------

// POST /certificates/issue — issue a certificate
router.post(
  "/issue",
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, course_id, enrollment_id, template_id } = req.body;
      if (!user_id || !course_id || !enrollment_id) {
        throw new BadRequestError("user_id, course_id, and enrollment_id are required");
      }
      const certificate = await certService.issueCertificate(
        req.user!.empcloudOrgId,
        user_id,
        course_id,
        enrollment_id,
        template_id
      );
      sendSuccess(res, certificate, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /certificates/:id — get single certificate
router.get(
  "/:id",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const certificate = await certService.getCertificate(
        req.user!.empcloudOrgId,
        req.params.id
      );
      sendSuccess(res, certificate);
    } catch (err) {
      next(err);
    }
  }
);

// POST /certificates/:id/revoke — revoke a certificate
router.post(
  "/:id/revoke",
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = req.body;
      const certificate = await certService.revokeCertificate(
        req.user!.empcloudOrgId,
        req.params.id,
        reason
      );
      sendSuccess(res, certificate);
    } catch (err) {
      next(err);
    }
  }
);

// POST /certificates/:id/renew — renew a certificate
router.post(
  "/:id/renew",
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const certificate = await certService.renewCertificate(
        req.user!.empcloudOrgId,
        req.params.id
      );
      sendSuccess(res, certificate, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /certificates/:id/download — download certificate PDF
router.get(
  "/:id/download",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const certificate = await certService.getCertificate(
        req.user!.empcloudOrgId,
        req.params.id
      );

      if (!certificate.pdf_url) {
        throw new NotFoundError("Certificate PDF");
      }

      const filePath = path.resolve(process.cwd(), certificate.pdf_url.replace(/^\//, ""));

      if (!fs.existsSync(filePath)) {
        throw new NotFoundError("Certificate PDF file");
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${certificate.certificate_number}.pdf"`
      );

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (err) {
      next(err);
    }
  }
);

export { router as certificationRoutes };
