import { createClient } from "redis";

import { env } from "../config/env";
import { logger } from "../config/logger";

export const redis = createClient({
  url: env.REDIS_URL,
});

redis.on("error", (error) => {
  logger.error(`Redis client error: ${error.message}`);
});

let connectPromise: Promise<void> | null = null;

export async function ensureRedisConnection() {
  if (redis.isOpen) {
    return;
  }

  if (!connectPromise) {
    connectPromise = redis.connect().finally(() => {
      connectPromise = null;
    });
  }

  await connectPromise;
}
