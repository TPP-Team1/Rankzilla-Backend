const express = require("express");
const router = express.Router();
const { Poll, PollOption, Vote, VotingRank } = require("../database");
const { authenticateJWT, blockIfDisabled, isAdmin, optionalAuth } = require("../auth");
const { where, Model } = require("sequelize");
const { Op } = require("sequelize"); // Op = Sequelize's operator tool (like AND, OR, NOT, etc.)


// Get all users Polls----------------------------
router.get("/", authenticateJWT, async (req, res) => {
  const userId = req.user.id;

  try {
    // Get all votes submitted by this user
    const userVotes = await Vote.findAll({ where: { userId } });

    // Extract poll IDs that this user has voted in
    const votedPollIds = [...new Set(userVotes.map(vote => vote.pollId))];
    console.log("User voted in poll IDs:", votedPollIds);

    // Get all polls created by this user
    const createdPolls = await Poll.findAll({
      where: { userId },
      include: [{ model: PollOption }], // optional, fetches options if needed
    });

    // Get all polls the user voted in, but DIDN'T create
    const votedPolls = votedPollIds.length > 0
      ? await Poll.findAll({
        where: {
          id: votedPollIds,              // poll ID is in the user's vote list
          userId: { [Op.ne]: userId },   // but NOT created by this user (Op.ne = "not equal")
        },
        include: [{ model: PollOption }],
      })
      : []; // fallback in case user has no votes

    console.log("Created polls:", createdPolls.length);
    console.log("Voted (not owned) polls:", votedPolls.length);

    //Format results to mark `created` or `participated` for frontend filters
    const formattedCreated = createdPolls.map(poll => ({
      ...poll.toJSON(),
      created: true,
      participated: false,
    }));

    const formattedVoted = votedPolls.map(poll => ({
      ...poll.toJSON(),
      created: false,
      participated: true,
    }));

    //Combine both into one clean array
    const allPolls = [...formattedCreated, ...formattedVoted];

    res.json(allPolls);
  } catch (error) {
    console.error("Error in GET /api/polls:", error);
    res.status(500).json({ error: "Failed to fetch polls" });
  }
});

//Get all draft polls by user--------------------

router.get("/draft", authenticateJWT, async (req, res) => {
  const userId = req.user.id;
  try {
    const draftPolls = await Poll.findAll({
      where: {
        userId,
        status: "draft",
      },
    });
    const specialDelivery = {
      message:
        draftPolls.length === 0
          ? "There no polls to display"
          : "Polls successfully retrived",
      polls: draftPolls, // polls is an array of objects
    };

    specialDelivery.polls.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    specialDelivery.polls.map((poll) => {
      console.log(poll.createdAt);
    });

    res.status(200).json(specialDelivery);
  } catch (error) {
    res.status(500).json({ error: "Failed to get drafted polls" });
  }
});

// Get polls by slug
router.get("/slug/:slug", async (req, res) => {
  try {
    const pollSlug = req.params.slug;
    const poll = await Poll.findOne({
      where: { slug: pollSlug },
      include: [
        {
          model: PollOption,
        },
      ],
    });

    if (!poll) {
      return res.status(404).json({ error: "Poll not found" });
    }

    if (poll.authRequired && !req.user) {
      return res.status(401).json({ error: "Login required to view this poll" });
    }


    res.json(poll);
  } catch (error) {
    res.status(500).json({ error: "Failed to get poll" });
  }
});

//Get a users poll by id with options-----------------
router.get("/:pollId", authenticateJWT, async (req, res) => {
  const userId = req.user.id;
  const { pollId } = req.params;
  console.log("Fetching poll with ID:", pollId);

  try {
    // fetch a spcific poll with options that belong to this user
    const poll = await Poll.findOne({
      where: {
        id: pollId,
        userId: userId,
      },
      include: [
        { model: PollOption },
        { model: Vote },
      ],

    });

    if (!poll) {
      return res.status(404).json({ error: "No polls found" });
    }
    res.json(poll);
  } catch (error) {
    console.error("Error fetching poll:", error);
    res.status(500).json({ error: "Failed to get poll by ID" });
  }
});

