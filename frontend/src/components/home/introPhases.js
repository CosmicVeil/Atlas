export const TITLE_VH = 70;
export const HOLD_VH = 100;
export const TRANSITION_VH = 70;
export const RELEASE_VH = 50;
export const TOTAL_VH = TITLE_VH + 6 * HOLD_VH + 5 * TRANSITION_VH + RELEASE_VH;
export const INTRO_END = TITLE_VH / TOTAL_VH;
export const OUTRO_START = (TOTAL_VH - RELEASE_VH) / TOTAL_VH;
export const TRANSITION = TRANSITION_VH / TOTAL_VH;
export const BEAT = TRANSITION / 3;
export const TITLE_FOLD_END = INTRO_END - BEAT;

export const FEATURE_PHASES = [
  { key: 'portfolio', layout: 'A', title: 'Portfolio Management', description: 'Track multiple portfolios with real-time performance metrics and AI-driven insights.', cta: 'Open portfolios', route: '/portfolio' },
  { key: 'stock-data', layout: 'B', title: 'Stock Data Explorer', description: 'Access comprehensive market data, historical charts, and real-time analytics.', cta: 'Explore stock data', route: '/stock-data' },
  { key: 'ai-analysis', layout: 'C', title: 'AI Market Analysis', description: 'Daily analysis of top 1000 stocks with recommendations and risk assessment.', cta: "See today's analysis", route: '/ai-analysis' },
  { key: 'advisor', layout: 'A', title: 'Personal AI Advisor', description: 'Custom stock analysis and recommendations based on your portfolio and budget.', cta: 'Ask about a stock', route: '/ai-analysis' },
  { key: 'profile', layout: 'B', title: 'User Profile', description: 'Manage preferences, risk tolerance, and investment goals in one place.', cta: 'Open your profile', route: '/profile' },
  { key: 'insights', layout: 'C', title: 'Market Insights', description: 'Best and worst performing stocks with detailed AI-generated explanations.', cta: 'View market insights', route: '/market-news' },
];

const clamp = (value) => Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

export function getHoldRange(index) {
  if (!Number.isInteger(index) || index < 0 || index >= FEATURE_PHASES.length) {
    throw new RangeError('Feature phase index must be an integer from 0 to 5');
  }
  const start = (TITLE_VH + index * (HOLD_VH + TRANSITION_VH)) / TOTAL_VH;
  return [start, (TITLE_VH + index * (HOLD_VH + TRANSITION_VH) + HOLD_VH) / TOTAL_VH];
}

export function getTransitionBeats(index) {
  if (!Number.isInteger(index) || index < 0 || index >= 5) throw new RangeError('Transition index must be from 0 to 4');
  const end = getHoldRange(index)[1];
  const next = getHoldRange(index + 1)[0];
  return { retract: [end, end + BEAT], travel: [end + BEAT, next - BEAT], grow: [next - BEAT, next] };
}

const boundary = index => index === 0 ? INTRO_END : index === 6 ? OUTRO_START
  : (getTransitionBeats(index - 1).travel[0] + getTransitionBeats(index - 1).travel[1]) / 2;

export function getPhaseRange(index) {
  getHoldRange(index);
  return [boundary(index), boundary(index + 1)];
}

export function getActivePhase(progress) {
  const p = clamp(progress);
  if (p < INTRO_END) return -1;
  if (p >= OUTRO_START) return FEATURE_PHASES.length;
  return FEATURE_PHASES.findIndex((_, index) => p < boundary(index + 1));
}

export function getLocalProgress(progress, index) {
  const [start, end] = getPhaseRange(index);
  return clamp((clamp(progress) - start) / (end - start));
}

export function getFadeStops(index) {
  const [start, end] = getHoldRange(index);
  return { input: [start - BEAT, start, end, end + BEAT], output: [0, 1, 1, 0] };
}

export function getInteractivePhase(progress) {
  const p = clamp(progress);
  if (p < TITLE_FOLD_END) return -1;
  if (p >= OUTRO_START + BEAT) return FEATURE_PHASES.length;
  return FEATURE_PHASES.findIndex((_, index) => index === 5 || p < boundary(index + 1));
}

export function getCopyFadeStops(index) {
  return getFadeStops(index);
}

export function getIllustrationStops(index) {
  const [start, end] = getHoldRange(index);
  return { input: [start - BEAT, start, start + (end - start) * 0.8], output: [0, 0.35, 1] };
}

export function getLayoutTravel(progress) {
  const p = clamp(progress);
  for (let index = 0; index < 5; index++) {
    const { travel } = getTransitionBeats(index);
    if (p < travel[0]) return { from: index, to: index, amount: 0 };
    if (p < travel[1]) return { from: index, to: index + 1, amount: (p - travel[0]) / (travel[1] - travel[0]) };
  }
  return { from: 5, to: 5, amount: 0 };
}

export function getFrameVisible(index, progress) {
  const [start, end] = getHoldRange(index);
  const incoming = index === 0 ? start - BEAT : getTransitionBeats(index - 1).travel[0];
  return progress >= incoming && progress < end + BEAT;
}

export function getWrapperProgress(top, height, viewport) {
  const distance = height - viewport;
  return distance > 0 ? clamp(-top / distance) : 0;
}

export function getSceneScrollProgress(index) {
  const [start, end] = getHoldRange(index);
  return (start + end) / 2;
}

export function progressToScrollY(progress, wrapperTop, height, viewport) {
  return wrapperTop + clamp(progress) * Math.max(0, height - viewport);
}
