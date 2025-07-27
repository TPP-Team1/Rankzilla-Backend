const express = require("express");
const sendMail = require("../utils/sendMail");
const router = express.Router();
const { Vote, User } = require("../database");
const { Op } = require("sequelize");

router.post("/send-email/:pollId", async (req, res) => {
    const { pollId } = req.params;

    try{
        // get voter emails
        const voters = await Vote.findAll({
            where: {
              pollId,
              [Op.or]: [
                { userId: { [Op.ne]: null } },
                { email: { [Op.ne]: null } },
              ],
            },
            include: [
              {
                model: User,
                attributes: ["email"],
                required: false,
              },
            ],
            attributes: ["userId", "email"],
          });

        const voterEmails = voters
        .map((vote) => vote.email || (vote.User ? vote.User.email : null))
        .filter((email) => email !== null);

        if (voterEmails.length === 0) {
            return res.status(404).json({ error: "No voters found for this poll." });
        }
        

        // Fetch the poll results
    const backendBase = process.env.INTERNAL_BACKEND_URL || "http://localhost:8080"; // server-to-server
    const resultsRes = await fetch(`${backendBase}/api/polls/${pollId}/results`, {
    });

    const resultsData = await resultsRes.json();

    let resultSummary = "";

    if (resultsData.status === "winner") {
        resultSummary = `🏆 The winning option is **${resultsData.name}** with ${resultsData.voteCount} of ${resultsData.totalVotes} votes.`;
      } else if (resultsData.status === "tie") {
        const tiedNames = resultsData.tiedOptions.map(opt => opt.name).join(", ");
        const tiedVotes = resultsData.tiedOptions[0]?.voteCount ?? 0;
        if (resultsData.tiedOptions.length === 1) {
          // Just one tied option, treat like a winner
          resultSummary = `🏆 The winning option is **${tiedNames}** with ${tiedVotes} of ${resultsData.totalVotes} votes.`;
        } else {
          // Multiple tied options
          resultSummary = `⚖️ It's a tie between **${tiedNames}**, each receiving ${tiedVotes} votes.`;
        }
      } 

    // Send email to each voter with winner included
    const result = await sendMail(voterEmails, resultSummary);



        // send email to each voter
       // const result = await sendMail(voterEmails);

        res.status(200).json({ message: "Email sent successfully", result });
    }
    catch (error) {
        console.error("Error sending email:", error);
        res.status(500).json({ error: "Failed to send email" });
    }

});

module.exports = router;