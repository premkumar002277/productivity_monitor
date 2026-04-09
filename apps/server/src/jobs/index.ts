import { registerDailyRollupJob } from "./dailyRollup";
import { registerDailyEmotionRollupJob } from "./dailyEmotionRollup";
import { registerRetentionCleanupJob } from "./retentionCleanup";

export function bootstrapJobs() {
  return [registerDailyRollupJob(), registerDailyEmotionRollupJob(), registerRetentionCleanupJob()];
}
