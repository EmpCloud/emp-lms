import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("jsonwebtoken", () => ({
  default: { verify: vi.fn() },
}));

vi.mock("../../../config", () => ({
  config: { jwt: { secret: "test-secret" } },
}));

import jwt from "jsonwebtoken";
import { authenticate, optionalAuth, authorize } from "../auth.middleware";

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    query: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  return {} as Response;
}

let nextFn: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  nextFn = vi.fn();
});

const validPayload = {
  empcloudUserId: 1,
  empcloudOrgId: 1,
  role: "employee" as const,
  email: "test@example.com",
  firstName: "John",
  lastName: "Doe",
  orgName: "TestOrg",
};

// ── authenticate ─────────────────────────────────────────────────────────

describe("authenticate", () => {
  it("should authenticate with a valid Bearer token", () => {
    (jwt.verify as any).mockReturnValue(validPayload);
    const req = mockReq({ headers: { authorization: "Bearer valid-token" } });

    authenticate(req, mockRes(), nextFn);

    expect(jwt.verify).toHaveBeenCalledWith("valid-token", "test-secret");
    expect(req.user).toEqual(validPayload);
    expect(nextFn).toHaveBeenCalledWith();
  });

  it("should authenticate with a query token", () => {
    (jwt.verify as any).mockReturnValue(validPayload);
    const req = mockReq({ query: { token: "query-token" } });

    authenticate(req, mockRes(), nextFn);

    expect(jwt.verify).toHaveBeenCalledWith("query-token", "test-secret");
    expect(req.user).toEqual(validPayload);
  });

  it("should reject when no token is provided", () => {
    const req = mockReq();

    authenticate(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: "UNAUTHORIZED" })
    );
  });

  it("should reject when authorization header has no Bearer prefix", () => {
    const req = mockReq({ headers: { authorization: "Basic abc123" } });

    authenticate(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: "UNAUTHORIZED" })
    );
  });

  it("should return TOKEN_EXPIRED for expired tokens", () => {
    const expiredError = new Error("jwt expired");
    expiredError.name = "TokenExpiredError";
    (jwt.verify as any).mockImplementation(() => { throw expiredError; });

    const req = mockReq({ headers: { authorization: "Bearer expired-token" } });

    authenticate(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: "TOKEN_EXPIRED" })
    );
  });

  it("should return INVALID_TOKEN for malformed tokens", () => {
    (jwt.verify as any).mockImplementation(() => { throw new Error("invalid signature"); });

    const req = mockReq({ headers: { authorization: "Bearer bad-token" } });

    authenticate(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: "INVALID_TOKEN" })
    );
  });

  it("should prefer query token when both header and query are present", () => {
    (jwt.verify as any).mockReturnValue(validPayload);
    const req = mockReq({
      headers: { authorization: "Bearer header-token" },
      query: { token: "query-token" },
    });

    authenticate(req, mockRes(), nextFn);

    expect(jwt.verify).toHaveBeenCalledWith("query-token", "test-secret");
  });
});

// ── optionalAuth ─────────────────────────────────────────────────────────

describe("optionalAuth", () => {
  it("should set user when valid token is provided", () => {
    (jwt.verify as any).mockReturnValue(validPayload);
    const req = mockReq({ headers: { authorization: "Bearer valid-token" } });

    optionalAuth(req, mockRes(), nextFn);

    expect(req.user).toEqual(validPayload);
    expect(nextFn).toHaveBeenCalledWith();
  });

  it("should proceed without user when no token is provided", () => {
    const req = mockReq();

    optionalAuth(req, mockRes(), nextFn);

    expect(req.user).toBeUndefined();
    expect(nextFn).toHaveBeenCalledWith();
  });

  it("should proceed without user when token is invalid", () => {
    (jwt.verify as any).mockImplementation(() => { throw new Error("bad"); });
    const req = mockReq({ headers: { authorization: "Bearer bad-token" } });

    optionalAuth(req, mockRes(), nextFn);

    expect(req.user).toBeUndefined();
    expect(nextFn).toHaveBeenCalledWith();
  });
});

// ── authorize ────────────────────────────────────────────────────────────

describe("authorize", () => {
  it("should allow when user has an allowed role", () => {
    const req = mockReq();
    req.user = { ...validPayload, role: "org_admin" };

    authorize("org_admin", "super_admin")(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith();
  });

  it("should deny when user has a disallowed role", () => {
    const req = mockReq();
    req.user = { ...validPayload, role: "employee" };

    authorize("org_admin", "super_admin")(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })
    );
  });

  it("should return 401 when user is not authenticated", () => {
    const req = mockReq();

    authorize("org_admin")(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: "UNAUTHORIZED" })
    );
  });

  it("should allow any authenticated user when no roles specified", () => {
    const req = mockReq();
    req.user = { ...validPayload, role: "employee" };

    authorize()(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith();
  });
});
