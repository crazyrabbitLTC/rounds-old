// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;


import "../utils/Voting.sol";

contract VotingMock is Voting {
    function castMockVoteVote(address recipient, uint256 voteCount) public {
        _castVote(recipient, voteCount);
    }
}