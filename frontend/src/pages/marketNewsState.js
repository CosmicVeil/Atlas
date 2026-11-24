// Pure view-state logic for the Market News page, kept out of the JSX so it
// can be unit-tested with node --test.

// Turn an /api/news/warnings response into page state. `available: false`
// means the backend could not reach the warning store (MongoDB / news
// pipeline offline), which is different from a genuinely empty feed.
export function parseWarningsResponse(data) {
  if (!data || data.error) {
    return { error: data?.error || 'Unable to load market warnings.' };
  }
  return {
    negative: Array.isArray(data.negative) ? data.negative : [],
    positive: Array.isArray(data.positive) ? data.positive : [],
    // Older backends did not send the flag; treat missing as available.
    available: data.available !== false,
  };
}

// Pick which page-level state to show:
// loading     first request has not finished yet
// error       request failed and there is nothing earlier to show
// unavailable backend answered but the warning store is offline
// empty       store is up but has no accepted warnings yet
// ready       there is at least one warning to show
// A failed refresh keeps showing earlier cards ('ready'); the page shows the
// error text above them instead of wiping them out.
export function marketNewsStatus({ loaded, error, available, negative, positive }) {
  if (!loaded) return 'loading';
  const hasWarnings = negative.length > 0 || positive.length > 0;
  if (hasWarnings) return 'ready';
  if (error) return 'error';
  if (!available) return 'unavailable';
  return 'empty';
}
