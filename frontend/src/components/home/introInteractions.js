export const INITIAL_STATE = {
  portfolio: { selected: null, hovered: null },
  'stock-data': { timeframe: null, crosshair: null },
  'ai-analysis': { note: null, dot: null, pinned: false },
  advisor: { question: null },
  profile: { goals: {}, risk: null, currency: null },
  insights: { bar: null },
};

export const QUESTIONS = [
  { question: 'How concentrated is this portfolio?', summary: 'Technology represents 42% of this sample portfolio.', factors: ['Pro · Exposure across 12 companies', 'Pro · Three sectors represented', 'Con · Technology is the largest sector', 'Con · Top holding accounts for 18%'] },
  { question: 'What changed in MSFT revenue?', summary: 'MSFT sample revenue grew 12% year over year.', factors: ['Pro · Cloud revenue increased', 'Pro · Recurring revenue expanded', 'Con · Costs increased by 9%', 'Con · Currency reduced reported growth'] },
  { question: 'How volatile was NVDA this month?', summary: 'NVDA moved 8% across this sample month.', factors: ['Pro · Volume rose over the period', 'Pro · Month ended above its opening price', 'Con · Daily price swings reached 4%', 'Con · Returns varied from the index'] },
];

export const TIMEFRAMES = Object.fromEntries(['1D', '1M', '1Y'].map((label, series) => [label,
  Array.from({ length: 12 }, (_, i) => {
    const open = 181 + series * 5 + i * (series + 1);
    const close = open + (i % 3 === 0 ? -3 : 4);
    return [open, Math.max(open, close) + 3, Math.min(open, close) - 2, close, 22 + (i * 13 + series * 7) % 48];
  }),
]));
export const RISK_NOTES = ['AAPL · Lower sample price variability.', 'MSFT · Broad recurring revenue base.', 'NVDA · Larger sample daily price swings.', 'AMZN · Earnings varied by segment.', 'GOOGL · Advertising is the largest revenue source.'];
export const BAR_DETAILS = [
  ['XOM', '−2.6%', 'XOM fell 2.6% in this sample session as energy shares declined.'],
  ['CVX', '−1.8%', 'CVX fell 1.8% in this sample session alongside the energy group.'],
  ['PFE', '−1.2%', 'PFE fell 1.2% in this sample session, trailing the group.'],
  ['NVDA', '+4.8%', 'NVDA rose 4.8% in this sample session, leading the group.'],
  ['MSFT', '+3.1%', 'MSFT rose 3.1% in this sample session with technology shares.'],
  ['AAPL', '+2.4%', 'AAPL rose 2.4% in this sample session, finishing above its opening price.'],
];
const clamp = (value, max = 1) => Math.min(max, Math.max(0, value));
const validIndex = (index, length) => Number.isInteger(index) && index >= 0 && index < length;

export function reduceInteraction(scene, state, action) {
  switch (scene) {
    case 'portfolio':
      if (action.type === 'select' && validIndex(action.index, 3)) return { ...state, selected: action.index };
      if (action.type === 'hover' && (action.index === null || validIndex(action.index, 3))) return { ...state, hovered: action.index };
      break;
    case 'stock-data':
      if (action.type === 'timeframe' && Object.hasOwn(TIMEFRAMES, action.value)) return { ...state, timeframe: action.value };
      if (action.type === 'crosshair' && Number.isFinite(action.value)) return { ...state, crosshair: clamp(action.value) };
      break;
    case 'ai-analysis':
      if (action.type === 'note' && validIndex(action.index, 5)) return { ...state, note: state.note === action.index ? null : action.index };
      if (action.type === 'pin' && validIndex(action.index, 1000)) return { ...state, dot: action.index, pinned: !state.pinned || state.dot !== action.index };
      if (action.type === 'dot' && !state.pinned && (action.index === null || validIndex(action.index, 1000))) return { ...state, dot: action.index };
      break;
    case 'advisor':
      if (action.type === 'question' && validIndex(action.index, 3)) return { ...state, question: action.index };
      break;
    case 'profile':
      if (action.type === 'goal' && validIndex(action.index, 3)) return { ...state, goals: { ...state.goals, [action.index]: !(state.goals[action.index] ?? action.current) } };
      if (action.type === 'risk' && Number.isFinite(action.value)) return { ...state, risk: Math.round(clamp(action.value, 100)) };
      if (action.type === 'currency' && ['USD', 'EUR', 'GBP'].includes(action.value)) return { ...state, currency: action.value };
      break;
    case 'insights':
      if (action.type === 'bar' && validIndex(action.index, 6)) return { ...state, bar: action.index };
      break;
  }
  return state;
}

export function sliderKey(value, key) {
  if (key === 'Home') return 0;
  if (key === 'End') return 100;
  return clamp(value + (['ArrowRight', 'ArrowUp'].includes(key) ? 10 : ['ArrowLeft', 'ArrowDown'].includes(key) ? -10 : 0), 100);
}

export function getTilt(nx, ny) {
  return { rotateX: (0.5 - clamp(ny)) * 8, rotateY: (clamp(nx) - 0.5) * 8 };
}

export function dotAt(x, y) {
  const index = Math.min(24, Math.floor(clamp(y) * 25)) * 40 + Math.min(39, Math.floor(clamp(x) * 40));
  return { index, ticker: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL'][index % 5] };
}

export function formatCurrency(currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(128450 * ({ USD: 1, EUR: 0.92, GBP: 0.78 }[currency]));
}
