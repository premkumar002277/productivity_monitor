import Queue from "bull";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { cleanupExpiredEvents } from "../services/reporter";

export function registerRetentionCleanupJob() {
  const queue = new Queue("retention-cleanup", env.REDIS_URL);

  queue.process(async () => {
    const result = await cleanupExpiredEvents();
    logger.info(
      `Retention cleanup removed ${result.deletedCount} raw records older than ${result.cutoff} ` +
        `(events=${result.eventCount}, emotions=${result.emotionSampleCount}, headPose=${result.headPoseSampleCount}, behavior=${result.behaviorSampleCount})`,
    );
  });

  queue.on("error", (error) => {
    logger.error(`Retention cleanup job error: ${error.message}`);
  });

  void queue.add(
    {},
    {
      jobId: "retention-cleanup",
      repeat: { cron: "20 0 * * *" },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );

  return queue;
}
