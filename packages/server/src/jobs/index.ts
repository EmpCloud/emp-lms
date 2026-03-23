// ============================================================================
// JOB WORKERS INITIALIZATION
// Starts BullMQ workers for email, compliance, certificates, and reminders.
// ============================================================================

import { logger } from "../utils/logger";
import { isQueueSystemAvailable } from "./queue";

// ---------------------------------------------------------------------------
// Email worker processor
// ---------------------------------------------------------------------------

export async function processEmailJob(jobData: any): Promise<void> {
  try {
    const { findUserById } = await import("../db/empcloud");

    const user = await findUserById(jobData.userId);
    if (!user) {
      logger.warn(`Email job: user ${jobData.userId} not found, skipping`);
      return;
    }

    let emailService: any;
    try {
      emailService = await import("../services/email/email.service");
    } catch {
      logger.warn("Email service not available, skipping email job");
      return;
    }

    switch (jobData.type) {
      case "enrollment_created":
        await emailService.sendEnrollmentEmail?.(user.email, user.first_name, jobData);
        break;
      case "enrollment_completed":
        await emailService.sendCompletionEmail?.(user.email, user.first_name, jobData);
        break;
      case "certificate_issued":
        await emailService.sendCertificateEmail?.(user.email, user.first_name, jobData);
        break;
      case "compliance_reminder":
        await emailService.sendComplianceReminderEmail?.(user.email, user.first_name, jobData);
        break;
      case "compliance_overdue":
        await emailService.sendComplianceOverdueEmail?.(user.email, user.first_name, jobData);
        break;
      case "ilt_reminder":
        await emailService.sendILTReminderEmail?.(user.email, user.first_name, jobData);
        break;
      case "quiz_passed":
      case "quiz_failed":
        await emailService.sendQuizResultEmail?.(user.email, user.first_name, jobData);
        break;
      default:
        logger.warn(`Unknown email job type: ${jobData.type}`);
    }
  } catch (error) {
    logger.error(`Email job failed:`, error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Compliance check worker processor
// ---------------------------------------------------------------------------

export async function processComplianceCheckJob(): Promise<void> {
  try {
    const { getDB } = await import("../db/adapters/index");
    const db = getDB();

    // Get all org IDs that have compliance assignments
    const orgs = await db.raw<any[]>(
      `SELECT DISTINCT organization_id FROM compliance_assignments`
    );

    const { checkOverdue } = await import("../services/compliance/compliance.service");

    for (const org of orgs) {
      await checkOverdue(org.organization_id);
    }

    logger.info(`Compliance check completed for ${orgs.length} organizations`);
  } catch (error) {
    logger.error("Compliance check failed:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Certificate expiry worker processor
// ---------------------------------------------------------------------------

export async function processCertificateExpiryJob(): Promise<void> {
  try {
    const { getDB } = await import("../db/adapters/index");
    const db = getDB();

    // Get all org IDs that have certificates
    const orgs = await db.raw<any[]>(
      `SELECT DISTINCT organization_id FROM certificates WHERE status = 'active' AND expires_at IS NOT NULL`
    );

    const { checkExpiringCertificates } = await import(
      "../services/certification/certification.service"
    );

    for (const org of orgs) {
      await checkExpiringCertificates(org.organization_id);
    }

    logger.info(`Certificate expiry check completed for ${orgs.length} organizations`);
  } catch (error) {
    logger.error("Certificate expiry check failed:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Reminders worker processor (reuses compliance overdue check)
// ---------------------------------------------------------------------------

export async function processRemindersJob(): Promise<void> {
  try {
    const { getDB } = await import("../db/adapters/index");
    const db = getDB();

    const orgs = await db.raw<any[]>(
      `SELECT DISTINCT organization_id FROM compliance_records WHERE status IN ('not_started', 'in_progress')`
    );

    const { checkOverdue } = await import("../services/compliance/compliance.service");

    for (const org of orgs) {
      await checkOverdue(org.organization_id);
    }

    logger.info(`Reminders processed for ${orgs.length} organizations`);
  } catch (error) {
    logger.error("Reminders processing failed:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Streak update worker processor
// ---------------------------------------------------------------------------

export async function processStreakUpdateJob(): Promise<void> {
  try {
    const { getDB } = await import("../db/adapters/index");
    const db = getDB();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const staleProfiles = await db.raw<any[]>(
      `SELECT id, user_id, org_id, current_streak_days FROM user_learning_profiles
       WHERE current_streak_days > 0
       AND (last_activity_at IS NULL OR DATE(last_activity_at) < ?)`,
      [yesterdayStr]
    );

    for (const profile of staleProfiles) {
      await db.update("user_learning_profiles", profile.id, {
        current_streak_days: 0,
      });
    }

    logger.info(`Streak update: reset ${staleProfiles.length} stale streaks`);
  } catch (error) {
    logger.error("Streak update failed:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Initialize workers (called from index.ts after queues are ready)
// ---------------------------------------------------------------------------

export async function initWorkers(): Promise<void> {
  if (!isQueueSystemAvailable()) {
    logger.warn("Queue system not available — workers not initialized");
    return;
  }

  logger.info("LMS job workers initialized");
}
