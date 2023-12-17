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

    error RecipientEliminated();
    error InvalidBallot();
    error InvalidRound();
    error RegistrationClosed();
    error UserAlreadyRegistered();
    error PreviousRoundNotOver();
    error RoundOver();
    error TooManyVotes();
    error UserNotRegistered();
    error VoterEliminated();
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

    // Constructor replaced by initializer for upgradeable contract
    function initialize(Setting calldata _settings) public initializer {
        settings = _settings;
        _grantRole(DEFAULT_ADMIN_ROLE, settings.admin);
    }

    // Registers a new voter
    function register() external payable {
        if (!_canRegister()) revert RegistrationClosed();
        if (registered[msg.sender]) revert UserAlreadyRegistered();

        registered[msg.sender] = true;
        emit UserRegistered(msg.sender);
    }

    // Checks if new registrations are allowed
    function _canRegister() internal view returns (bool) {
        // Allow if no rounds have started or late entrants are allowed
        return rounds.length == 0 || settings.allowLateEntrants;
    }

    function startNextRound() external isOpenToPublic {
        if (rounds.length == 0 || _isRoundOver(uint256(rounds.length - 1))) {
            _startNextRound();
        } else {
            revert PreviousRoundNotOver();
        }
    }

    function getCurrentRound() external view returns (uint256) {
        return _getCurrentRound();
    }

    function _getCurrentRound() internal view returns (uint256) {
        if (rounds.length == 0) {
            return 0;
        }
        return rounds.length - 1;
    }

    // Validates the ballot before casting a vote
    function _isValidBallot(
        address[] calldata recipients
    ) public view returns (bool) {
        uint256 currentRound = _getCurrentRound();
        if (!_haveRoundsStarted() || !_isRoundActive(currentRound))
            revert InvalidRound();
        if (_isRoundOver(currentRound)) revert RoundOver();
        if (!registered[msg.sender]) revert UserNotRegistered();
        if (recipients.length > _votesRemainingInThisRound(msg.sender))
            revert TooManyVotes();
        if (_checkIfEliminated(msg.sender)) revert VoterEliminated();
        for (uint256 i = 0; i < recipients.length; i++) {
            if (_checkIfEliminated(recipients[i])) revert RecipientEliminated();
        }
        return true;
    }

    function _votesRemainingInThisRound(
        address voter
    ) internal view returns (uint256) {
        uint256 currentRound = _getCurrentRound();
        uint256 votesCast = numberOfVotesCastInThisRound[voter][currentRound];

        if (votesCast >= settings.maxRecipientsPerVote) {
            return 0;
        }

        return settings.maxRecipientsPerVote - votesCast;
    }

    function _updateVotersVotesRemaining(
        address voter,
        uint256 roundNumber,
        uint256 votes
    ) internal {
        numberOfVotesCastInThisRound[voter][roundNumber] += votes;
    }

    function castVote(address[] calldata recipients) external nonReentrant {
        _isValidBallot(recipients);

        if (_votesRemainingInThisRound(msg.sender) < recipients.length)
            revert TooManyVotes();

        uint256 currentRound = _getCurrentRound();

        _updateVotersVotesRemaining(
            msg.sender,
            currentRound,
            recipients.length
        );

        for (uint256 i = 0; i < recipients.length; i++) {
            rounds[currentRound].votes.castVote(
                recipients[i],
                settings.defaultVoteWeight
            );
        }

        emit VoteCast(msg.sender, currentRound, recipients);
    }

    function getVotes(
        address recipient,
        uint256 round
    ) external view returns (uint256) {
        return rounds[round].votes.getVotes(recipient);
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

    // Simplify function to start the next round
    function _startNextRound() internal {
        Voting newVotingInstance = new Voting();
        Round memory newRound = Round({
            votes: newVotingInstance,
            startingTime: block.timestamp,
            endingTime: block.timestamp + settings.roundDuration,
            active: true
        });
        rounds.push(newRound);
        emit RoundStarted(
            rounds.length,
            address(newVotingInstance),
            newRound.startingTime,
            newRound.endingTime
        );
    }
}
