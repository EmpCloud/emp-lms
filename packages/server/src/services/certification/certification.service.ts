// ============================================================================
// CERTIFICATION SERVICE
// Certificate issuance, verification, revocation, renewal, PDF generation,
// and template management.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";
import { getDB } from "../../db/adapters/index";
import { lmsEvents } from "../../events/index";
import { logger } from "../../utils/logger";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  ConflictError,
} from "../../utils/errors";

// ---------------------------------------------------------------------------
// Certificate Issuance
// ---------------------------------------------------------------------------

export async function issueCertificate(
  orgId: number,
  userId: number,
  courseId: string,
  enrollmentId: string,
  templateId?: string
) {
  const db = getDB();

  // Verify enrollment is completed
  const enrollment = await db.findById<any>("enrollments", enrollmentId);
  if (!enrollment) {
    throw new NotFoundError("Enrollment", enrollmentId);
  }
  if (enrollment.status !== "completed") {
    throw new BadRequestError("Certificate can only be issued for completed enrollments");
  }
  if (enrollment.user_id !== userId || enrollment.course_id !== courseId) {
    throw new BadRequestError("Enrollment does not match the provided user and course");
  }

  // Check if certificate already exists for this enrollment
  const existing = await db.findOne<any>("certificates", {
    enrollment_id: enrollmentId,
    status: "active",
  });
  if (existing) {
    throw new ConflictError("An active certificate already exists for this enrollment");
  }

  // Load course
  const course = await db.findById<any>("courses", courseId);
  if (!course) {
    throw new NotFoundError("Course", courseId);
  }

  // Resolve template: explicit > course default > org default
  let resolvedTemplateId = templateId || course.certificate_template_id;
  let template: any = null;

  if (resolvedTemplateId) {
    template = await db.findById<any>("certificate_templates", resolvedTemplateId);
  }

  if (!template) {
    // Fallback to org default template
    template = await db.findOne<any>("certificate_templates", {
      org_id: orgId,
      is_default: true,
    });
    if (template) {
      resolvedTemplateId = template.id;
    }
  }

  // Generate unique certificate number
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  const certificateNumber = `CERT-${orgId}-${dateStr}-${randomSuffix}`;

  // Create certificate record
  const certificateId = uuidv4();
  const certificate = await db.create<any>("certificates", {
    id: certificateId,
    org_id: orgId,
    user_id: userId,
    course_id: courseId,
    enrollment_id: enrollmentId,
    certificate_number: certificateNumber,
    issued_at: now,
    expires_at: null,
    status: "active",
    template_id: resolvedTemplateId || null,
    metadata: JSON.stringify({
      course_title: course.title,
      score: enrollment.score,
    }),
    pdf_url: null,
  });

  // Generate PDF if template is available
  let pdfUrl: string | null = null;
  if (template) {
    try {
      // We need user data — fetch from empcloud or use basic info
      const userData = {
        first_name: "User",
        last_name: String(userId),
      };

      // Try to get richer user data from the enrollment metadata or other sources
      // For now, use org context
      pdfUrl = await generateCertificatePdf(
        certificate,
        template,
        userData,
        { title: course.title, description: course.description }
      );

      await db.update("certificates", certificateId, { pdf_url: pdfUrl });
    } catch (err) {
      logger.error(`Failed to generate certificate PDF for ${certificateId}:`, err);
      // Certificate is still valid, PDF generation is non-blocking
    }
  }

  // Emit event
  lmsEvents.emit("certificate.issued", {
    certificateId,
    courseId,
    userId,
    orgId,
    issuedAt: now,
  });

  logger.info(`Certificate issued: ${certificateNumber} for user ${userId}, course ${courseId}`);

  return {
    ...certificate,
    pdf_url: pdfUrl || certificate.pdf_url,
  };
}

// ---------------------------------------------------------------------------
// Certificate Retrieval
// ---------------------------------------------------------------------------

export async function getCertificate(orgId: number, certificateId: string) {
  const db = getDB();

  const certificate = await db.findById<any>("certificates", certificateId);
  if (!certificate) {
    throw new NotFoundError("Certificate", certificateId);
  }
  if (certificate.org_id !== orgId) {
    throw new ForbiddenError("Certificate does not belong to your organization");
  }

  // Enrich with course info
  const course = await db.findById<any>("courses", certificate.course_id);

  return {
    ...certificate,
    metadata: typeof certificate.metadata === "string"
      ? JSON.parse(certificate.metadata)
      : certificate.metadata,
    course: course
      ? { id: course.id, title: course.title, slug: course.slug }
      : null,
  };
}

