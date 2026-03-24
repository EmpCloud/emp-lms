import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.query);
      // In Express 5, req.query is read-only. Merge parsed values onto the existing object.
      Object.keys(parsed).forEach((key) => {
        (req.query as Record<string, any>)[key] = parsed[key];
      });
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function validateParams(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.params);
      Object.keys(parsed).forEach((key) => {
        (req.params as Record<string, any>)[key] = parsed[key];
      });
      next();
    } catch (err) {
      next(err);
    }
  };
}
