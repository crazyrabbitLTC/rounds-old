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
        string name;
        address admin;
        bytes32 metadata;
        uint256 houseSplit;
        uint256 winnerSplit;
        uint256 roundDuration;
        uint256 rounds;
        uint256 maxRecipientsPerVote;
        bool allowPublicStartAndEnd;
        uint256 eliminationNumerator;
        bool eliminateTop;
    }

    uint256 public totalRegisteredCandidates;

    struct Round {
        Voting votes;
        uint256 startingTime;
        uint256 endingTime;
    }

    mapping(address => bool) public registered;
    mapping(address => mapping(uint256 => uint256))
        public numberOfVotesCastInThisRound;
    mapping(address => uint256) public points;

    Setting public settings;
    Round[] public rounds;
    Voting public roundTracker;

    // Tracking points
    Voting public pointsTracker;
    uint256 public defaultPoints = 2000;

    event RoundStarted(
        uint256 indexed roundNumber,
        address indexed roundAddress,
        uint256 startingTime,
        uint256 endingTime
    );
    event RoundEnded(uint256 indexed roundNumber);
    event UserRegistered(address indexed user);
    event VoteCast(address indexed voter, uint256 round, address[] recipients);
    event CandidateEliminated(address indexed candidate, uint256 round);

    error RecipientEliminated();
    error InvalidBallot();
    error InvalidRound();
    error RoundFullyProcessed();
    error RoundNotProcessed();
    error RegistrationClosed();
    error UserAlreadyRegistered();
    error PreviousRoundNotOver();
    error RoundNotActive();
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

    modifier earnPoints() {
        pointsTracker.castVote(msg.sender, defaultPoints) ;
        _;
    }

    function initialize(Setting calldata _settings) public initializer {
        settings = _settings;
        _grantRole(DEFAULT_ADMIN_ROLE, settings.admin);

        // Setup a total vote stracker
        roundTracker = new Voting();
        pointsTracker = new Voting();
    }

    // Registers a new voter
    function register() external earnPoints() payable {
        if (!_canRegister()) revert RegistrationClosed();
        if (registered[msg.sender]) revert UserAlreadyRegistered();

        registered[msg.sender] = true;
        totalRegisteredCandidates++; // Increment total registered candidates count
        emit UserRegistered(msg.sender);
    }

    function _canRegister() internal view returns (bool) {
        return rounds.length == 0;
    }

    function getCurrentRound() external view returns (uint256) {
        return _getCurrentRound();
    }

    function _getCurrentRound() internal view returns (uint256) {
        return rounds.length == 0 ? 0 : rounds.length - 1;
    }

    function startNextRound() external isOpenToPublic earnPoints() {
        uint256 currentRound = _getCurrentRound();
        if (rounds.length == 0 || _isRoundOver(currentRound)) {
            _startNextRound();
        } else {
            revert PreviousRoundNotOver();
        }
    }

    function _startNextRound() internal {
        Voting newVotingInstance = new Voting();
        Round memory newRound = Round({
            votes: newVotingInstance,
            startingTime: block.timestamp,
            endingTime: block.timestamp + settings.roundDuration
        });
        rounds.push(newRound);
        emit RoundStarted(
            rounds.length,
            address(newVotingInstance),
            newRound.startingTime,
            newRound.endingTime
        );
    }

    function castVote(address[] calldata recipients) external nonReentrant earnPoints() {
        _isValidBallot(recipients, msg.sender);
        uint256 currentRound = _getCurrentRound();
        uint256 defaultVoteAmount = 1;
        _updateVotersVotesRemaining(
            msg.sender,
            currentRound,
            recipients.length
        );
        for (uint256 i = 0; i < recipients.length; i++) {
            rounds[currentRound].votes.castVote(
                recipients[i],
                defaultVoteAmount
            );
            _tallyTotalVotes(recipients[i], defaultVoteAmount);
        }
        emit VoteCast(msg.sender, currentRound, recipients);
    }

    function _tallyTotalVotes(address recipient, uint256 votes) internal {
        roundTracker.castVote(recipient, votes);
    }

    function getCandidateTotalVotes(address candidate)
        external
        view
        returns (uint256)
    {
        return roundTracker.getVotes(candidate);
    }

    function getParticipantPoints(address participant)
        external
        view
        returns (uint256)
    {
        return pointsTracker.getVotes(participant);
    }

    function _isValidBallot(
        address[] calldata recipients,
        address voter
    ) public view returns (bool) {
        uint256 currentRound = _getCurrentRound();
        if (!_haveRoundsStarted()) revert InvalidRound();
        if (!_isRoundActive(currentRound)) revert RoundNotActive();
        if (_isRoundOver(currentRound)) revert RoundOver();
        if (!registered[msg.sender]) revert UserNotRegistered();
        if (recipients.length > _votesRemainingInThisRound(msg.sender))
            revert TooManyVotes();
        for (uint256 i = 0; i < recipients.length; i++) {
            if (isEliminated(recipients[i])) revert RecipientEliminated();
        }
        if (isEliminated(voter)) revert VoterEliminated();
        return true;
    }

    // Function to check if a candidate has been eliminated in any round
    function isEliminated(address candidate) public view returns (bool) {
        for (
            uint256 roundNumber = 0;
            roundNumber < rounds.length;
            roundNumber++
        ) {
            if (!_isRoundActive(roundNumber)) {
                uint256 totalNodes = rounds[roundNumber]
                    .votes
                    .getTotalNodeCount();
                uint256 effectiveTotal = totalRegisteredCandidates > totalNodes
                    ? totalRegisteredCandidates
                    : totalNodes;

                uint256 thresholdIndex;
                if (settings.eliminateTop) {
                    // Top elimination: Consider the top percentage of totalNodes
                    thresholdIndex =
                        (totalNodes * settings.eliminationNumerator) /
                        100;
                } else {
                    // Bottom elimination: Consider the bottom percentage of effectiveTotal
                    thresholdIndex =
                        effectiveTotal -
                        (effectiveTotal * settings.eliminationNumerator) /
                        100;
                }
                require(
                    thresholdIndex <= effectiveTotal,
                    "Threshold index calculation overflow"
                );

                uint256 candidatePosition = rounds[roundNumber]
                    .votes
                    .getPositionByAddress(candidate);
                if (candidatePosition == 0) {
                    // For candidates with no votes, position is considered at the end if eliminateTop is false
                    candidatePosition = settings.eliminateTop
                        ? 0
                        : effectiveTotal + 1;
                }

                bool isInEliminationZone = settings.eliminateTop
                    ? candidatePosition <= thresholdIndex
                    : candidatePosition > thresholdIndex;

                if (isInEliminationZone) return true; // Candidate was eliminated in this round
            }
        }
        return false; // Candidate has not been eliminated in any round
    }

    function _votesRemainingInThisRound(
        address voter
    ) internal view returns (uint256) {
        uint256 currentRound = _getCurrentRound();
        return
            settings.maxRecipientsPerVote -
            numberOfVotesCastInThisRound[voter][currentRound];
    }

    function _updateVotersVotesRemaining(
        address voter,
        uint256 roundNumber,
        uint256 votes
    ) internal {
        numberOfVotesCastInThisRound[voter][roundNumber] += votes;
    }

    function getVotes(
        address recipient,
        uint256 round
    ) external view returns (uint256) {
        return rounds[round].votes.getVotes(recipient);
    }

    function _isRoundOver(uint256 roundNumber) internal view returns (bool) {
        return rounds[roundNumber].endingTime <= block.timestamp;
    }

    function _isRoundActive(uint256 roundNumber) internal view returns (bool) {
        if (roundNumber >= rounds.length) {
            return false; // roundNumber is out of bounds
        }
        Round memory round = rounds[roundNumber];
        return
            block.timestamp >= round.startingTime &&
            block.timestamp < round.endingTime;
    }

    function _haveRoundsStarted() internal view returns (bool) {
        return rounds.length > 0;
    }
}
