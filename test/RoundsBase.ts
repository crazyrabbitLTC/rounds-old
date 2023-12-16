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

        let recipients = [user, user2, user3, user4,];

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
            allowLateEntrants: false,
            allowPublicStartAndEnd: true
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
        expect(parseInt(contractSettings.defaultVoteWeight.toString())).to.equal(settings.defaultVoteWeight);
        expect(contractSettings.allowLateEntrants).to.equal(settings.allowLateEntrants);
        expect(contractSettings.allowPublicStartAndEnd).to.equal(settings.allowPublicStartAndEnd);
    });

    describe("Registration", function () {
        it("should allow users to register when registration is open", async function () {
            const { roundsBase, settings, user } = await loadFixture(deployRoundBaseFixture);

            await expect(roundsBase.connect(user).register())
                .to.emit(roundsBase, "UserRegistered")
                .withArgs(user.address);
        });

        xit("should revert registration when registration is closed", async function () {
            const { roundsBase, settings, user } = await loadFixture(deployRoundBaseFixture);

            // Simulate closing registration here
            await expect(roundsBase.connect(user).register())
                .to.be.revertedWith("RegistrationClosed");
        });
    });

    describe("Starting and Ending Rounds", function () {
        it("should allow starting the next round if conditions are met", async function () {
            const { roundsBase, settings, user, admin } = await loadFixture(deployRoundBaseFixture);

            await expect(roundsBase.connect(admin).startNextRound())
                .to.emit(roundsBase, "RoundStarted");
        });

        it("should revert starting the next round if conditions are not met", async function () {
            const { roundsBase, settings, user, admin } = await loadFixture(deployRoundBaseFixture);
            // start a round first
            await expect(roundsBase.connect(admin).startNextRound())

            // Start a second round with the previous round not over
            await expect(roundsBase.connect(admin).startNextRound())
                .to.be.revertedWithCustomError(roundsBase, "PreviousRoundNotOver");

        });

        it("should revert starting the next round if previous rounnd hasn't finished", async function () {
            const { roundsBase, settings, user, admin } = await loadFixture(deployRoundBaseFixture);
            // start first round
            await expect(roundsBase.connect(admin).startNextRound())

            // start second round before first has finished
            await expect(roundsBase.connect(admin).startNextRound())
                .to.be.revertedWithCustomError(roundsBase, "PreviousRoundNotOver");
        });

    });

    describe("Registration", function () {

        it("should allow a user to register before any rounds", async function () {
            const { roundsBase, settings, user, admin, recipients } = await loadFixture(deployRoundBaseFixture);
            await expect(roundsBase.connect(user).register()).to.emit(roundsBase, "UserRegistered");
        });

        it("should not allow user to register after a round has started if late registration is not allowed", async function () {
            const { roundsBase, settings, user, admin, recipients } = await loadFixture(deployRoundBaseFixture);

            const contractSettings = await roundsBase.settings();
            expect(contractSettings.allowLateEntrants).to.equal(false);

            await roundsBase.connect(admin).startNextRound()
            await expect(roundsBase.connect(user).register()).to.be.revertedWithCustomError(roundsBase, "RegistrationClosed");
        });

        // also do when late registration is allowed


    });
    describe("Cast Vote", function () {

        it("should not allow a user to cast a vote with no rounds", async function () {
            const { roundsBase, settings, user, admin, recipients } = await loadFixture(deployRoundBaseFixture);
            await roundsBase.connect(user).register();
            await expect(roundsBase.connect(user).castVote(recipients)).to.be.revertedWithCustomError(roundsBase, "NoRoundsStarted")
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
                .to.be.revertedWithCustomError(roundsBase, "RoundOver");
        });

        it("should revert if too many votes are cast", async function () {
            const { roundsBase, settings, user, admin } = await loadFixture(deployRoundBaseFixture);
            await roundsBase.connect(user).register();
            await expect(roundsBase.connect(admin).startNextRound())

            const tooManyRecipients = new Array(settings.maxRecipientsPerVote + 1).fill(user.address);
            await expect(roundsBase.connect(user).castVote(tooManyRecipients))
                .to.be.revertedWithCustomError(roundsBase, "TooManyVotes");
        });
    });



});
