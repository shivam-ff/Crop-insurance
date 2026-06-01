import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button, Card, LanguageToggle, Pill } from "../ui.jsx";
import { useAuth } from "../auth.jsx";
import { useI18n } from "../i18n.jsx";
import hero from "../assets/farmer_field.svg";

export default function Login() {
  const nav = useNavigate();
  const { login, demoLogin } = useAuth();
  const { t } = useI18n();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login({ email, password });
      nav("/policies");
    } catch (e2) {
      setErr(e2.message || String(e2));
    } finally {
      setBusy(false);
    }
  }

  function onDemoLogin() {
    setErr("");
    demoLogin();
    nav("/policies");
  }

  return (
    <div className="container">
      <div className="topbar">
        <div className="title">
          <div className="logo" />
          <div>
            <h1>{t("appName")}</h1>
            <p>{t("loginSubtitle")}</p>
          </div>
        </div>
        <LanguageToggle />
      </div>

      <div className="hero">
        <div className="card">
          <div className="cardInner">
            <h2 className="heroTitle">{t("loginTitle")}</h2>
            <p className="heroText">{t("tagline")}</p>
            <div className="row" style={{ marginTop: 10 }}>
              <Pill tone="good">Rainfall-based automatic payout</Pill>
              <Pill tone="brand">Transparent & fast</Pill>
            </div>
          </div>
        </div>
        <div className="heroArt">
          <img src={hero} alt="Farmer and fields" style={{ width: "100%", display: "block", borderRadius: 14 }} />
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr", maxWidth: 560, margin: "0 auto" }}>
        <Card title={t("loginTitle")} hint="Email-password se login karein, ya demo account se seedha app dekhein.">
          <form onSubmit={onSubmit} className="fieldGrid" style={{ gridTemplateColumns: "1fr" }}>
            <div className="field">
              <div className="label">{t("email")}</div>
              <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="field">
              <div className="label">{t("password")}</div>
              <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
            </div>
            {err ? (
              <div className="pill bad" style={{ borderRadius: 12 }}>
                {err}
              </div>
            ) : null}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <Button tone="primary" disabled={busy}>
                {busy ? "Logging in…" : t("login")}
              </Button>
              <Button type="button" onClick={onDemoLogin} disabled={busy}>
                Continue as demo
              </Button>
              <Link to="/signup" className="muted" style={{ fontSize: 12 }}>
                {t("newUser")} Create account →
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

