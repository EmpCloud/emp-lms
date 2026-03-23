import { Router, Request, Response } from "express";
import { config } from "../../config";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  const uptime = process.uptime();
  const d = Math.floor(uptime / 86400);
  const h = Math.floor((uptime % 86400) / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);

  res.json({
    status: "ok",
    uptime: parts.join(" "),
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    environment: config.env,
  });
});

router.get("/detailed", async (_req: Request, res: Response) => {
  const start = Date.now();
  const checks: Record<string, any> = {};

  // Memory
  const mem = process.memoryUsage();
  checks.memory = {
    rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
  };

  // Uptime
  const uptime = process.uptime();
  const d = Math.floor(uptime / 86400);
  const h = Math.floor((uptime % 86400) / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);

  checks.uptime = {
    process: `${Math.round(uptime)}s`,
    formatted: parts.join(" "),
  };

  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    responseTime: `${Date.now() - start}ms`,
    version: "0.1.0",
    environment: config.env,
    checks,
  });
});

export { router as healthRoutes };
