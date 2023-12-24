import { expect } from "chai";
import { ethers } from "hardhat";
import { RoundsBase } from "../typechain-types";
import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/dist/src/signer-with-address";

describe("RoundsBase Contract", function () {

    async function deployRoundBaseFixture() {
        let roundsBase: RoundsBase;
        let deployer: SignerWithAddress, admin: SignerWithAddress, user: SignerWithAddress, user2: SignerWithAddress, user3: SignerWithAddress, user4: SignerWithAddress;
        let settings: any;
        [deployer, admin, user, user2, user3, user4] = await ethers.getSigners();

        let recipients = [user, user2, user3];

        settings = {
            name: "Test Round",
            admin: admin.address,
            metadata: ethers.keccak256(ethers.toUtf8Bytes("Test Round Metadata")),
            houseSplit: 50,
            winnerSplit: 50,
            roundDuration: 3600, // 1 hour
            rounds: 5,
            maxRecipientsPerVote: 3,
            allowPublicStartAndEnd: true,
            eliminationNumerator: 20, // Threshold percentage numerator for elimination (0-100)
            eliminateTop: true,
        };

        const RoundsBaseFactory = await ethers.getContractFactory("RoundsBase", deployer);
        roundsBase = await RoundsBaseFactory.deploy() as RoundsBase;
        await roundsBase.initialize(settings);

        return { roundsBase, deployer, admin, user, settings, recipients };
    };

    it("should deploy and initialize the contract with correct settings", async () => {
        const { roundsBase, settings } = await loadFixture(deployRoundBaseFixture);
        const contractSettings = await roundsBase.settings();

        expect(contractSettings.name).to.equal(settings.name);
        expect(contractSettings.admin).to.equal(settings.admin);
        expect(contractSettings.metadata).to.equal(settings.metadata);
        expect(parseInt(contractSettings.houseSplit.toString())).to.equal(settings.houseSplit);
        expect(parseInt(contractSettings.winnerSplit.toString())).to.equal(settings.winnerSplit);
        expect(parseInt(contractSettings.roundDuration.toString())).to.equal(settings.roundDuration);
        expect(parseInt(contractSettings.rounds.toString())).to.equal(settings.rounds);
        expect(parseInt(contractSettings.maxRecipientsPerVote.toString())).to.equal(settings.maxRecipientsPerVote);
        expect(contractSettings.allowPublicStartAndEnd).to.equal(settings.allowPublicStartAndEnd);
    });

    describe("Registration", function () {
        it("should allow users to register when registration is open", async function () {
            const { roundsBase, settings, user } = await loadFixture(deployRoundBaseFixture);

            await expect(roundsBase.connect(user).register())
                .to.emit(roundsBase, "UserRegistered")
                .withArgs(user.address);
        });

        it("should revert registration when registration is closed", async function () {
            const { roundsBase, settings, user, admin } = await loadFixture(deployRoundBaseFixture);

            // Start round (and close registration)
            await expect(roundsBase.connect(admin).startNextRound())
            .to.emit(roundsBase, "RoundStarted");

            // Simulate closing registration here
            await expect(roundsBase.connect(user).register())
                .to.be.revertedWithCustomError(roundsBase, "RegistrationClosed");
        });
    });

    describe("Starting and Ending Rounds", function () {
        it("should allow starting the first round", async function () {
            const { roundsBase, settings, user, admin } = await loadFixture(deployRoundBaseFixture);
            await expect(roundsBase.connect(admin).startNextRound())
                .to.emit(roundsBase, "RoundStarted");
        });

        it("should increment rounds correctly", async function () {
            const { roundsBase, settings, user, admin } = await loadFixture(deployRoundBaseFixture);

            await expect(roundsBase.connect(admin).startNextRound())
                .to.emit(roundsBase, "RoundStarted");

            expect(await roundsBase.getCurrentRound()).to.equal(0);
            // move forward in time
            await time.increase(settings.roundDuration + 1);

            await expect(roundsBase.connect(admin).startNextRound())
                .to.emit(roundsBase, "RoundStarted");
            expect(await roundsBase.getCurrentRound()).to.equal(1);

            // move forward in time
            await time.increase(settings.roundDuration + 1);

            await expect(roundsBase.connect(admin).startNextRound())
                .to.emit(roundsBase, "RoundStarted");
            expect(await roundsBase.getCurrentRound()).to.equal(2);
        });

        it("should allow starting the next round if conditions are met", async function () {
            const { roundsBase, settings, user, admin } = await loadFixture(deployRoundBaseFixture);

            // start round
            await expect(roundsBase.connect(admin).startNextRound())
                .to.emit(roundsBase, "RoundStarted");

            // move forward in time
            await time.increase(settings.roundDuration + 1);

            await expect(roundsBase.connect(admin).startNextRound())
                .to.emit(roundsBase, "RoundStarted");
        });

        it("should revert starting the next round if previous round has not finished", async function () {
            const { roundsBase, settings, user, admin } = await loadFixture(deployRoundBaseFixture);
            // start a round first
            await expect(roundsBase.connect(admin).startNextRound())

            // Start a second round with the previous round not over
            await expect(roundsBase.connect(admin).startNextRound())
                .to.be.revertedWithCustomError(roundsBase, "PreviousRoundNotOver");
        });

        it("should revert starting the next round if previous round hasn't finished", async function () {
            const { roundsBase, settings, user, admin } = await loadFixture(deployRoundBaseFixture);
            // start first round
            await expect(roundsBase.connect(admin).startNextRound())

            // start second round before first has finished
            await expect(roundsBase.connect(admin).startNextRound())
                .to.be.revertedWithCustomError(roundsBase, "PreviousRoundNotOver");
        });

    });

    describe("Tally Total Votes", function () {
        it("should correctly tally votes for a single round", async function () {
            const { roundsBase, user, admin, recipients } = await loadFixture(deployRoundBaseFixture);
            
            await roundsBase.connect(user).register();
            await roundsBase.connect(admin).startNextRound();
        
            // user casts a vote for a recipient
            await roundsBase.connect(user).castVote([recipients[0].address]);

            // Check the vote tally for the recipient
            const votes = await roundsBase.getCandidateTotalVotes(recipients[0].address);
            expect(votes).to.equal(1);
          });

          it("should correctly tally votes across multiple rounds with time advancement", async function () {
            const { roundsBase, user, admin, recipients, settings } = await loadFixture(deployRoundBaseFixture);
            
            await roundsBase.connect(user).register();
        
            for (let i = 0; i < 3; i++) {
              await roundsBase.connect(admin).startNextRound();
              await roundsBase.connect(user).castVote([recipients[0].address]);
        
              // Advance time to simulate the end of the round
              await time.increase(settings.roundDuration + 1);
        
              // If necessary, you can add a check here to ensure the round has ended
              // Example: expect(await roundsBase.getCurrentRound()).to.equal(i + 1);
            }
        
            const votes = await roundsBase.getCandidateTotalVotes(recipients[0].address);
            expect(votes).to.equal(3); // Expect 3 votes across 3 rounds
          });

          it("should show zero votes when no votes are cast", async function () {
            const { roundsBase, admin, recipients, settings } = await loadFixture(deployRoundBaseFixture);
        
            await roundsBase.connect(admin).startNextRound();
            // No votes are cast in this round
            await time.increase(settings.roundDuration + 1);
        
            const votes = await roundsBase.getCandidateTotalVotes(recipients[0].address);
            expect(votes).to.equal(0);
          });
        
          it.only("should correctly tally votes for multiple candidates", async function () {
            const { roundsBase, user, admin, recipients, settings } = await loadFixture(deployRoundBaseFixture);
        
            await roundsBase.connect(user).register();
            await roundsBase.connect(admin).startNextRound();
            await roundsBase.connect(user).castVote([recipients[0].address, recipients[1].address]);
            await time.increase(settings.roundDuration + 1);
        
            const votesRecipient1 = await roundsBase.getCandidateTotalVotes(recipients[0].address);
            const votesRecipient2 = await roundsBase.getCandidateTotalVotes(recipients[1].address);
            expect(votesRecipient1).to.equal(1);
            expect(votesRecipient2).to.equal(1);
          });
        
          it("should handle max votes per user per round", async function () {
            const { roundsBase, user, admin, recipients, settings } = await loadFixture(deployRoundBaseFixture);
        
            await roundsBase.connect(user).register();
            await roundsBase.connect(admin).startNextRound();
        
            const maxVotesArray = Array(settings.maxRecipientsPerVote).fill(recipients[0].address);
            await roundsBase.connect(user).castVote(maxVotesArray);
            await time.increase(settings.roundDuration + 1);
        
            const votes = await roundsBase.getCandidateTotalVotes(recipients[0].address);
            expect(votes).to.equal(settings.maxRecipientsPerVote);
          });
        
          it("should correctly tally votes across rounds with different voting patterns", async function () {
            const { roundsBase, user, admin, recipients, settings } = await loadFixture(deployRoundBaseFixture);
        
            await roundsBase.connect(user).register();
        
            // Round 1: Vote for recipient 0
            await roundsBase.connect(admin).startNextRound();
            await roundsBase.connect(user).castVote([recipients[0].address]);
            await time.increase(settings.roundDuration + 1);
        
            // Round 2: No votes
            await roundsBase.connect(admin).startNextRound();
            await time.increase(settings.roundDuration + 1);
        
            // Round 3: Vote for recipient 1
            await roundsBase.connect(admin).startNextRound();
            await roundsBase.connect(user).castVote([recipients[1].address]);
            await time.increase(settings.roundDuration + 1);
        
            const votesRecipient0 = await roundsBase.getCandidateTotalVotes(recipients[0].address);
            const votesRecipient1 = await roundsBase.getCandidateTotalVotes(recipients[1].address);
            expect(votesRecipient0).to.equal(1);
            expect(votesRecipient1).to.equal(1);
          });
        
    })

    describe("Registration", function () {

        it("should allow a user to register before any rounds", async function () {
            const { roundsBase, settings, user, admin, recipients } = await loadFixture(deployRoundBaseFixture);
            await expect(roundsBase.connect(user).register()).to.emit(roundsBase, "UserRegistered");
        });

        it("should not allow user to register after a round has started", async function () {
            const { roundsBase, settings, user, admin, recipients } = await loadFixture(deployRoundBaseFixture);

            const contractSettings = await roundsBase.settings();

            await roundsBase.connect(admin).startNextRound()
            await expect(roundsBase.connect(user).register()).to.be.revertedWithCustomError(roundsBase, "RegistrationClosed");
        });

        // also do when late registration is allowed


    });
    describe("Cast Vote", function () {

        it("should not allow a user to cast a vote with no rounds", async function () {
            const { roundsBase, settings, user, admin, recipients } = await loadFixture(deployRoundBaseFixture);
            await roundsBase.connect(user).register();
            await expect(roundsBase.connect(user).castVote(recipients)).to.be.revertedWithCustomError(roundsBase, "InvalidRound")
        });


        it("should allow a registered user to cast votes", async function () {
            const { roundsBase, settings, user, admin, recipients } = await loadFixture(deployRoundBaseFixture);
            await roundsBase.connect(user).register();

            // start first round
            await expect(roundsBase.connect(admin).startNextRound())
            await expect(roundsBase.connect(user).castVote([user.address]))
                .to.emit(roundsBase, "VoteCast")
                .withArgs(user.address, 0, [user.address]);
        });

        it("should revert vote casting for non-registered users", async function () {
            const { roundsBase, settings, user, admin, recipients } = await loadFixture(deployRoundBaseFixture);
            await expect(roundsBase.connect(admin).startNextRound())

            await expect(roundsBase.connect(user).castVote(recipients))
                .to.be.revertedWithCustomError(roundsBase, "UserNotRegistered");
        });

        it("should revert vote casting if the round is not active or over", async function () {
            const { roundsBase, settings, user, admin, recipients } = await loadFixture(deployRoundBaseFixture);
            await expect(roundsBase.connect(admin).startNextRound())

            // advance time till after round duration
            time.increase(settings.roundDuration + 1);

            await expect(roundsBase.connect(user).castVote(recipients))
                .to.be.revertedWithCustomError(roundsBase, "RoundNotActive");
        });

        it("should revert if too many votes are cast", async function () {
            const { roundsBase, settings, user, admin } = await loadFixture(deployRoundBaseFixture);
            await roundsBase.connect(user).register();
            await expect(roundsBase.connect(admin).startNextRound())

            const tooManyRecipients = new Array(settings.maxRecipientsPerVote + 1).fill(user.address);
            await expect(roundsBase.connect(user).castVote(tooManyRecipients))
                .to.be.revertedWithCustomError(roundsBase, "TooManyVotes");
        });

        it("should correctly increment the number of votes cast in the current round", async function () {
            const { roundsBase, user, admin, recipients, settings } = await loadFixture(deployRoundBaseFixture);

            const correctNumberOfRecipients = new Array(settings.maxRecipientsPerVote).fill(user.address);
            await roundsBase.connect(user).register();
            await roundsBase.connect(admin).startNextRound();

            await roundsBase.connect(user).castVote(correctNumberOfRecipients);

            const currentRound = await roundsBase.getCurrentRound();
            const votesCast = await roundsBase.numberOfVotesCastInThisRound(user.address, currentRound);
            expect(votesCast).to.equal(correctNumberOfRecipients.length);
        });




        //   it("should revert if trying to cast a vote for an eliminated user", async function () {
        //     const { roundsBase, user, admin, eliminatedUser } = await loadFixture(deployRoundBaseFixture);

        //     await roundsBase.connect(user).register();
        //     await roundsBase.connect(admin).startNextRound();

        //     // Assuming there is a way to eliminate a user in the contract
        //     await roundsBase.eliminateUser(eliminatedUser.address);

        //     await expect(roundsBase.connect(user).castVote([eliminatedUser.address]))
        //       .to.be.revertedWithCustomError(roundsBase, "UserEliminated");
        //   });

        it("should revert if trying to cast a vote in a round that has not started", async function () {
            const { roundsBase, user, recipients } = await loadFixture(deployRoundBaseFixture);

            await roundsBase.connect(user).register();

            // Do not start the round

            await expect(roundsBase.connect(user).castVote(recipients))
                .to.be.revertedWithCustomError(roundsBase, "InvalidRound");
        });

        it("should allow user to vote more than once in the same round if they still have votes", async function () {
            const { roundsBase, user, admin, recipients } = await loadFixture(deployRoundBaseFixture);

            await roundsBase.connect(user).register();
            await roundsBase.connect(admin).startNextRound();
            const correctNumberOfRecipients = new Array(1).fill(user.address);
            await expect(roundsBase.connect(user).castVote(correctNumberOfRecipients)).to.emit(roundsBase, "VoteCast");
            await expect(roundsBase.connect(user).castVote(correctNumberOfRecipients)).to.emit(roundsBase, "VoteCast");
            await expect(roundsBase.connect(user).castVote(correctNumberOfRecipients)).to.emit(roundsBase, "VoteCast");
        });

        it("should not allow user to vote more than once in the same round if they run out of  votes", async function () {
            const { roundsBase, user, admin } = await loadFixture(deployRoundBaseFixture);

            await roundsBase.connect(user).register();
            await roundsBase.connect(admin).startNextRound();

            // single recipients
            const recipients = new Array(1).fill(user.address);
            await expect(roundsBase.connect(user).castVote(recipients)).to.emit(roundsBase, "VoteCast");
            await expect(roundsBase.connect(user).castVote(recipients)).to.emit(roundsBase, "VoteCast");
            await expect(roundsBase.connect(user).castVote(recipients)).to.emit(roundsBase, "VoteCast");
            await expect(roundsBase.connect(user).castVote(recipients)).to.be.revertedWithCustomError(roundsBase, "TooManyVotes");

        });

        it("should allow user to vote more than once in the same round if they still have votes", async function () {
            const { roundsBase, user, admin, } = await loadFixture(deployRoundBaseFixture);

            await roundsBase.connect(user).register();
            await roundsBase.connect(admin).startNextRound();
            const recipient = new Array(1).fill(user.address);
            await expect(roundsBase.connect(user).castVote(recipient)).to.emit(roundsBase, "VoteCast");
            await expect(roundsBase.connect(user).castVote(recipient)).to.emit(roundsBase, "VoteCast");
            await expect(roundsBase.connect(user).castVote(recipient)).to.emit(roundsBase, "VoteCast");
        });

        it("should correctly report the number of votes for an address", async function () {
            const { roundsBase, admin, user, recipients } = await loadFixture(deployRoundBaseFixture);

            await roundsBase.connect(user).register();
            await roundsBase.connect(admin).startNextRound();


            // Start a round and cast votes
            const recipient = new Array(1).fill(recipients[2].address);
            await roundsBase.connect(user).castVote(recipient);

            // Retrieve Votes
            const currentRound = await roundsBase.getCurrentRound();
            const votes = await roundsBase.getVotes(recipient[0], currentRound);
            const voteOfaNoncandidate = await roundsBase.getVotes(admin.address, currentRound);
            expect(votes).to.equal(1);
            expect(voteOfaNoncandidate).to.equal(0);
        });


    });

    describe("Vote Integrity", function () {
        it("should correctly tally votes", async function () {
            const { roundsBase, user, admin, recipients, settings } = await loadFixture(deployRoundBaseFixture);

            // Register user
            await roundsBase.connect(user).register();

            // Start a new round
            await roundsBase.connect(admin).startNextRound();

            // Vote
            await roundsBase.connect(user).castVote([recipients[0].address, recipients[1].address]);

            // Simulate the end of the round
            await time.increase(settings.roundDuration + 1);

            // Check that the round has ended
            const currentRound = await roundsBase.getCurrentRound();
            const roundInfo = await roundsBase.rounds(currentRound);

            // Check the final vote count for each recipient
            // This assumes the Voting contract has a method to retrieve votes for a recipient in a given round
            const votesForFirstRecipient = await roundsBase.getVotes(recipients[0].address, currentRound);
            const votesForSecondRecipient = await roundsBase.getVotes(recipients[1].address, currentRound);

            expect(votesForFirstRecipient).to.equal(1);
            expect(votesForSecondRecipient).to.equal(1);
        });

    });


});

