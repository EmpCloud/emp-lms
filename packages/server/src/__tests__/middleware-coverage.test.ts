// =============================================================================
// EMP LMS — Middleware, Error, Rate Limit, Validate, Errors, Response Unit Tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { z, ZodError } from "zod";

vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../config", () => ({
  config: { jwt: { secret: "lms-test-secret" } },
}));
vi.mock("@emp-lms/shared", () => ({ default: {} }));

import { authenticate, optionalAuth, authorize, AuthPayload } from "../api/middleware/auth.middleware";
import { errorHandler } from "../api/middleware/error.middleware";
import { rateLimit } from "../api/middleware/rate-limit.middleware";
import { validateBody, validateQuery, validateParams } from "../api/middleware/validate.middleware";
import { AppError, NotFoundError, ValidationError, UnauthorizedError, ForbiddenError, ConflictError, BadRequestError } from "../utils/errors";
import { sendSuccess, sendError, sendPaginated } from "../utils/response";

function mockReq(overrides: any = {}): any {
  return { headers: {}, params: {}, query: {}, body: {}, ip: "127.0.0.1", ...overrides };
}
function mockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

// =============================================================================
// Auth Middleware
// =============================================================================
describe("LMS Auth Middleware", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("authenticate()", () => {
    it("rejects missing auth", () => {
      const next = vi.fn();
      authenticate(mockReq(), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    it("internal service bypass", () => {
      const orig = process.env.INTERNAL_SERVICE_SECRET;
      process.env.INTERNAL_SERVICE_SECRET = "lms-sec";
      const req = mockReq({
        headers: { "x-internal-service": "empcloud-dashboard", "x-internal-secret": "lms-sec" },
        query: { organization_id: "4" },
      });
      const next = vi.fn();
      authenticate(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
      expect(req.user.empcloudOrgId).toBe(4);
      process.env.INTERNAL_SERVICE_SECRET = orig;
    });

    it("authenticates valid JWT", () => {
      const token = jwt.sign({ empcloudUserId: 1, empcloudOrgId: 2, role: "hr_admin" }, "lms-test-secret");
      const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
      const next = vi.fn();
      authenticate(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
      expect(req.user.empcloudUserId).toBe(1);
    });

    it("rejects expired token", () => {
      const token = jwt.sign({ sub: "1" }, "lms-test-secret", { expiresIn: "-1s" });
      const next = vi.fn();
      authenticate(mockReq({ headers: { authorization: `Bearer ${token}` } }), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "TOKEN_EXPIRED" }));
    });

    it("rejects invalid token", () => {
      const next = vi.fn();
      authenticate(mockReq({ headers: { authorization: "Bearer garbage" } }), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: "INVALID_TOKEN" }));
    });
  });

  describe("optionalAuth()", () => {
    it("continues without user when no auth", () => {
      const req = mockReq();
      const next = vi.fn();
      optionalAuth(req, mockRes(), next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it("attaches user on valid token", () => {
      const token = jwt.sign({ empcloudUserId: 5, role: "employee" }, "lms-test-secret");
      const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
      const next = vi.fn();
      optionalAuth(req, mockRes(), next);
      expect(req.user.empcloudUserId).toBe(5);
      expect(next).toHaveBeenCalled();
    });

    it("continues without user on bad token", () => {
      const req = mockReq({ headers: { authorization: "Bearer bad" } });
      const next = vi.fn();
      optionalAuth(req, mockRes(), next);
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it("accepts query token", () => {
      const token = jwt.sign({ empcloudUserId: 6 }, "lms-test-secret");
      const req = mockReq({ query: { token } });
      const next = vi.fn();
      optionalAuth(req, mockRes(), next);
      expect(req.user.empcloudUserId).toBe(6);
    });
  });

  describe("authorize()", () => {
    it("rejects unauthenticated", () => {
      const next = vi.fn();
      authorize("hr_admin")(mockReq(), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    it("rejects wrong role", () => {
      const next = vi.fn();
      authorize("org_admin")(mockReq({ user: { role: "employee" } }), mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    it("allows matching role", () => {
      const next = vi.fn();
      authorize("hr_admin")(mockReq({ user: { role: "hr_admin" } }), mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });

    it("auto-grants org_admin when hr_admin allowed", () => {
      const next = vi.fn();
      authorize("hr_admin")(mockReq({ user: { role: "org_admin" } }), mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });

    it("allows any auth when no roles", () => {
      const next = vi.fn();
      authorize()(mockReq({ user: { role: "employee" } }), mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });
  });
});

// =============================================================================
// Error Handler
// =============================================================================
describe("LMS Error Handler", () => {
  it("handles AppError", () => {
    const res = mockRes();
    errorHandler(new AppError(422, "V", "bad"), mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it("handles AppError with details", () => {
    const err = new AppError(400, "BAD", "m", { f: ["r"] });
    const res = mockRes();
    errorHandler(err, mockReq(), res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ details: { f: ["r"] } }),
    }));
  });

  it("handles ZodError as 422", () => {
    const err = new ZodError([{ code: "invalid_type", expected: "string", received: "number", path: ["x"], message: "bad" }]);
    const res = mockRes();
    errorHandler(err, mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it("handles unknown error as 500", () => {
    const res = mockRes();
    errorHandler(new Error("boom"), mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// =============================================================================
// Validate Middleware
// =============================================================================
describe("LMS Validate Middleware", () => {
  const nameSchema = z.object({ name: z.string().min(1) });

  describe("validateBody()", () => {
    it("passes valid body", () => {
      const mw = validateBody(nameSchema);
      const req = mockReq({ body: { name: "Course" } });
      const next = vi.fn();
      mw(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });

    it("forwards ZodError on invalid body", () => {
      const mw = validateBody(nameSchema);
      const req = mockReq({ body: {} });
      const next = vi.fn();
      mw(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(ZodError));
    });
  });

  describe("validateQuery()", () => {
    const qSchema = z.object({ page: z.string() });

    it("passes valid query", () => {
      const mw = validateQuery(qSchema);
      const req = mockReq({ query: { page: "1" } });
      const next = vi.fn();
      mw(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });

    it("forwards ZodError on invalid query", () => {
      const mw = validateQuery(qSchema);
      const req = mockReq({ query: {} });
      const next = vi.fn();
      mw(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(ZodError));
    });
  });

  describe("validateParams()", () => {
    const pSchema = z.object({ id: z.string() });

    it("passes valid params", () => {
      const mw = validateParams(pSchema);
      const req = mockReq({ params: { id: "abc" } });
      const next = vi.fn();
      mw(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });

    it("forwards ZodError on invalid params", () => {
      const mw = validateParams(pSchema);
      const req = mockReq({ params: {} });
      const next = vi.fn();
      mw(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(ZodError));
    });
  });
});

// =============================================================================
// Rate Limit
// =============================================================================
describe("LMS Rate Limit", () => {
  it("skips when disabled", () => {
    const orig = process.env.RATE_LIMIT_DISABLED;
    process.env.RATE_LIMIT_DISABLED = "true";
    const next = vi.fn();
    rateLimit({ windowMs: 1000, max: 1 })(mockReq({ ip: "lms-skip" }), mockRes(), next);
    expect(next).toHaveBeenCalled();
    process.env.RATE_LIMIT_DISABLED = orig;
  });

  it("blocks over limit", () => {
    const orig = process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_DISABLED;
    const limiter = rateLimit({ windowMs: 60000, max: 1 });
    const ip = `lms-block-${Date.now()}`;
    limiter(mockReq({ ip }), mockRes(), vi.fn());
    const res = mockRes();
    limiter(mockReq({ ip }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(429);
    process.env.RATE_LIMIT_DISABLED = orig;
  });
});

// =============================================================================
// Error Classes
// =============================================================================
describe("LMS Error Classes", () => {
  it("AppError", () => { expect(new AppError(400, "X", "m").statusCode).toBe(400); });
  it("NotFoundError", () => { expect(new NotFoundError("Course").message).toContain("Course"); });
  it("ValidationError", () => { expect(new ValidationError("bad").statusCode).toBe(400); });
  it("UnauthorizedError", () => { expect(new UnauthorizedError().statusCode).toBe(401); });
  it("ForbiddenError", () => { expect(new ForbiddenError().statusCode).toBe(403); });
  it("ConflictError", () => { expect(new ConflictError("dup").statusCode).toBe(409); });
  it("BadRequestError", () => { expect(new BadRequestError("bad").statusCode).toBe(400); });
});

// =============================================================================
// Response Helpers
// =============================================================================
describe("LMS Response Helpers", () => {
  it("sendSuccess", () => {
    const res = mockRes();
    sendSuccess(res, { id: 1 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("sendError", () => {
    const res = mockRes();
    sendError(res, 404, "NOT_FOUND", "gone");
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("sendPaginated", () => {
    const res = mockRes();
    sendPaginated(res, [1, 2, 3], 30, 1, 10);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: [1, 2, 3],
      meta: expect.objectContaining({ totalPages: 3, total: 30, page: 1, limit: 10 }),
    }));
  });
});
