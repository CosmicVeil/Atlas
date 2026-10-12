import { useCallback, useEffect, useReducer, useRef } from 'react';
import { getLatestPredictions } from '../api/ai';
import { baselineSince, INITIAL_BANNER_STATE, PREDICTION_POLL_INTERVAL_MS, reduceBanner } from './predictionBanner.js';

export default function usePredictionBanner({ token, enabled, tickers = null }) {
  const [state, dispatch] = useReducer(reduceBanner, INITIAL_BANNER_STATE);
  const current = useRef({ state, tickers });
  const session = useRef(null);
  useEffect(() => { current.current = { state, tickers }; }, [state, tickers]);
  useEffect(() => {
    const active = { token };
    session.current = active;
    return () => { session.current = null; };
  }, [token]);

  useEffect(() => {
    if (!token || !enabled) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      const since = current.current.state.since;
      if (document.visibilityState !== 'visible' || !since) return;
      try {
        const response = await getLatestPredictions(token, since);
        if (!cancelled) dispatch({ type: 'poll', response, tickers: current.current.tickers });
      } catch { /* Poll failures leave the current analysis in place. */ }
    }, PREDICTION_POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token, enabled]);

  const captureBaseline = useCallback(async () => {
    const active = session.current;
    const fallback = new Date().toISOString();
    let latest = null;
    try { latest = (await getLatestPredictions(token))?.latestUpdatedAt; }
    catch { /* Loaded prediction timestamps still provide a baseline offline. */ }
    return { active, latest, fallback };
  }, [token]);

  const setBaseline = useCallback(async (stocks, captured) => {
    const { active, latest, fallback } = captured ?? await captureBaseline();
    if (active && session.current === active) {
      dispatch({ type: 'baseline', since: baselineSince(stocks, latest, fallback) });
    }
  }, [captureBaseline]);

  return {
    visible: !!token && enabled && state.visible,
    symbols: state.symbols,
    captureBaseline,
    setBaseline,
    dismiss: () => dispatch({ type: 'dismiss' }),
    startReload: () => dispatch({ type: 'reload' }),
  };
}
