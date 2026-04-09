import type { HeadPoseSampleValue } from "../types/api";

type Point = {
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function midpoint(left: Point, right: Point) {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}

export function estimateHeadPose(
  landmarks: Point[],
  dimensions: {
    width: number;
    height: number;
  },
): HeadPoseSampleValue {
  const noseTip = landmarks[30];
  const leftEye = landmarks[36];
  const rightEye = landmarks[45];

  if (!noseTip || !leftEye || !rightEye) {
    return {
      yaw: 0,
      pitch: 0,
      roll: 0,
      lookingAway: false,
    };
  }

  const eyeCenter = midpoint(leftEye, rightEye);
  const faceWidth = Math.max(1, dimensions.width);
  const faceHeight = Math.max(1, dimensions.height);
  const yaw = (noseTip.x - eyeCenter.x) / faceWidth;
  const pitch = (noseTip.y - eyeCenter.y) / faceHeight;
  const roll = (rightEye.y - leftEye.y) / Math.max(1, rightEye.x - leftEye.x);

  return {
    yaw: Number(clamp(yaw, -1, 1).toFixed(3)),
    pitch: Number(clamp(pitch, -1, 1).toFixed(3)),
    roll: Number(clamp(roll, -1, 1).toFixed(3)),
    lookingAway: Math.abs(yaw) > 0.25 || pitch < 0.08 || pitch > 0.4,
  };
}
