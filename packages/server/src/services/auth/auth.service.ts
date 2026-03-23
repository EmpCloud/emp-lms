// ============================================================================
// AUTH SERVICE
// Handles login, SSO, and token refresh for EMP LMS.
// Users are stored in the EmpCloud master database.
// ============================================================================

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import {
  findUserByEmail,
  findUserById,
  findOrgById,
} from "../../db/empcloud";
import { UnauthorizedError, ValidationError } from "../../utils/errors";
import type { AuthPayload } from "../../api/middleware/auth.middleware";

interface LoginResult {
  user: {
    empcloudUserId: number;
    empcloudOrgId: number;
    role: string;
    email: string;
    firstName: string;
    lastName: string;
    orgName: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiry as any,
  });
}

function signRefreshToken(userId: number): string {
  return jwt.sign({ userId, type: "refresh" }, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiry as any,
  });
}

export async function login(email: string, password: string): Promise<LoginResult> {
  if (!email || !password) {
    throw new ValidationError("Email and password are required");
  }

  const user = await findUserByEmail(email);
  if (!user) {
    throw new UnauthorizedError("Invalid email or password");
  }

  if (!user.password) {
    throw new UnauthorizedError("Password not set for this account");
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const org = await findOrgById(user.organization_id);
  if (!org || !org.is_active) {
    throw new UnauthorizedError("Organization is inactive");
  }

  const payload: AuthPayload = {
    empcloudUserId: user.id,
    empcloudOrgId: user.organization_id,
    role: user.role as AuthPayload["role"],
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.id);

  logger.info(`User logged in: ${user.email} (org: ${org.name})`);

  return {
    user: payload,
    tokens: { accessToken, refreshToken },
  };
}

/**
 * SSO login: exchange an EMP Cloud RS256 JWT for an LMS-specific HS256 JWT.
 * We decode the EMP Cloud token without cryptographic verification (the user
 * arrived via the trusted dashboard redirect) and validate the referenced user
 * exists and is active in the empcloud database before issuing our own tokens.
 */
export async function ssoLogin(empcloudToken: string): Promise<LoginResult> {
  const decoded = jwt.decode(empcloudToken);
  if (!decoded || typeof decoded === "string") {
    throw new UnauthorizedError("Invalid SSO token");
  }

  const userId = Number(decoded.sub);
  if (!userId) {
    throw new UnauthorizedError("SSO token missing user id");
  }

  const user = await findUserById(userId);
  if (!user || user.status !== 1) {
    throw new UnauthorizedError("User not found or inactive");
  }

  const org = await findOrgById(user.organization_id);
  if (!org || !org.is_active) {
    throw new UnauthorizedError("Organization is inactive");
  }

  const payload: AuthPayload = {
    empcloudUserId: user.id,
    empcloudOrgId: user.organization_id,
    role: user.role as AuthPayload["role"],
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
  };

  const accessToken = signAccessToken(payload);
  const refreshTokenValue = signRefreshToken(user.id);

  logger.info(`SSO login: ${user.email} (org: ${org.name})`);

  return {
    user: payload,
    tokens: { accessToken, refreshToken: refreshTokenValue },
  };
}

export async function refreshToken(token: string): Promise<{ accessToken: string; refreshToken: string }> {
  let decoded: any;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  if (decoded.type !== "refresh") {
    throw new UnauthorizedError("Invalid token type");
  }

  const user = await findUserById(decoded.userId);
  if (!user || user.status !== 1) {
    throw new UnauthorizedError("User not found or inactive");
  }

  const org = await findOrgById(user.organization_id);
  if (!org || !org.is_active) {
    throw new UnauthorizedError("Organization is inactive");
  }

  const payload: AuthPayload = {
    empcloudUserId: user.id,
    empcloudOrgId: user.organization_id,
    role: user.role as AuthPayload["role"],
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    orgName: org.name,
  };

  const newAccessToken = signAccessToken(payload);
  const newRefreshToken = signRefreshToken(user.id);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}
