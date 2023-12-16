import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
describe("Voting Util", function () {
  async function deployVotingFixture() {
    const [deployer, alice, bob, jane, alisha, newCandidate, mario, luigi] =
      await ethers.getSigners();

    const Voting = await ethers.getContractFactory("VotingMock");
    const voting = await Voting.deploy();

    return {
      voting,
      deployer,
      alice,
      bob,
      jane,
      alisha,
      newCandidate,
      mario,
      luigi,
    };
  }

  describe("Unit Tests", function () {
    it("should deploy the contract successfully", async () => {
      const Voting = await ethers.getContractFactory("Voting");
      const voting = await Voting.deploy();

      expect(await voting.getAddress()).to.properAddress;
    });
    it("should correctly insert a new candidate in an empty list", async () => {
      const { voting, alice } = await loadFixture(deployVotingFixture);
      const aliceAddress = await alice.getAddress();

      // Cast the first vote
      await voting.connect(alice).castMockVoteVote(aliceAddress, 5);

      // Fetch candidates
      const candidatesInOrder = await voting.getCandidatesInOrder(1, 1);
      const simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      // Assertion
      expect(simplifiedCandidates).to.deep.equal([
        { recipient: aliceAddress, votes: 5 },
      ]);
    });

    it("should correctly handle paging when fetching candidates", async () => {
      const { voting, alice, bob, jane } = await loadFixture(
        deployVotingFixture
      );

      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      const janeAddress = await jane.getAddress();

      // Initial Votes
      await voting.connect(alice).castMockVoteVote(aliceAddress, 3);
      await voting.connect(bob).castMockVoteVote(bobAddress, 2);
      await voting.connect(jane).castMockVoteVote(janeAddress, 1);

      // First page
      let candidatesInOrder = await voting.getCandidatesInOrder(2, 1);
      let simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(simplifiedCandidates).to.deep.equal([
        { recipient: aliceAddress, votes: 3 },
        { recipient: bobAddress, votes: 2 },
      ]);
    });

    it("should correctly insert a new candidate based on votes", async () => {
      const { voting, alice, bob, newCandidate } = await loadFixture(
        deployVotingFixture
      );

      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      const newCandidateAddress = await newCandidate.getAddress();

      // Initial Votes for Alice and Bob
      await voting.connect(alice).castMockVoteVote(aliceAddress, 3);
      await voting.connect(bob).castMockVoteVote(bobAddress, 2);

      // Initial check
      let candidatesInOrder = await voting.getCandidatesInOrder(2, 1);
      let simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(simplifiedCandidates).to.deep.equal([
        { recipient: aliceAddress, votes: 3 },
        { recipient: bobAddress, votes: 2 },
      ]);

      // Cast votes for newCandidate
      await voting
        .connect(newCandidate)
        .castMockVoteVote(newCandidateAddress, 4);

      // Check again to see if newCandidate is inserted correctly
      candidatesInOrder = await voting.getCandidatesInOrder(3, 1);
      simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(simplifiedCandidates).to.deep.equal([
        { recipient: newCandidateAddress, votes: 4 },
        { recipient: aliceAddress, votes: 3 },
        { recipient: bobAddress, votes: 2 },
      ]);
    });

    it("should revert when invalid arguments are passed to getCandidatesInOrder", async () => {
      const { voting } = await loadFixture(deployVotingFixture);

      // Invalid page size (zero)
      await expect(voting.getCandidatesInOrder(0, 1)).to.be.revertedWith(
        "PageSize must be greater than zero"
      );

      // Invalid page number (zero)
      await expect(voting.getCandidatesInOrder(1, 0)).to.be.revertedWith(
        "Page must be greater than zero"
      );
    });
    it("should correctly reorder candidates when existing votes are added", async () => {
      const { voting, alice, bob, jane } = await loadFixture(
        deployVotingFixture
      );

      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      const janeAddress = await jane.getAddress();

      // Initial Votes
      await voting.connect(alice).castMockVoteVote(aliceAddress, 1);
      await voting.connect(bob).castMockVoteVote(bobAddress, 2);
      await voting.connect(jane).castMockVoteVote(janeAddress, 3);

      // Alice receives additional votes, overtaking Bob but still less than Jane
      await voting.connect(alice).castMockVoteVote(aliceAddress, 2);

      let candidatesInOrder = await voting.getCandidatesInOrder(3, 1);

      const simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(simplifiedCandidates).to.deep.equal([
        { recipient: janeAddress, votes: 3 },
        { recipient: aliceAddress, votes: 3 },
        { recipient: bobAddress, votes: 2 },
      ]);
    });

    it("should correctly paginate candidates", async () => {
      const { voting, alice, bob, jane, alisha } = await loadFixture(
        deployVotingFixture
      );

      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      const janeAddress = await jane.getAddress();
      const alishaAddress = await alisha.getAddress();

      // Initial Votes
      await voting.connect(alice).castMockVoteVote(aliceAddress, 4);
      await voting.connect(bob).castMockVoteVote(bobAddress, 3);
      await voting.connect(jane).castMockVoteVote(janeAddress, 2);
      await voting.connect(alisha).castMockVoteVote(alishaAddress, 1);

      // Retrieve the first page (Page 1, Page size 2)
      let candidatesInOrder = await voting.getCandidatesInOrder(2, 1);

      let simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(simplifiedCandidates).to.deep.equal([
        { recipient: aliceAddress, votes: 4 },
        { recipient: bobAddress, votes: 3 },
      ]);

      // Retrieve the second page (Page 2, Page size 2)
      candidatesInOrder = await voting.getCandidatesInOrder(2, 2);

      simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(simplifiedCandidates).to.deep.equal([
        { recipient: janeAddress, votes: 2 },
        { recipient: alishaAddress, votes: 1 },
      ]);
    });

    it("should correctly handle zero votes and candidates with same number of votes", async () => {
      const { voting, alice, bob, jane, alisha, mario } = await loadFixture(
        deployVotingFixture
      );

      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      const janeAddress = await jane.getAddress();
      const alishaAddress = await alisha.getAddress();
      const marioAddress = await mario.getAddress();

      // Initial Votes
      await voting.connect(alice).castMockVoteVote(aliceAddress, 3);
      await voting.connect(bob).castMockVoteVote(bobAddress, 3);
      await voting.connect(jane).castMockVoteVote(janeAddress, 2);
      await voting.connect(alisha).castMockVoteVote(alishaAddress, 0);

      // Cast vote for a new candidate with votes same as an existing candidate
      await voting.connect(mario).castMockVoteVote(marioAddress, 2);

      let candidatesInOrder = await voting.getCandidatesInOrder(5, 1);

      let simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(simplifiedCandidates).to.deep.equal([
        { recipient: aliceAddress, votes: 3 },
        { recipient: bobAddress, votes: 3 },
        { recipient: janeAddress, votes: 2 },
        { recipient: marioAddress, votes: 2 },
        { recipient: alishaAddress, votes: 0 },
      ]);
    });

    it("should correctly handle pagination in getCandidatesInOrder", async () => {
      const { voting, alice, bob, jane, alisha, mario, luigi } =
        await loadFixture(deployVotingFixture);

      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      const janeAddress = await jane.getAddress();
      const alishaAddress = await alisha.getAddress();
      const marioAddress = await mario.getAddress();
      const luigiAddress = await luigi.getAddress();

      // Initial Votes
      await voting.connect(alice).castMockVoteVote(aliceAddress, 5);
      await voting.connect(bob).castMockVoteVote(bobAddress, 4);
      await voting.connect(jane).castMockVoteVote(janeAddress, 3);
      await voting.connect(alisha).castMockVoteVote(alishaAddress, 2);
      await voting.connect(mario).castMockVoteVote(marioAddress, 1);
      await voting.connect(luigi).castMockVoteVote(luigiAddress, 0);

      // Fetch the first page with pageSize = 3
      let candidatesInOrder = await voting.getCandidatesInOrder(3, 1);
      let simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(simplifiedCandidates).to.deep.equal([
        { recipient: aliceAddress, votes: 5 },
        { recipient: bobAddress, votes: 4 },
        { recipient: janeAddress, votes: 3 },
      ]);

      // Fetch the second page with pageSize = 3
      candidatesInOrder = await voting.getCandidatesInOrder(3, 2);
      simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(simplifiedCandidates).to.deep.equal([
        { recipient: alishaAddress, votes: 2 },
        { recipient: marioAddress, votes: 1 },
        { recipient: luigiAddress, votes: 0 },
      ]);
    });

    it("should correctly paginate candidates", async () => {
      const { voting, alice, bob, jane, alisha } = await loadFixture(
        deployVotingFixture
      );

      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      const janeAddress = await jane.getAddress();
      const alishaAddress = await alisha.getAddress();

      // Initial Votes
      await voting.connect(alice).castMockVoteVote(aliceAddress, 4);
      await voting.connect(bob).castMockVoteVote(bobAddress, 3);
      await voting.connect(jane).castMockVoteVote(janeAddress, 2);
      await voting.connect(alisha).castMockVoteVote(alishaAddress, 1);

      // Get the first page with 2 candidates
      let candidatesInOrder = await voting.getCandidatesInOrder(2, 1);

      let simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(simplifiedCandidates).to.deep.equal([
        { recipient: aliceAddress, votes: 4 },
        { recipient: bobAddress, votes: 3 },
      ]);

      // Get the second page with 2 candidates
      candidatesInOrder = await voting.getCandidatesInOrder(2, 2);

      simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(simplifiedCandidates).to.deep.equal([
        { recipient: janeAddress, votes: 2 },
        { recipient: alishaAddress, votes: 1 },
      ]);

      // Get a page that should be empty
      candidatesInOrder = await voting.getCandidatesInOrder(2, 3);

      simplifiedCandidates = candidatesInOrder
        .map((c) => {
          return {
            recipient: c.recipient.toString(),
            votes: parseInt(c.votes.toString()),
          };
        })
        .filter((c) => c.recipient !== ZERO_ADDRESS && c.votes !== 0);

      expect(simplifiedCandidates).to.deep.equal([]);
    });

    it("should return an empty array when there are no candidates", async () => {
      const { voting } = await loadFixture(deployVotingFixture);

      // Get candidates when the list is empty
      let candidatesInOrder = await voting.getCandidatesInOrder(2, 1);

      const simplifiedCandidates = candidatesInOrder
        .map((c) => {
          return {
            recipient: c.recipient.toString(),
            votes: parseInt(c.votes.toString()),
          };
        })
        .filter((c) => c.recipient !== ZERO_ADDRESS && c.votes !== 0);

      expect(simplifiedCandidates).to.deep.equal([]);
    });

    // Pagination Bounds
    it("should reject invalid pagination settings", async () => {
      const { voting } = await loadFixture(deployVotingFixture);

      await expect(voting.getCandidatesInOrder(0, 1)).to.be.revertedWith(
        "PageSize must be greater than zero"
      );
      await expect(voting.getCandidatesInOrder(10, 0)).to.be.revertedWith(
        "Page must be greater than zero"
      );

      // Not possible to do thanks to uint256
      //   await expect(voting.getCandidatesInOrder(-1, 1)).to.be.revertedWith(
      //     "PageSize must be greater than zero"
      //   );
      //   await expect(voting.getCandidatesInOrder(10, -1)).to.be.revertedWith(
      //     "Page must be greater than zero"
      //   );
    });

    // Empty List
    it("should handle empty candidate list gracefully", async () => {
      const { voting } = await loadFixture(deployVotingFixture);

      const candidatesInOrder = await voting.getCandidatesInOrder(10, 1);
      expect(
        candidatesInOrder.filter(
          (c) => c.recipient !== ZERO_ADDRESS && c.votes !== BigInt(0)
        )
      ).to.deep.equal([]);
    });

    // Partial Fill
    it("should handle partial fill correctly", async () => {
      const { voting, alice, bob } = await loadFixture(deployVotingFixture);

      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();

      await voting.connect(alice).castMockVoteVote(aliceAddress, 2);
      await voting.connect(bob).castMockVoteVote(bobAddress, 3);

      const candidatesInOrder = await voting.getCandidatesInOrder(10, 1);

      const simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(
        simplifiedCandidates.filter(
          (c) => c.recipient !== ZERO_ADDRESS && c.votes !== 0
        )
      ).to.deep.equal([
        { recipient: bobAddress, votes: 3 },
        { recipient: aliceAddress, votes: 2 },
      ]);
    });

    // Out-of-bounds Page
    it("should return only empty elements for out-of-bounds page numbers", async () => {
      const { voting, alice, bob } = await loadFixture(deployVotingFixture);

      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();

      await voting.connect(alice).castMockVoteVote(aliceAddress, 2);
      await voting.connect(bob).castMockVoteVote(bobAddress, 3);

      const candidatesInOrder = await voting.getCandidatesInOrder(2, 2);
      expect(
        candidatesInOrder.filter(
          (c) => c.recipient !== ZERO_ADDRESS && c.votes !== BigInt(0)
        )
      ).to.deep.equal([]);
    });

    // Exact Fit
    it("should return all candidates when pageSize equals number of candidates", async () => {
      const { voting, alice, bob } = await loadFixture(deployVotingFixture);

      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();

      await voting.connect(alice).castMockVoteVote(aliceAddress, 2);
      await voting.connect(bob).castMockVoteVote(bobAddress, 3);

      const candidatesInOrder = await voting.getCandidatesInOrder(2, 1);

      const simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(simplifiedCandidates).to.deep.equal([
        { recipient: bobAddress, votes: 3 },
        { recipient: aliceAddress, votes: 2 },
      ]);
    });

    // Ordering
    it("should return candidates in descending order of votes", async () => {
      const { voting, alice, bob, jane } = await loadFixture(
        deployVotingFixture
      );

      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      const janeAddress = await jane.getAddress();

      await voting.connect(jane).castMockVoteVote(janeAddress, 1);
      await voting.connect(bob).castMockVoteVote(bobAddress, 3);
      await voting.connect(alice).castMockVoteVote(aliceAddress, 2);

      const candidatesInOrder = await voting.getCandidatesInOrder(3, 1);

      const simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(simplifiedCandidates).to.deep.equal([
        { recipient: bobAddress, votes: 3 },
        { recipient: aliceAddress, votes: 2 },
        { recipient: janeAddress, votes: 1 },
      ]);
    });
  });

  describe("Voting", function () {
    it("should initialize with correct default values", async () => {
      const { voting, deployer, alice, bob, jane, alisha } = await loadFixture(
        deployVotingFixture
      );

      expect(await voting.head()).to.equal(0);
      expect(await voting.tail()).to.equal(0);
      expect(await voting.nextId()).to.equal(1);
    });

    it("should allow casting a vote", async () => {
      const { voting, deployer, alice, bob, jane, alisha } = await loadFixture(
        deployVotingFixture
      );

      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      const janeAddress = await jane.getAddress();
      const alishaAddress = await alisha.getAddress();

      // Alice casts a vote for herself
      await voting.connect(alice).castMockVoteVote(aliceAddress, 2);
      // Bob casts a vote for Alice
      await voting.connect(bob).castMockVoteVote(aliceAddress, 1);
      // Jane comes in and casts a vote for Bob
      await voting.connect(jane).castMockVoteVote(bobAddress, 1);
      // Alisha comes in an casts a vote for Jane
      await voting.connect(alisha).castMockVoteVote(janeAddress, 1);
      // Score: Alice 3 Bob 2 Jane 1

      const candidatesInOrder = await voting.getCandidatesInOrder(5, 1);

      //   Alice should be the winner
      expect(candidatesInOrder[0][0]).to.equal(aliceAddress);
      // Bob should be in second place
      expect(candidatesInOrder[1][0]).to.equal(bobAddress);
      // Jane should be the third place because she was voted after bob
      expect(candidatesInOrder[2][0]).to.equal(janeAddress);
    });

    it("should correctly order candidates based on votes", async () => {
      const { voting, deployer, alice, bob, jane, alisha } = await loadFixture(
        deployVotingFixture
      );

      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
      const janeAddress = await jane.getAddress();
      const alishaAddress = await alisha.getAddress();

      // Initial Votes
      await voting.connect(alice).castMockVoteVote(aliceAddress, 2);
      await voting.connect(bob).castMockVoteVote(bobAddress, 4);
      await voting.connect(jane).castMockVoteVote(janeAddress, 3);
      await voting.connect(alisha).castMockVoteVote(alishaAddress, 1);

      let candidatesInOrder = await voting.getCandidatesInOrder(4, 1);

      const simplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(simplifiedCandidates).to.deep.equal([
        { recipient: bobAddress, votes: 4 },
        { recipient: janeAddress, votes: 3 },
        { recipient: aliceAddress, votes: 2 },
        { recipient: alishaAddress, votes: 1 },
      ]);

      // Additional Votes
      await voting.connect(alice).castMockVoteVote(aliceAddress, 1);
      await voting.connect(alisha).castMockVoteVote(janeAddress, 2);

      candidatesInOrder = await voting.getCandidatesInOrder(4, 1);

      const newSimplifiedCandidates = candidatesInOrder.map((c) => {
        return {
          recipient: c.recipient.toString(),
          votes: parseInt(c.votes.toString()),
        };
      });

      expect(newSimplifiedCandidates).to.deep.equal([
        { recipient: janeAddress, votes: 5 },
        { recipient: bobAddress, votes: 4 },
        { recipient: aliceAddress, votes: 3 },
        { recipient: alishaAddress, votes: 1 },
      ]);
    });
  });

  describe("New Functionality Tests", function () {
    it("should correctly identify if an address has received votes", async function () {
      const { voting, alice } = await loadFixture(deployVotingFixture);
      const aliceAddress = await alice.getAddress();
  
      // Cast a vote for Alice
      await voting.connect(alice).castMockVoteVote(aliceAddress, 1);
  
      // Check if Alice has received votes
      expect(await voting.hasReceivedVotes(aliceAddress)).to.be.true;
    });
  
    it("should return false for an address that has not received any votes", async function () {
      const { voting, alice, bob } = await loadFixture(deployVotingFixture);

      const aliceAddress = await alice.getAddress();

      const bobAddress = await bob.getAddress();
  
      // Alice casts a vote, but not for Bob
      await voting.connect(alice).castMockVoteVote(aliceAddress, 1);
  
      // Check if Bob has received votes
      expect(await voting.hasReceivedVotes(bobAddress)).to.be.false;
    });
  
    it("should correctly return the total number of unique results", async function () {
      const { voting, alice, bob } = await loadFixture(deployVotingFixture);
      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
  
      // Cast votes for Alice and Bob
      await voting.connect(alice).castMockVoteVote(aliceAddress, 1);
      await voting.connect(bob).castMockVoteVote(bobAddress, 1);
  
      // Check the total number of unique results
      expect(await voting.getTotalNodeCount()).to.equal(2);
    });
  
    it("should correctly identify the position of a given address", async function () {
      const { voting, alice, bob } = await loadFixture(deployVotingFixture);
      const aliceAddress = await alice.getAddress();
      const bobAddress = await bob.getAddress();
  
      // Cast votes for Alice and Bob
      await voting.connect(alice).castMockVoteVote(aliceAddress, 3);
      await voting.connect(bob).castMockVoteVote(bobAddress, 2);
  
      // Check the position of Alice and Bob
      expect(await voting.getPositionByAddress(aliceAddress)).to.equal(1);
      expect(await voting.getPositionByAddress(bobAddress)).to.equal(2);
    });
  
    it("should return 0 for the position of an address that has not received any votes", async function () {
      const { voting, alice, bob } = await loadFixture(deployVotingFixture);
      const bobAddress = await bob.getAddress();
      const aliceAddress = await alice.getAddress();

  
      // Alice casts a vote, but not for Bob
      await voting.connect(alice).castMockVoteVote(aliceAddress, 1);
  
      // Check the position of Bob
      expect(await voting.getPositionByAddress(bobAddress)).to.equal(0);
    });
  });
  
});
