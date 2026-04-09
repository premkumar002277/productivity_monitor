import { createLogger, format, transports } from "winston";

import { env } from "./env";

export const logger = createLogger({
  level: env.NODE_ENV === "development" ? "debug" : "info",
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.printf(({ level, message, timestamp, stack }) =>
      stack
        ? `${timestamp} [${level}] ${message}\n${stack}`
        : `${timestamp} [${level}] ${message}`,
    ),
  ),
  transports: [new transports.Console()],
});
