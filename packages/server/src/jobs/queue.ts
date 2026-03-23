// ============================================================================
// BULLMQ QUEUE SETUP
// Creates Redis connection, queues, workers, and schedules recurring LMS
// jobs. Handles graceful Redis unavailability — logs warning, does not crash.
// ============================================================================

import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config";
import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// Redis connection
// ---------------------------------------------------------------------------

let redisConnection: IORedis | null = null;
let isRedisAvailable = false;

function createRedisConnection(): IORedis {
  const connection = new IORedis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: true,
    retryStrategy(times: number) {
      if (times > 5) {
        logger.warn("Redis: max retry attempts reached, stopping reconnection");
        return null;
      }
      return Math.min(times * 500, 5000);
    },
  });

  connection.on("connect", () => {
    isRedisAvailable = true;
    logger.info("Redis connected for job queues");
  });

  connection.on("error", (err) => {
    isRedisAvailable = false;
    logger.warn(`Redis connection error: ${err.message}`);
  });

  connection.on("close", () => {
    isRedisAvailable = false;
    logger.warn("Redis connection closed");
  });

  return connection;
}

function getRedisConnection(): IORedis {
  if (!redisConnection) {
    redisConnection = createRedisConnection();
  }
  return redisConnection;
}

// ---------------------------------------------------------------------------
// Queue names
// ---------------------------------------------------------------------------

export const QUEUE_NAMES = {
  EMAIL: "lms:email",
  COMPLIANCE_CHECK: "lms:compliance-check",
  CERTIFICATE_EXPIRY: "lms:certificate-expiry",
  REMINDERS: "lms:reminders",
  ANALYTICS: "lms:analytics",
  STREAK_UPDATE: "lms:streak-update",
} as const;

// ---------------------------------------------------------------------------
// Queue instances
// ---------------------------------------------------------------------------

let queues: Record<string, Queue> = {};
let workers: Worker[] = [];

export function getQueue(name: string): Queue | null {
  return queues[name] ?? null;
}

export function isQueueSystemAvailable(): boolean {
  return isRedisAvailable;
}

// ---------------------------------------------------------------------------
// Status helper for API
// ---------------------------------------------------------------------------

export async function getQueueStatus(): Promise<
  { name: string; waiting: number; active: number; completed: number; failed: number; delayed: number }[]
> {
  const statuses = [];
  for (const [, queue] of Object.entries(queues)) {
    try {
      const counts = await queue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed"
      );
      statuses.push({
        name: queue.name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      });
    } catch {
      statuses.push({
        name: queue.name,
        waiting: -1,
        active: -1,
        completed: -1,
        failed: -1,
        delayed: -1,
      });
    }
  }
  return statuses;
}

// ---------------------------------------------------------------------------
// Job processor stubs (to be replaced with real implementations)
// ---------------------------------------------------------------------------

async function processEmail(): Promise<void> {
  logger.debug("Processing email job");
}

async function processComplianceCheck(): Promise<void> {
  logger.debug("Processing compliance check job");
}

async function processCertificateExpiry(): Promise<void> {
  logger.debug("Processing certificate expiry job");
}

async function processReminders(): Promise<void> {
  logger.debug("Processing reminders job");
}

async function processAnalytics(): Promise<void> {
  logger.debug("Processing analytics job");
}

