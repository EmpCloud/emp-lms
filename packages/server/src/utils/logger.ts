import winston from "winston";
import { config } from "../config";

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
    ...(config.env === "production"
      ? [
          new winston.transports.File({ filename: "logs/error.log", level: "error" }),
          new winston.transports.File({ filename: "logs/combined.log" }),
        ]
      : []),
  ],
});
