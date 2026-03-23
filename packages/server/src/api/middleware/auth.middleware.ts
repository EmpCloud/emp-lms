import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import { AppError } from "../../utils/errors";

export interface AuthPayload {
  empcloudUserId: number;
  empcloudOrgId: number;
  role: "super_admin" | "org_admin" | "hr_admin" | "hr_manager" | "manager" | "employee";
  email: string;
  firstName: string;
  lastName: string;
  orgName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const queryToken = req.query.token as string | undefined;

  if (!header?.startsWith("Bearer ") && !queryToken) {
    return next(new AppError(401, "UNAUTHORIZED", "Missing or invalid authorization header"));
  }

  const token = queryToken || header!.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthPayload;
    req.user = payload;
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return next(new AppError(401, "TOKEN_EXPIRED", "Access token has expired"));
    }
    return next(new AppError(401, "INVALID_TOKEN", "Invalid access token"));
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const queryToken = req.query.token as string | undefined;

  if (!header?.startsWith("Bearer ") && !queryToken) {
    return next();
  }

  const token = queryToken || header!.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthPayload;
    req.user = payload;
  } catch {
    // Token invalid or expired — proceed without user context
  }
  next();
}

export function authorize(...roles: AuthPayload["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "UNAUTHORIZED", "Not authenticated"));
    }
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(
        new AppError(403, "FORBIDDEN", "You do not have permission to perform this action")
      );
    }
    next();
  };
}
