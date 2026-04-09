import type { SessionMetrics } from "./scorer";
import { ensureRedisConnection, redis } from "../lib/redis";

export type LiveScorePayload = Pick<
  SessionMetrics,
  "score" | "status" | "faceSeconds" | "idleSeconds" | "activeSeconds" | "totalSeconds"
> & {
  userId: string;
  sessionId: string;
  name: string;
  email: string;
  department: string | null;
  isMonitoring: boolean;
  updatedAt: string;
};

export function liveScoreKey(userId: string) {
  return `score:${userId}`;
}

export async function writeLiveScore(payload: LiveScorePayload) {
  await ensureRedisConnection();
  await redis.set(liveScoreKey(payload.userId), JSON.stringify(payload));
}

export async function deleteLiveScore(userId: string) {
  await ensureRedisConnection();
  await redis.del(liveScoreKey(userId));
}

export async function readLiveScores(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, LiveScorePayload>();
  }

  await ensureRedisConnection();
  const records = await redis.mGet(userIds.map((userId) => liveScoreKey(userId)));
  const scoreMap = new Map<string, LiveScorePayload>();

  records.forEach((record, index) => {
    if (!record) {
      return;
    }

    const payload = JSON.parse(record) as LiveScorePayload;
    scoreMap.set(userIds[index], payload);
  });

  return scoreMap;
}
