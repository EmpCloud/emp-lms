import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn() },
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn(() => "mock-token"),
    verify: vi.fn(),
    decode: vi.fn(),
  },
}));

vi.mock("../../config", () => ({
  config: {
    jwt: {
      secret: "test-secret",
      accessExpiry: "15m",
      refreshExpiry: "7d",
    },
  },
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../db/empcloud", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  findOrgById: vi.fn(),
}));

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { findUserByEmail, findUserById, findOrgById } from "../../db/empcloud";
import { login, ssoLogin, refreshToken } from "./auth.service";

const mockUser = {
  id: 1,
  organization_id: 10,
  email: "john@example.com",
  password: "$2a$10$hashedpassword",
  first_name: "John",
  last_name: "Doe",
  role: "employee",
  status: 1,
};

const mockOrg = {
  id: 10,
  name: "TestOrg",
  is_active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── login ────────────────────────────────────────────────────────────────

describe("login", () => {
  it("should return user and tokens on valid credentials", async () => {
    (findUserByEmail as any).mockResolvedValue(mockUser);
    (bcrypt.compare as any).mockResolvedValue(true);
    (findOrgById as any).mockResolvedValue(mockOrg);

    const result = await login("john@example.com", "password123");

    expect(result.user.email).toBe("john@example.com");
    expect(result.user.empcloudUserId).toBe(1);
    expect(result.user.orgName).toBe("TestOrg");
    expect(result.tokens.accessToken).toBe("mock-token");
    expect(result.tokens.refreshToken).toBe("mock-token");
  });

  it("should throw ValidationError when email is missing", async () => {
    await expect(login("", "password")).rejects.toThrow("Email and password are required");
  });

  it("should throw ValidationError when password is missing", async () => {
    await expect(login("john@example.com", "")).rejects.toThrow("Email and password are required");
  });

  it("should throw UnauthorizedError when user is not found", async () => {
    (findUserByEmail as any).mockResolvedValue(null);

    await expect(login("unknown@example.com", "password")).rejects.toThrow("Invalid email or password");
  });

  it("should throw UnauthorizedError when password is not set", async () => {
    (findUserByEmail as any).mockResolvedValue({ ...mockUser, password: null });

    await expect(login("john@example.com", "password")).rejects.toThrow("Password not set");
  });

  it("should throw UnauthorizedError when password does not match", async () => {
    (findUserByEmail as any).mockResolvedValue(mockUser);
    (bcrypt.compare as any).mockResolvedValue(false);

    await expect(login("john@example.com", "wrong")).rejects.toThrow("Invalid email or password");
  });

  it("should throw UnauthorizedError when organization is inactive", async () => {
    (findUserByEmail as any).mockResolvedValue(mockUser);
    (bcrypt.compare as any).mockResolvedValue(true);
    (findOrgById as any).mockResolvedValue({ ...mockOrg, is_active: false });

    await expect(login("john@example.com", "password")).rejects.toThrow("Organization is inactive");
  });

  it("should throw UnauthorizedError when organization is not found", async () => {
    (findUserByEmail as any).mockResolvedValue(mockUser);
    (bcrypt.compare as any).mockResolvedValue(true);
    (findOrgById as any).mockResolvedValue(null);

    await expect(login("john@example.com", "password")).rejects.toThrow("Organization is inactive");
  });
});

// ── ssoLogin ─────────────────────────────────────────────────────────────

describe("ssoLogin", () => {
  it("should return user and tokens for valid SSO token", async () => {
    (jwt.decode as any).mockReturnValue({ sub: "1" });
    (findUserById as any).mockResolvedValue(mockUser);
    (findOrgById as any).mockResolvedValue(mockOrg);

    const result = await ssoLogin("valid-sso-token");

    expect(result.user.empcloudUserId).toBe(1);
    expect(result.tokens.accessToken).toBeDefined();
  });

  it("should throw UnauthorizedError when token cannot be decoded", async () => {
    (jwt.decode as any).mockReturnValue(null);

    await expect(ssoLogin("bad-token")).rejects.toThrow("Invalid SSO token");
  });

  it("should throw UnauthorizedError when token is a string", async () => {
    (jwt.decode as any).mockReturnValue("just-a-string");

    await expect(ssoLogin("string-token")).rejects.toThrow("Invalid SSO token");
  });

  it("should throw UnauthorizedError when sub is missing", async () => {
    (jwt.decode as any).mockReturnValue({ iss: "test" });

    await expect(ssoLogin("no-sub-token")).rejects.toThrow("SSO token missing user id");
  });

  it("should throw UnauthorizedError when user is inactive", async () => {
    (jwt.decode as any).mockReturnValue({ sub: "1" });
    (findUserById as any).mockResolvedValue({ ...mockUser, status: 0 });

    await expect(ssoLogin("sso-token")).rejects.toThrow("User not found or inactive");
  });
});

// ── refreshToken ─────────────────────────────────────────────────────────

describe("refreshToken", () => {
  it("should return new token pair for valid refresh token", async () => {
    (jwt.verify as any).mockReturnValue({ userId: 1, type: "refresh" });
    (findUserById as any).mockResolvedValue(mockUser);
    (findOrgById as any).mockResolvedValue(mockOrg);

    const result = await refreshToken("valid-refresh-token");

    expect(result.accessToken).toBe("mock-token");
    expect(result.refreshToken).toBe("mock-token");
  });

  it("should throw UnauthorizedError when token verification fails", async () => {
    (jwt.verify as any).mockImplementation(() => { throw new Error("expired"); });

    await expect(refreshToken("expired-token")).rejects.toThrow("Invalid or expired refresh token");
  });

  it("should throw UnauthorizedError when token type is not refresh", async () => {
    (jwt.verify as any).mockReturnValue({ userId: 1, type: "access" });

    await expect(refreshToken("wrong-type-token")).rejects.toThrow("Invalid token type");
  });

  it("should throw UnauthorizedError when user is not found", async () => {
    (jwt.verify as any).mockReturnValue({ userId: 999, type: "refresh" });
    (findUserById as any).mockResolvedValue(null);

    await expect(refreshToken("token")).rejects.toThrow("User not found or inactive");
  });

  it("should throw UnauthorizedError when org is inactive during refresh", async () => {
    (jwt.verify as any).mockReturnValue({ userId: 1, type: "refresh" });
    (findUserById as any).mockResolvedValue(mockUser);
    (findOrgById as any).mockResolvedValue({ ...mockOrg, is_active: false });

    await expect(refreshToken("token")).rejects.toThrow("Organization is inactive");
  });
});
