import { useCallback, useEffect, useRef, useState } from "react";

import type { MouseBehaviorValue } from "../types/api";

const EMPTY_MOUSE_BEHAVIOR: MouseBehaviorValue = {
  avgVelocityPx: 0,
  clicksPerMin: 0,
  erraticScore: 0,
  idleSeconds: 0,
};

function mean(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function stdDev(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const average = mean(values);
  const variance = values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function useMouseBehavior(enabled: boolean) {
  const [summary, setSummary] = useState<MouseBehaviorValue>(EMPTY_MOUSE_BEHAVIOR);
  const lastPositionRef = useRef<{ x: number; y: number } | null>(null);
  const currentDistanceRef = useRef(0);
  const sampledDistancesRef = useRef<number[]>([]);
  const clickTimestampsRef = useRef<number[]>([]);
  const lastMoveAtRef = useRef(Date.now());

  const reset = useCallback(() => {
    lastPositionRef.current = null;
    currentDistanceRef.current = 0;
    sampledDistancesRef.current = [];
    clickTimestampsRef.current = [];
    lastMoveAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!enabled) {
      reset();
      setSummary(EMPTY_MOUSE_BEHAVIOR);
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const lastPosition = lastPositionRef.current;

      if (lastPosition) {
        const deltaX = event.clientX - lastPosition.x;
        const deltaY = event.clientY - lastPosition.y;
        currentDistanceRef.current += Math.sqrt(deltaX ** 2 + deltaY ** 2);
      }

      lastPositionRef.current = { x: event.clientX, y: event.clientY };
      lastMoveAtRef.current = Date.now();
    };

    const handleMouseDown = () => {
      clickTimestampsRef.current.push(Date.now());
    };

    const sampleInterval = window.setInterval(() => {
      sampledDistancesRef.current.push(currentDistanceRef.current);
      currentDistanceRef.current = 0;
    }, 500);

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mousedown", handleMouseDown);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.clearInterval(sampleInterval);
    };
  }, [enabled, reset]);

  const flushSummary = useCallback(() => {
    const now = Date.now();
    const idleSeconds = Math.max(0, Math.floor((now - lastMoveAtRef.current) / 1000));
    clickTimestampsRef.current = clickTimestampsRef.current.filter((timestamp) => now - timestamp <= 60_000);
    const distances = [...sampledDistancesRef.current, currentDistanceRef.current];
    const avgVelocityPx = Math.round(mean(distances));
    const erraticScore = Number((stdDev(distances) / (avgVelocityPx + 1)).toFixed(3));

    const nextSummary: MouseBehaviorValue = {
      avgVelocityPx,
      clicksPerMin: clickTimestampsRef.current.length,
      erraticScore,
      idleSeconds: idleSeconds > 10 ? idleSeconds : 0,
    };

    sampledDistancesRef.current = [];
    currentDistanceRef.current = 0;
    setSummary(nextSummary);
    return nextSummary;
  }, []);

  return {
    summary,
    flushSummary,
  };
}