// Create polls---------------------------
router.post("/", authenticateJWT, blockIfDisabled, async (req, res) => {
  const userId = req.user.id;
  const {
    title,
    description,
    deadline,
    status,
    options = [],
    authRequired,
    allowSharedLinks,
  } = req.body;

  if (status === "published" && options.length < 2) {
    return res.status(400).json({
      error: " 2 options are requires to  publish a poll",
    });
  }
  try {
    const newPoll = await Poll.create({
      title,
      description,
      deadline,
      status,
      authRequired,
      allowSharedLinks,
      userId,
    });
    //[opttion1, option2, option3]
    if (options.length > 0) {
      const formattedOptions = options.map((text) => ({
        optionText: text,
        pollId: newPoll.id,
      }));

      await PollOption.bulkCreate(formattedOptions);
      return res.status(201).json({
        message: "Poll and options created",
        poll: newPoll,
      });
    }
    return res.json(newPoll);
  } catch (error) {
    console.error("Poll creation failed:", error);
    res.status(500).json({
      error: "Failed to create poll",
      message: "Check that API fields and data are correct",
    });
  }
});

//Edit polls--------------------
router.patch("/:pollId", authenticateJWT, async (req, res) => {
  const userId = req.user.id;
  const poll = req.body;
  const { title, description, deadline, status, options = [] } = req.body;
  const newBody = {
    title,
    description,
    deadline,
    status,
  };
  const { pollId } = req.params;

  try {
    const updatePoll = await Poll.findByPk(pollId);

    if (!updatePoll) {
      return res.status(404).json({ error: "poll not found" });
    } else if (updatePoll.userId !== userId) {
      return res
        .status(403)
        .json({ error: "poll does not belong to this user" });
    } else if (updatePoll.isDisabled) {
      return res.status(403).json({ error: "Poll is disabled and cannot be edited" });
    }

    if (updatePoll.status === "draft") {
      const updatedPoll = await updatePoll.update(newBody);
      const optionsToDestroy = await PollOption.destroy({ where: { pollId } });

      // [option1, option2, option3]
      // formattedOptions = [
      //     {
      //         optionText: 'option1',
      //         pollId: pollId,
      //     },
      //     {
      //         optionText: 'option2',
      //         pollId: pollId,
      //     },
      //     {
      //         optionText: 'option3',
      //         pollId: pollId,
      //     }
      // ];

      const formattedOptions = await options.map((text) => ({
        optionText: text,
        pollId: pollId,
      }));

      const newPollOptions = await PollOption.bulkCreate(formattedOptions);

      return res.json(newBody);
    }

    if (updatePoll.status === "published") {
      const updateDeadline = await updatePoll.update({ deadline, status });
      return res.json(updateDeadline);
    }
    return res
      .status(400)
      .json({ error: "Invalid poll status string or update not allowed" });

    ///email
    



  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({
      error: "Failed to update poll",
      message: "Only deadline can be edited when poll is published",
    });
  }
});

//delete draft poll-------------------------
router.delete("/:id", authenticateJWT, async (req, res) => {
  try {
    const pollId = req.params.id;
    const userId = req.user.id;

    const poll = await Poll.findByPk(pollId);

    if (!poll) {
      return res.status(404).json({ error: "Poll not found" });
    }

    if (poll.userId !== userId) {
      return res.status(401).json({ error: "Unauthorized action: You do not own this poll" });
    }

    await poll.destroy();

    res.json({ message: "Poll deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete poll" });
  }
});

// --------------------- Create Vote (Draft Only) ---------------------
router.post("/:pollId/vote", optionalAuth, blockIfDisabled, async (req, res) => {
  const { pollId } = req.params;
  const { email } = req.body;
  const userId = req.user?.id || null;

  try {
    // Block duplicate votes for authenticated users
    if (userId) {
      const existingVote = await Vote.findOne({ where: { pollId, userId } });
      if (existingVote) {
        return res.status(409).json({ error: "Vote already exists" });
      }
    }

    // Validate email for guests
    if (!userId && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return res.status(400).json({ error: "Valid email is required for guests" });
    }

    // Create a draft vote
    const vote = await Vote.create({
      userId,
      pollId,
      email: userId ? null : email,
      submitted: false,
    });

    return res.status(201).json(vote);
  } catch (err) {
    console.error("Vote creation error:", err);
    return res.status(500).json({ error: "Failed to create vote" });
  }
});