export async function getUserCertificates(orgId: number, userId: number) {
  const db = getDB();

  const result = await db.findMany<any>("certificates", {
    filters: { org_id: orgId, user_id: userId },
    sort: { field: "issued_at", order: "desc" },
    limit: 1000,
  });

  // Enrich with course info. The adapter camelizes keys so
  // course_id → courseId, certificate_number → certificateNumber etc.
  const certificates = [];
  for (const cert of result.data) {
    const cid = cert.courseId ?? cert.course_id;
    const course = cid ? await db.findById<any>("courses", cid) : null;
    certificates.push({
      id: cert.id,
      certificateNumber: cert.certificateNumber ?? cert.certificate_number,
      courseName: course?.title ?? "Unknown Course",
      courseSlug: course?.slug,
      issuedDate: cert.issuedAt ?? cert.issued_at,
      expiryDate: cert.expiresAt ?? cert.expires_at ?? null,
      status: cert.status,
      pdfUrl: cert.pdfUrl ?? cert.pdf_url ?? null,
      metadata: typeof cert.metadata === "string" ? JSON.parse(cert.metadata) : cert.metadata,
      course: course
        ? { id: course.id, title: course.title, slug: course.slug }
        : null,
    });
  }

  return certificates;
}

export async function getCourseCertificates(orgId: number, courseId: string) {
  const db = getDB();

  const result = await db.findMany<any>("certificates", {
    filters: { org_id: orgId, course_id: courseId },
    sort: { field: "issued_at", order: "desc" },
    limit: 1000,
  });

  return result.data.map((cert: any) => ({
    ...cert,
    metadata: typeof cert.metadata === "string" ? JSON.parse(cert.metadata) : cert.metadata,
  }));
}

// ---------------------------------------------------------------------------
// Public Verification
// ---------------------------------------------------------------------------

export async function verifyCertificate(certificateNumber: string) {
  const db = getDB();

  const certificate = await db.findOne<any>("certificates", {
    certificate_number: certificateNumber,
  });

  if (!certificate) {
    throw new NotFoundError("Certificate", certificateNumber);
  }

  const course = await db.findById<any>("courses", certificate.course_id);

  return {
    certificate_number: certificate.certificate_number,
    status: certificate.status,
    issued_at: certificate.issued_at,
    expires_at: certificate.expires_at,
    course_title: course ? course.title : null,
    org_id: certificate.org_id,
    is_valid: certificate.status === "active",
  };
}

// ---------------------------------------------------------------------------
// Revoke & Renew
// ---------------------------------------------------------------------------

export async function revokeCertificate(orgId: number, certificateId: string, reason?: string) {
  const db = getDB();

  const certificate = await db.findById<any>("certificates", certificateId);
  if (!certificate) {
    throw new NotFoundError("Certificate", certificateId);
  }
  if (certificate.org_id !== orgId) {
    throw new ForbiddenError("Certificate does not belong to your organization");
  }
  if (certificate.status === "revoked") {
    throw new BadRequestError("Certificate is already revoked");
  }

  const metadata = typeof certificate.metadata === "string"
    ? JSON.parse(certificate.metadata)
    : certificate.metadata || {};

  const updated = await db.update<any>("certificates", certificateId, {
    status: "revoked",
    metadata: JSON.stringify({
      ...metadata,
      revoked_at: new Date().toISOString(),
      revocation_reason: reason || null,
    }),
  });

  logger.info(`Certificate revoked: ${certificate.certificate_number} (reason: ${reason || "none"})`);

  return {
    ...updated,
    metadata: typeof updated.metadata === "string" ? JSON.parse(updated.metadata) : updated.metadata,
  };
}

