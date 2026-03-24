// ============================================================================
// SCORM SERVICE
// SCORM package management, tracking, and SCORM API adapter support.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { getDB } from "../../db/adapters/index";
import { lmsEvents } from "../../events/index";
import { config } from "../../config/index";
import { logger } from "../../utils/logger";
import {
  NotFoundError,
  BadRequestError,
} from "../../utils/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScormPackage {
  id: string;
  org_id: number;
  course_id: string;
  lesson_id: string | null;
  title: string;
  version: "1.2" | "2004";
  entry_point: string;
  package_url: string;
  manifest_data: any;
  created_at: Date;
  updated_at: Date;
}

interface ScormTracking {
  id: string;
  package_id: string;
  user_id: number;
  enrollment_id: string;
  status: string;
  score: number | null;
  time_spent: number;
  suspend_data: string | null;
  location: string | null;
  total_time: string | null;
  completion_status: string | null;
  success_status: string | null;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Upload SCORM Package
// ---------------------------------------------------------------------------

export async function uploadPackage(
  orgId: number,
  courseId: string,
  lessonId: string | null,
  file: Express.Multer.File,
  version: "1.2" | "2004"
): Promise<ScormPackage> {
  const db = getDB();

  // Verify course exists
  const course = await db.findOne<any>("courses", {
    id: courseId,
    org_id: orgId,
  });
  if (!course) {
    throw new NotFoundError("Course", courseId);
  }

  // Verify lesson exists if provided
  if (lessonId) {
    const lesson = await db.findOne<any>("lessons", { id: lessonId });
    if (!lesson) {
      throw new NotFoundError("Lesson", lessonId);
    }
  }

  const packageId = uuidv4();
  const extractDir = path.resolve(
    config.upload.uploadDir,
    "scorm",
    String(orgId),
    packageId
  );

  // Create extraction directory
  fs.mkdirSync(extractDir, { recursive: true });

  // Unzip the uploaded file
  let unzipped = false;
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(file.path);
    zip.extractAllTo(extractDir, true);
    unzipped = true;
  } catch (err: any) {
    logger.error(`Failed to extract SCORM ZIP: ${err.message}`);
    // Clean up
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    throw new BadRequestError("Failed to extract SCORM package. Ensure the file is a valid ZIP archive.");
  }

  // Clean up the uploaded ZIP file
  try {
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  } catch {
    // Non-critical
  }

  // Parse imsmanifest.xml
  const manifestPath = path.join(extractDir, "imsmanifest.xml");
  if (!fs.existsSync(manifestPath)) {
    fs.rmSync(extractDir, { recursive: true, force: true });
    throw new BadRequestError("Invalid SCORM package: imsmanifest.xml not found.");
  }

  let manifestData: any = {};
  let entryPoint = "index.html";
  let title = course.title;

  try {
    const xml2js = require("xml2js");
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
    const manifestXml = fs.readFileSync(manifestPath, "utf-8");
    const parsed = await parser.parseStringPromise(manifestXml);

    manifestData = parsed;

    // Extract title from manifest
    const manifest = parsed.manifest || parsed.Manifest;
    if (manifest) {
      const organizations = manifest.organizations || manifest.Organizations;
      if (organizations) {
        const org =
          organizations.organization ||
          organizations.Organization;
        if (org) {
          const orgItem = Array.isArray(org) ? org[0] : org;
          if (orgItem && orgItem.title) {
            title =
              typeof orgItem.title === "string"
                ? orgItem.title
                : orgItem.title._ || orgItem.title;
          }
        }
      }

      // Extract entry point (launch URL) from resources
      const resources = manifest.resources || manifest.Resources;
      if (resources) {
        const resource =
          resources.resource || resources.Resource;
        if (resource) {
          const res = Array.isArray(resource) ? resource[0] : resource;
          if (res) {
            const href =
              res.$ && res.$.href
                ? res.$.href
                : res.href || "index.html";
            entryPoint = href;
          }
        }
      }
    }
  } catch (err: any) {
    logger.warn(`Failed to parse imsmanifest.xml: ${err.message}. Using defaults.`);
  }

  const packageUrl = `/scorm/${orgId}/${packageId}`;

