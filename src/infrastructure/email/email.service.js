import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../logger/logger.js";

const transporter = nodemailer.createTransport({
  host: env.EMAIL?.HOST || "smtp.gmail.com",
  port: env.EMAIL?.PORT || 465,
  secure: (env.EMAIL?.PORT || 465) === 465,
  auth: {
    user: env.EMAIL?.USER,
    pass: env.EMAIL?.PASS,
  },
});

export const emailService = {
  /**
   * Sends an email notification or verification message
   * @param {Object} options - { to, subject, html, text }
   * @returns {Promise<boolean>}
   */
  sendEmail: async ({ to, subject, html, text }) => {
    try {
      if (!env.EMAIL?.USER || !env.EMAIL?.PASS) {
        logger.warn(`[EMAIL SIMULATED - NO CREDS] To: ${to} | Subject: ${subject}`);
        return true;
      }

      const info = await transporter.sendMail({
        from: `"RIFAH Secretariat" <${env.EMAIL.USER}>`,
        to,
        subject,
        text,
        html,
      });

      logger.info(`Email sent to ${to}: ${subject} (ID: ${info.messageId})`);
      return true;
    } catch (error) {
      logger.error(`Failed to send email to ${to}:`, error);
      return false;
    }
  },

  /**
   * Sends an invitation email to a new Chapter Admin
   */
  sendChapterAdminInvite: async (email, password, chapterName, adminName) => {
    const subject = `Welcome to RIFAH: ${chapterName} Admin Access`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0284c7;">Welcome to RIFAH Administration</h2>
        <p>Dear ${adminName},</p>
        <p>You have been appointed as the <strong>Chapter Admin</strong> for <strong>${chapterName}</strong>.</p>
        <p>You can now log in to the RIFAH Secretariat portal to manage businesses, leads, and verifications for your region.</p>
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Portal:</strong> <a href="http://localhost:3000/login">http://localhost:3000/login</a></p>
          <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 0;"><strong>Password:</strong> ${password}</p>
        </div>
        <p style="color: #64748b; font-size: 14px;">Please log in and change your password immediately.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">RIFAH Chamber of Commerce & Industries</p>
      </div>
    `;

    return emailService.sendEmail({ to: email, subject, html });
  }
};
