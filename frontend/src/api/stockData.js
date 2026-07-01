const API_URL = import.meta.env.VITE_API_URL;

export async function getStockDetail(symbol, token) {
  const res = await fetch(`${API_URL}/api/stocks/${symbol.toUpperCase()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

export async function getAllStocks(token) {
  const res = await fetch(`${API_URL}/api/stocks`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}
