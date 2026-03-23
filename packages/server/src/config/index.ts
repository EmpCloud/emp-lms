import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

export const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "4500"),
  host: process.env.HOST || "0.0.0.0",

  // LMS module database (lms-specific tables only)
  db: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    name: process.env.DB_NAME || "emp_lms",
    poolMin: parseInt(process.env.DB_POOL_MIN || "2"),
    poolMax: parseInt(process.env.DB_POOL_MAX || "10"),
  },

  // EmpCloud master database (users, organizations, auth — shared across modules)
  empcloudDb: {
    host: process.env.EMPCLOUD_DB_HOST || process.env.DB_HOST || "localhost",
    port: parseInt(process.env.EMPCLOUD_DB_PORT || process.env.DB_PORT || "3306"),
    user: process.env.EMPCLOUD_DB_USER || process.env.DB_USER || "root",
    password: process.env.EMPCLOUD_DB_PASSWORD || process.env.DB_PASSWORD || "",
    name: process.env.EMPCLOUD_DB_NAME || "empcloud",
  },

  // Redis (for queues, caching)
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || "change-this-in-production",
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || "15m",
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || "7d",
  },

  // Email (course notifications, compliance reminders, certificate alerts)
  email: {
    host: process.env.SMTP_HOST || "localhost",
    port: parseInt(process.env.SMTP_PORT || "1025"),
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
    from: process.env.SMTP_FROM || "lms@empcloud.com",
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5178",
  },

  // File uploads
  upload: {
    maxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE || String(50 * 1024 * 1024)), // 50MB
    maxVideoSize: parseInt(process.env.UPLOAD_MAX_VIDEO_SIZE || String(500 * 1024 * 1024)), // 500MB
    maxScormSize: parseInt(process.env.UPLOAD_MAX_SCORM_SIZE || String(200 * 1024 * 1024)), // 200MB
    allowedImageTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    allowedVideoTypes: ["video/mp4", "video/webm", "video/ogg", "video/quicktime"],
    allowedDocTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    allowedScormTypes: ["application/zip", "application/x-zip-compressed"],
    uploadDir: process.env.UPLOAD_DIR || "uploads",
  },

  // SCORM
  scorm: {
    extractDir: process.env.SCORM_EXTRACT_DIR || "scorm_packages",
    playerUrl: process.env.SCORM_PLAYER_URL || "/scorm-player",
  },

  // AI (course recommendations, content generation)
  ai: {
    provider: process.env.AI_PROVIDER || "openai",
    apiKey: process.env.AI_API_KEY || "",
    model: process.env.AI_MODEL || "gpt-4",
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || "2048"),
  },

  // Rewards / Gamification
  rewards: {
    pointsPerCourseCompletion: parseInt(process.env.REWARDS_COURSE_COMPLETION || "100"),
    pointsPerQuizPass: parseInt(process.env.REWARDS_QUIZ_PASS || "50"),
    pointsPerCertificate: parseInt(process.env.REWARDS_CERTIFICATE || "200"),
    pointsPerStreak: parseInt(process.env.REWARDS_STREAK || "25"),
    streakThresholdDays: parseInt(process.env.REWARDS_STREAK_THRESHOLD || "7"),
  },
} as const;
