import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { config } from "../config";

const productionTransports: winston.transport[] = [
  new DailyRotateFile({
    filename: "logs/%DATE%-combined.log",
    datePattern: "YYYY-MM-DD",
    maxSize: "50m",
    maxFiles: "30d",
    level: "info",
  }),
  new DailyRotateFile({
    filename: "logs/%DATE%-error.log",
    datePattern: "YYYY-MM-DD",
    maxSize: "50m",
    maxFiles: "30d",
    level: "error",
  }),
];

export const logger = winston.createLogger({
  level: config.env === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    config.env === "production"
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple())
  ),
  transports: [
    new winston.transports.Console(),
    ...(config.env === "production" ? productionTransports : []),
  ],
});
