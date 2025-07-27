const express = require("express");
const sendMail = require("../utils/sendMail");
const router = express.Router();
const { Vote, User } = require("../database");
const { Op } = require("sequelize");

router.post("/send-email/:pollId", async (req, res) => {
  const { pollId } = req.params;

  try {
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

    // console.log("Got all emails")

    const voterEmails = voters
      .map((vote) => vote.email || (vote.User ? vote.User.email : null))
      .filter((email) => email !== null);

    // console.log("emails---->", voterEmails)

    // send email to each voter
    const result = await sendMail(voterEmails);
    // console.log("Email was sent maybe")

    res.status(200).json({ message: "Email sent successfully", result });
  }
  catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: "Failed to send email" });
  }

});

module.exports = router;