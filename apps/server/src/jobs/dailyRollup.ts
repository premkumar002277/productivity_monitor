import Queue from "bull";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { runDailyRollup } from "../services/reporter";

export function registerDailyRollupJob() {
  const queue = new Queue("daily-rollup", env.REDIS_URL);

  queue.process(async () => {
    const result = await runDailyRollup();
    logger.info(`Daily rollup complete for ${result.date}: ${result.sessionsProcessed} sessions`);
  });

  queue.on("error", (error) => {
    logger.error(`Daily rollup job error: ${error.message}`);
  });

  void queue.add(
    {},
    {
      jobId: "daily-rollup",
      repeat: { cron: "5 0 * * *" },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );

  return queue;
}