export async function renewCertificate(orgId: number, certificateId: string) {
  const db = getDB();

  const oldCertificate = await db.findById<any>("certificates", certificateId);
  if (!oldCertificate) {
    throw new NotFoundError("Certificate", certificateId);
  }
  if (oldCertificate.org_id !== orgId) {
    throw new ForbiddenError("Certificate does not belong to your organization");
  }
  if (oldCertificate.status === "active") {
    throw new BadRequestError("Certificate is still active and does not need renewal");
  }

  // Mark old certificate as expired if it was active
  if (oldCertificate.status !== "revoked") {
    await db.update("certificates", certificateId, { status: "expired" });
  }

  // Generate new certificate number
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  const certificateNumber = `CERT-${orgId}-${dateStr}-${randomSuffix}`;

  const newCertificateId = uuidv4();
  const newCertificate = await db.create<any>("certificates", {
    id: newCertificateId,
    org_id: orgId,
    user_id: oldCertificate.user_id,
    course_id: oldCertificate.course_id,
    enrollment_id: oldCertificate.enrollment_id,
    certificate_number: certificateNumber,
    issued_at: now,
    expires_at: null,
    status: "active",
    template_id: oldCertificate.template_id,
    metadata: JSON.stringify({
      renewed_from: oldCertificate.certificate_number,
      original_issued_at: oldCertificate.issued_at,
    }),
    pdf_url: null,
  });

  // Generate PDF if template exists
  if (oldCertificate.template_id) {
    const template = await db.findById<any>("certificate_templates", oldCertificate.template_id);
    if (template) {
      const course = await db.findById<any>("courses", oldCertificate.course_id);
      try {
        const pdfUrl = await generateCertificatePdf(
          newCertificate,
          template,
          { first_name: "User", last_name: String(oldCertificate.user_id) },
          { title: course?.title || "", description: course?.description || "" }
        );
        await db.update("certificates", newCertificateId, { pdf_url: pdfUrl });
        newCertificate.pdf_url = pdfUrl;
      } catch (err) {
        logger.error(`Failed to generate renewed certificate PDF for ${newCertificateId}:`, err);
      }
    }
  }

  lmsEvents.emit("certificate.issued", {
    certificateId: newCertificateId,
    courseId: oldCertificate.course_id,
    userId: oldCertificate.user_id,
    orgId,
    issuedAt: now,
  });

  logger.info(`Certificate renewed: ${oldCertificate.certificate_number} -> ${certificateNumber}`);

  return newCertificate;
}

// ---------------------------------------------------------------------------
// Expiration Check
// ---------------------------------------------------------------------------

export async function checkExpiringCertificates(orgId: number) {
  const db = getDB();

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Find active certificates expiring within 30 days
  const results = await db.raw<any[]>(
    `SELECT * FROM certificates
     WHERE org_id = ?
       AND status = 'active'
       AND expires_at IS NOT NULL
       AND expires_at <= ?
       AND expires_at > ?
     ORDER BY expires_at ASC`,
    [orgId, thirtyDaysFromNow.toISOString(), now.toISOString()]
  );

  const expiring = Array.isArray(results) ? results : [];

  logger.info(`Found ${expiring.length} expiring certificates for org ${orgId}`);

  return expiring;
}

// ---------------------------------------------------------------------------
// PDF Generation
// ---------------------------------------------------------------------------

export async function generateCertificatePdf(
  certificate: any,
  template: any,
  userData: { first_name: string; last_name: string },
  courseData: { title: string; description?: string }
): Promise<string> {
  const htmlTemplate = template.html_template || getDefaultTemplate();

  // Compile with Handlebars
  const compiledTemplate = Handlebars.compile(htmlTemplate);
  const issuedDate = new Date(certificate.issued_at);

  const html = compiledTemplate({
    recipient_name: `${userData.first_name} ${userData.last_name}`,
    first_name: userData.first_name,
    last_name: userData.last_name,
    course_title: courseData.title,
    course_description: courseData.description || "",
    certificate_number: certificate.certificate_number,
    issued_date: issuedDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    issued_at: certificate.issued_at,
    expires_at: certificate.expires_at || "",
    org_id: certificate.org_id,
  });

  // Ensure output directory exists
  const outputDir = path.resolve(process.cwd(), "uploads", "certificates");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileName = `${certificate.certificate_number}.pdf`;
  const filePath = path.join(outputDir, fileName);

  // Render PDF with Puppeteer
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: filePath,
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await browser.close();
  }

  const pdfUrl = `/uploads/certificates/${fileName}`;
  logger.info(`Certificate PDF generated: ${pdfUrl}`);
  return pdfUrl;
}

