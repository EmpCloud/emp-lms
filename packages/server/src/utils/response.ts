import { Response } from "express";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  perPage: number
) {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      page,
      limit: perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    },
  });
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, string[]>
) {
  return res.status(statusCode).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  });
}