describe("Elimination Logic", function () {

    async function deployRoundBaseFixture() {
        let roundsBase: RoundsBase;
        let deployer: SignerWithAddress, admin: SignerWithAddress, user: SignerWithAddress, user2: SignerWithAddress, user3: SignerWithAddress, user4: SignerWithAddress;
        let settings: any;
        [deployer, admin, user, user2, user3, user4] = await ethers.getSigners();

        let recipients = [user, user2, user3];

        settings = {
            name: "Test Round",
            admin: admin.address,
            metadata: ethers.keccak256(ethers.toUtf8Bytes("Test Round Metadata")),
            houseSplit: 50,
            winnerSplit: 50,
            roundDuration: 3600, // 1 hour
            rounds: 5,
            maxRecipientsPerVote: 3,
            defaultVoteWeight: 1,
            allowPublicStartAndEnd: true,
            eliminationNumerator: 20, // Bottom 20% gets eliminated
            eliminateTop: false
        };

        const RoundsBaseFactory = await ethers.getContractFactory("RoundsBase", deployer);
        roundsBase = await RoundsBaseFactory.deploy() as RoundsBase;
        await roundsBase.initialize(settings);

        // Register users
        await roundsBase.connect(user).register();
        await roundsBase.connect(user2).register();
        await roundsBase.connect(user3).register();
        await roundsBase.connect(user4).register();


        return { roundsBase, deployer, admin, user, user2, user3, user4, settings, recipients };
    };
    it("should correctly eliminate candidates based on voting", async function () {
        const { roundsBase, admin, user, user2, user3, user4, settings } = await loadFixture(deployRoundBaseFixture);

        // Admin starts the first round
        await roundsBase.connect(admin).startNextRound();

        // Cast votes: User and User2 vote for User3, User4 gets no votes, User votes for themselves
        await roundsBase.connect(user).castVote([user.address]);
        await roundsBase.connect(user2).castVote([user3.address]);
        await roundsBase.connect(user3).castVote([user3.address]);

        // Simulate the end of the round
        await time.increase(settings.roundDuration + 1);

        await roundsBase.connect(admin).startNextRound();

        // Check if User4 is eliminated (no votes)
        expect(await roundsBase.isEliminated(user4.address)).to.be.true;
        expect(await roundsBase.getVotes(user4.address, 0)).to.equal(0);

        // Check if User3 is not eliminated (most votes)
        expect(await roundsBase.isEliminated(user3.address)).to.be.false;
        expect(await roundsBase.getVotes(user3.address, 0)).to.equal(2);
        // Check if User is not eliminated (received some votes)
        expect(await roundsBase.isEliminated(user.address)).to.be.false;
        expect(await roundsBase.getVotes(user.address, 0)).to.equal(1);

    });
    it("should eliminate a candidate who falls into the elimination zone after a round", async function () {
        const { roundsBase, admin, user, user2, user3, user4, settings } = await loadFixture(deployRoundBaseFixture);

        // Admin starts the first round
        await roundsBase.connect(admin).startNextRound();

        // Cast votes
        // User and User2 vote for User3, User4 gets no votes
        await roundsBase.connect(user).castVote([user3.address]);
        await roundsBase.connect(user2).castVote([user3.address]);

        // check which round we are in
        expect(await roundsBase.getCurrentRound()).to.equal(0);

        // Simulate the end of the round
        await time.increase(settings.roundDuration + 1);

        // Admin starts the next round, which should also end the current round
        await roundsBase.connect(admin).startNextRound();

        // check which round we are in
        expect(await roundsBase.getCurrentRound()).to.equal(1);

        // User4 should be eliminated as they are in the bottom 20% (received no votes)
        expect(await roundsBase.isEliminated(user4.address)).to.be.true;
    });

    // Other test scenarios...

    //Cases where multiple candidates fall into the elimination zone.
    //Scenarios where no candidates are eliminated.
    //Edge cases, like when all candidates receive equal votes.
    //Test when a voter is eliminted trying to vote again
});
