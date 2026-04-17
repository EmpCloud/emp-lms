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

      // If a pre-generated PDF exists, serve it directly.
      if (certificate.pdf_url || certificate.pdfUrl) {
        const pdfPath = certificate.pdf_url || certificate.pdfUrl;
        const filePath = path.resolve(process.cwd(), pdfPath.replace(/^\//, ""));

        if (fs.existsSync(filePath)) {
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${certificate.certificate_number || certificate.certificateNumber}.pdf"`
          );
          const fileStream = fs.createReadStream(filePath);
          return fileStream.pipe(res);
        }
      }

      // Fallback: render the HTML certificate template inline so the user
      // can print-to-PDF from the browser. This covers local dev where
      // Puppeteer isn't configured for server-side PDF generation.
      const certNumber = certificate.certificate_number || certificate.certificateNumber || "N/A";
      const issuedAt = certificate.issued_at || certificate.issuedAt;
      const issuedDate = issuedAt ? new Date(issuedAt).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }) : "N/A";

      // Load template if available
      const templateId = certificate.template_id || certificate.templateId;
      let html = "";
      if (templateId) {
        const { getDB } = await import("../../db/adapters/index.js");
        const db = getDB();
        const tmpl = await db.findById<any>("certificate_templates", templateId);
        if (tmpl) {
          const rawHtml = tmpl.htmlTemplate || tmpl.html_template || "";
          // Look up learner name from EmpCloud users
          const userId = Number(certificate.user_id || certificate.userId);
          const { findUserById } = await import("../../db/empcloud.js");
          const learner = await findUserById(userId);
          const learnerName = learner ? `${learner.first_name} ${learner.last_name}` : "Learner";

          // Look up course title
          const courseId = certificate.course_id || certificate.courseId;
          const course = courseId ? await db.findById<any>("courses", courseId) : null;
          const courseTitle = course?.title || "Course";

          // Look up org name
          const { getEmpCloudDB } = await import("../../db/empcloud.js");
          const ecDb = getEmpCloudDB();
          const org = await ecDb("organizations").where({ id: certificate.org_id || certificate.orgId || req.user!.empcloudOrgId }).first();
          const orgName = org?.name || "Organization";

          html = rawHtml
            .replace(/\{\{learner_name\}\}/g, learnerName)
            .replace(/\{\{course_title\}\}/g, courseTitle)
            .replace(/\{\{issued_date\}\}/g, issuedDate)
            .replace(/\{\{certificate_number\}\}/g, certNumber)
            .replace(/\{\{org_name\}\}/g, orgName);
        }
      }

      if (!html) {
        html = `<div style="text-align:center;padding:60px;font-family:Georgia,serif;">
          <h1>Certificate of Completion</h1>
          <p>Certificate #${certNumber}</p>
          <p>Issued: ${issuedDate}</p>
        </div>`;
      }

      const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Certificate ${certNumber}</title>
        <style>@media print { body { margin: 0; } @page { size: landscape; margin: 0; } }</style>
      </head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;">
        ${html}
      </body></html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(fullHtml);
    } catch (err) {
      next(err);
    }
  }
);

export { router as certificationRoutes };
