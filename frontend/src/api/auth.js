const API_URL = import.meta.env.VITE_API_URL;

async function postJson(path, payload) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Network error / backend unreachable
    return { error: 'Unable to reach the server. Please try again.' };
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    // Response had no / invalid JSON body; keep data as {}
  }

  if (!res.ok) {
    return { ...data, error: data.error || data.msg || `Request failed (${res.status})` };
  }
  return data;
}

export async function signup(email, password) {
  return postJson('/api/auth/signup', { email, password });
}

export async function login(email, password) {
  return postJson('/api/auth/login', { email, password });
}
