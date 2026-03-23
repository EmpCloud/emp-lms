import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../../utils/logger";
import { AppError } from "../../utils/errors";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // Handle Zod validation errors as 422
  if (err instanceof ZodError) {
    return res.status(422).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: err.flatten().fieldErrors,
      },
    });
  }

  logger.error("Unhandled error:", err);

  const isDev = process.env.NODE_ENV !== "production";
  return res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: isDev ? err.message : "An unexpected error occurred",
    },
  });
}
