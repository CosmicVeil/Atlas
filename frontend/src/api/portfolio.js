const API_URL = import.meta.env.VITE_API_URL;

export async function getPortfolios(token) {
  const res = await fetch(`${API_URL}/api/portfolios/`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

export async function createPortfolio(token, name) {
  const res = await fetch(`${API_URL}/api/portfolios/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ name })
  });
  return res.json();
}

export async function updatePortfolio(token, id, name) {
  const res = await fetch(`${API_URL}/api/portfolios/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ name })
  });
  return res.json();
}

export async function deletePortfolio(token, id) {
  const res = await fetch(`${API_URL}/api/portfolios/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}
