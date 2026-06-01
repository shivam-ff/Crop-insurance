import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button, Card, LanguageToggle, Pill } from "../ui.jsx";
import { useAuth } from "../auth.jsx";
import { useI18n } from "../i18n.jsx";
import hero from "../assets/farmer_field.svg";

const presets = [
  {
    id: "basic",
    title: "Basic Plan",
    subtitle: "Most popular",
    premiumInr: "9000",
    insuredInr: "150000",
    thresholdMm: "60",
    durationDays: "120"
  },
  {
    id: "standard",
    title: "Standard Plan",
    subtitle: "Higher coverage",
    premiumInr: "18000",
    insuredInr: "300000",
    thresholdMm: "80",
    durationDays: "180"
  },
  {
    id: "pro",
    title: "Premium Plan",
    subtitle: "Maximum protection",
    premiumInr: "36000",
    insuredInr: "600000",
    thresholdMm: "100",
    durationDays: "270"
  }
];

export default function SelectPolicy() {
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useI18n();

  return (
    <div className="container">
      <div className="topbar">
        <div className="title">
          <div className="logo" />
          <div>
            <h1>{t("appName")}</h1>
            <p>{t("selectPlan")}</p>
          </div>
        </div>
        <div className="row">
          <Pill tone="brand">Wallet: {user?.walletAddress ? `${user.walletAddress.slice(0, 6)}…${user.walletAddress.slice(-4)}` : "—"}</Pill>
          <LanguageToggle />
          <Button onClick={() => { logout(); nav("/login"); }}>{t("logout")}</Button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
        <Card
          title={t("selectPlan")}
          hint="Plan select karke agle page par premium bharke policy buy kar sakte hain."
          right={<Link to="/app" className="pill brand">{t("goToDashboard")} →</Link>}
        >
          <div className="hero" style={{ marginBottom: 12 }}>
            <div className="card">
              <div className="cardInner">
                <h2 className="heroTitle">Simple plans for farmers</h2>
                <p className="heroText">
                  Aap apni zarurat ke hisaab se plan select karein. Payout rainfall threshold ke basis par hota hai.
                </p>
              </div>
            </div>
            <div className="heroArt">
              <img src={hero} alt="Farm" style={{ width: "100%", display: "block", borderRadius: 14 }} />
            </div>
          </div>

          <div className="kpiGrid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {presets.map((p) => (
              <div key={p.id} className="kpi">
                <div className="small">{p.subtitle}</div>
                <div className="big">{p.title}</div>
                <div className="divider" />
                <div className="small">Premium</div>
                <div className="big mono">₹{Number(p.premiumInr).toLocaleString("en-IN")}</div>
                <div className="small" style={{ marginTop: 6 }}>Insured</div>
                <div className="big mono">₹{Number(p.insuredInr).toLocaleString("en-IN")}</div>
                <div className="small" style={{ marginTop: 6 }}>Threshold</div>
                <div className="big mono">{p.thresholdMm} mm</div>
                <div className="small" style={{ marginTop: 6 }}>Duration</div>
                <div className="big mono">{p.durationDays} days</div>
                <div className="divider" />
                <div className="row">
                  <Button
                    tone="primary"
                    onClick={() => {
                      localStorage.setItem("policy_preset", JSON.stringify(p));
                      nav("/app");
                    }}
                  >
                    Select plan
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

