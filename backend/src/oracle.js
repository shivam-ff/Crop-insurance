import { ethers } from "ethers";

// Minimal ABI needed by the backend.
export const ParametricRainfallInsuranceAbi = [
  "function oracle() view returns (address)",
  "function getPoliciesByFarmer(address farmer) view returns (uint256[])",
  "function settlePolicy(uint256 policyId, uint256 observedRainfallMm) external",
  "function policies(uint256 policyId) view returns (address farmer,uint256 premiumWei,uint256 insuredAmountWei,uint256 rainfallThresholdMm,uint64 startTs,uint64 endTs,bool settled,uint256 observedRainfallMm,bool payoutEligible,bool paid)"
];

export function makeOracleClient({ rpcUrl, oraclePrivateKey, contractAddress }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(oraclePrivateKey, provider);
  const contract = new ethers.Contract(contractAddress, ParametricRainfallInsuranceAbi, wallet);

  return {
    wallet,
    contract,
    async getPolicy(policyId) {
      const p = await contract.policies(policyId);
      return {
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
    },
    async settle({ policyId, observedRainfallMm }) {
      const tx = await contract.settlePolicy(policyId, observedRainfallMm);
      const receipt = await tx.wait();
      return { txHash: receipt.hash };
    },
    async listPoliciesByFarmer(farmer) {
      try {
        const ids = await contract.getPoliciesByFarmer(farmer);
        return ids.map((x) => x.toString());
      } catch (err) {
        // If backend points to an older deployment that doesn't expose getPoliciesByFarmer,
        // keep API stable by returning an empty list instead of throwing.
        const msg = String(err?.message ?? err);
        if (msg.includes("BAD_DATA") || msg.includes("could not decode result data")) {
          return [];
        }
        throw err;
      }
    }
  };
}

