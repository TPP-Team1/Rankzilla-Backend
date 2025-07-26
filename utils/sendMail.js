require("dotenv").config();
const nodemailer = require("nodemailer");


const sendMail = async (to) => {
    try{
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER, // email address
                pass: process.env.EMAIL_PASSWORD, // app password
            },
        });

        const mailResults = {
            from: `Rankzilla <${process.env.EMAIL_USER}>`, // sender address
            to,
            subject: "Poll Results Are Out!",
            text: "Here are the results of the poll you voted on!",
        };

        const info = await transporter.sendMail(mailResults);
        console.log("Email sent: ", info.messageId);
        return info;
    }
    catch (error) {
        console.error("Error sending email:", error);
        throw error;
    }
};

module.exports = sendMail;