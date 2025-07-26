const express = require("express");
const sendMail = require("../utils/sendMail");
const router = express.Router();

router.post("/send-email", async (req, res) => {
    const { to } = req.body;

    try{
        const result = await sendMail(to);
        res.status(200).json({ message: "Email sent successfully", result });
    }
    catch (error) {
        console.error("Error sending email:", error);
        res.status(500).json({ error: "Failed to send email" });
    }

});

module.exports = router;