  const scormPackage = await db.create<ScormPackage>("scorm_packages", {
    id: packageId,
    org_id: orgId,
    course_id: courseId,
    lesson_id: lessonId || null,
    title,
    version,
    entry_point: entryPoint,
    package_url: packageUrl,
    manifest_data: JSON.stringify(manifestData),
  });

  logger.info(`SCORM package uploaded: ${title} (${packageId}) for course ${courseId}`);

  return scormPackage;
}

// ---------------------------------------------------------------------------
// Get Package
// ---------------------------------------------------------------------------

export async function getPackage(
  orgId: number,
  packageId: string
): Promise<ScormPackage> {
  const db = getDB();

  const pkg = await db.findOne<ScormPackage>("scorm_packages", {
    id: packageId,
    org_id: orgId,
  });
  if (!pkg) {
    throw new NotFoundError("SCORM Package", packageId);
  }

  return pkg;
}

// ---------------------------------------------------------------------------
// Get Packages by Course
// ---------------------------------------------------------------------------

export async function getPackagesByCourse(
  orgId: number,
  courseId: string
): Promise<ScormPackage[]> {
  const db = getDB();

  const packages = await db.raw<ScormPackage[]>(
    `SELECT * FROM scorm_packages WHERE org_id = ? AND course_id = ? ORDER BY created_at DESC`,
    [orgId, courseId]
  );

  return packages;
}

// ---------------------------------------------------------------------------
// Delete Package
// ---------------------------------------------------------------------------

export async function deletePackage(
  orgId: number,
  packageId: string
): Promise<void> {
  const db = getDB();

  const pkg = await db.findOne<ScormPackage>("scorm_packages", {
    id: packageId,
    org_id: orgId,
  });
  if (!pkg) {
    throw new NotFoundError("SCORM Package", packageId);
  }

  // Delete tracking records first
  await db.deleteMany("scorm_tracking", { package_id: packageId });

  // Delete the package record
  await db.delete("scorm_packages", packageId);

  // Remove extracted files
  const extractDir = path.resolve(
    config.upload.uploadDir,
    "scorm",
    String(orgId),
    packageId
  );
  try {
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  } catch (err: any) {
    logger.warn(`Failed to remove SCORM files at ${extractDir}: ${err.message}`);
  }

  logger.info(`SCORM package deleted: ${packageId}`);
}

// ---------------------------------------------------------------------------
// Get Launch URL
// ---------------------------------------------------------------------------

export async function getLaunchUrl(
  packageId: string
): Promise<{ launchUrl: string; version: string; title: string }> {
  const db = getDB();

  const pkg = await db.findById<ScormPackage>("scorm_packages", packageId);
  if (!pkg) {
    throw new NotFoundError("SCORM Package", packageId);
  }

  const launchUrl = `${pkg.package_url}/${pkg.entry_point}`;

  return {
    launchUrl,
    version: pkg.version,
    title: pkg.title,
  };
}

// ---------------------------------------------------------------------------
// Init Tracking
// ---------------------------------------------------------------------------

export async function initTracking(
  packageId: string,
  userId: number,
  enrollmentId: string
): Promise<ScormTracking> {
  const db = getDB();

  const pkg = await db.findById<ScormPackage>("scorm_packages", packageId);
  if (!pkg) {
    throw new NotFoundError("SCORM Package", packageId);
  }

  // Check if tracking already exists
  const existing = await db.findOne<ScormTracking>("scorm_tracking", {
    package_id: packageId,
    user_id: userId,
  });

  if (existing) {
    return existing;
  }

  const tracking = await db.create<ScormTracking>("scorm_tracking", {
    id: uuidv4(),
    package_id: packageId,
    user_id: userId,
    enrollment_id: enrollmentId,
    status: "not_attempted",
    score: null,
    time_spent: 0,
    suspend_data: null,
    location: null,
    total_time: null,
    completion_status: null,
    success_status: null,
  });

  logger.info(`SCORM tracking initialized: package=${packageId}, user=${userId}`);

  return tracking;
}

// ---------------------------------------------------------------------------
// Update Tracking
// ---------------------------------------------------------------------------

