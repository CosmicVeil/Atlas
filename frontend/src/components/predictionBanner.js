export const PREDICTION_POLL_INTERVAL_MS = 30000;
export const BANNER_MESSAGE = 'New prediction came in. Reload?';
export const INITIAL_BANNER_STATE = { since: null, latestSeen: null, visible: false, symbols: [] };

export function newestTimestamp(values) {
  return values.filter(value => typeof value === 'string' && Number.isFinite(Date.parse(value)))
    .reduce((latest, value) => !latest || Date.parse(value) > Date.parse(latest) ? value : latest, null);
}

export function baselineSince(stocks, latestUpdatedAt, fallbackIso) {
  return newestTimestamp([...stocks.map(stock => stock.predictionUpdatedAt), latestUpdatedAt]) || fallbackIso;
}

export function filterToTickers(symbols, tickers) {
  const selected = tickers === null ? null : new Set(tickers.map(ticker => ticker.toUpperCase()));
  return [...new Set(symbols.filter(symbol => typeof symbol === 'string').map(symbol => symbol.toUpperCase()))]
    .filter(symbol => selected === null || selected.has(symbol));
}

export function bannerTickers(symbols) {
  return symbols.length <= 3 ? symbols : [];
}

export function reduceBanner(state, action) {
  switch (action.type) {
    case 'baseline':
      return { ...INITIAL_BANNER_STATE, since: action.since };
    case 'poll': {
      const response = action.response;
      if (!response || response.error || !(response.count > 0) || !Array.isArray(response.symbols)
        || !newestTimestamp([response.latestUpdatedAt])
        || Date.parse(response.latestUpdatedAt) <= Date.parse(state.since)) return state;
      const symbols = filterToTickers(response.symbols, action.tickers ?? null);
      if (!symbols.length) return state;
      return { ...state, visible: true, symbols, latestSeen: response.latestUpdatedAt };
    }
    case 'dismiss':
    case 'reload':
      return { ...state, visible: false, symbols: [], since: state.latestSeen || state.since };
    default:
      return state;
  }
}
