import { useCallback, useEffect, useRef, useState } from "react";

import type { KeyboardBehaviorValue } from "../types/api";

const EMPTY_KEYBOARD_BEHAVIOR: KeyboardBehaviorValue = {
  kpm: 0,
  rhythmScore: 0,
  backspaceRate: 0,
  burstDetected: false,
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function useKeyboardBehavior(enabled: boolean) {
  const [summary, setSummary] = useState<KeyboardBehaviorValue>(EMPTY_KEYBOARD_BEHAVIOR);
  const keydownTimestampsRef = useRef<number[]>([]);
  const backspaceCountRef = useRef(0);

  const reset = useCallback(() => {
    keydownTimestampsRef.current = [];
    backspaceCountRef.current = 0;
  }, []);

  useEffect(() => {
    if (!enabled) {
      reset();
      setSummary(EMPTY_KEYBOARD_BEHAVIOR);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      keydownTimestampsRef.current.push(Date.now());

      if (event.key === "Backspace") {
        backspaceCountRef.current += 1;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, reset]);

  const flushSummary = useCallback(() => {
    const timestamps = [...keydownTimestampsRef.current];
    const totalKeyCount = timestamps.length;
    const intervals = timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]);
    const averageInterval = mean(intervals);
    const rhythmScore =
      intervals.length > 0 ? Number(clamp(1 - stdDev(intervals) / (averageInterval + 1), 0, 1).toFixed(3)) : 0;
    const nextSummary: KeyboardBehaviorValue = {
      kpm: Math.round((totalKeyCount / 5) * 60),
      rhythmScore,
      backspaceRate: totalKeyCount > 0 ? Number((backspaceCountRef.current / totalKeyCount).toFixed(3)) : 0,
      burstDetected: totalKeyCount >= 5 && intervals.some((interval) => interval > 2_000) && intervals.some((interval) => interval < 120),
    };

    keydownTimestampsRef.current = [];
    backspaceCountRef.current = 0;
    setSummary(nextSummary);
    return nextSummary;
  }, []);

  return {
    summary,
    flushSummary,
  };
}