// --------------------- Submit or Save Draft Vote ---------------------
router.patch("/:pollId/vote/:voteId", optionalAuth, async (req, res) => {
  const { pollId, voteId } = req.params;
  const { rankings, submitted } = req.body;
  const userId = req.user?.id || null;

  try {
    // Look up the vote — must match pollId and either belong to logged-in user or be anonymous
    const vote = await Vote.findOne({
      where: {
        id: voteId,
        pollId,
        [Op.or]: [{ userId }, { userId: null }],
      },
    });

    if (!vote) return res.status(404).json({ error: "Vote not found" });
    if (vote.submitted) return res.status(403).json({ error: "Vote already submitted" });

    // Update rankings if provided
    if (Array.isArray(rankings)) {
      await VotingRank.destroy({ where: { voteId } });

      const newRanks = rankings.map((r) => ({
        voteId,
        pollOptionId: r.optionId,
        rank: r.rank,
      }));
      await VotingRank.bulkCreate(newRanks);
    }

    // If submitted, finalize the vote
    if (submitted === true) {
      await vote.update({ submitted: true });

      // Recount participants
      const count = await Vote.count({
        where: { pollId, submitted: true },
      });
      await Poll.update({ participants: count }, { where: { id: pollId } });

      return res.status(200).json({ message: "Vote submitted" });
    }

    // Otherwise, just saved as draft (only for logged-in users)
    return res.status(200).json({ message: "Draft saved" });
  } catch (err) {
    console.error("Vote update error:", err);
    return res.status(500).json({ error: "Failed to update vote" });
  }
});

// get the current user's submission for a poll-----------------------------
router.get("/:pollId/vote", authenticateJWT, async (req, res) => {
  const userId = req.user.id;
  const { pollId } = req.params;
  try {
    const vote = await Vote.findOne({
      where: { userId, pollId },
      include: {
        model: VotingRank,
        include: {
          model: PollOption,
          attributes: ["id", "optionText"],
        },
      },
    });
    if (!vote) {
      return res.status(404).json({ error: "No submission found for this poll" });
    }
    res.json(vote);
  } catch (error) {
    console.error("Error fetching user submission:", error);
    res.status(500).json({ error: "Failed to fetch user submission" });
  }
});




//------------------------------------ Calculate results -------------------------------------------------------- 

