import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext();
const API_URL = import.meta.env.VITE_API_URL;

// Returns the token's expiry time in ms, or null if it can't be read
function getTokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isTokenValid(token) {
  if (!token) return false;
  const expiry = getTokenExpiry(token);
  return expiry !== null && expiry > Date.now();
}

export function AuthProvider({ children }) {
  // Read persisted values from localStorage so the user stays logged in after reload,
  // but drop the token straight away if it has already expired
  const [token, setToken] = useState(() => {
    const saved = localStorage.getItem('token');
    if (isTokenValid(saved)) return saved;
    localStorage.removeItem('token');
    localStorage.removeItem('email');
    return null;
  });
  const [email, setEmail] = useState(() => (token ? localStorage.getItem('email') : null));

  function login(newToken, newEmail) {
    setToken(newToken);
    setEmail(newEmail);
    localStorage.setItem('token', newToken);
    localStorage.setItem('email', newEmail);
  }

  function logout() {
    setToken(null);
    setEmail(null);
    localStorage.removeItem('token');
    localStorage.removeItem('email');
  }

  // Log out automatically the moment the token expires
  useEffect(() => {
    if (!token) return;
    const expiry = getTokenExpiry(token);
    if (expiry === null) return;
    const timer = setTimeout(logout, Math.max(0, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [token]);

  // Log out if the backend rejects the token (expired, bad signature, deleted user, ...).
  // Flask-JWT-Extended answers 401, or 422 with a `msg` field, for token problems.
  useEffect(() => {
    if (!token) return;
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (url.startsWith(API_URL) && !url.includes('/api/auth/')) {
        if (res.status === 401) {
          logout();
        } else if (res.status === 422) {
          const body = await res.clone().json().catch(() => null);
          if (body?.msg) logout();
        }
      }
      return res;
    };
    return () => { window.fetch = originalFetch; };
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, email, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
