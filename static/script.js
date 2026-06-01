let autoMode = false;
let autoTimer = null;
let farmerAddress = "";

const $ = (id) => document.getElementById(id);

// ripple position for buttons
window.addEventListener("pointerdown", (e) => {
  const btn = e.target?.closest?.(".btn");
  if (!btn) return;
  const r = btn.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * 100;
  const y = ((e.clientY - r.top) / r.height) * 100;
  btn.style.setProperty("--x", `${x}%`);
  btn.style.setProperty("--y", `${y}%`);
});

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.add("hidden"), 2200);
}

function appendLogs(lines) {
  const box = $("logs");
  if (!box || !Array.isArray(lines)) return;
  box.textContent = lines.join("\n");
  box.scrollTop = box.scrollHeight;
}

function setLoading(on) {
  const nodes = ["rainfallVal", "tempVal", "riskVal"].map($).filter(Boolean);
  for (const n of nodes) {
    if (on) n.classList.add("loadingShimmer");
    else n.classList.remove("loadingShimmer");
  }
}

function selectPlanCard(planId) {
  document.querySelectorAll("[data-plan-card]").forEach((c) => c.classList.remove("selected"));
  const card = document.querySelector(`[data-plan-card="${planId}"]`);
  if (card) card.classList.add("selected");
}

function confettiBurst() {
  const wrap = $("confetti");
  if (!wrap) return;
  wrap.innerHTML = "";
  const colors = ["#2e7d32", "#43a047", "#f9a825", "#1b5e20", "#ffffff"];
  for (let i = 0; i < 44; i++) {
    const p = document.createElement("i");
    const left = Math.random() * 100;
    const size = 6 + Math.random() * 8;
    const delay = Math.random() * 0.2;
    const duration = 0.9 + Math.random() * 0.7;
    p.style.left = `${left}%`;
    p.style.width = `${size}px`;
    p.style.height = `${size * 1.4}px`;
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDelay = `${delay}s`;
    p.style.animationDuration = `${duration}s`;
    wrap.appendChild(p);
  }
  setTimeout(() => (wrap.innerHTML = ""), 1800);
}

function setRisk(risk) {
  const el = $("riskVal");
  if (!el) return;
  el.textContent = risk || "—";
  el.classList.remove("risk-low", "risk-med", "risk-high");
  document.body.classList.remove("screenHighRisk");

  if (risk === "LOW") el.classList.add("risk-low");
  if (risk === "MEDIUM") el.classList.add("risk-med");
  if (risk === "HIGH") {
    el.classList.add("risk-high");
    document.body.classList.add("screenHighRisk");
  }
}

function setPolicyActive(active) {
  const badge = $("policyBadge");
  if (!badge) return;
  if (active) {
    badge.textContent = "Policy: Active ✅";
    badge.classList.remove("warn", "bad");
    badge.classList.add("good");
  } else {
    badge.textContent = "Policy: Not active";
    badge.classList.remove("good", "bad");
    badge.classList.add("warn");
  }
}

function setTimeline(step) {
  const steps = document.querySelectorAll("#timeline .step");
  if (!steps?.length) return;
  steps.forEach((s) => {
    const n = Number(s.getAttribute("data-step"));
    s.classList.remove("done", "current");
    if (Number.isFinite(step) && n < step) s.classList.add("done");
    if (Number.isFinite(step) && n === step) s.classList.add("current");
  });
}

function setClaim(statusMessage, paid) {
  const box = $("claimBox");
  const msg = $("claimMsg");
  const sub = $("claimSub");
  if (!box || !msg || !sub) return;
  msg.textContent = statusMessage || "No claim yet.";
  if (paid) {
    sub.textContent = "₹5000 Credited Successfully ✅";
    box.classList.add("paySuccess");
    setTimeline(4);
  } else {
    sub.textContent = "Monitoring your farm weather…";
    box.classList.remove("paySuccess");
  }
}

async function apiGet(path) {
  const r = await fetch(path, { credentials: "same-origin" });
  return await r.json();
}

async function apiPost(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "Request failed");
  return j;
}

function randomTemp() {
  return Math.round(22 + Math.random() * 16); // 22-38°C
}

async function evaluate(rainfallMm) {
  const temperatureC = randomTemp();
  setLoading(true);
  setTimeline(2);
  if ($("rainfallVal")) $("rainfallVal").textContent = String(Math.round(rainfallMm));
  if ($("tempVal")) $("tempVal").textContent = String(Math.round(temperatureC));

  const res = await apiPost("/api/evaluate", {
    rainfallMm: Math.round(rainfallMm),
    temperatureC: Math.round(temperatureC),
    autoMode,
  });

  setRisk(res.risk);
  if (res.risk === "HIGH" && !res.paid) setTimeline(3);
  setClaim(res.statusMessage, res.paid);
  appendLogs(res.logs);
  setPolicyActive(Boolean(res.policy?.active));
  setLoading(false);

  if (res.paid) {
    toast("₹5000 credited ✅");
    confettiBurst();
  }
}

