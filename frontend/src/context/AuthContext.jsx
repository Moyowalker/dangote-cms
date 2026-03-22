import React, { createContext, useContext, useState, useEffect } from 'react';
import client, { AUTH_UNAUTHORIZED_EVENT, clearSessionState, ensureCsrfToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapAuth() {
      try {
        await ensureCsrfToken();
        const res = await client.get('/auth/me');
        if (!cancelled) {
          setUser(res.data?.user || null);
        }
      } catch (err) {
        if (!cancelled && err.response?.status !== 401) {
          console.error('Auth bootstrap failed:', err);
        }
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    function handleUnauthorized() {
      setUser(null);
      setLoading(false);
    }

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    bootstrapAuth();

    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, []);

  async function login(username, password) {
    const res = await client.post('/auth/login', { username, password });
    const newUser = res.data?.user || null;
    setUser(newUser);
    await ensureCsrfToken();
    return newUser;
  }

  async function logout() {
    try {
      await client.post('/auth/logout');
    } catch (e) {
      // ignore
    }
    clearSessionState();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