export async function updateTracking(
  packageId: string,
  userId: number,
  data: {
    status?: string;
    score?: number;
    time_spent?: number;
    suspend_data?: string;
    location?: string;
    total_time?: string;
    completion_status?: string;
    success_status?: string;
  }
): Promise<ScormTracking> {
  const db = getDB();

  const tracking = await db.findOne<ScormTracking>("scorm_tracking", {
    package_id: packageId,
    user_id: userId,
  });

  if (!tracking) {
    throw new NotFoundError("SCORM Tracking", `package=${packageId}, user=${userId}`);
  }

  const updateFields: Record<string, any> = {};

  if (data.status !== undefined) updateFields.status = data.status;
  if (data.score !== undefined) updateFields.score = data.score;
  if (data.time_spent !== undefined) updateFields.time_spent = data.time_spent;
  if (data.suspend_data !== undefined) updateFields.suspend_data = data.suspend_data;
  if (data.location !== undefined) updateFields.location = data.location;
  if (data.total_time !== undefined) updateFields.total_time = data.total_time;
  if (data.completion_status !== undefined) updateFields.completion_status = data.completion_status;
  if (data.success_status !== undefined) updateFields.success_status = data.success_status;

  const updated = await db.update<ScormTracking>("scorm_tracking", tracking.id, updateFields);

  return updated;
}

// ---------------------------------------------------------------------------
// Get Tracking
// ---------------------------------------------------------------------------

export async function getTracking(
  packageId: string,
  userId: number
): Promise<ScormTracking | null> {
  const db = getDB();

  const tracking = await db.findOne<ScormTracking>("scorm_tracking", {
    package_id: packageId,
    user_id: userId,
  });

  return tracking;
}

// ---------------------------------------------------------------------------
// Commit Tracking (update + check completion)
// ---------------------------------------------------------------------------

export async function commitTracking(
  packageId: string,
  userId: number,
  data: {
    status?: string;
    score?: number;
    time_spent?: number;
    suspend_data?: string;
    location?: string;
    total_time?: string;
    completion_status?: string;
    success_status?: string;
  }
): Promise<ScormTracking> {
  const db = getDB();

  // Update tracking data first
  const tracking = await updateTracking(packageId, userId, data);

  // Check if the SCORM content is completed or passed
  const isCompleted =
    data.completion_status === "completed" ||
    data.status === "completed" ||
    data.status === "passed" ||
    data.success_status === "passed";

  if (isCompleted) {
    // Get the package to find enrollment info
    const pkg = await db.findById<ScormPackage>("scorm_packages", packageId);
    if (pkg) {
      // Get the tracking record with enrollment_id
      const fullTracking = await db.findOne<ScormTracking>("scorm_tracking", {
        package_id: packageId,
        user_id: userId,
      });

      if (fullTracking && fullTracking.enrollment_id) {
        // Update enrollment progress
        const enrollment = await db.findById<any>(
          "enrollments",
          fullTracking.enrollment_id
        );

        if (enrollment) {
          const updateData: Record<string, any> = {
            last_accessed_at: new Date().toISOString(),
          };

          if (data.time_spent !== undefined) {
            updateData.time_spent_minutes = Math.round(
              (enrollment.time_spent_minutes || 0) + data.time_spent / 60
            );
          }

          if (data.score !== undefined) {
            updateData.score = data.score;
          }

          // Mark enrollment as completed if SCORM is completed/passed
          if (
            enrollment.status !== "completed" &&
            enrollment.status !== "failed"
          ) {
            const isPassed =
              data.success_status === "passed" ||
              data.status === "passed";
            const isFailed =
              data.success_status === "failed" ||
              data.status === "failed";

            if (isPassed || data.completion_status === "completed") {
              updateData.status = "completed";
              updateData.completed_at = new Date().toISOString();
              updateData.progress_percentage = 100;

              lmsEvents.emit("enrollment.completed", {
                enrollmentId: fullTracking.enrollment_id,
                courseId: pkg.course_id,
                userId,
                orgId: pkg.org_id,
                completedAt: new Date(),
                score: data.score,
              });
            } else if (isFailed) {
              updateData.status = "failed";
            } else {
              updateData.status = "in_progress";
            }
          }

          await db.update("enrollments", fullTracking.enrollment_id, updateData);
        }
      }
    }
  }

  return tracking;
}
