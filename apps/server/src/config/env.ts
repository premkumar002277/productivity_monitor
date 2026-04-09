import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  CLIENT_ORIGIN: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES: z.string().default("7d"),
  DEFAULT_ALERT_SCORE_THRESHOLD: z.coerce.number().min(0).max(100).default(40),
  DEFAULT_ALERT_DURATION_MINUTES: z.coerce.number().int().min(1).default(15),
  RETENTION_DAYS: z.coerce.number().int().min(1).default(90),
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(16).default(12),
});

export const env = envSchema.parse(process.env);
