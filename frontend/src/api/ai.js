const API_URL = import.meta.env.VITE_API_URL;

export async function analyzeStock(token, symbol, portfolioId = null) {
  const body = { symbol };
  if (portfolioId) {
    body.portfolio_id = parseInt(portfolioId);
  }
  const res = await fetch(`${API_URL}/api/ai/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

export async function getPortfolioRecommendations(token, portfolioId) {
  const res = await fetch(`${API_URL}/api/ai/portfolio-recommend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ portfolio_id: parseInt(portfolioId) })
  });
  return res.json();
}

export async function getBudgetSuggestions(token, budget, portfolioId = null) {
  const body = { budget: parseFloat(budget) };
  if (portfolioId) {
    body.portfolio_id = parseInt(portfolioId);
  }
  const res = await fetch(`${API_URL}/api/ai/budget-suggest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  return res.json();
}

export async function getTop500Analysis(token) {
  const res = await fetch(`${API_URL}/api/ai/top-500`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

export async function refreshTop500(token) {
  const res = await fetch(`${API_URL}/api/ai/top-500/refresh`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

export async function startBatchAnalysis(token) {
  const res = await fetch(`${API_URL}/api/ai/analyze-all/start`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

export async function stopBatchAnalysis(token) {
  const res = await fetch(`${API_URL}/api/ai/analyze-all/stop`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

export async function getBatchAnalysisStatus(token) {
  const res = await fetch(`${API_URL}/api/ai/analyze-all/status`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

export async function getStocksAnalysis(token, { search = '', sort_by = 'symbol', order = 'asc', page = 1, per_page = 25 } = {}) {
  const params = new URLSearchParams({
    search,
    sort_by,
    order,
    page: page.toString(),
    per_page: per_page.toString()
  });
  const res = await fetch(`${API_URL}/api/stocks/?${params.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}