router.get("/:pollId/results", blockIfDisabled, async (req, res) => {

  const { pollId } = req.params;

  const votes = await Vote.findAll({
    where: { pollId: pollId },
    include: { model: VotingRank },
  });
  //   [
  //     {
  //         "id": 1,
  //         "submitted": true,
  //         "voterToken": null,
  //         "ipAddress": null,
  //         "userId": 2,
  //         "pollId": 1,
  //         "createdAt": "2025-07-24T07:04:10.459Z",
  //         "updatedAt": "2025-07-24T07:04:10.459Z",
  //         "votingRanks": [
  //             {
  //                 "id": 1,
  //                 "voteId": 1,
  //                 "pollOptionId": 1,
  //                 "rank": 1,
  //                 "createdAt": "2025-07-24T07:04:10.475Z",
  //                 "updatedAt": "2025-07-24T07:04:10.475Z"
  //             },
  //             {
  //                 "id": 2,
  //                 "voteId": 1,
  //                 "pollOptionId": 2,
  //                 "rank": 2,
  //                 "createdAt": "2025-07-24T07:04:10.475Z",
  //                 "updatedAt": "2025-07-24T07:04:10.475Z"
  //             },
  //             {
  //                 "id": 3,
  //                 "voteId": 1,
  //                 "pollOptionId": 3,
  //                 "rank": 3,
  //                 "createdAt": "2025-07-24T07:04:10.475Z",
  //                 "updatedAt": "2025-07-24T07:04:10.475Z"
  //             },
  //             {
  //                 "id": 4,
  //                 "voteId": 1,
  //                 "pollOptionId": 4,
  //                 "rank": 4,
  //                 "createdAt": "2025-07-24T07:04:10.475Z",
  //                 "updatedAt": "2025-07-24T07:04:10.475Z"
  //             },
  //             {
  //                 "id": 5,
  //                 "voteId": 1,
  //                 "pollOptionId": 5,
  //                 "rank": 5,
  //                 "createdAt": "2025-07-24T07:04:10.475Z",
  //                 "updatedAt": "2025-07-24T07:04:10.475Z"
  //             },
  //             {
  //                 "id": 6,
  //                 "voteId": 1,
  //                 "pollOptionId": 5,
  //                 "rank": 5,
  //                 "createdAt": "2025-07-24T07:04:10.475Z",
  //                 "updatedAt": "2025-07-24T07:04:10.475Z"
  //             }
  //         ]
  //     }
  // ]

  const allBallots = votes.map(vote => vote.votingRanks);
  //   [
  //     [
  //         {
  //             "id": 1,
  //             "voteId": 1,
  //             "pollOptionId": 1,
  //             "rank": 1,
  //             "createdAt": "2025-07-24T07:04:10.475Z",
  //             "updatedAt": "2025-07-24T07:04:10.475Z"
  //         },
  //         {
  //             "id": 2,
  //             "voteId": 1,
  //             "pollOptionId": 2,
  //             "rank": 2,
  //             "createdAt": "2025-07-24T07:04:10.475Z",
  //             "updatedAt": "2025-07-24T07:04:10.475Z"
  //         },
  //         {
  //             "id": 3,
  //             "voteId": 1,
  //             "pollOptionId": 3,
  //             "rank": 3,
  //             "createdAt": "2025-07-24T07:04:10.475Z",
  //             "updatedAt": "2025-07-24T07:04:10.475Z"
  //         },
  //         {
  //             "id": 4,
  //             "voteId": 1,
  //             "pollOptionId": 4,
  //             "rank": 4,
  //             "createdAt": "2025-07-24T07:04:10.475Z",
  //             "updatedAt": "2025-07-24T07:04:10.475Z"
  //         },
  //         {
  //             "id": 5,
  //             "voteId": 1,
  //             "pollOptionId": 5,
  //             "rank": 5,
  //             "createdAt": "2025-07-24T07:04:10.475Z",
  //             "updatedAt": "2025-07-24T07:04:10.475Z"
  //         },
  //         {
  //             "id": 6,
  //             "voteId": 1,
  //             "pollOptionId": 5,
  //             "rank": 5,
  //             "createdAt": "2025-07-24T07:04:10.475Z",
  //             "updatedAt": "2025-07-24T07:04:10.475Z"
  //         }
  //     ]
  // ]

  const ballots = allBallots.map(ballot => {
    return ballot
      .sort((a, b) => a.rank - b.rank)
      .map((element) => element.pollOptionId)
  })

  //   [
  //     [
  //         7,
  //         8,
  //         9,
  //         10
  //     ],
  //     [
  //         10,
  //         9,
  //         8,
  //         7
  //     ]
  // ]
  const options = await PollOption.findAll({ where: { pollId: pollId } })
  //   [
  //     {
  //         "id": 1,
  //         "optionText": "Demon Slayer",
  //         "position": 1,
  //         "pollId": 1,
  //         "createdAt": "2025-07-24T07:01:09.263Z",
  //         "updatedAt": "2025-07-24T07:01:09.263Z"
  //     },
  //     {
  //         "id": 2,
  //         "optionText": "One Piece",
  //         "position": 2,
  //         "pollId": 1,
  //         "createdAt": "2025-07-24T07:01:09.263Z",
  //         "updatedAt": "2025-07-24T07:01:09.263Z"
  //     },
  //     {
  //         "id": 3,
  //         "optionText": "AOT",
  //         "position": 3,
  //         "pollId": 1,
  //         "createdAt": "2025-07-24T07:01:09.263Z",
  //         "updatedAt": "2025-07-24T07:01:09.263Z"
  //     },
  //     {
  //         "id": 4,
  //         "optionText": "Naruto",
  //         "position": 4,
  //         "pollId": 1,
  //         "createdAt": "2025-07-24T07:01:09.263Z",
  //         "updatedAt": "2025-07-24T07:01:09.263Z"
  //     },
  //     {
  //         "id": 5,
  //         "optionText": "Devil May Cry",
  //         "position": 5,
  //         "pollId": 1,
  //         "createdAt": "2025-07-24T07:01:09.263Z",
  //         "updatedAt": "2025-07-24T07:01:09.263Z"
  //     },
  //     {
  //         "id": 6,
  //         "optionText": "Castlevania",
  //         "position": 6,
  //         "pollId": 1,
  //         "createdAt": "2025-07-24T07:01:09.263Z",
  //         "updatedAt": "2025-07-24T07:01:09.263Z"
  //     }
  // ]

  const optionsMap = {};

  for (const option of options) {
    optionsMap[option.id] =
    {
      name: option.optionText,
      count: 0,
      eliminated: false,
    };
  }
  //  {
  //     "7": {
  //         "name": "Die Hard",
  //         "count": 0,
  //         "elimated": 
  //     },
  //     "8": {
  //         "name": "Die Hard 2",
  //         "count": 0,
  //         "elimated": 
  //     },
  //     "9": {
  //         "name": "Twilight",
  //         "count": 0,
  //         "elimated": 
  //     },
  //     "10": {
  //         "name": "Spiderverse",
  //         "count": 0,
  //         "elimated": 
  //     }
  // }

  const totalVotes = ballots.length;
  // console.log(totalVotes)
  const majorityThreshhold = Math.floor(totalVotes / 2) + 1;
  // console.log(majorityThreshhold)


  let foundWinner = false;

  // Front end needs the options that were eliminated for each round to include their count ------>
  let roundNumber = 1;
  let roundResults = [];

  while (!foundWinner) {

    for (const option of Object.values(optionsMap)) {
      option.count = 0;
    }
    //   [
    //     [
    //         1,
    //         2,
    //         3,
    //         4
    //     ],
    //     [
    //         10,
    //         9,
    //         8,
    //         7
    //     ]
    // ]
    for (const ballot of ballots) {
      for (const optionId of ballot) {
        const option = optionsMap[optionId];
        if (!option.eliminated) {
          option.count += 1;
          break;
        }
      }
    }
    //     {
    //   '1': { name: 'Demon Slayer', count: 1, eliminated: false },
    //   '2': { name: 'One Piece', count: 0, eliminated: true },
    //   '3': { name: 'AOT', count: 0, eliminated: true },
    //   '4': { name: 'Naruto', count: 0, eliminated: true },
    //   '5': { name: 'Devil May Cry', count: 0, eliminated: true },
    //   '6': { name: 'Castlevania', count: 0, eliminated: true }
    // }



    // Front end needs the options that were eliminated for each round to include their count ------>
    const currentRound = {
      round: roundNumber,
      results: {},
    };
    for (const [id, option] of Object.entries(optionsMap)) {
      currentRound.results[id] = {
        name: option.name,
        count: option.count,
        eliminated: option.eliminated
      };
    }
    roundResults.push(currentRound);
    roundNumber++;

    for (const [id, option] of Object.entries(optionsMap)) {
      if (option.count > majorityThreshhold) {
        foundWinner = true;
        return res.json({
          status: "winner",
          optionId: id,
          name: option.name,
          voteCount: option.count,
          totalVotes,
          rounds: roundResults
        });
      }
    }


    let minCount = Infinity;
    let optionToEliminate = [];


    for (const [optionId, option] of Object.entries(optionsMap)) {
      if (!option.eliminated) {
        if (option.count < minCount) {
          minCount = option.count;
          optionToEliminate = [optionId];
        } else if (option.count === minCount) {
          optionToEliminate.push(optionId)
        }
      }
    }


    const remaining = Object.values(optionsMap).filter((option) => !option.eliminated);

    if (remaining.length === optionToEliminate.length) {
      foundWinner = true
      return res.json({
        status: "tie",
        tiedOptions: optionToEliminate.map((id) => ({
          optionId: id,
          name: optionsMap[id].name,
          voteCount: optionsMap[id].count,
        })),
        totalVotes,
        rounds: roundResults
      });
    }


    for (const optionId of optionToEliminate) {
      optionsMap[optionId].eliminated = true
    }
  }



  // return res.send(options)
  // return res.send(votes)
  // return res.send(allBallots)
  // return res.send(ballots)
  //   [
  //     [
  //         7,
  //         8,
  //         9,
  //         10
  //     ],
  //     [
  //         10,
  //         9,
  //         8,
  //         7
  //     ]
  // ]
  // return res.send(options)
  return res.send(optionsMap)

  //  {
  //     "7": {
  //         "name": "Die Hard",
  //         "count": 0,
  //         "elimated": 0
  //     },
  //     "8": {
  //         "name": "Die Hard 2",
  //         "count": 0,
  //         "elimated": 0
  //     },
  //     "9": {
  //         "name": "Twilight",
  //         "count": 0,
  //         "elimated": 0
  //     },
  //     "10": {
  //         "name": "Spiderverse",
  //         "count": 0,
  //         "elimated": 0
  //     }
  // }
})

