import { describe, it, expect } from "vitest";
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from "./errors";

describe("AppError", () => {
  it("should create with statusCode, code, and message", () => {
    const err = new AppError(500, "SERVER_ERROR", "Something went wrong");
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("SERVER_ERROR");
    expect(err.message).toBe("Something went wrong");
    expect(err.name).toBe("AppError");
    expect(err).toBeInstanceOf(Error);
  });

  it("should include details when provided", () => {
    const details = { field: ["required"] };
    const err = new AppError(400, "VALIDATION", "Invalid", details);
    expect(err.details).toEqual(details);
  });
});

describe("NotFoundError", () => {
  it("should create with resource and id", () => {
    const err = new NotFoundError("Course", "abc-123");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toContain("Course");
    expect(err.message).toContain("abc-123");
  });

  it("should create with resource only (no id)", () => {
    const err = new NotFoundError("Enrollment");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Enrollment not found");
  });
});

describe("ValidationError", () => {
  it("should create with 400 status", () => {
    const err = new ValidationError("Invalid input");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("should include field details", () => {
    const details = { title: ["too short"], email: ["invalid format"] };
    const err = new ValidationError("Validation failed", details);
    expect(err.details).toEqual(details);
  });
});

describe("UnauthorizedError", () => {
  it("should create with default message", () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Unauthorized");
  });

  it("should create with custom message", () => {
    const err = new UnauthorizedError("Token expired");
    expect(err.message).toBe("Token expired");
  });
});

describe("ForbiddenError", () => {
  it("should create with 403 status", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
  });

  it("should use custom message", () => {
    const err = new ForbiddenError("Admin only");
    expect(err.message).toBe("Admin only");
  });
});

describe("ConflictError", () => {
  it("should create with 409 status", () => {
    const err = new ConflictError("Already exists");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("Already exists");
  });
});

describe("BadRequestError", () => {
  it("should create with 400 status", () => {
    const err = new BadRequestError("Bad input");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("should include details", () => {
    const details = { name: ["required"] };
    const err = new BadRequestError("Bad input", details);
    expect(err.details).toEqual(details);
  });
});
