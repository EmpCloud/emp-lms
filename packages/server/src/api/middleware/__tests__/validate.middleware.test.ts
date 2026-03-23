import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { validateBody, validateQuery, validateParams } from "../validate.middleware";

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  return {} as Response;
}

let nextFn: ReturnType<typeof vi.fn>;

beforeEach(() => {
  nextFn = vi.fn();
});

// ── validateBody ─────────────────────────────────────────────────────────

describe("validateBody", () => {
  const schema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
  });

  it("should pass valid body data and call next", () => {
    const req = mockReq({ body: { title: "Test Course" } });

    validateBody(schema)(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith();
    expect(req.body).toEqual({ title: "Test Course" });
  });

  it("should strip unknown properties from body", () => {
    const req = mockReq({ body: { title: "Test", extra: "field" } });

    validateBody(schema)(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith();
    expect(req.body).not.toHaveProperty("extra");
  });

  it("should call next with ZodError when body is invalid", () => {
    const req = mockReq({ body: { title: "" } });

    validateBody(schema)(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith(expect.any(ZodError));
  });

  it("should call next with ZodError when required field is missing", () => {
    const req = mockReq({ body: {} });

    validateBody(schema)(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith(expect.any(ZodError));
  });
});

// ── validateQuery ────────────────────────────────────────────────────────

describe("validateQuery", () => {
  const schema = z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    perPage: z.coerce.number().int().positive().optional().default(20),
    search: z.string().optional(),
  });

  it("should pass valid query params and call next", () => {
    const req = mockReq({ query: { page: "2", perPage: "10" } as any });

    validateQuery(schema)(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith();
    expect(req.query).toEqual({ page: 2, perPage: 10 });
  });

  it("should apply defaults for missing query params", () => {
    const req = mockReq({ query: {} });

    validateQuery(schema)(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith();
    expect(req.query).toEqual({ page: 1, perPage: 20 });
  });

  it("should call next with error for invalid query params", () => {
    const req = mockReq({ query: { page: "not-a-number" } as any });

    validateQuery(schema)(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith(expect.any(ZodError));
  });
});

// ── validateParams ───────────────────────────────────────────────────────

describe("validateParams", () => {
  const schema = z.object({
    id: z.string().uuid(),
  });

  it("should pass valid params and call next", () => {
    const req = mockReq({ params: { id: "550e8400-e29b-41d4-a716-446655440000" } });

    validateParams(schema)(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith();
    expect(req.params.id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("should call next with ZodError for invalid UUID param", () => {
    const req = mockReq({ params: { id: "not-a-uuid" } });

    validateParams(schema)(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith(expect.any(ZodError));
  });

  it("should call next with ZodError when required param is missing", () => {
    const req = mockReq({ params: {} });

    validateParams(schema)(req, mockRes(), nextFn);

    expect(nextFn).toHaveBeenCalledWith(expect.any(ZodError));
  });
});
