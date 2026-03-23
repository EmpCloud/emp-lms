import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

vi.mock("../../../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { errorHandler } from "../error.middleware";
import { AppError } from "../../../utils/errors";

function mockReq(): Request {
  return {} as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

const nextFn: NextFunction = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

// ── AppError handling ────────────────────────────────────────────────────

describe("errorHandler with AppError", () => {
  it("should return the correct status code and error body", () => {
    const err = new AppError(400, "BAD_REQUEST", "Invalid input");
    const res = mockRes();

    errorHandler(err, mockReq(), res, nextFn);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "BAD_REQUEST", message: "Invalid input" },
    });
  });

  it("should include details when present on AppError", () => {
    const details = { name: ["Name is required"] };
    const err = new AppError(422, "VALIDATION_ERROR", "Validation failed", details);
    const res = mockRes();

    errorHandler(err, mockReq(), res, nextFn);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Validation failed", details },
    });
  });

  it("should handle 401 Unauthorized AppError", () => {
    const err = new AppError(401, "UNAUTHORIZED", "Not logged in");
    const res = mockRes();

    errorHandler(err, mockReq(), res, nextFn);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.objectContaining({ code: "UNAUTHORIZED" }) })
    );
  });

  it("should handle 404 Not Found AppError", () => {
    const err = new AppError(404, "NOT_FOUND", "Resource not found");
    const res = mockRes();

    errorHandler(err, mockReq(), res, nextFn);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── ZodError handling ────────────────────────────────────────────────────

describe("errorHandler with ZodError", () => {
  it("should return 422 with flattened field errors", () => {
    const zodError = new ZodError([
      {
        code: "invalid_type",
        expected: "string",
        received: "undefined",
        path: ["email"],
        message: "Required",
      },
    ]);
    const res = mockRes();

    errorHandler(zodError, mockReq(), res, nextFn);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: expect.objectContaining({ email: ["Required"] }),
      },
    });
  });

  it("should handle ZodError with multiple field errors", () => {
    const zodError = new ZodError([
      { code: "too_small", minimum: 1, type: "string", inclusive: true, exact: false, path: ["name"], message: "Too short" },
      { code: "invalid_type", expected: "number", received: "string", path: ["age"], message: "Expected number" },
    ]);
    const res = mockRes();

    errorHandler(zodError, mockReq(), res, nextFn);

    expect(res.status).toHaveBeenCalledWith(422);
    const body = res.json.mock.calls[0][0];
    expect(body.error.details).toHaveProperty("name");
    expect(body.error.details).toHaveProperty("age");
  });
});

// ── Unknown error handling ───────────────────────────────────────────────

describe("errorHandler with unknown errors", () => {
  it("should return 500 with error message in development", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const err = new Error("Something broke");
    const res = mockRes();

    errorHandler(err, mockReq(), res, nextFn);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Something broke" },
    });

    process.env.NODE_ENV = originalEnv;
  });

  it("should hide error message in production", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const err = new Error("Secret internal details");
    const res = mockRes();

    errorHandler(err, mockReq(), res, nextFn);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    });

    process.env.NODE_ENV = originalEnv;
  });

  it("should log unknown errors", async () => {
    const { logger } = await import("../../../utils/logger");
    const err = new Error("Unexpected");
    const res = mockRes();

    errorHandler(err, mockReq(), res, nextFn);

    expect(logger.error).toHaveBeenCalledWith("Unhandled error:", err);
  });
});
