// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRounds {
    // Define your function signatures here

    // Example function to set a value
    function setValue(uint256 value) external;

    // Example function to get a value
    function getValue() external view returns (uint256);


    function castVote(address recipient, uint256 voteCount) external;
    function enterRound(address recipient, uint256 voteCount) external;

    function getCandidatesInOrder(uint256 page) external;

    function startNextRound() external;
    function endRound() external;

}
