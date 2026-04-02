// ============================================================================
// EMP-LMS SERVER ENTRY POINT
// ============================================================================

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";
import { config } from "./config";
import { initDB, closeDB } from "./db/adapters";
import { initEmpCloudDB, closeEmpCloudDB } from "./db/empcloud";
import { logger } from "./utils/logger";

// Route imports
import { healthRoutes } from "./api/routes/health.routes";
import { authRoutes } from "./api/routes/auth.routes";
import { courseRoutes } from "./api/routes/course.routes";
import { enrollmentRoutes } from "./api/routes/enrollment.routes";
import { quizRoutes } from "./api/routes/quiz.routes";
import { certificationRoutes } from "./api/routes/certification.routes";
import { learningPathRoutes } from "./api/routes/learning-path.routes";
import { complianceRoutes } from "./api/routes/compliance.routes";
import { iltRoutes } from "./api/routes/ilt.routes";
import { scormRoutes } from "./api/routes/scorm.routes";
import { videoRoutes } from "./api/routes/video.routes";
import { gamificationRoutes } from "./api/routes/gamification.routes";
import { marketplaceRoutes } from "./api/routes/marketplace.routes";
import { analyticsRoutes } from "./api/routes/analytics.routes";
import { recommendationRoutes } from "./api/routes/recommendation.routes";
import { notificationRoutes } from "./api/routes/notification.routes";
import { discussionRoutes } from "./api/routes/discussion.routes";
import { ratingRoutes } from "./api/routes/rating.routes";
import { settingsRoutes } from "./api/routes/settings.routes";

// Middleware imports
import { errorHandler } from "./api/middleware/error.middleware";
import { apiLimiter, authLimiter, defaultLimiter } from "./api/middleware/rate-limit.middleware";

