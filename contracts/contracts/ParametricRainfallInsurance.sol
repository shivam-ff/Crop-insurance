// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Parametric rainfall insurance (prototype).
 *
 * - Farmers buy policies by paying premium.
 * - An off-chain oracle posts rainfall for a policy period.
 * - If total rainfall is below threshold, farmer can claim payout.
 *
 * This is intentionally simplified for a college-project demo.
 */
contract ParametricRainfallInsurance {
    address public owner;
    address public oracle;

    uint256 public nextPolicyId = 1;
    uint64 public constant MIN_POLICY_DURATION = 30 days;
    uint64 public constant MAX_POLICY_DURATION = 365 days;
    uint256 public constant MIN_RAINFALL_THRESHOLD_MM = 20;
    uint256 public constant MAX_RAINFALL_THRESHOLD_MM = 400;

    // Minimal reentrancy guard (avoid external dependency for student project).
    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "REENTRANCY");
        _locked = 2;
        _;
        _locked = 1;
    }

    struct Policy {
        address farmer;
        uint256 premiumWei;
        uint256 insuredAmountWei;
        uint256 rainfallThresholdMm; // trigger if observed < threshold
        uint64 startTs;
        uint64 endTs;
        bool settled;
        uint256 observedRainfallMm; // oracle writes
        bool payoutEligible;
        bool paid;
    }

    mapping(uint256 => Policy) public policies;
    mapping(address => uint256[]) private _policiesByFarmer;

    event OracleUpdated(address indexed oracle);
    event OwnerUpdated(address indexed owner);
    event PolicyPurchased(
        uint256 indexed policyId,
        address indexed farmer,
        uint256 premiumWei,
        uint256 insuredAmountWei,
        uint256 rainfallThresholdMm,
        uint64 startTs,
        uint64 endTs
    );
    event PolicySettled(uint256 indexed policyId, uint256 observedRainfallMm, bool payoutEligible);
    event PayoutClaimed(uint256 indexed policyId, address indexed farmer, uint256 amountWei);
    event PoolFunded(address indexed from, uint256 amountWei);
    event PoolWithdrawn(address indexed to, uint256 amountWei);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "NOT_ORACLE");
        _;
    }

    constructor(address oracle_) payable {
        owner = msg.sender;
        oracle = oracle_;
        if (msg.value > 0) {
            emit PoolFunded(msg.sender, msg.value);
        }
    }

    receive() external payable {
        emit PoolFunded(msg.sender, msg.value);
    }

    function setOracle(address oracle_) external onlyOwner {
        require(oracle_ != address(0), "BAD_ORACLE");
        oracle = oracle_;
        emit OracleUpdated(oracle_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "BAD_OWNER");
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    function fundPool() external payable {
        require(msg.value > 0, "AMOUNT_REQUIRED");
        emit PoolFunded(msg.sender, msg.value);
    }

    /**
     * Owner withdrawal for demo administration (e.g., end-of-semester cleanup).
     * In real insurance designs, pool governance would be more robust.
     */
    function ownerWithdraw(address payable to, uint256 amountWei) external onlyOwner nonReentrant {
        require(to != address(0), "BAD_TO");
        require(amountWei > 0, "AMOUNT_REQUIRED");
        require(address(this).balance >= amountWei, "INSUFFICIENT_POOL");

        (bool ok, ) = to.call{value: amountWei}("");
        require(ok, "TRANSFER_FAILED");
        emit PoolWithdrawn(to, amountWei);
    }

    function getPoliciesByFarmer(address farmer) external view returns (uint256[] memory) {
        return _policiesByFarmer[farmer];
    }

    /**
     * Buy a policy. The premium is paid as msg.value and held in the pool.
     * The insured amount is paid out from the contract pool if eligible.
     */
    function buyPolicy(
        uint256 insuredAmountWei,
        uint256 rainfallThresholdMm,
        uint64 startTs,
        uint64 endTs
    ) external payable returns (uint256 policyId) {
        require(msg.value > 0, "PREMIUM_REQUIRED");
        require(insuredAmountWei > 0, "INSURED_REQUIRED");
        require(rainfallThresholdMm >= MIN_RAINFALL_THRESHOLD_MM, "THRESHOLD_TOO_LOW");
        require(rainfallThresholdMm <= MAX_RAINFALL_THRESHOLD_MM, "THRESHOLD_TOO_HIGH");
        require(endTs > startTs, "BAD_WINDOW");
        require(startTs >= block.timestamp, "START_IN_PAST");
        uint64 duration = endTs - startTs;
        require(duration >= MIN_POLICY_DURATION, "DURATION_TOO_SHORT");
        require(duration <= MAX_POLICY_DURATION, "DURATION_TOO_LONG");
        require(msg.value * 100 >= insuredAmountWei, "PREMIUM_TOO_LOW");
        require(msg.value * 4 <= insuredAmountWei, "PREMIUM_TOO_HIGH");

        policyId = nextPolicyId++;
        policies[policyId] = Policy({
            farmer: msg.sender,
            premiumWei: msg.value,
            insuredAmountWei: insuredAmountWei,
            rainfallThresholdMm: rainfallThresholdMm,
            startTs: startTs,
            endTs: endTs,
            settled: false,
            observedRainfallMm: 0,
            payoutEligible: false,
            paid: false
        });

        _policiesByFarmer[msg.sender].push(policyId);

        emit PolicyPurchased(
            policyId,
            msg.sender,
            msg.value,
            insuredAmountWei,
            rainfallThresholdMm,
            startTs,
            endTs
        );
    }

    /**
     * Oracle settles after policy end time by submitting observed rainfall.
     * If observed rainfall is below threshold, payout becomes eligible.
     */
    function settlePolicy(uint256 policyId, uint256 observedRainfallMm) external onlyOracle {
        Policy storage p = policies[policyId];
        require(p.farmer != address(0), "NOT_FOUND");
        require(!p.settled, "ALREADY_SETTLED");
        require(block.timestamp >= p.endTs, "TOO_EARLY");

        p.settled = true;
        p.observedRainfallMm = observedRainfallMm;
        p.payoutEligible = observedRainfallMm < p.rainfallThresholdMm;

        emit PolicySettled(policyId, observedRainfallMm, p.payoutEligible);
    }

    function claimPayout(uint256 policyId) external nonReentrant {
        Policy storage p = policies[policyId];
        require(p.farmer == msg.sender, "NOT_FARMER");
        require(p.settled, "NOT_SETTLED");
        require(p.payoutEligible, "NOT_ELIGIBLE");
        require(!p.paid, "ALREADY_PAID");

        p.paid = true;

        uint256 amount = p.insuredAmountWei;
        require(address(this).balance >= amount, "INSUFFICIENT_POOL");

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "TRANSFER_FAILED");

        emit PayoutClaimed(policyId, msg.sender, amount);
    }
}

