## Decentralized Crop Insurance (Parametric Rainfall) — Prototype

This is a college-project prototype for **decentralized crop insurance** using **parametric rainfall triggers**, an **oracle-style backend**, and **Ethereum-compatible smart contracts**.

### Repo structure
- `contracts/`: Hardhat + Solidity smart contract
- `backend/`: Oracle API + demo-grade auth (JWT) + weather settlement
- `frontend/`: Professional portal UI (Signup/Login → Select plan → Dashboard)

### What the demo shows
1. A farmer buys a policy by paying a premium on-chain.
2. Users can **Sign up / Login** and see a dashboard with **total payouts** for their linked wallet.
3. The backend (oracle) posts rainfall readings (simulated or Open-Meteo) and settles the policy.
4. If rainfall is below the threshold, the farmer can claim payout from the pool.

### Prerequisites
- Node.js (LTS recommended)
- MetaMask

### Quick start (local demo)
Open three terminals.

#### 1) Smart contracts
```bash
cd contracts
npm install
npx hardhat node
```

In a new terminal:
```bash
cd contracts
npx hardhat run scripts/deploy.js --network localhost
```
This prints the deployed contract address. Copy it for backend/frontend env.

#### 2) Backend oracle
```bash
cd backend
npm install
copy .env.example .env
```
Edit `.env` and set:
- `RPC_URL=http://127.0.0.1:8545`
- `ORACLE_PRIVATE_KEY=` (use one of the Hardhat node private keys)
- `CONTRACT_ADDRESS=` (from deploy step)
- `JWT_SECRET=` (any long random string)

Optional (real rainfall from weather API):
- `RAINFALL_SOURCE=open-meteo`

Run:
```bash
npm run dev
```

#### 3) Frontend
```bash
cd frontend
npm install
copy .env.example .env
```
Set `VITE_CONTRACT_ADDRESS=` to the deployed address.
Set `VITE_BACKEND_URL=` if your backend runs on a different port.

Run:
```bash
npm run dev
```

### Next improvements (optional)
- Swap simulated rainfall for a real weather API (Open-Meteo, etc.)
- Add multi-policy, multi-region support
- Use Chainlink (or equivalent) for decentralized oracle patterns
