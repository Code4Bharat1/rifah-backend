import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: parseInt(process.env.SMTP_PORT || "587", 10) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function main() {
  console.log("Using USER:", process.env.SMTP_USER);
  console.log("Using PASS:", process.env.SMTP_PASS ? "***" : "undefined");
  try {
    const info = await transporter.sendMail({
      from: `"RIFAH Secretariat" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER, // send to self for testing
      subject: "Test Email from RIFAH Backend",
      text: "This is a test email.",
    });
    console.log("Email sent successfully: " + info.messageId);
  } catch (err) {
    console.error("Failed to send email:", err.message);
  }
}

main();
