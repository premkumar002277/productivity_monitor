import { registerDailyRollupJob } from "./dailyRollup";
import { registerRetentionCleanupJob } from "./retentionCleanup";

export function bootstrapJobs() {
  return [registerDailyRollupJob(), registerRetentionCleanupJob()];
}
