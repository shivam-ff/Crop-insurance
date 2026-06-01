import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { api } from "./api.js";

const AuthCtx = createContext(null);

const TOKEN_KEY = "crop_insurance_token";
const USER_KEY = "crop_insurance_user";
const DEMO_TOKEN = "demo-session";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const setSession = useCallback((t, u) => {
    setToken(t);
    setUser(u);
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  }, []);

  const logout = useCallback(() => {
    setToken("");
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  const signup = useCallback(async ({ email, password, fullName, walletAddress }) => {
    const res = await api("/auth/signup", { method: "POST", body: { email, password, fullName, walletAddress } });
    setSession(res.token, res.user);
    return res;
  }, [setSession]);

  const login = useCallback(async ({ email, password }) => {
    const res = await api("/auth/login", { method: "POST", body: { email, password } });
    setSession(res.token, res.user);
    return res;
  }, [setSession]);

  const demoLogin = useCallback(() => {
    const demoUser = {
      fullName: "Demo Farmer",
      email: "demo@farmer.app",
      walletAddress: "",
      isDemo: true
    };
    setSession(DEMO_TOKEN, demoUser);
    return { token: DEMO_TOKEN, user: demoUser };
  }, [setSession]);

  const value = useMemo(() => ({ token, user, signup, login, demoLogin, logout }), [token, user, signup, login, demoLogin, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}

