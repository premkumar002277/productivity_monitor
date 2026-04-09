type LookingAwaySample = {
  timestamp: Date;
  lookingAway: boolean;
};

const HEAD_POSE_SAMPLE_INTERVAL_SECONDS = 2;

function countTrailingSamples(samples: LookingAwaySample[], expectedValue: boolean) {
  let count = 0;

  for (let index = samples.length - 1; index >= 0; index -= 1) {
    if (samples[index].lookingAway !== expectedValue) {
      break;
    }

    count += 1;
  }

  return count;
}

export function summarizeLookingAway(samples: LookingAwaySample[]) {
  if (samples.length === 0) {
    return {
      headAwayRatio: 0,
      lookingAwaySeconds: 0,
      lookingAtSeconds: 0,
    };
  }

  const sorted = [...samples].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  const awayCount = sorted.filter((sample) => sample.lookingAway).length;
  const trailingAwaySamples = countTrailingSamples(sorted, true);
  const trailingAtScreenSamples = countTrailingSamples(sorted, false);

  return {
    headAwayRatio: awayCount / sorted.length,
    lookingAwaySeconds: trailingAwaySamples * HEAD_POSE_SAMPLE_INTERVAL_SECONDS,
    lookingAtSeconds: trailingAtScreenSamples * HEAD_POSE_SAMPLE_INTERVAL_SECONDS,
  };
}
