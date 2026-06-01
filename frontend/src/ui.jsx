import React, { useEffect } from "react";
import { useI18n } from "./i18n.jsx";

export function clampStr(s, max) {
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

export function shortAddr(a) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function Pill({ tone = "brand", children }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Button({ tone = "default", className = "", ...props }) {
  const toneClass = tone === "primary" ? "primary" : tone === "danger" ? "danger" : "";
  return <button className={`btn ${toneClass} ${className}`} {...props} />;
}

export function Card({ title, hint, right, children }) {
  return (
    <div className="card">
      <div className="cardHeader">
        <div>
          <h2>{title}</h2>
          {hint ? <div className="hint">{hint}</div> : null}
        </div>
        {right ? <div className="row">{right}</div> : null}
      </div>
      <div className="cardInner">{children}</div>
    </div>
  );
}

export function ToastStack({ toasts, dismiss }) {
  useEffect(() => {
    if (!toasts?.length) return;
    const t = setInterval(() => {
      const now = Date.now();
      for (const toast of toasts) {
        if (toast.expiresAt && toast.expiresAt <= now) {
          dismiss(toast.id);
        }
      }
    }, 300);
    return () => clearInterval(t);
  }, [toasts, dismiss]);

  if (!toasts?.length) return null;

  return (
    <div className="toastWrap">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <div className="toastTop">
            <div className="toastTitle">{t.title}</div>
            <button className="btn" onClick={() => dismiss(t.id)} style={{ padding: "6px 10px" }}>
              Close
            </button>
          </div>
          <div className="toastMsg">{t.message}</div>
        </div>
      ))}
    </div>
  );
}

export function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="row">
      <span className="muted" style={{ fontSize: 12 }}>{t("language")}</span>
      <button
        className={`btn ${lang === "hi" ? "primary" : ""}`}
        style={{ padding: "8px 10px" }}
        onClick={() => setLang("hi")}
      >
        {t("hindi")}
      </button>
      <button
        className={`btn ${lang === "en" ? "primary" : ""}`}
        style={{ padding: "8px 10px" }}
        onClick={() => setLang("en")}
      >
        {t("english")}
      </button>
    </div>
  );
}

