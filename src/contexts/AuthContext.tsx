/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AuthContext — manages user authentication state.
 *
 * Stores JWT in localStorage. On mount, validates the token via /api/auth/me.
 * Provides login/register/logout and an authFetch helper that auto-attaches
 * the Bearer token to API requests.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { pullFromServer } from '../services/syncService';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  planType: 'free' | 'plus' | 'pro';
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
  /** Fetch wrapper that auto-attaches the auth token. */
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  /** Update the local user state (e.g. after plan change). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>(null!);
export const useAuth = () => useContext(AuthContext);

const TOKEN_KEY = 'lumina:auth-token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  });
  const [isLoading, setIsLoading] = useState(true);

  const authFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) headers['Authorization'] = `Bearer ${t}`;
    return fetch(url, { ...options, headers });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await authFetch('/api/auth/me');
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        try {
          localStorage.setItem('lumina:plan', data.user.planType);
          localStorage.setItem('lumina:user-email', data.user.email);
        } catch { /* ignore */ }
      }
    } catch { /* silent */ }
  }, [authFetch]);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    authFetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setUser(data.user);
          try {
            localStorage.setItem('lumina:plan', data.user.planType);
            localStorage.setItem('lumina:user-email', data.user.email);
          } catch { /* ignore */ }
          pullFromServer().catch(() => {});
        } else {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        }
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, [token, authFetch]);

  // If no token, still finish loading
  useEffect(() => {
    if (!token) setIsLoading(false);
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem('lumina:plan', data.user.planType);
    localStorage.setItem('lumina:user-email', data.user.email);
    setToken(data.token);
    setUser(data.user);
    pullFromServer().catch(() => {});
  };

  const register = async (email: string, password: string, displayName: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem('lumina:plan', data.user.planType);
    localStorage.setItem('lumina:user-email', data.user.email);
    setToken(data.token);
    setUser(data.user);
    pullFromServer().catch(() => {});
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('lumina:plan');
    localStorage.removeItem('lumina:user-email');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, authFetch, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
