const API_URL = import.meta.env.VITE_API_URL;

export async function getProfile(token) {
  const res = await fetch(`${API_URL}/api/profile`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

export async function updateProfile(token, values) {
  const res = await fetch(`${API_URL}/api/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(values)
  });
  return res.json();
}
