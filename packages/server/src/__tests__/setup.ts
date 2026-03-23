// ============================================================================
// VITEST SETUP FILE
// Mocks environment variables and suppresses logger output during tests.
// ============================================================================

import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock environment variables
// ---------------------------------------------------------------------------

process.env.NODE_ENV = "test";
process.env.PORT = "4500";
process.env.HOST = "127.0.0.1";
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "3306";
process.env.DB_USER = "root";
process.env.DB_PASSWORD = "test_password";
process.env.DB_NAME = "emp_lms_test";
process.env.EMPCLOUD_DB_HOST = "localhost";
process.env.EMPCLOUD_DB_PORT = "3306";
process.env.EMPCLOUD_DB_USER = "root";
process.env.EMPCLOUD_DB_PASSWORD = "test_password";
process.env.EMPCLOUD_DB_NAME = "empcloud_test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.JWT_SECRET = "test-jwt-secret-do-not-use-in-production";
process.env.JWT_ACCESS_EXPIRY = "15m";
process.env.JWT_REFRESH_EXPIRY = "7d";
process.env.SMTP_HOST = "localhost";
process.env.SMTP_PORT = "1025";
process.env.SMTP_FROM = "lms-test@empcloud.com";
process.env.CORS_ORIGIN = "http://localhost:5178";
process.env.AI_API_KEY = "test-ai-key";
process.env.UPLOAD_DIR = "/tmp/emp-lms-test-uploads";

// ---------------------------------------------------------------------------
// Mock logger to suppress output during tests
// ---------------------------------------------------------------------------

vi.mock("../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));