async function processStreakUpdate(): Promise<void> {
  logger.debug("Processing streak update job");
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export async function initJobQueues(): Promise<void> {
  try {
    const connection = getRedisConnection();

    // Wait briefly for Redis to connect
    await new Promise<void>((resolve) => {
      if (isRedisAvailable) return resolve();
      const timer = setTimeout(() => resolve(), 3000);
      connection.once("ready", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    if (!isRedisAvailable) {
      logger.warn(
        "Redis is not available — job queues will not be started. Scheduled jobs (compliance checks, certificate expiry, reminders) will not run."
      );
      return;
    }

    const connectionOpts = { connection: connection as any };

    // Create queues
    queues = {
      [QUEUE_NAMES.EMAIL]: new Queue(QUEUE_NAMES.EMAIL, connectionOpts),
      [QUEUE_NAMES.COMPLIANCE_CHECK]: new Queue(QUEUE_NAMES.COMPLIANCE_CHECK, connectionOpts),
      [QUEUE_NAMES.CERTIFICATE_EXPIRY]: new Queue(QUEUE_NAMES.CERTIFICATE_EXPIRY, connectionOpts),
      [QUEUE_NAMES.REMINDERS]: new Queue(QUEUE_NAMES.REMINDERS, connectionOpts),
      [QUEUE_NAMES.ANALYTICS]: new Queue(QUEUE_NAMES.ANALYTICS, connectionOpts),
      [QUEUE_NAMES.STREAK_UPDATE]: new Queue(QUEUE_NAMES.STREAK_UPDATE, connectionOpts),
    };

    // Create workers
    workers = [
      new Worker(
        QUEUE_NAMES.EMAIL,
        async () => { await processEmail(); },
        connectionOpts
      ),
      new Worker(
        QUEUE_NAMES.COMPLIANCE_CHECK,
        async () => { await processComplianceCheck(); },
        connectionOpts
      ),
      new Worker(
        QUEUE_NAMES.CERTIFICATE_EXPIRY,
        async () => { await processCertificateExpiry(); },
        connectionOpts
      ),
      new Worker(
        QUEUE_NAMES.REMINDERS,
        async () => { await processReminders(); },
        connectionOpts
      ),
      new Worker(
        QUEUE_NAMES.ANALYTICS,
        async () => { await processAnalytics(); },
        connectionOpts
      ),
      new Worker(
        QUEUE_NAMES.STREAK_UPDATE,
        async () => { await processStreakUpdate(); },
        connectionOpts
      ),
    ];

    // Attach error handlers to workers
    for (const worker of workers) {
      worker.on("failed", (job, err) => {
        logger.error(`Job ${job?.name} in ${worker.name} failed:`, err);
      });
      worker.on("completed", (job) => {
        logger.info(`Job ${job?.name} in ${worker.name} completed`);
      });
    }

    // Schedule recurring jobs

    // Daily compliance checks at 8:00 AM
    await queues[QUEUE_NAMES.COMPLIANCE_CHECK].upsertJobScheduler(
      "daily-compliance-check",
      { pattern: "0 8 * * *" },
      { name: "compliance-check" }
    );

    // Certificate expiry checks at 2:00 AM
    await queues[QUEUE_NAMES.CERTIFICATE_EXPIRY].upsertJobScheduler(
      "daily-certificate-expiry",
      { pattern: "0 2 * * *" },
      { name: "certificate-expiry-check" }
    );

    // Streak updates at midnight
    await queues[QUEUE_NAMES.STREAK_UPDATE].upsertJobScheduler(
      "daily-streak-update",
      { pattern: "0 0 * * *" },
      { name: "streak-update" }
    );

    // Reminders at 9:00 AM
    await queues[QUEUE_NAMES.REMINDERS].upsertJobScheduler(
      "daily-reminders",
      { pattern: "0 9 * * *" },
      { name: "daily-reminders" }
    );

    logger.info("Job queues initialized — compliance checks at 8 AM, certificate expiry at 2 AM, streaks at midnight, reminders at 9 AM");
  } catch (error) {
    logger.warn("Failed to initialize job queues — scheduled jobs disabled:", error);
  }
}

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

export async function closeJobQueues(): Promise<void> {
  for (const worker of workers) {
    await worker.close();
  }
  for (const queue of Object.values(queues)) {
    await queue.close();
  }
  if (redisConnection) {
    redisConnection.disconnect();
    redisConnection = null;
  }
  logger.info("Job queues shut down");
}
