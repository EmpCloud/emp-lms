// ============================================================================
// AUTH ROUTES
// POST /login, /sso, /refresh, /logout, GET /me
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import * as authService from "../../services/auth/auth.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// POST /auth/login
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new ValidationError("Email and password are required");
    }
    const result = await authService.login(email, password);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /auth/sso
router.post("/sso", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    if (!token) {
      throw new ValidationError("SSO token is required");
    }
    const result = await authService.ssoLogin(token);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh
router.post("/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new ValidationError("Refresh token is required");
    }
    const result = await authService.refreshToken(refreshToken);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /auth/logout
router.post("/logout", authenticate, (_req: Request, res: Response) => {
  // In a stateless JWT setup, logout is handled client-side by discarding tokens.
  // If a token blacklist is needed later, it can be added here with Redis.
  sendSuccess(res, { message: "Logged out successfully" });
});

// GET /auth/me
router.get("/me", authenticate, (req: Request, res: Response) => {
  sendSuccess(res, { user: req.user });
});

export { router as authRoutes };
