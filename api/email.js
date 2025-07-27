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
                { guestEmail: { [Op.ne]: null } },
              ],
            },
            include: [
              {
                model: User,
                attributes: ["email"],
                required: false,
              },
            ],
            attributes: ["userId", "guestEmail"],
          });

        const voterEmails = voters
        .map((vote) => vote.guestEmail || (vote.User ? vote.User.email : null))
        .filter((email) => email !== null);

        if (voterEmails.length === 0) {
            return res.status(404).json({ error: "No voters found for this poll." });
        }

        // send email to each voter
        const result = await sendMail(voterEmails);

        res.status(200).json({ message: "Email sent successfully", result });
    }
    catch (error) {
        console.error("Error sending email:", error);
        res.status(500).json({ error: "Failed to send email" });
    }

});

module.exports = router;