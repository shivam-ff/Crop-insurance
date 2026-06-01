const hre = require("hardhat");

async function main() {
  const [deployer, oracle] = await hre.ethers.getSigners();

  console.log("Deployer:", deployer.address);
  console.log("Oracle:", oracle.address);

  const Factory = await hre.ethers.getContractFactory("ParametricRainfallInsurance");
  // Seed the pool with some ETH so payouts can happen in demos.
  const contract = await Factory.deploy(oracle.address, {
    value: hre.ethers.parseEther("5")
  });
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("ParametricRainfallInsurance deployed to:", address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