async function refreshStatus() {
  const s = await apiGet("/api/status");
  if (!s.ok) return;
  setPolicyActive(Boolean(s.policy?.active));
  if (s.policy?.active) setTimeline(1);
  if (Number.isFinite(s.policy?.last_rainfall_mm) && $("rainfallVal")) $("rainfallVal").textContent = String(Math.round(s.policy.last_rainfall_mm));
  if (Number.isFinite(s.policy?.last_temperature_c) && $("tempVal")) $("tempVal").textContent = String(Math.round(s.policy.last_temperature_c));
  setRisk(s.policy?.last_risk || "—");
  appendLogs(s.logs || []);

  // Location display
  const loc = $("locVal");
  if (loc) {
    const lat = s.policy?.location_lat;
    const lon = s.policy?.location_lon;
    loc.textContent = (typeof lat === "number" && typeof lon === "number") ? `${lat.toFixed(4)}, ${lon.toFixed(4)}` : "Not detected";
  }
}

async function connectMetaMask() {
  if (!window.ethereum) {
    toast("Wallet not available on this device.");
    return;
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  farmerAddress = accounts?.[0] || "";
  const b = $("walletBadge");
  if (b) b.textContent = farmerAddress ? `Wallet: ${farmerAddress.slice(0, 6)}…${farmerAddress.slice(-4)}` : "Wallet: Not connected";
  toast("Wallet connected ✅");
}

function setAuto(on) {
  autoMode = on;
  const btn = $("btnAuto");
  if (btn) btn.textContent = `Auto Mode: ${autoMode ? "ON" : "OFF"}`;

  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;

  if (autoMode) {
    toast("Auto mode ON (हर 5 सेकंड डेटा)");
    autoTimer = setInterval(() => {
      const rainfall = Math.round(Math.random() * 120);
      evaluate(rainfall).catch(() => {});
    }, 5000);
  } else {
    toast("Auto mode OFF");
  }
}

async function detectLocation() {
  if (!navigator.geolocation) {
    toast("Geolocation not supported");
    return;
  }
  toast("Detecting location…");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const res = await apiPost("/api/location", { lat, lon });
      appendLogs(res.logs);
      await refreshStatus();
      toast("Location saved ✅");
    },
    () => toast("Location permission denied")
  );
}

async function buyPlan(planId) {
  selectPlanCard(planId);
  const res = await apiPost("/api/buy_policy", { planId, farmerAddress });
  appendLogs(res.logs);
  setPolicyActive(Boolean(res.policy?.active));
  setTimeline(1);
  toast("Coverage active ✅");
}

function initDashboard() {
  const btnConnect = $("btnConnect");
  if (btnConnect) btnConnect.addEventListener("click", () => connectMetaMask().catch((e) => toast(e.message || String(e))));

  const btnLoc = $("btnDetectLocation");
  if (btnLoc) btnLoc.addEventListener("click", () => detectLocation().catch((e) => toast(e.message || String(e))));

  document.querySelectorAll("[data-buy-plan]").forEach((btn) => {
    btn.addEventListener("click", () => buyPlan(btn.getAttribute("data-buy-plan")).catch((e) => toast(e.message || String(e))));
  });

  const btnStatus = $("btnStatus");
  if (btnStatus) btnStatus.addEventListener("click", () => refreshStatus().catch(() => {}));

  const btnDrought = $("btnDrought");
  if (btnDrought) btnDrought.addEventListener("click", () => evaluate(10).catch((e) => toast(e.message || String(e))));

  const btnNormal = $("btnNormal");
  if (btnNormal) btnNormal.addEventListener("click", () => evaluate(40).catch((e) => toast(e.message || String(e))));

  const btnHeavy = $("btnHeavy");
  if (btnHeavy) btnHeavy.addEventListener("click", () => evaluate(100).catch((e) => toast(e.message || String(e))));

  const btnAuto = $("btnAuto");
  if (btnAuto) btnAuto.addEventListener("click", () => setAuto(!autoMode));

  const btnClear = $("btnClearLogs");
  if (btnClear) btnClear.addEventListener("click", () => {
    if ($("logs")) $("logs").textContent = "";
    toast("Logs cleared");
  });

  refreshStatus().catch(() => {});
}

window.addEventListener("DOMContentLoaded", () => {
  const page = document.body.getAttribute("data-page");
  if (page === "dashboard") initDashboard();
});

