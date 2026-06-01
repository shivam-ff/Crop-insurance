import React from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./auth.jsx";
import { LanguageProvider } from "./i18n.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import SelectPolicy from "./pages/SelectPolicy.jsx";
import Dashboard from "./pages/Dashboard.jsx";

function Protected({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route
              path="/policies"
              element={
                <Protected>
                  <SelectPolicy />
                </Protected>
              }
            />
            <Route
              path="/app"
              element={
                <Protected>
                  <Dashboard />
                </Protected>
              }
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </HashRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
