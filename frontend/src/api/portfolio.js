const API_URL = import.meta.env.VITE_API_URL;

async function readJsonResponse(res) {
  const data = await res.json();
  if (!res.ok) {
    return { ...data, error: data.error || data.msg || `Request failed (${res.status})` };
  }
  return data;
}

export async function getPortfolios(token) {
  const res = await fetch(`${API_URL}/api/portfolios/`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return readJsonResponse(res);
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
  return readJsonResponse(res);
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
  return readJsonResponse(res);
}

export async function deletePortfolio(token, id) {
  const res = await fetch(`${API_URL}/api/portfolios/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return readJsonResponse(res);
}
