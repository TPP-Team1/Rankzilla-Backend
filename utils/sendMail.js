require(dotenv).config();
const nodemailer = require("nodemailer");

const sendMail = async (to) => {
    try{
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER, // email address
                pass: process.env.EMAIL_PASS, // app password
            },
        });
    }
    catch (error) {
        
    }
};

export default sendMail;