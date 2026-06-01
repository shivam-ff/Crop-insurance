import React, { createContext, useContext, useMemo, useState } from "react";

const LangCtx = createContext(null);
const KEY = "krishi_lang";

const strings = {
  en: {
    appName: "Krishi Suraksha",
    tagline: "Fast, transparent crop insurance payouts using verified rainfall data",
    language: "Language",
    english: "English",
    hindi: "हिन्दी",
    loginTitle: "Login",
    loginSubtitle: "Access your policies and payouts",
    signupTitle: "Create account",
    signupSubtitle: "Create your profile and link your wallet",
    fullName: "Full name",
    email: "Email",
    password: "Password",
    walletAddress: "Wallet address (0x...)",
    connectWallet: "Connect wallet",
    createAccount: "Create account",
    alreadyHave: "Already have an account?",
    login: "Login",
    newUser: "New user?",
    logout: "Logout",
    selectPlan: "Select your insurance plan",
    goToDashboard: "Go to dashboard",
    dashboard: "Dashboard",
    totalPayout: "Total payout received",
    totalPolicies: "Total policies",
    eligibleToClaim: "Eligible to claim"
  },
  hi: {
    appName: "कृषि सुरक्षा",
    tagline: "सत्यापित वर्षा डेटा के आधार पर तेज़ और पारदर्शी बीमा भुगतान",
    language: "भाषा",
    english: "English",
    hindi: "हिन्दी",
    loginTitle: "लॉगिन",
    loginSubtitle: "अपनी पॉलिसी और भुगतान देखें",
    signupTitle: "नया खाता बनाएं",
    signupSubtitle: "अपनी जानकारी भरें और वॉलेट जोड़ें",
    fullName: "पूरा नाम",
    email: "ईमेल",
    password: "पासवर्ड",
    walletAddress: "वॉलेट पता (0x...)",
    connectWallet: "MetaMask से जोड़ें",
    createAccount: "खाता बनाएं",
    alreadyHave: "पहले से खाता है?",
    login: "लॉगिन",
    newUser: "नया यूज़र?",
    logout: "लॉगआउट",
    selectPlan: "अपनी बीमा योजना चुनें",
    goToDashboard: "डैशबोर्ड खोलें",
    dashboard: "डैशबोर्ड",
    totalPayout: "कुल भुगतान (payout)",
    totalPolicies: "कुल पॉलिसी",
    eligibleToClaim: "क्लेम के लिए योग्य"
  }
};

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem(KEY) || "hi");
  const value = useMemo(() => {
    const t = (k) => strings[lang]?.[k] ?? strings.en[k] ?? k;
    const set = (l) => {
      setLang(l);
      localStorage.setItem(KEY, l);
    };
    return { lang, setLang: set, t };
  }, [lang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useI18n() {
  const v = useContext(LangCtx);
  if (!v) throw new Error("LanguageProvider missing");
  return v;
}

