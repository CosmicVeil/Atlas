export const INTRO_END = 0.1;
export const OUTRO_START = 0.9;
export const CROSSFADE = 0.025;

export const FEATURE_PHASES = [
  { key: 'portfolio', title: 'Portfolio Management' },
  { key: 'stock-data', title: 'Stock Data Explorer' },
  { key: 'ai-analysis', title: 'AI Market Analysis' },
  { key: 'advisor', title: 'Personal AI Advisor' },
  { key: 'profile', title: 'User Profile' },
  { key: 'insights', title: 'Market Insights' },
];

const clamp = (value) => Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));
const boundary = (index) => index === FEATURE_PHASES.length
  ? OUTRO_START
  : INTRO_END + (OUTRO_START - INTRO_END) * index / FEATURE_PHASES.length;

export function getPhaseRange(index) {
  if (!Number.isInteger(index) || index < 0 || index >= FEATURE_PHASES.length) {
    throw new RangeError('Feature phase index must be an integer from 0 to 5');
  }
  return [boundary(index), boundary(index + 1)];
}

export function getActivePhase(progress) {
  const p = clamp(progress);
  if (p < INTRO_END) return -1;
  if (p >= OUTRO_START) return FEATURE_PHASES.length;
  // Compare the same boundaries used for animation, avoiding rounding at handoffs.
  return FEATURE_PHASES.findIndex((_, index) => p < boundary(index + 1));
}

export function getLocalProgress(progress, index) {
  const [start, end] = getPhaseRange(index);
  return clamp((clamp(progress) - start) / (end - start));
}

export function getFadeStops(index) {
  const [start, end] = getPhaseRange(index);
  return {
    input: [start - CROSSFADE, start + CROSSFADE, end - CROSSFADE, end + CROSSFADE],
    output: [0, 1, 1, 0],
  };
}
