export const TOTAL_VH = 760;
export const INTRO_END = 60 / TOTAL_VH;
export const OUTRO_START = 720 / TOTAL_VH;
export const CROSSFADE = 0.15 * 110 / TOTAL_VH;
export const TITLE_FOLD_END = INTRO_END - CROSSFADE;

export const FEATURE_PHASES = [
  { key: 'portfolio', title: 'Portfolio Management', description: 'Track multiple portfolios with real-time performance metrics and AI-driven insights.', cta: 'Open portfolios', route: '/portfolio' },
  { key: 'stock-data', title: 'Stock Data Explorer', description: 'Access comprehensive market data, historical charts, and real-time analytics.', cta: 'Explore stock data', route: '/stock-data' },
  { key: 'ai-analysis', title: 'AI Market Analysis', description: 'Daily analysis of top 1000 stocks with recommendations and risk assessment.', cta: "See today's analysis", route: '/ai-analysis' },
  { key: 'advisor', title: 'Personal AI Advisor', description: 'Custom stock analysis and recommendations based on your portfolio and budget.', cta: 'Ask about a stock', route: '/ai-analysis' },
  { key: 'profile', title: 'User Profile', description: 'Manage preferences, risk tolerance, and investment goals in one place.', cta: 'Open your profile', route: '/profile' },
  { key: 'insights', title: 'Market Insights', description: 'Best and worst performing stocks with detailed AI-generated explanations.', cta: 'View market insights', route: '/market-news' },
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
    input: [start - CROSSFADE, start, end - CROSSFADE, end],
    output: [0, 1, 1, 0],
  };
}

// Copy and interaction change owners halfway through the illustration overlap.
// Use the same boundary calculation in both directions, including exact ties.
export function getInteractivePhase(progress) {
  const p = clamp(progress);
  if (p < INTRO_END - CROSSFADE / 2) return -1;
  if (p >= OUTRO_START - CROSSFADE / 2) return FEATURE_PHASES.length;
  return FEATURE_PHASES.findIndex((_, index) => p < boundary(index + 1) - CROSSFADE / 2);
}

export function getCopyFadeStops(index) {
  const [start, end] = getPhaseRange(index);
  // Settle copy while its shell is still arriving (75% opacity), and keep it
  // settled until the departing shell drops below 75%. The midpoint remains
  // the ownership boundary, so adjacent copy and CTAs never double-print.
  return {
    input: [start - CROSSFADE / 2, start - CROSSFADE / 4, end - CROSSFADE * 0.75, end - CROSSFADE / 2],
    output: [0, 1, 1, 0],
  };
}

export function getIllustrationStops(index) {
  const [start, end] = getPhaseRange(index);
  return {
    input: [start - CROSSFADE, start, end - CROSSFADE],
    output: [0, 0.35, 1],
  };
}

export function getWrapperProgress(top, height, viewport) {
  const distance = height - viewport;
  return distance > 0 ? clamp(-top / distance) : 0;
}

export function getSceneScrollProgress(index) {
  const { input } = getFadeStops(index);
  return (input[1] + input[2]) / 2;
}

export function progressToScrollY(progress, wrapperTop, height, viewport) {
  return wrapperTop + clamp(progress) * Math.max(0, height - viewport);
}
