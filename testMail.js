const sendMail = require("./utils/sendMail"); // Adjust path if needed

async function test() {
  try {
    const info = await sendMail("rankzilla.results@gmail.com"); // Replace with your real email
    console.log("Test email sent successfully:", info);
  } catch (error) {
    console.error("Failed to send test email:", error);
  }
}

test();