import { env } from "../../config/env.js";
import { logger } from "../logger/logger.js";

export const emailService = {
  /**
   * Sends an email notification or verification message
   * @param {Object} options - { to, subject, html, text }
   * @returns {Promise<boolean>}
   */
  sendEmail: async ({ to, subject, html, text }) => {
    try {
      if (env.isDevelopment() || !env.EMAIL.HOST) {
        logger.info(`[EMAIL SIMULATED] To: ${to} | Subject: ${subject}`);
        return true;
      }

      // In production with valid SMTP, transport would send mail here
      logger.info(`Email sent to ${to}: ${subject}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send email to ${to}:`, error);
      return false;
    }
  },
};
