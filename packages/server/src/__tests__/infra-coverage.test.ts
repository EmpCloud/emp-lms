/**
 * EMP LMS — Additional infrastructure coverage tests.
 * Validate middleware (errors.test.ts and response.test.ts already exist).
 */
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { validateBody, validateQuery, validateParams } from "../api/middleware/validate.middleware";

function mockReq(overrides: any = {}) {
  return {
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as any;
}

function mockRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
}

describe("Validate middleware", () => {
  describe("validateBody", () => {
    const schema = z.object({ title: z.string().min(1) });

    it("parses valid body and calls next", () => {
      const req = mockReq({ body: { title: "Hello" } });
      const next = vi.fn();
      validateBody(schema)(req, mockRes(), next);
      expect(req.body).toEqual({ title: "Hello" });
      expect(next).toHaveBeenCalledWith();
    });

    it("calls next with ZodError for invalid body", () => {
      const req = mockReq({ body: { title: "" } });
      const next = vi.fn();
      validateBody(schema)(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(z.ZodError));
    });

    it("strips extra fields", () => {
      const req = mockReq({ body: { title: "X", extra: "junk" } });
      const next = vi.fn();
      validateBody(schema)(req, mockRes(), next);
      expect(req.body).toEqual({ title: "X" });
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe("validateQuery", () => {
    const schema = z.object({ page: z.string().optional() });

    it("parses valid query and calls next", () => {
      const req = mockReq({ query: { page: "2" } });
      const next = vi.fn();
      validateQuery(schema)(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });

    it("calls next with error for invalid query", () => {
      const strictSchema = z.object({ page: z.string().regex(/^\d+$/) });
      const req = mockReq({ query: { page: "abc" } });
      const next = vi.fn();
      validateQuery(strictSchema)(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(z.ZodError));
    });
  });

  describe("validateParams", () => {
    const schema = z.object({ id: z.string().min(1) });

    it("parses valid params and calls next", () => {
      const req = mockReq({ params: { id: "123" } });
      const next = vi.fn();
      validateParams(schema)(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith();
    });

    it("calls next with error for invalid params", () => {
      const req = mockReq({ params: { id: "" } });
      const next = vi.fn();
      validateParams(schema)(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(expect.any(z.ZodError));
    });
  });
});