function getDefaultTemplate(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      margin: 0;
      padding: 40px;
      font-family: 'Georgia', serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .certificate {
      background: white;
      border: 3px solid #c9a94e;
      padding: 60px 80px;
      text-align: center;
      width: 900px;
      box-shadow: 0 0 0 8px white, 0 0 0 11px #c9a94e;
    }
    .certificate h1 {
      font-size: 42px;
      color: #2c3e50;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 3px;
    }
    .certificate .subtitle {
      font-size: 18px;
      color: #7f8c8d;
      margin-bottom: 30px;
    }
    .certificate .recipient {
      font-size: 36px;
      color: #c9a94e;
      font-style: italic;
      margin: 20px 0;
      border-bottom: 2px solid #c9a94e;
      display: inline-block;
      padding-bottom: 5px;
    }
    .certificate .course-name {
      font-size: 24px;
      color: #2c3e50;
      margin: 20px 0;
      font-weight: bold;
    }
    .certificate .details {
      font-size: 14px;
      color: #7f8c8d;
      margin-top: 30px;
    }
    .certificate .cert-number {
      font-size: 12px;
      color: #bdc3c7;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="certificate">
    <h1>Certificate of Completion</h1>
    <p class="subtitle">This is to certify that</p>
    <p class="recipient">{{recipient_name}}</p>
    <p class="subtitle">has successfully completed the course</p>
    <p class="course-name">{{course_title}}</p>
    <p class="details">Issued on {{issued_date}}</p>
    <p class="cert-number">Certificate No: {{certificate_number}}</p>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Template Management
// ---------------------------------------------------------------------------

export async function listTemplates(orgId: number) {
  const db = getDB();

  const result = await db.findMany<any>("certificate_templates", {
    filters: { org_id: orgId },
    sort: { field: "created_at", order: "desc" },
    limit: 1000,
  });

  return result.data;
}

export async function getTemplate(orgId: number, templateId: string) {
  const db = getDB();

  const template = await db.findById<any>("certificate_templates", templateId);
  if (!template) {
    throw new NotFoundError("Certificate Template", templateId);
  }
  if (template.org_id !== orgId) {
    throw new ForbiddenError("Template does not belong to your organization");
  }

  return template;
}

export async function createTemplate(
  orgId: number,
  data: {
    name: string;
    description?: string;
    html_template?: string;
    is_default?: boolean;
  }
) {
  const db = getDB();

  // If setting as default, unset any existing default
  if (data.is_default) {
    const existingDefault = await db.findOne<any>("certificate_templates", {
      org_id: orgId,
      is_default: true,
    });
    if (existingDefault) {
      await db.update("certificate_templates", existingDefault.id, { is_default: false });
    }
  }

  const templateId = uuidv4();
  const template = await db.create<any>("certificate_templates", {
    id: templateId,
    org_id: orgId,
    name: data.name,
    description: data.description || null,
    html_template: data.html_template || null,
    is_default: data.is_default ?? false,
  });

  logger.info(`Certificate template created: ${templateId} for org ${orgId}`);
  return template;
}

export async function updateTemplate(
  orgId: number,
  templateId: string,
  data: {
    name?: string;
    description?: string;
    html_template?: string;
    is_default?: boolean;
  }
) {
  const db = getDB();

  const template = await db.findById<any>("certificate_templates", templateId);
  if (!template) {
    throw new NotFoundError("Certificate Template", templateId);
  }
  if (template.org_id !== orgId) {
    throw new ForbiddenError("Template does not belong to your organization");
  }

  // If setting as default, unset any existing default
  if (data.is_default) {
    const existingDefault = await db.findOne<any>("certificate_templates", {
      org_id: orgId,
      is_default: true,
    });
    if (existingDefault && existingDefault.id !== templateId) {
      await db.update("certificate_templates", existingDefault.id, { is_default: false });
    }
  }

  const updateData: Record<string, any> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.html_template !== undefined) updateData.html_template = data.html_template;
  if (data.is_default !== undefined) updateData.is_default = data.is_default;

  const updated = await db.update<any>("certificate_templates", templateId, updateData);

  logger.info(`Certificate template updated: ${templateId}`);
  return updated;
}

export async function deleteTemplate(orgId: number, templateId: string) {
  const db = getDB();

  const template = await db.findById<any>("certificate_templates", templateId);
  if (!template) {
    throw new NotFoundError("Certificate Template", templateId);
  }
  if (template.org_id !== orgId) {
    throw new ForbiddenError("Template does not belong to your organization");
  }

  // Check if template is in use by any certificates
  const inUseCount = await db.count("certificates", { template_id: templateId });
  if (inUseCount > 0) {
    throw new BadRequestError(
      `Cannot delete template: it is used by ${inUseCount} certificate(s)`
    );
  }

  // Also check if any courses reference this template
  const courseUseCount = await db.count("courses", { certificate_template_id: templateId });
  if (courseUseCount > 0) {
    throw new BadRequestError(
      `Cannot delete template: it is assigned to ${courseUseCount} course(s)`
    );
  }

  await db.delete("certificate_templates", templateId);
  logger.info(`Certificate template deleted: ${templateId}`);
  return { deleted: true };
}
