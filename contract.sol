// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * AI + IoT Based Decentralized Crop Insurance for Indian Farmers (Demo)
 *
 * Minimal contract for classroom demo:
 * - Farmer "buys" insurance by paying a small premium
 * - Owner triggers payout when AI predicts HIGH risk
 * - Payout sends fixed amount to farmer
 */
contract CropInsuranceDemo {
    address public owner;
    mapping(address => bool) public insured;

    event InsuranceBought(address indexed farmer, uint256 premiumWei);
    event PayoutTriggered(address indexed farmer, uint256 payoutWei);

    constructor() payable {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "ONLY_OWNER");
        _;
    }

    // Farmer pays premium to activate insurance (demo only)
    function buyInsurance() external payable {
        require(msg.value > 0, "PREMIUM_REQUIRED");
        insured[msg.sender] = true;
        emit InsuranceBought(msg.sender, msg.value);
    }

    // Owner triggers payout only for insured farmers (called when risk is HIGH)
    function triggerPayout(address farmer) external onlyOwner {
        require(insured[farmer], "NOT_INSURED");
        uint256 payout = address(this).balance >= 0.01 ether ? 0.01 ether : address(this).balance;
        require(payout > 0, "NO_FUNDS");
        payable(farmer).transfer(payout);
        emit PayoutTriggered(farmer, payout);
    }

    // Fund contract so it can pay claims
    receive() external payable {}
}