// admin route to fetch all polls---------------------------------------------------------------

router.get("/admin/all", authenticateJWT, isAdmin, async (req, res) => {

  try {
    const polls = await Poll.findAll({
      include: [{ model: PollOption }],
      attributes: { exclude: ["userId"] }, // exclude sensitive user info
    });
    res.json(polls);
  } catch (error) {
    console.error("Error fetching all polls:", error);
    res.status(500).json({ error: "Failed to fetch all polls" });
  }
});

// duplicate poll endpoint---------------------------------------------------------------
router.post('/:id/duplicate', authenticateJWT, async (req, res) => {
  try {
    const pollId = req.params.id;
    const userId = req.user.id;

    // fetch poll and options
    const poll = await Poll.findByPk(pollId, {
      include: { model: PollOption }
    });
    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }
    if (poll.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized: not your poll' });
    }

    // create new poll with same fields
    const newPoll = await Poll.create({
      title: poll.title + ' (copy)',
      description: poll.description,
      status: 'draft',
      userId: userId,
      deadline: poll.deadline,
      authRequired: poll.authRequired,
      restricted: poll.restricted
    });

    // generate unique slug
    await newPoll.update({ slug: `${poll.slug}-copy-${newPoll.id}` });

    // copy options
    const newOptions = poll.pollOptions.map((opt) => ({
      optionText: opt.optionText,
      pollId: newPoll.id,
      position: opt.position
    }));
    await PollOption.bulkCreate(newOptions);

    // fetch new poll with options
    const pollWithOptions = await Poll.findByPk(newPoll.id, {
      include: { model: PollOption }
    });

    res.status(201).json({
      message: 'Poll duplicated successfully',
      poll: pollWithOptions
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to duplicate poll' });
  }
});

// duplicate poll by id------------------------------------------------------------------------------------------
router.post('/:pollId/duplicate', authenticateJWT, async (req, res) => {
  const userId = req.user.id;
  const { pollId } = req.params;
  try {
    // fetch poll and options
    const poll = await Poll.findOne({
      where: { id: pollId, userId },
      include: { model: PollOption }
    });
    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }
    // create new poll
    const newPoll = await Poll.create({
      title: poll.title + ' (copy)',
      description: poll.description,
      status: 'draft',
      userId,
      deadline: poll.deadline,
      authRequired: poll.authRequired,
      restricted: poll.restricted
    });
    await newPoll.update({ slug: `${poll.slug}-copy-${newPoll.id}` });
    // copy options
    const newOptions = poll.pollOptions.map((opt) => ({
      optionText: opt.optionText,
      pollId: newPoll.id,
      position: opt.position
    }));
    await PollOption.bulkCreate(newOptions);
    // fetch new poll with options
    const pollWithOptions = await Poll.findOne({
      where: { id: newPoll.id, userId },
      include: { model: PollOption }
    });
    res.status(201).json({
      message: 'Poll duplicated successfully',
      poll: pollWithOptions
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to duplicate poll' });
  }
});

// PATCH /api/polls/:pollId/disable - admin only---------------------------------------------------------------
router.patch('/:pollId/disable', authenticateJWT, isAdmin, async (req, res) => {
  const { pollId } = req.params;
  try {
    const poll = await Poll.findByPk(pollId);
    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }
    poll.isDisabled = true;
    await poll.save();
    res.json({ message: 'Poll disabled', pollId: poll.id });
  } catch (error) {
    console.error('Error disabling poll:', error);
    res.status(500).json({ error: 'Failed to disable poll' });
  }
});

// GET /api/polls/participated - Polls where current user has voted
router.get("/participated", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    // Find all votes by this user
    const votes = await Vote.findAll({ where: { userId } });
    const pollIds = votes.map(v => v.pollId);
    if (pollIds.length === 0) {
      return res.json({ message: "No participated polls.", polls: [] });
    }
    // find all polls where user has voted
    const polls = await Poll.findAll({ where: { id: pollIds } });
    // label as participated
    const labeled = polls.map(p => ({ ...p.toJSON(), participated: true }));
    res.json({ message: "Participated polls retrieved.", polls: labeled });
  } catch (error) {
    console.error("Error fetching participated polls:", error);
    res.status(500).json({ error: "Failed to get participated polls" });
  }
});

// GET /api/polls/created - Polls created by current user
router.get("/created", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const polls = await Poll.findAll({ where: { userId } });
    // label as `created`
    const labeled = polls.map(p => ({ ...p.toJSON(), created: true }));
    res.json({ message: "Created polls retrieved.", polls: labeled });
  } catch (error) {
    console.error("Error fetching created polls:", error);
    res.status(500).json({ error: "Failed to get created polls" });
  }
});

module.exports = router;
