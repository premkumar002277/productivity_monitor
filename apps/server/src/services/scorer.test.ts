import { EventType } from "@prisma/client";

import { computeSessionMetrics } from "./scorer";

describe("computeSessionMetrics", () => {
  it("calculates a blended productivity score from face, focus, and idle signals", () => {
    const startedAt = new Date("2026-04-09T09:00:00.000Z");
    const endedAt = new Date("2026-04-09T09:10:00.000Z");

    const metrics = computeSessionMetrics(
      {
        startedAt,
        endedAt,
      },
      [
        { type: EventType.FACE_DETECTED, timestamp: new Date("2026-04-09T09:00:00.000Z") },
        { type: EventType.TAB_BLUR, timestamp: new Date("2026-04-09T09:03:00.000Z") },
        { type: EventType.TAB_FOCUS, timestamp: new Date("2026-04-09T09:05:00.000Z") },
        { type: EventType.IDLE_START, timestamp: new Date("2026-04-09T09:07:00.000Z") },
        { type: EventType.IDLE_END, timestamp: new Date("2026-04-09T09:09:00.000Z") },
        { type: EventType.FACE_LOST, timestamp: new Date("2026-04-09T09:10:00.000Z") },
      ],
    );

    expect(metrics.faceSeconds).toBe(600);
    expect(metrics.activeSeconds).toBe(480);
    expect(metrics.idleSeconds).toBe(120);
    expect(metrics.score).toBe(90);
    expect(metrics.status).toBe("active");
  });
});
