import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ethers } from "ethers";
import { Button, Card, LanguageToggle, Pill } from "../ui.jsx";
import { useAuth } from "../auth.jsx";
import { useI18n } from "../i18n.jsx";
import hero from "../assets/farmer_field.svg";

export default function Signup() {
  const nav = useNavigate();
  const { signup } = useAuth();
  const { t } = useI18n();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    async function tryWallet() {
      try {
        if (!window.ethereum) return;
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_accounts", []);
        if (accounts?.[0]) setWalletAddress(accounts[0]);
      } catch {
        // ignore
      }
    }
    tryWallet();
  }, []);

  async function connectWallet() {
    setErr("");
    try {
      if (!window.ethereum) throw new Error("MetaMask not installed");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setWalletAddress(accounts?.[0] || "");
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await signup({ fullName, email, password, walletAddress });
      nav("/policies");
    } catch (e2) {
      setErr(e2.message || String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="topbar">
        <div className="title">
          <div className="logo" />
          <div>
            <h1>{t("appName")}</h1>
            <p>{t("signupSubtitle")}</p>
          </div>
        </div>
        <LanguageToggle />
      </div>

      <div className="hero">
        <div className="card">
          <div className="cardInner">
            <h2 className="heroTitle">{t("signupTitle")}</h2>
            <p className="heroText">
              Is app me aapki policy aur payout blockchain par safe rehta hai. Wallet connect karna sirf verification ke liye hai.
            </p>
            <div className="row" style={{ marginTop: 10 }}>
              <Pill tone="good">Easy steps</Pill>
              <Pill tone="brand">Hindi/English</Pill>
            </div>
          </div>
        </div>
        <div className="heroArt">
          <img src={hero} alt="Farmer and fields" style={{ width: "100%", display: "block", borderRadius: 14 }} />
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr", maxWidth: 620, margin: "0 auto" }}>
        <Card title={t("signupTitle")} hint="Details bhariye. Wallet connect karna recommended hai.">
          <form onSubmit={onSubmit} className="fieldGrid">
            <div className="field">
              <div className="label">{t("fullName")}</div>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="field">
              <div className="label">{t("email")}</div>
              <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="field">
              <div className="label">{t("password")} (min 6 chars)</div>
              <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
            </div>
            <div className="field">
              <div className="label">{t("walletAddress")}</div>
              <input className="input mono" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="0x..." />
              <div className="row">
                <Button type="button" onClick={connectWallet} disabled={!window.ethereum}>
                  {t("connectWallet")}
                </Button>
                <span className="muted" style={{ fontSize: 12 }}>
                  (recommended)
                </span>
              </div>
            </div>

            {err ? (
              <div className="pill bad" style={{ borderRadius: 12, gridColumn: "1 / -1" }}>
                {err}
              </div>
            ) : null}

            <div className="row" style={{ justifyContent: "space-between", gridColumn: "1 / -1" }}>
              <Button tone="primary" disabled={busy}>
                {busy ? "Creating…" : t("createAccount")}
              </Button>
              <Link to="/login" className="muted" style={{ fontSize: 12 }}>
                {t("alreadyHave")} {t("login")} →
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

