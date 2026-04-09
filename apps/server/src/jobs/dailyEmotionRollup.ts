import Queue from "bull";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { runDailyEmotionRollup } from "../services/reporter";

export function registerDailyEmotionRollupJob() {
  const queue = new Queue("daily-emotion-rollup", env.REDIS_URL);

  queue.process(async () => {
    const result = await runDailyEmotionRollup();
    logger.info(`Daily emotion rollup complete for ${result.date}: ${result.emotionSamplesProcessed} samples`);
  });

  queue.on("error", (error) => {
    logger.error(`Daily emotion rollup job error: ${error.message}`);
  });

  void queue.add(
    {},
    {
      jobId: "daily-emotion-rollup",
      repeat: { cron: "10 0 * * *" },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );

  return queue;
}
