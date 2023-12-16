// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRounds} from "./IRounds.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import {Voting} from "./utils/Voting.sol";

/// @title RoundsBase Contract
/// @dev This contract allows users to vote for candidates.
contract RoundsBase is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    struct Setting {
        string name; // Name of the round
        address admin; // Admin of the round
        bytes32 metadata; // Metadata of the round
        uint256 houseSplit; // 0-100 (percentage)
        uint256 winnerSplit; // 0-100 (percentage)
        uint256 roundDuration; // Duration of the round (in seconds)
        uint256 rounds; // Number of rounds
        uint256 maxRecipientsPerVote; // Max votes per round
        uint256 defaultVoteWeight;
        bool allowLateEntrants; // Allow late entrants
        bool allowPublicStartAndEnd; // Allow public to start round
    }

    struct Round {
        Voting votes;
        uint256 startingTime;
        uint256 endingTime;
        bool active;
    }

    mapping(address => bool) public registered;
    mapping(address => mapping(uint256 => uint256))
        public numberOfVotesCastInThisRound;
    mapping(address => uint256) public points;

    Setting public settings;

    Round[] public rounds;

    event RoundStarted(
        uint256 indexed roundNumber,
        address indexed roundAddress,
        uint256 startingTime,
        uint256 endingTime
    );
    event RoundEnded(uint256 indexed roundNumber);
    event UserRegistered(address indexed user);
    event VoteCast(address indexed voter, uint256 round, address[] recipients);
    error NoRoundsStarted();
    error RegistrationClosed();
    error UserAlreadyRegistered();
    error PreviousRoundNotOver();
    error RoundNotActive();
    error RoundOver();
    error TooManyVotes();
    error UserNotRegistered();
    error UserEliminated();
    error NotAdmin();

    modifier isOpenToPublic() {
        if (
            !settings.allowPublicStartAndEnd &&
            !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)
        ) {
            revert NotAdmin();
        }
        _;
    }

    function initialize(Setting calldata _settings) public initializer {
        settings = _settings;
        _grantRole(DEFAULT_ADMIN_ROLE, settings.admin);
    }

    function register() external payable {
        if (!_canRegister()) revert RegistrationClosed();
        if (registered[msg.sender]) revert UserAlreadyRegistered();

        _register(msg.sender);
    }

    function _register(address _voter) internal {
        registered[_voter] = true;
        emit UserRegistered(_voter);
    }

    function _canRegister() internal view returns (bool) {
        if (rounds.length == 0) {
            return true;
        }
        return settings.allowLateEntrants;
    }

    function startNextRound() external isOpenToPublic {
        if (rounds.length == 0 || _isRoundOver(uint256(rounds.length - 1))) {
            _startNextRound();
        } else {
            revert PreviousRoundNotOver();
        }
    }

    function castVote(address[] calldata recipients) external nonReentrant {
        if (!_haveRoundsStarted()) revert NoRoundsStarted();
        uint256 currentRound = rounds.length - 1;
        if (!_isRoundActive(currentRound)) revert RoundNotActive();
        if (_isRoundOver(currentRound)) revert RoundOver();
        if (!registered[msg.sender]) revert UserNotRegistered();
        if (recipients.length > settings.maxRecipientsPerVote)
            revert TooManyVotes();
        if (_checkIfEliminated(msg.sender)) revert UserEliminated();

        numberOfVotesCastInThisRound[msg.sender][currentRound] += recipients
            .length;
        for (uint256 i = 0; i < recipients.length; i++) {
            rounds[currentRound].votes.castVote(
                recipients[i],
                settings.defaultVoteWeight
            );
        }
        emit VoteCast(msg.sender, currentRound, recipients);
    }

    function _checkIfEliminated(address voter) internal pure returns (bool) {
        return false;
    }

    function _isRoundOver(uint256 roundNumber) internal view returns (bool) {
        return rounds[roundNumber].endingTime <= block.timestamp;
    }

    function _isRoundActive(uint256 roundNumber) internal view returns (bool) {
        return rounds[roundNumber].active;
    }

    function _haveRoundsStarted() internal view returns (bool) {
        return rounds.length > 0;
    }

    function _startNextRound() internal {
        Voting newVotingInstance = new Voting();
        Round memory newRoundStruct = Round({
            votes: newVotingInstance,
            startingTime: block.timestamp,
            endingTime: block.timestamp + settings.roundDuration,
            active: true
        });
        rounds.push(newRoundStruct);
        emit RoundStarted(
            rounds.length,
            address(newVotingInstance),
            newRoundStruct.startingTime,
            newRoundStruct.endingTime
        );
    }
}