// Event system
import { lmsEvents } from "./events";
import { getQueue, QUEUE_NAMES, isQueueSystemAvailable } from "./jobs/queue";

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (config.cors.origin === "*") return callback(null, true);
      // Allow empcloud.com subdomains (production & test)
      if (origin.endsWith(".empcloud.com") && origin.startsWith("https://")) {
        return callback(null, true);
      }
      if (
        config.env === "development" &&
        (origin.startsWith("http://localhost") ||
          origin.startsWith("http://127.0.0.1") ||
          origin.endsWith(".ngrok-free.dev"))
      ) {
        return callback(null, true);
      }
      const allowed = config.cors.origin.split(",").map((s) => s.trim());
      if (allowed.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(defaultLimiter);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.use("/health", healthRoutes);

// ---------------------------------------------------------------------------
// API Routes (v1)
// ---------------------------------------------------------------------------
const v1 = express.Router();
v1.use(apiLimiter);

// Auth routes (stricter rate limit)
v1.use("/auth", authLimiter, authRoutes);

// Core LMS routes
v1.use("/courses", courseRoutes);
v1.use("/enrollments", enrollmentRoutes);
v1.use("/quizzes", quizRoutes);
v1.use("/certificates", certificationRoutes);
v1.use("/learning-paths", learningPathRoutes);
v1.use("/compliance", complianceRoutes);
v1.use("/ilt", iltRoutes);
v1.use("/scorm", scormRoutes);
v1.use("/videos", videoRoutes);
v1.use("/gamification", gamificationRoutes);
v1.use("/marketplace", marketplaceRoutes);
v1.use("/analytics", analyticsRoutes);
v1.use("/recommendations", recommendationRoutes);
v1.use("/notifications", notificationRoutes);
v1.use("/discussions", discussionRoutes);
v1.use("/ratings", ratingRoutes);
v1.use("/users/me/preferences", settingsRoutes);

app.use("/api/v1", v1);

// ---------------------------------------------------------------------------
// Error handling (must be last)
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------------

function registerEventListeners(): void {
  // ---- enrollment.completed ------------------------------------------------
  lmsEvents.on("enrollment.completed", async (data) => {
    logger.info(`Enrollment completed: user=${data.userId} course=${data.courseId}`);

    // Issue certificate if course has a certificate template
    try {
      const { getDB } = await import("./db/adapters");
      const db = getDB();
      const templates = await db.raw<any[]>(
        `SELECT id FROM certificate_templates WHERE organization_id = ? AND is_default = true LIMIT 1`,
        [data.orgId]
      );
      if (templates.length > 0) {
        const { issueCertificate } = await import("./services/certification/certification.service");
        await issueCertificate(
          data.orgId,
          data.userId,
          data.courseId,
          data.enrollmentId,
          templates[0].id
        );
        logger.info(`Certificate issued for user=${data.userId} course=${data.courseId}`);
      }
    } catch (err) {
      logger.error(`Failed to issue certificate on enrollment completion:`, err);
    }

    // Update learning path progress for any paths containing this course
    try {
      const { getDB } = await import("./db/adapters");
      const db = getDB();
      const pathEnrollments = await db.raw<any[]>(
        `SELECT lpe.learning_path_id
         FROM learning_path_enrollments lpe
         JOIN learning_path_courses lpc ON lpc.learning_path_id = lpe.learning_path_id
         WHERE lpe.user_id = ? AND lpe.org_id = ? AND lpc.course_id = ? AND lpe.status != 'completed'`,
        [data.userId, data.orgId, data.courseId]
      );
      if (pathEnrollments.length > 0) {
        const { updatePathProgress } = await import("./services/learning-path/learning-path.service");
        for (const pe of pathEnrollments) {
          await updatePathProgress(data.orgId, data.userId, pe.learning_path_id);
        }
      }
    } catch (err) {
      logger.error(`Failed to update learning path progress:`, err);
    }

    // Update user learning profile (e.g. skills, completion stats)
    try {
      const { updateUserLearningProfile } = await import("./services/gamification/gamification.service");
      await updateUserLearningProfile(data.orgId, data.userId, { type: "course_completed" });
    } catch (err) {
      logger.error(`Failed to update user learning profile:`, err);
    }

    // Queue completion email
    if (isQueueSystemAvailable()) {
      const emailQueue = getQueue(QUEUE_NAMES.EMAIL);
      if (emailQueue) {
        await emailQueue.add("enrollment-completed", {
          type: "enrollment_completed",
          userId: data.userId,
          courseId: data.courseId,
          orgId: data.orgId,
          completedAt: data.completedAt,
          score: data.score,
        });
      }
    }
  });

  // ---- quiz.passed ---------------------------------------------------------
  lmsEvents.on("quiz.passed", async (data) => {
    logger.info(`Quiz passed: user=${data.userId} quiz=${data.quizId} score=${data.score}`);

    // Award gamification points
    try {
      const { awardQuizPassPoints } = await import("./services/gamification/gamification.service");
      await awardQuizPassPoints(data.orgId, data.userId, `quiz-${data.quizId}`, data.score);
    } catch (err) {
      logger.error(`Failed to award points for quiz pass:`, err);
    }

    // Queue quiz result email
    if (isQueueSystemAvailable()) {
      const emailQueue = getQueue(QUEUE_NAMES.EMAIL);
      if (emailQueue) {
        await emailQueue.add("quiz-result", {
          type: "quiz_passed",
          userId: data.userId,
          quizId: data.quizId,
          courseId: data.courseId,
          orgId: data.orgId,
          score: data.score,
          passingScore: data.passingScore,
        });
      }
    }
  });

  // ---- quiz.failed ---------------------------------------------------------
  lmsEvents.on("quiz.failed", async (data) => {
    logger.info(`Quiz failed: user=${data.userId} quiz=${data.quizId} score=${data.score}`);

    // Queue quiz result email
    if (isQueueSystemAvailable()) {
      const emailQueue = getQueue(QUEUE_NAMES.EMAIL);
      if (emailQueue) {
        await emailQueue.add("quiz-result", {
          type: "quiz_failed",
          userId: data.userId,
          quizId: data.quizId,
          courseId: data.courseId,
          orgId: data.orgId,
          score: data.score,
          passingScore: data.passingScore,
        });
      }
    }
  });

  // ---- certificate.issued --------------------------------------------------
  lmsEvents.on("certificate.issued", async (data) => {
    logger.info(`Certificate issued: user=${data.userId} cert=${data.certificateId}`);

    // Queue certificate email
    if (isQueueSystemAvailable()) {
      const emailQueue = getQueue(QUEUE_NAMES.EMAIL);
      if (emailQueue) {
        await emailQueue.add("certificate-issued", {
          type: "certificate_issued",
          userId: data.userId,
          certificateId: data.certificateId,
          courseId: data.courseId,
          orgId: data.orgId,
          issuedAt: data.issuedAt,
          expiresAt: data.expiresAt,
        });
      }
    }
  });

  // ---- compliance.completed ------------------------------------------------
  lmsEvents.on("compliance.completed", async (data) => {
    logger.info(`Compliance completed: user=${data.userId} compliance=${data.complianceId}`);

    // Queue compliance completion notification
    if (isQueueSystemAvailable()) {
      const emailQueue = getQueue(QUEUE_NAMES.EMAIL);
      if (emailQueue) {
        await emailQueue.add("compliance-completed", {
          type: "compliance_completed",
          userId: data.userId,
          complianceId: data.complianceId,
          courseId: data.courseId,
          orgId: data.orgId,
          completedAt: data.completedAt,
        });
      }
    }
  });

  // ---- learning_path.completed ---------------------------------------------
  lmsEvents.on("learning_path.completed", async (data) => {
    logger.info(`Learning path completed: user=${data.userId} path=${data.learningPathId}`);

    // Award gamification points
    try {
      const { awardLearningPathCompletionPoints } = await import("./services/gamification/gamification.service");
      await awardLearningPathCompletionPoints(data.orgId, data.userId, `path-${data.learningPathId}`);
    } catch (err) {
      logger.error(`Failed to award points for learning path completion:`, err);
    }

    // Queue learning path completion email
    if (isQueueSystemAvailable()) {
      const emailQueue = getQueue(QUEUE_NAMES.EMAIL);
      if (emailQueue) {
        await emailQueue.add("learning-path-completed", {
          type: "learning_path_completed",
          userId: data.userId,
          learningPathId: data.learningPathId,
          orgId: data.orgId,
          completedAt: data.completedAt,
        });
      }
    }
  });

  logger.info("LMS event listeners registered");
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function start() {
  try {
    // Initialize EmpCloud master database (users, orgs, auth)
    await initEmpCloudDB();
    logger.info("EmpCloud database connected");

    // Initialize LMS module database
    const db = await initDB();
    logger.info("LMS database connected");

    // Run migrations
    await db.migrate();
    logger.info("LMS database migrations applied");

    // Initialize job queues (Redis-backed, graceful if unavailable)
    const { initJobQueues } = await import("./jobs/queue");
    await initJobQueues();

    // Initialize workers
    const { initWorkers } = await import("./jobs/index");
    await initWorkers();

    // Register event listeners for cross-module communication
    registerEventListeners();

    // Start server
    app.listen(config.port, config.host, () => {
      logger.info(`emp-lms server running at http://${config.host}:${config.port}`);
      logger.info(`   Environment: ${config.env}`);
      logger.info(`   CORS origin: ${config.cors.origin}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down...");
  lmsEvents.removeAllListeners();
  try {
    const { closeJobQueues } = await import("./jobs/queue");
    await closeJobQueues();
  } catch {
    // Queue may not have been initialized
  }
  await closeDB();
  await closeEmpCloudDB();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();

export { app };
