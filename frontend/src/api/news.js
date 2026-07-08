const API_URL = import.meta.env.VITE_API_URL;

async function readJsonResponse(res) {
  const data = await res.json();
  if (!res.ok) {
    return { ...data, error: data.error || data.msg || `Request failed (${res.status})` };
  }
  return data;
}

export async function getMarketWarnings(token, limit = 50) {
  // Reads the MongoDB results produced by the warning streamer.
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_URL}/api/news/warnings?limit=${limit}`, {
    headers,
  });
  return readJsonResponse(res);
}
