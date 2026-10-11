import { BAR_DETAILS, CANDLES, INITIAL_STATE, QUESTION, QUESTIONS, TIMEFRAMES } from './introInteractions';

const dotCenter = (index, wide) => {
  const x = 12 + (index % 40) * 13 + 1.5;
  return { x: wide ? x : x * 0.5, y: 32 + Math.floor(index / 40) * 8 + 1.5 };
};
const HOT_DOT = 23 * 40 + 38;

// Where each scene's call to action lives, in the illustration's own units: a
// pulsing beacon on the data point that matters most, a leader line, and the
// edge of the labelled link it points to. It follows the visitor's choices.
export function getCtaSpec(scene, state = INITIAL_STATE[scene], wide = false) {
  switch (scene) {
    case 'portfolio': {
      const y = [202, 184, 174, 211][state.selected === null ? 0 : state.selected + 1];
      return { anchor: { x: 500, y }, pill: { edge: 512, y: 285 }, leader: 'vh' };
    }
    case 'stock-data': {
      const candles = TIMEFRAMES[state.timeframe] ?? CANDLES;
      const close = candles[candles.length - 1][3];
      const y = state.timeframe === null
        ? 230 - (close - 178) * 4.5
        : (() => {
          const low = Math.min(...candles.map(candle => candle[2]));
          const high = Math.max(...candles.map(candle => candle[1]));
          return 230 - (close - low) / (high - low) * 160;
        })();
      return { anchor: { x: 26 + (candles.length - 1) * 42, y }, pill: { edge: 512, y: 330 }, leader: 'vh' };
    }
    case 'ai-analysis': {
      const anchor = dotCenter(state.pinned && state.dot !== null ? state.dot : HOT_DOT, wide);
      return { anchor, pill: wide ? { edge: 868, y: 274 } : { edge: 512, y: 290 }, leader: 'vh' };
    }
    case 'advisor': {
      const question = QUESTIONS[state.question]?.question ?? QUESTION;
      return { anchor: { x: Math.min(498, 18 + question.length * 11.2), y: 224 }, pill: { edge: 512, y: 262 }, leader: 'vh' };
    }
    case 'profile':
      return { anchor: { x: 470, y: 36 }, pill: { edge: 446, y: 36 }, leader: 'h' };
    case 'insights': {
      const step = wide ? 130 : 78;
      const bar = state.bar ?? 3;
      const [, change] = BAR_DETAILS[bar];
      const value = Math.abs(parseFloat(change.replace('−', '-')));
      const anchor = bar >= 3
        ? { x: 48 + (bar - 3) * step, y: 240 - value * 14 }
        : { x: (wide ? 474 : 294) + bar * step, y: 240 + value * 14 };
      return { anchor, pill: wide ? { edge: 868, y: 160 } : { edge: 512, y: 160 }, leader: 'hv' };
    }
    default:
      return null;
  }
}
