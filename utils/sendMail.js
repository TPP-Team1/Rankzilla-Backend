require("dotenv").config();
const nodemailer = require("nodemailer");


const sendMail = async (recipients, resultMessage) => {
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
            to: recipients,
            subject: "Poll Results Are Out!",
            text: `Thank you for participating in the poll!\n\n${resultMessage}`,
            html: `<p>Thank you for participating in the poll!</p><p><strong>${resultMessage}</strong></p>`
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