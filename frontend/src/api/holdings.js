const API_URL = import.meta.env.VITE_API_URL;

async function readJsonResponse(res) {
  const data = await res.json();
  if (!res.ok) {
    return { ...data, error: data.error || data.msg || `Request failed (${res.status})` };
  }
  return data;
}

export async function getHoldings(token, portfolioId) {
  const res = await fetch(`${API_URL}/api/holdings/${portfolioId}/holdings`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return readJsonResponse(res);
}

export async function addHolding(token, portfolioId, holdingData) {
  const res = await fetch(`${API_URL}/api/holdings/${portfolioId}/holdings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(holdingData)
  });
  return readJsonResponse(res);
}

export async function deleteHolding(token, portfolioId, holdingId) {
  const res = await fetch(`${API_URL}/api/holdings/${portfolioId}/holdings/${holdingId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return readJsonResponse(res);
}
