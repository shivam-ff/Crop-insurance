import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { Button, Card, LanguageToggle, Pill, ToastStack, shortAddr } from "../ui.jsx";
import { api, getBackendUrl } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useI18n } from "../i18n.jsx";
import hero from "../assets/farmer_field.svg";

const CONTRACT_ABI = [
  "function buyPolicy(uint256 insuredAmountWei,uint256 rainfallThresholdMm,uint64 startTs,uint64 endTs) payable returns (uint256)",
  "function claimPayout(uint256 policyId)",
  "function policies(uint256 policyId) view returns (address farmer,uint256 premiumWei,uint256 insuredAmountWei,uint256 rainfallThresholdMm,uint64 startTs,uint64 endTs,bool settled,uint256 observedRainfallMm,bool payoutEligible,bool paid)",
  "event PolicyPurchased(uint256 indexed policyId,address indexed farmer,uint256 premiumWei,uint256 insuredAmountWei,uint256 rainfallThresholdMm,uint64 startTs,uint64 endTs)"
];

function nowPlusMinutes(min) {
  return Math.floor(Date.now() / 1000) + min * 60;
}

function fmtTimeLeft(seconds) {
  if (seconds <= 0) return "0m";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function safeNumber(s) {
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const ETH_TO_INR_RATE = Number(import.meta.env.VITE_ETH_TO_INR || 300000);
const MIN_INSURED_INR = 50000;
const MAX_INSURED_INR = 1000000;
const MIN_DURATION_DAYS = 30;
const MAX_DURATION_DAYS = 365;
const MIN_PREMIUM_INR = 1000;
const MIN_PREMIUM_RATE = 0.02;
const MAX_PREMIUM_RATE = 0.2;
const DEMO_POLICIES_KEY = "crop_insurance_demo_policies";

function weiToEthStr(weiStr) {
  try {
    return ethers.formatEther(BigInt(weiStr || "0"));
  } catch {
    return "0";
  }
}

function inrToEth(inrValue) {
  if (!Number.isFinite(inrValue) || inrValue <= 0 || !Number.isFinite(ETH_TO_INR_RATE) || ETH_TO_INR_RATE <= 0) return "0";
  return (inrValue / ETH_TO_INR_RATE).toFixed(18);
}

function weiToInrStr(weiStr) {
  const eth = Number(weiToEthStr(weiStr));
  if (!Number.isFinite(eth)) return "0";
  return Math.round(eth * ETH_TO_INR_RATE).toLocaleString("en-IN");
}

function ethStrToInrStr(ethStr, fallback) {
  const eth = Number(ethStr);
  if (!Number.isFinite(eth) || eth <= 0) return fallback;
  return String(Math.round(eth * ETH_TO_INR_RATE));
}

function formatEth(wei) {
  try {
    return Number(ethers.formatEther(wei)).toFixed(6);
  } catch {
    return "0.000000";
  }
}

function getFriendlyError(error) {
  const message = error?.reason || error?.shortMessage || error?.message || String(error);
  if (/insufficient funds/i.test(message)) {
    return "Wallet has insufficient ETH for premium + gas. Please fund this wallet and try again.";
  }
  if (/user rejected|rejected the request|ACTION_REJECTED/i.test(message)) {
    return "Transaction was cancelled in wallet confirmation.";
  }
  return message;
}

function readDemoPolicies() {
  try {
    const raw = localStorage.getItem(DEMO_POLICIES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function Dashboard() {
  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
  const backendUrl = getBackendUrl();
  const { token, user, logout } = useAuth();
  const { t } = useI18n();
  const isDemoUser = Boolean(user?.isDemo);

  const [account, setAccount] = useState("");
  const [walletEth, setWalletEth] = useState("");
  const [chainId, setChainId] = useState(null);
  const [toasts, setToasts] = useState([]);

  const preset = useMemo(() => {
    try {
      const raw = localStorage.getItem("policy_preset");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const [insuredInr, setInsuredInr] = useState(
    preset?.insuredInr || ethStrToInrStr(preset?.insuredEth, "300000")
  );
  const [premiumInr, setPremiumInr] = useState(
    preset?.premiumInr || ethStrToInrStr(preset?.premiumEth, "18000")
  );
  const [thresholdMm, setThresholdMm] = useState(preset?.thresholdMm || "50");
  const [durationDays, setDurationDays] = useState(
    preset?.durationDays || (preset?.durationMin ? String(Math.max(1, Math.round(Number(preset.durationMin) / 1440))) : "180")
  );

  const [policyId, setPolicyId] = useState("");
  const [policy, setPolicy] = useState(null);
  const [clock, setClock] = useState(Math.floor(Date.now() / 1000));
  const [backendHealth, setBackendHealth] = useState({ ok: false, loading: true });

  const [myPolicyIds, setMyPolicyIds] = useState([]);
  const [myPoliciesLoading, setMyPoliciesLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [lat, setLat] = useState("28.6139");
  const [lon, setLon] = useState("77.2090");
  const [demoPolicies, setDemoPolicies] = useState(() => (isDemoUser ? readDemoPolicies() : []));

  const canUse = useMemo(() => Boolean(window.ethereum) && Boolean(contractAddress), [contractAddress]);
  const isLocalTestNetwork = chainId === 31337;

  const pushToast = useCallback((title, message, ms = 6000) => {
    const id = crypto?.randomUUID?.() ?? String(Math.random());
    setToasts((t) => [{ id, title, message, expiresAt: Date.now() + ms }, ...t].slice(0, 4));
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setClock(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!window.ethereum) return undefined;
    const handler = async () => {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const network = await provider.getNetwork();
        setChainId(Number(network.chainId));
        if (account) {
          const balanceWei = await provider.getBalance(account);
          setWalletEth(formatEth(balanceWei));
        }
      } catch {
        // Ignore chain/account event refresh errors.
      }
    };
    window.ethereum.on?.("chainChanged", handler);
    window.ethereum.on?.("accountsChanged", handler);
    return () => {
      window.ethereum.removeListener?.("chainChanged", handler);
      window.ethereum.removeListener?.("accountsChanged", handler);
    };
  }, [account]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        setBackendHealth({ ok: false, loading: true });
        const r = await fetch(`${backendUrl}/health`);
        const j = await r.json();
        if (cancelled) return;
        setBackendHealth({ ok: Boolean(j?.ok), loading: false, oracleAddress: j?.oracleAddress });
      } catch {
        if (cancelled) return;
        setBackendHealth({ ok: false, loading: false });
      }
    }
    check();
  }, [backendUrl]);

  const refreshMyPolicies = useCallback(async () => {
    if (isDemoUser) {
      setMyPolicyIds(demoPolicies.map((p) => String(p.id)));
      return;
    }
    if (!user?.walletAddress) return;
    try {
      setMyPoliciesLoading(true);
      const j = await api(`/policies/by-farmer/${user.walletAddress}`);
      setMyPolicyIds(Array.isArray(j?.policyIds) ? j.policyIds : []);
    } catch (e) {
      pushToast("Policy list", e.message || String(e), 9000);
    } finally {
      setMyPoliciesLoading(false);
    }
  }, [isDemoUser, demoPolicies, user?.walletAddress, pushToast]);

  const refreshSummary = useCallback(async () => {
    if (isDemoUser) {
      const totalPaidInrDemo = demoPolicies
        .filter((p) => p.paid)
        .reduce((acc, p) => acc + Number(p.insuredInr || 0), 0);
      setSummary({
        stats: {
          totalPolicies: demoPolicies.length,
          eligible: demoPolicies.filter((p) => p.payoutEligible && !p.paid).length,
          totalPaidWei: ethers.parseEther(inrToEth(totalPaidInrDemo)).toString()
        }
      });
      return;
    }
    try {
      const j = await api("/dashboard", { token });
      setSummary(j);
    } catch (e) {
      pushToast("Dashboard", e.message || String(e), 9000);
    }
  }, [isDemoUser, demoPolicies, token, pushToast]);

  useEffect(() => {
    refreshMyPolicies();
    refreshSummary();
  }, [refreshMyPolicies, refreshSummary]);

  useEffect(() => {
    if (!isDemoUser) return;
    localStorage.setItem(DEMO_POLICIES_KEY, JSON.stringify(demoPolicies));
  }, [isDemoUser, demoPolicies]);

  async function connect() {
    try {
      if (!window.ethereum) throw new Error("MetaMask not found");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const a = accounts?.[0] || "";
      setAccount(a);
      const network = await provider.getNetwork();
      setChainId(Number(network.chainId));
      const balanceWei = await provider.getBalance(a);
      setWalletEth(formatEth(balanceWei));
      if (user?.walletAddress && a && user.walletAddress.toLowerCase() !== a.toLowerCase()) {
        pushToast("Wallet mismatch", "Connected wallet does not match the wallet saved in your account.", 10000);
      } else {
        pushToast("Wallet connected", "MetaMask account connected successfully.");
      }
    } catch (e) {
      pushToast("Wallet error", e.message || String(e), 9000);
    }
  }

  async function refreshWalletBalance() {
    try {
      if (!window.ethereum || !account) return;
      const provider = new ethers.BrowserProvider(window.ethereum);
      const balanceWei = await provider.getBalance(account);
      setWalletEth(formatEth(balanceWei));
    } catch {
      // Ignore background balance refresh failures.
    }
  }

  async function fundTestWallet() {
    try {
      if (!window.ethereum) throw new Error("MetaMask not found");
      if (!account) throw new Error("Connect wallet first");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      const cid = Number(network.chainId);
      if (cid !== 31337) {
        throw new Error("Test funding button works only on local test network (chainId 31337).");
      }

      const amountHex = "0x56BC75E2D63100000"; // 100 ETH
      let funded = false;
      try {
        await provider.send("hardhat_setBalance", [account, amountHex]);
        funded = true;
      } catch {
        // Try anvil-compatible method.
      }
      if (!funded) {
        await provider.send("anvil_setBalance", [account, amountHex]);
      }

      await refreshWalletBalance();
      pushToast("Test wallet funded", "Added 100 test ETH to your connected wallet.", 9000);
    } catch (e) {
      pushToast("Funding failed", e.message || String(e), 10000);
    }
  }

  async function getContract() {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return {
      provider,
      signer,
      contract: new ethers.Contract(contractAddress, CONTRACT_ABI, signer)
    };
  }

  async function buy() {
    try {
      if (isDemoUser) {
        const premium = safeNumber(premiumInr);
        const insured = safeNumber(insuredInr);
        const threshold = safeNumber(thresholdMm);
        const days = safeNumber(durationDays);
        if (!(premium > 0 && insured > 0 && threshold > 0 && days > 0)) {
          throw new Error("Please enter valid policy values.");
        }
        const startTs = nowPlusMinutes(1);
        const endTs = startTs + Number(days) * 24 * 60 * 60;
        const nextId = demoPolicies.length ? Math.max(...demoPolicies.map((p) => Number(p.id))) + 1 : 1;
        const created = {
          id: String(nextId),
          farmer: "demo-farmer",
          premiumWei: ethers.parseEther(inrToEth(premium)).toString(),
          insuredAmountWei: ethers.parseEther(inrToEth(insured)).toString(),
          insuredInr: insured,
          premiumInr: premium,
          rainfallThresholdMm: String(Math.round(threshold)),
          startTs,
          endTs,
          settled: false,
          observedRainfallMm: "0",
          payoutEligible: false,
          paid: false
        };
        setDemoPolicies((prev) => [...prev, created]);
        setPolicyId(String(nextId));
        setPolicy(created);
        pushToast("Policy created", `Demo policy created successfully. Policy ID: ${nextId}`, 9000);
        return;
      }
      if (!canUse) throw new Error("Missing MetaMask or VITE_CONTRACT_ADDRESS");
      const premium = safeNumber(premiumInr);
      const insured = safeNumber(insuredInr);
      const threshold = safeNumber(thresholdMm);
      const days = safeNumber(durationDays);
      if (!(premium > 0)) throw new Error("Premium must be > 0");
      if (!(insured > 0)) throw new Error("Insured amount must be > 0");
      if (!(threshold > 0)) throw new Error("Rainfall threshold must be > 0 mm");
      if (!(insured >= MIN_INSURED_INR && insured <= MAX_INSURED_INR)) {
        throw new Error(`Insured amount must be between ₹${MIN_INSURED_INR.toLocaleString("en-IN")} and ₹${MAX_INSURED_INR.toLocaleString("en-IN")}`);
      }
      const minPremiumForInsured = Math.max(MIN_PREMIUM_INR, Math.ceil(insured * MIN_PREMIUM_RATE));
      const maxPremiumForInsured = Math.floor(insured * MAX_PREMIUM_RATE);
      if (!(premium >= minPremiumForInsured && premium <= maxPremiumForInsured)) {
        throw new Error(
          `Premium should be practical for this insured amount: ₹${minPremiumForInsured.toLocaleString("en-IN")} to ₹${maxPremiumForInsured.toLocaleString("en-IN")}`
        );
      }
      if (!(threshold >= 20 && threshold <= 400)) throw new Error("Rainfall threshold must be between 20 and 400 mm");
      if (!(days >= MIN_DURATION_DAYS && days <= MAX_DURATION_DAYS)) {
        throw new Error(`Duration must be between ${MIN_DURATION_DAYS} and ${MAX_DURATION_DAYS} days`);
      }

      const insuredEth = inrToEth(insured);
      const premiumEth = inrToEth(premium);
      if (!(safeNumber(insuredEth) > 0) || !(safeNumber(premiumEth) > 0)) {
        throw new Error("Could not process payment amount. Please try again.");
      }

      const { provider, signer, contract: c } = await getContract();
      const startTs = nowPlusMinutes(1);
      const endTs = startTs + Number(days) * 24 * 60 * 60;
      const insuredWei = ethers.parseEther(insuredEth);
      const premiumWei = ethers.parseEther(premiumEth);
      const fromAddress = await signer.getAddress();

      const gasEstimate = await c.buyPolicy.estimateGas(
        insuredWei,
        BigInt(thresholdMm),
        startTs,
        endTs,
        { value: premiumWei }
      );
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ?? 0n;
      const estimatedGasCost = gasEstimate * gasPrice;
      const walletBalance = await provider.getBalance(fromAddress);
      const totalRequired = premiumWei + estimatedGasCost;

      if (walletBalance < totalRequired) {
        const shortBy = totalRequired - walletBalance;
        throw new Error(
          `Insufficient wallet balance. Need ~${formatEth(totalRequired)} ETH (premium ${formatEth(premiumWei)} + gas ${formatEth(estimatedGasCost)}), but wallet has ${formatEth(walletBalance)} ETH. Add at least ${formatEth(shortBy)} ETH and retry.`
        );
      }

      const tx = await c.buyPolicy(
        insuredWei,
        BigInt(thresholdMm),
        startTs,
        endTs,
        { value: premiumWei }
      );
      pushToast("Request submitted", "Policy purchase request sent. Please approve in wallet.", 8000);
      const receipt = await tx.wait();
      const purchased = receipt.logs
        .map((l) => {
          try {
            return c.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((p) => p?.name === "PolicyPurchased");
      const id = purchased?.args?.policyId?.toString();
      if (id) {
        setPolicyId(id);
        pushToast("Policy created", `Your policy is active. Policy ID: ${id}`);
        setTimeout(() => {
          refreshMyPolicies();
          refreshSummary();
        }, 800);
      } else {
        pushToast("Policy created", "Policy purchased. If policy ID is not visible, refresh policy list.", 9000);
      }
    } catch (e) {
      pushToast("Policy purchase failed", getFriendlyError(e), 11000);
    }
  }

  async function loadPolicy() {
    try {
      if (isDemoUser) {
        if (!policyId) throw new Error("Enter policy ID");
        const found = demoPolicies.find((p) => String(p.id) === String(policyId));
        if (!found) throw new Error("Policy not found in demo account.");
        setPolicy(found);
        pushToast("Policy loaded", "Demo policy details updated.", 7000);
        return;
      }
      if (!canUse) throw new Error("Missing MetaMask or VITE_CONTRACT_ADDRESS");
      if (!policyId) throw new Error("Enter policyId");
      const { contract: c } = await getContract();
      const p = await c.policies(BigInt(policyId));
      const normalized = {
        farmer: p.farmer,
        premiumWei: p.premiumWei.toString(),
        insuredAmountWei: p.insuredAmountWei.toString(),
        rainfallThresholdMm: p.rainfallThresholdMm.toString(),
        startTs: Number(p.startTs),
        endTs: Number(p.endTs),
        settled: Boolean(p.settled),
        observedRainfallMm: p.observedRainfallMm.toString(),
        payoutEligible: Boolean(p.payoutEligible),
        paid: Boolean(p.paid)
      };
      setPolicy(normalized);
      pushToast("Policy loaded", "Policy details updated.");
    } catch (e) {
      pushToast("Load failed", e.message || String(e), 10000);
    }
  }

  async function settleViaBackend(observedRainfallMm) {
    try {
      if (isDemoUser) {
        if (!policyId) throw new Error("Enter policy ID first");
        const observed = Number(observedRainfallMm);
        setDemoPolicies((prev) =>
          prev.map((p) =>
            String(p.id) === String(policyId)
              ? {
                  ...p,
                  settled: true,
                  observedRainfallMm: String(observed),
                  payoutEligible: observed < Number(p.rainfallThresholdMm)
                }
              : p
          )
        );
        setPolicy((prev) =>
          prev
            ? {
                ...prev,
                settled: true,
                observedRainfallMm: String(observed),
                payoutEligible: observed < Number(prev.rainfallThresholdMm)
              }
            : prev
        );
        pushToast("Assessment done", `Rainfall recorded: ${observed} mm`, 8000);
        return;
      }
      if (!policyId) throw new Error("Enter policyId first");
      if (backendHealth.loading) throw new Error("Backend is still checking health—try again in 2 seconds");
      if (!backendHealth.ok) throw new Error("Backend not reachable. Start backend and verify VITE_BACKEND_URL.");

      const resp = await fetch(`${backendUrl}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyId: Number(policyId), observedRainfallMm: Number(observedRainfallMm) })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error ? JSON.stringify(json.error) : "backend error");
      pushToast("Settlement requested", "Rainfall check completed for this policy.", 9000);
      setTimeout(() => refreshSummary(), 800);
    } catch (e) {
      pushToast("Settle failed", e.message || String(e), 10000);
    }
  }

  async function settleFromWeather() {
    try {
      if (isDemoUser) {
        if (!policyId) throw new Error("Enter policy ID first");
        const latitude = safeNumber(lat);
        const longitude = safeNumber(lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Enter valid latitude and longitude");
        const observed = Math.max(0, Math.round((Math.abs(latitude) * 1.7 + Math.abs(longitude) * 1.1) % 180));
        await settleViaBackend(observed);
        return;
      }
      if (!policyId) throw new Error("Enter policyId first");
      if (backendHealth.loading) throw new Error("Backend is still checking health—try again in 2 seconds");
      if (!backendHealth.ok) throw new Error("Backend not reachable. Start backend and verify VITE_BACKEND_URL.");
      const latitude = safeNumber(lat);
      const longitude = safeNumber(lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Enter valid latitude/longitude");

      const resp = await fetch(`${backendUrl}/settle/from-weather`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyId: Number(policyId), latitude, longitude })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error ? JSON.stringify(json.error) : "backend error");
      pushToast("Rainfall updated", `Observed rainfall: ${json.observedRainfallMm} mm`, 11000);
      setTimeout(() => refreshSummary(), 800);
    } catch (e) {
      pushToast("Weather settle failed", e.message || String(e), 11000);
    }
  }

  async function claim() {
    try {
      if (isDemoUser) {
        if (!policyId) throw new Error("Enter policy ID");
        let claimDone = false;
        let claimReason = "";
        setDemoPolicies((prev) =>
          prev.map((p) => {
            if (String(p.id) !== String(policyId)) return p;
            if (!p.settled) {
              claimReason = "Please assess rainfall before claiming.";
              return p;
            }
            if (!p.payoutEligible) {
              claimReason = "This policy is not eligible for payout.";
              return p;
            }
            if (p.paid) {
              claimReason = "Payout already completed for this policy.";
              return p;
            }
            claimDone = true;
            return { ...p, paid: true };
          })
        );
        if (!claimDone) throw new Error(claimReason || "Claim could not be processed.");
        setPolicy((prev) => (prev ? { ...prev, paid: true } : prev));
        pushToast("Claim completed", "Demo payout marked as completed.", 8000);
        return;
      }
      if (!canUse) throw new Error("Missing MetaMask or VITE_CONTRACT_ADDRESS");
      if (!policyId) throw new Error("Enter policyId");
      const { contract: c } = await getContract();
      const tx = await c.claimPayout(BigInt(policyId));
      pushToast("Claim request submitted", "Payout claim request sent. Please approve in wallet.", 9000);
      await tx.wait();
      pushToast("Claim completed", "Payout has been transferred to your wallet (if eligible).");
      setTimeout(() => refreshSummary(), 800);
    } catch (e) {
      pushToast("Claim failed", e.message || String(e), 10000);
    }
  }

  const policyPhase = useMemo(() => {
    if (!policy) return { label: "No policy selected", tone: "brand" };
    if (clock < policy.startTs) return { label: "Starts soon", tone: "brand" };
    if (clock >= policy.startTs && clock < policy.endTs) return { label: "Coverage active", tone: "good" };
    if (!policy.settled) return { label: "Rainfall assessment pending", tone: "warn" };
    if (policy.paid) return { label: "Payout received", tone: "good" };
    if (policy.payoutEligible) return { label: "Ready to claim", tone: "good" };
    return { label: "No payout for this season", tone: "bad" };
  }, [policy, clock]);

  const timeLeft = useMemo(() => {
    if (!policy) return null;
    if (clock < policy.startTs) return { label: "Starts in", seconds: policy.startTs - clock };
    if (clock < policy.endTs) return { label: "Coverage ends in", seconds: policy.endTs - clock };
    return { label: "Coverage period ended", seconds: 0 };
  }, [policy, clock]);

  const totalPaidInr = summary?.stats?.totalPaidWei ? weiToInrStr(summary.stats.totalPaidWei) : "0";
  const insuredPreview = safeNumber(insuredInr);
  const premiumPreview = safeNumber(premiumInr);
  const durationPreview = safeNumber(durationDays);
  const premiumRatePreview = insuredPreview > 0 && premiumPreview > 0
    ? ((premiumPreview / insuredPreview) * 100).toFixed(1)
    : null;
  const aiAdvice = useMemo(() => {
    const tips = [];
    const premiumRate = insuredPreview > 0 && premiumPreview > 0 ? (premiumPreview / insuredPreview) * 100 : 0;
    if (premiumRate > 12) tips.push("Premium looks high for this coverage. You can reduce premium or increase coverage amount.");
    if (premiumRate > 0 && premiumRate < 3) tips.push("Premium is very low. Keep enough cover for drought risk.");
    if (safeNumber(thresholdMm) < 50) tips.push("Low rainfall trigger can help claim earlier in dry conditions.");
    if (safeNumber(thresholdMm) > 120) tips.push("High trigger may reduce claim chances. Match it to your local rainfall pattern.");
    if (safeNumber(durationDays) < 90) tips.push("Try 90+ days for most crop seasons.");
    if (!tips.length) tips.push("Policy looks balanced for a normal crop season.");
    return tips.slice(0, 3);
  }, [insuredPreview, premiumPreview, thresholdMm, durationDays]);

  return (
    <>
      <div className="container">
        <div className="topbar">
          <div className="title">
            <div className="logo" />
            <div>
              <h1>{t("dashboard")}</h1>
              <p>{user?.fullName || user?.email}</p>
            </div>
          </div>

          <div className="row">
            <Pill tone={backendHealth.loading ? "brand" : backendHealth.ok ? "good" : "bad"}>
              {isDemoUser ? "Weather service: demo ready" : backendHealth.loading ? "Weather service: checking…" : backendHealth.ok ? "Weather service: ready" : "Weather service: offline"}
            </Pill>
            <LanguageToggle />
            {!isDemoUser ? (
              <Button tone="primary" onClick={connect} disabled={!window.ethereum}>
                {account ? `Wallet: ${shortAddr(account)}` : "Connect MetaMask"}
              </Button>
            ) : null}
            {!isDemoUser && account ? <Pill tone="brand">Wallet balance: {walletEth} ETH</Pill> : null}
            <Button onClick={() => { logout(); window.location.href = "/login"; }}>{t("logout")}</Button>
          </div>
        </div>

        <div className="hero">
          <div className="card">
            <div className="cardInner">
              <h2 className="heroTitle">{t("appName")}</h2>
              <p className="heroText">Protect your crop income with rainfall-based coverage and easy claim tracking.</p>
              <div className="row" style={{ marginTop: 10 }}>
                <Pill tone="good">Season coverage</Pill>
                <Pill tone="brand">Transparent records</Pill>
                <Pill tone="warn">Rainfall-based claims</Pill>
                {isDemoUser ? <Pill tone="brand">Demo mode</Pill> : null}
              </div>
            </div>
          </div>
          <div className="heroArt">
            <img src={hero} alt="Farm" style={{ width: "100%", display: "block", borderRadius: 14 }} />
          </div>
        </div>

        <div className="grid">
          <Card
            title="Portfolio summary"
            hint="Quick view of your total crop policies, claim eligibility, and payout amount."
            right={<Pill tone="brand">{isDemoUser ? "Demo account" : `Linked: ${shortAddr(user?.walletAddress || "")}`}</Pill>}
          >
            <div className="kpiGrid">
              <div className="kpi">
                <div className="small">{t("totalPolicies")}</div>
                <div className="big">{summary?.stats?.totalPolicies ?? "—"}</div>
              </div>
              <div className="kpi">
                <div className="small">{t("eligibleToClaim")}</div>
                <div className="big">{summary?.stats?.eligible ?? "—"}</div>
              </div>
              <div className="kpi">
                <div className="small">{t("totalPayout")}</div>
                <div className="big mono">₹{totalPaidInr}</div>
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <Button onClick={refreshSummary}>Refresh summary</Button>
            </div>
          </Card>

          <Card title="AI Farm Advisor" hint="Smart suggestions based on your policy values.">
            <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              {aiAdvice.map((tip, i) => (
                <div key={i} className="pill brand" style={{ borderRadius: 12 }}>
                  {tip}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Buy crop policy" hint={isDemoUser ? "Demo mode: payment is not required." : "Enter coverage details for your field and season."}>
            <div className="fieldGrid">
              <div className="field">
                <div className="label">Premium (INR)</div>
                <input
                  className="input"
                  type="number"
                  min={MIN_PREMIUM_INR}
                  step="500"
                  value={premiumInr}
                  onChange={(e) => setPremiumInr(e.target.value)}
                />
              </div>
              <div className="field">
                <div className="label">Insured amount (INR)</div>
                <input
                  className="input"
                  type="number"
                  min={MIN_INSURED_INR}
                  max={MAX_INSURED_INR}
                  step="10000"
                  value={insuredInr}
                  onChange={(e) => setInsuredInr(e.target.value)}
                />
              </div>
              <div className="field">
                <div className="label">Rainfall threshold (mm)</div>
                <input className="input" type="number" min="20" max="400" step="5" value={thresholdMm} onChange={(e) => setThresholdMm(e.target.value)} />
              </div>
              <div className="field">
                <div className="label">Policy duration (days)</div>
                <input
                  className="input"
                  type="number"
                  min={MIN_DURATION_DAYS}
                  max={MAX_DURATION_DAYS}
                  step="1"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                />
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Recommended range: insured ₹{MIN_INSURED_INR.toLocaleString("en-IN")}–₹{MAX_INSURED_INR.toLocaleString("en-IN")},
              duration {MIN_DURATION_DAYS}–{MAX_DURATION_DAYS} days, premium {Math.round(MIN_PREMIUM_RATE * 100)}–{Math.round(MAX_PREMIUM_RATE * 100)}% of insured value.
            </div>
            <div className="kpiGrid" style={{ marginTop: 10 }}>
              <div className="kpi">
                <div className="small">Coverage selected</div>
                <div className="big">₹{Number.isFinite(insuredPreview) ? Math.round(insuredPreview).toLocaleString("en-IN") : "—"}</div>
              </div>
              <div className="kpi">
                <div className="small">Premium rate</div>
                <div className="big">{premiumRatePreview ? `${premiumRatePreview}%` : "—"}</div>
              </div>
              <div className="kpi">
                <div className="small">Policy term</div>
                <div className="big">{Number.isFinite(durationPreview) ? `${durationPreview} days` : "—"}</div>
              </div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <Button tone="primary" onClick={buy} disabled={isDemoUser ? false : !canUse}>
                Buy policy
              </Button>
              <Button onClick={() => {
                setInsuredInr("50000");
                setPremiumInr("1000");
                setThresholdMm("50");
                setDurationDays("30");
              }}>
                Use test values
              </Button>
              {!isDemoUser ? (
                <Button onClick={fundTestWallet} disabled={!account || !isLocalTestNetwork}>
                  Fund test wallet
                </Button>
              ) : null}
            </div>
            {!isDemoUser ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                {!account
                  ? "Connect MetaMask to enable test funding."
                  : isLocalTestNetwork
                  ? "Local test network detected. You can fund this wallet instantly."
                  : `Current network chain ID is ${chainId ?? "unknown"}. Switch to Local Test Network (31337) to use test funding.`}
              </div>
            ) : null}
          </Card>

          <Card
            title="Track policy and claim"
            hint="Check policy status, assess rainfall after coverage period, and claim if eligible."
            right={<Pill tone={policy ? policyPhase.tone : "brand"}>{policy ? policyPhase.label : "No policy"}</Pill>}
          >
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="row">
                <div className="label">Policy ID</div>
                <input className="input mono" style={{ width: 150 }} value={policyId} onChange={(e) => setPolicyId(e.target.value)} placeholder="e.g. 1" />
                <Button onClick={loadPolicy} disabled={isDemoUser ? false : !canUse}>Load</Button>
              </div>
              {timeLeft ? (
                <Pill tone={timeLeft.seconds > 0 ? "warn" : "brand"}>
                  {timeLeft.label}: <span className="mono">{fmtTimeLeft(timeLeft.seconds)}</span>
                </Pill>
              ) : (
                <Pill tone="brand">No timer</Pill>
              )}
            </div>

            <div className="divider" />

            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="row">
                <div className="label">My policies</div>
                <Pill tone={myPoliciesLoading ? "brand" : "good"}>{myPoliciesLoading ? "Loading…" : `${myPolicyIds.length} found`}</Pill>
              </div>
              <Button onClick={refreshMyPolicies}>Refresh</Button>
            </div>

            <div className="row" style={{ marginTop: 8, gap: 8 }}>
              {myPolicyIds.length ? (
                myPolicyIds.slice().reverse().slice(0, 10).map((id) => (
                  <Button key={id} onClick={() => setPolicyId(String(id))} className={String(id) === String(policyId) ? "primary" : ""}>
                    #{id}
                  </Button>
                ))
              ) : (
                <span className="muted" style={{ fontSize: 12 }}>
                  No policies found for this account.
                </span>
              )}
            </div>

            <div className="divider" />

            <div className="row" style={{ gap: 8 }}>
              <Button onClick={() => settleViaBackend(10)} disabled={!policyId}>Assess drought case</Button>
              <Button onClick={() => settleViaBackend(100)} disabled={!policyId}>Assess normal rainfall</Button>
              <Button onClick={settleFromWeather} disabled={!policyId}>Check real rainfall</Button>
              <Button tone="primary" onClick={claim} disabled={(isDemoUser ? false : !canUse) || !policyId}>Claim payout</Button>
            </div>

            <div className="row" style={{ marginTop: 10, gap: 10 }}>
              <div className="field" style={{ minWidth: 220 }}>
                <div className="label">Latitude</div>
                <input className="input mono" value={lat} onChange={(e) => setLat(e.target.value)} />
              </div>
              <div className="field" style={{ minWidth: 220 }}>
                <div className="label">Longitude</div>
                <input className="input mono" value={lon} onChange={(e) => setLon(e.target.value)} />
              </div>
              <span className="muted" style={{ fontSize: 12, maxWidth: 340 }}>
                Add your farm location to check actual rainfall for this policy.
              </span>
            </div>
          </Card>

          <Card title="Policy details" hint="Simple view of rainfall assessment and payout status.">
            {policy ? (
              <>
                <div className="kpiGrid">
                  <div className="kpi">
                    <div className="small">Farmer account</div>
                    <div className="big mono" style={{ fontSize: 12 }}>{shortAddr(policy.farmer)}</div>
                  </div>
                  <div className="kpi">
                    <div className="small">Rainfall trigger</div>
                    <div className="big">{policy.rainfallThresholdMm} mm</div>
                    <div className="small">Claim may apply if rainfall stays below this level</div>
                  </div>
                  <div className="kpi">
                    <div className="small">Insured value</div>
                    <div className="big">₹{weiToInrStr(policy.insuredAmountWei)}</div>
                    <div className="small">Observed rainfall: {policy.observedRainfallMm} mm</div>
                  </div>
                </div>
                <div className="divider" />
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div className="row">
                    <Pill tone={policy.settled ? "good" : "warn"}>{policy.settled ? "Assessment done" : "Assessment pending"}</Pill>
                    <Pill tone={policy.paid ? "good" : "brand"}>{policy.paid ? "Payout done" : "Payout pending"}</Pill>
                    <Pill tone={policy.payoutEligible ? "good" : "bad"}>{policy.payoutEligible ? "Claim eligible" : "Claim not eligible"}</Pill>
                  </div>
                </div>
              </>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>Load a policy to view details.</span>
            )}
          </Card>
        </div>
      </div>

      <ToastStack toasts={toasts} dismiss={dismissToast} />
    </>
  );
}

