import "dotenv/config";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { makeOracleClient } from "./oracle.js";
import bcrypt from "bcryptjs";
import { readUsers, writeUsers } from "./store.js";
import { authMiddleware, signToken } from "./auth.js";

const envSchema = z.object({
  PORT: z.string().default("5050"),
  RPC_URL: z.string().min(1),
  ORACLE_PRIVATE_KEY: z.string().min(1),
  CONTRACT_ADDRESS: z.string().min(1),
  RAINFALL_SOURCE: z.string().default("simulator"),
  JWT_SECRET: z.string().min(10)
});

const env = envSchema.parse({
  PORT: process.env.PORT,
  RPC_URL: process.env.RPC_URL,
  ORACLE_PRIVATE_KEY: process.env.ORACLE_PRIVATE_KEY,
  CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS,
  RAINFALL_SOURCE: process.env.RAINFALL_SOURCE,
  JWT_SECRET: process.env.JWT_SECRET ?? "change-me-in-prod"
});

const oracle = makeOracleClient({
  rpcUrl: env.RPC_URL,
  oraclePrivateKey: env.ORACLE_PRIVATE_KEY,
  contractAddress: env.CONTRACT_ADDRESS
});

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  res.json({ ok: true, oracleAddress: oracle.wallet.address });
});

// --- Auth (demo-grade) ---
app.post("/auth/signup", async (req, res) => {
  const bodySchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(2).max(80),
    walletAddress: z.string().min(10)
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const users = await readUsers();
  const exists = users.find((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
  if (exists) return res.status(409).json({ ok: false, error: "email already registered" });

  const id = crypto?.randomUUID?.() ?? String(Date.now());
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = {
    id,
    email: parsed.data.email.toLowerCase(),
    fullName: parsed.data.fullName,
    walletAddress: parsed.data.walletAddress,
    passwordHash,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  await writeUsers(users);

  const token = signToken({ jwtSecret: env.JWT_SECRET, user });
  res.json({ ok: true, token, user: { id: user.id, email: user.email, fullName: user.fullName, walletAddress: user.walletAddress } });
});

app.post("/auth/login", async (req, res) => {
  const bodySchema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const users = await readUsers();
  const user = users.find((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
  if (!user) return res.status(401).json({ ok: false, error: "invalid credentials" });

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ ok: false, error: "invalid credentials" });

  const token = signToken({ jwtSecret: env.JWT_SECRET, user });
  res.json({ ok: true, token, user: { id: user.id, email: user.email, fullName: user.fullName, walletAddress: user.walletAddress } });
});

app.get("/me", authMiddleware({ jwtSecret: env.JWT_SECRET }), async (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.get("/dashboard", authMiddleware({ jwtSecret: env.JWT_SECRET }), async (req, res) => {
  try {
    const farmer = req.user.walletAddress;
    const policyIds = await oracle.listPoliciesByFarmer(farmer);
    const policies = await Promise.all(policyIds.map((id) => oracle.getPolicy(Number(id))));

    const totalPolicies = policies.length;
    const settled = policies.filter((p) => p.settled).length;
    const eligible = policies.filter((p) => p.payoutEligible && !p.paid).length;
    const paidCount = policies.filter((p) => p.paid).length;

    const totalPaidWei = policies
      .filter((p) => p.paid)
      .reduce((sum, p) => sum + BigInt(p.insuredAmountWei), 0n);

    res.json({
      ok: true,
      farmer,
      policyIds,
      stats: {
        totalPolicies,
        settled,
        eligible,
        paidCount,
        totalPaidWei: totalPaidWei.toString()
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/policies/by-farmer/:farmer", async (req, res) => {
  const farmer = String(req.params.farmer || "");
  if (!farmer.startsWith("0x") || farmer.length < 10) return res.status(400).json({ error: "bad farmer address" });
  try {
    const policyIds = await oracle.listPoliciesByFarmer(farmer);
    res.json({ ok: true, farmer, policyIds });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.get("/policy/:policyId", async (req, res) => {
  const policyId = Number(req.params.policyId);
  if (!Number.isInteger(policyId) || policyId <= 0) return res.status(400).json({ error: "bad policyId" });
  try {
    const policy = await oracle.getPolicy(policyId);
    res.json({ policyId, policy });
  } catch (e) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

// Demo endpoint: settle a policy with rainfall (mm) provided by caller (simulator mode).
app.post("/settle", async (req, res) => {
  const bodySchema = z.object({
    policyId: z.number().int().positive(),
    observedRainfallMm: z.number().int().nonnegative()
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await oracle.settle(parsed.data);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

// Professional demo endpoint: fetch rainfall from Open-Meteo and settle.
// NOTE: This is still an oracle pattern; it demonstrates "real data ingestion" without making the contract call external APIs.
app.post("/settle/from-weather", async (req, res) => {
  if (env.RAINFALL_SOURCE !== "open-meteo") {
    return res.status(400).json({ ok: false, error: "RAINFALL_SOURCE is not set to open-meteo" });
  }

  const bodySchema = z.object({
    policyId: z.number().int().positive(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const policy = await oracle.getPolicy(parsed.data.policyId);
    const startIso = new Date(policy.startTs * 1000).toISOString().slice(0, 10);
    const endIso = new Date(policy.endTs * 1000).toISOString().slice(0, 10);

    // Open-Meteo docs: https://open-meteo.com/
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${parsed.data.latitude}` +
      `&longitude=${parsed.data.longitude}` +
      `&daily=precipitation_sum&timezone=UTC&start_date=${startIso}&end_date=${endIso}`;

    const r = await fetch(url);
    const j = await r.json();
    const daily = j?.daily?.precipitation_sum;
    const total = Array.isArray(daily) ? daily.reduce((a, b) => a + (Number(b) || 0), 0) : NaN;
    if (!Number.isFinite(total)) throw new Error("Weather API returned unexpected format");

    const observedRainfallMm = Math.max(0, Math.round(total));
    const result = await oracle.settle({ policyId: parsed.data.policyId, observedRainfallMm });

    res.json({
      ok: true,
      source: "open-meteo",
      observedRainfallMm,
      startDate: startIso,
      endDate: endIso,
      weatherUrl: url,
      ...result
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.listen(Number(env.PORT), () => {
  // Keep logs short and clear for students.
  console.log(`Oracle backend listening on http://localhost:${env.PORT}`);
});

