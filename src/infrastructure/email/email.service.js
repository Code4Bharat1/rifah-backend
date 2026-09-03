import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { env } from "../../config/env.js";
import { logger } from "../logger/logger.js";
import { generateInvoicePdfBuffer } from "../../shared/utils/pdf-generator.js";

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
   * @param {Object} options - { to, subject, html, text, attachments }
   * @returns {Promise<boolean>}
   */
  sendEmail: async ({ to, subject, html, text, attachments }) => {
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
        attachments,
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
  },

  /**
   * Sends a Membership Invoice Receipt Email with attached PDF matching exact website template
   */
  sendMembershipInvoiceEmail: async ({
    email,
    name,
    businessName,
    planName,
    amount,
    invoiceNumber,
    paidAt,
    transactionId,
    paymentMethod,
  }) => {
    const formattedDate = new Date(paidAt || Date.now()).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    const formattedAmount = `₹ ${Number(amount || 0).toLocaleString("en-IN")}`;
    const cleanPlanName = (planName || "Membership").replace(/subscription/i, "").trim().toUpperCase();

    // 1. Generate Vector PDF Buffer matching Image 2
    const pdfBuffer = generateInvoicePdfBuffer({
      invoiceNumber,
      paidAt,
      name,
      businessName,
      planName: cleanPlanName,
      amount,
      transactionId,
      paymentMethod,
    });

    // 2. Locate RIFAH Official Logo Graphic File
    const logoPath = "C:/Users/HP/OneDrive/Desktop/RIFAH/rifah-frontend/public/rifah1-logo.png";
    const hasLogo = fs.existsSync(logoPath);

    const subject = `OFFICIAL INVOICE #${invoiceNumber} - RIFAH Chamber Membership`;
    
    // 3. Exact HTML match of website Image 2 invoice layout
    const html = `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; background-color: #ffffff; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
        <!-- Top Colored Decorative Header Band -->
        <div style="height: 6px; background: linear-gradient(90deg, #dc2626 0%, #2563eb 100%);"></div>
        
        <div style="padding: 36px 32px 32px 32px;">
          <!-- Top Row: Official RIFAH Logo Graphic & Invoice Header -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px;">
            <tr>
              <td style="vertical-align: top;">
                ${
                  hasLogo
                    ? `<img src="cid:rifahlogo" alt="RIFAH Chamber of Commerce & Industry" style="height: 48px; width: auto; max-width: 240px; display: block;" />`
                    : `<h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #0b192c; letter-spacing: -0.5px;">RIFAH CONNECT</h1>`
                }
                <p style="margin: 4px 0 0 0; font-size: 11px; font-weight: 600; color: #64748b;">Chamber of Commerce & Business Network</p>
              </td>
              <td style="vertical-align: top; text-align: right;">
                <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: #0b192c; letter-spacing: 0.5px; text-transform: uppercase;">OFFICIAL INVOICE</h2>
                <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: 700; color: #0284c7;"># ${invoiceNumber}</p>
                <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b;">Issued: ${formattedDate}</p>
              </td>
            </tr>
          </table>

          <!-- Two Column Metadata Cards -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px;">
            <tr>
              <td style="width: 48%; vertical-align: top; padding-right: 2%;">
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; min-height: 90px;">
                  <p style="margin: 0 0 8px 0; font-size: 10px; font-weight: 800; color: #0284c7; letter-spacing: 0.5px; text-transform: uppercase;">BILLED TO</p>
                  <p style="margin: 0; font-size: 14px; font-weight: 700; color: #0f172a;">${name || "Member User"}</p>
                  <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b;">${businessName || "Member Business"}</p>
                </div>
              </td>
              <td style="width: 48%; vertical-align: top; padding-left: 2%;">
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; min-height: 90px;">
                  <p style="margin: 0 0 8px 0; font-size: 10px; font-weight: 800; color: #0284c7; letter-spacing: 0.5px; text-transform: uppercase;">PAYMENT DETAILS</p>
                  <p style="margin: 0 0 4px 0; font-size: 12px; color: #475569;">
                    Status: <span style="display: inline-block; background-color: #dcfce7; color: #166534; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 9999px; text-transform: uppercase;">• PAID</span>
                  </p>
                  <p style="margin: 0; font-size: 11px; color: #475569;">Transaction ID: <span style="font-family: monospace; font-weight: 600;">${transactionId || "pay_ONLINE"}</span></p>
                  <p style="margin: 2px 0 0 0; font-size: 11px; color: #475569;">Payment Method: <strong>${paymentMethod || "Razorpay Online Payment"}</strong></p>
                </div>
              </td>
            </tr>
          </table>

          <!-- Line Items Table -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden;">
            <thead>
              <tr style="background-color: #0b192c; color: #ffffff;">
                <th style="padding: 14px 16px; text-align: left; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">DESCRIPTION / PURPOSE</th>
                <th style="padding: 14px 16px; text-align: center; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; width: 60px;">QTY</th>
                <th style="padding: 14px 16px; text-align: right; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; width: 110px;">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 16px;">
                  <p style="margin: 0; font-size: 14px; font-weight: 700; color: #0f172a;">${cleanPlanName} Membership Subscription</p>
                  <p style="margin: 3px 0 0 0; font-size: 11px; color: #64748b;">RIFAH Connect Member Services & Tier Access (1 Year)</p>
                </td>
                <td style="padding: 16px; text-align: center; font-size: 13px; font-weight: 700; color: #0f172a;">1</td>
                <td style="padding: 16px; text-align: right; font-size: 14px; font-weight: 800; color: #0f172a;">${formattedAmount}</td>
              </tr>
            </tbody>
          </table>

          <!-- Bottom Summary Section -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
            <tr>
              <td style="vertical-align: bottom; width: 50%;">
                <div style="border: 2px dashed #22c55e; border-radius: 12px; padding: 12px 16px; background-color: #f0fdf4; display: inline-block;">
                  <p style="margin: 0; font-size: 12px; font-weight: 800; color: #15803d; text-transform: uppercase;">✓ PAID & VERIFIED</p>
                  <p style="margin: 2px 0 0 0; font-size: 9px; font-weight: 700; color: #166534; letter-spacing: 0.5px; text-transform: uppercase;">RIFAH CONNECT TREASURY</p>
                </div>
              </td>
              <td style="vertical-align: top; width: 50%; text-align: right;">
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; display: inline-block; width: 220px; text-align: left;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12px; color: #64748b;">
                    <span>Subtotal:</span>
                    <span style="font-weight: 600; color: #0f172a;">${formattedAmount}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 12px; color: #64748b;">
                    <span>Taxes / Fees:</span>
                    <span style="font-weight: 600; color: #0f172a;">Included</span>
                  </div>
                  <div style="border-top: 1px solid #e2e8f0; pt-2; margin-top: 6px; padding-top: 8px; display: flex; justify-content: space-between; font-size: 15px; font-weight: 800;">
                    <span style="color: #0f172a;">Total Paid:</span>
                    <span style="color: #0284c7;">${formattedAmount}</span>
                  </div>
                </div>
              </td>
            </tr>
          </table>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0 0 20px 0;" />
          
          <p style="margin: 0; text-align: center; font-size: 13px; font-weight: 700; color: #0f172a;">Thank you for being a valued member of RIFAH Connect</p>
          <p style="margin: 4px 0 0 0; text-align: center; font-size: 11px; color: #94a3b8;">This is a computer-generated tax receipt and requires no physical signature. Official PDF attachment included below.</p>
          <p style="margin: 6px 0 0 0; text-align: center; font-size: 11px; font-weight: 600; color: #0284c7;">www.rifah.org · Chamber Desk Invoicing</p>
        </div>
      </div>
    `;

    const attachments = [
      {
        filename: `Official_Invoice_${invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ];

    if (hasLogo) {
      attachments.unshift({
        filename: "rifah1-logo.png",
        path: logoPath,
        cid: "rifahlogo",
      });
    }

    return emailService.sendEmail({
      to: email,
      subject,
      html,
      attachments,
    });
  },

  /**
   * Sends a Welcome Email on user registration
   */
  sendWelcomeEmail: async ({ email, name, role }) => {
    const logoPath = "C:/Users/HP/OneDrive/Desktop/RIFAH/rifah-frontend/public/rifah1-logo.png";
    const hasLogo = fs.existsSync(logoPath);
    const subject = `Welcome to RIFAH Chamber of Commerce & Industry! 🎉`;
    const html = `
      <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;">
        <div style="height: 6px; background: linear-gradient(90deg, #dc2626 0%, #2563eb 100%);"></div>
        <div style="padding: 32px;">
          ${hasLogo ? `<img src="cid:rifahlogo" alt="RIFAH" style="height: 48px; width: auto; margin-bottom: 20px;" />` : `<h1 style="color: #0b192c; font-size: 24px;">RIFAH CONNECT</h1>`}
          <h2 style="color: #0f172a; font-size: 20px; margin-top: 0;">Welcome to RIFAH Connect!</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">Dear <strong>${name || "Member"}</strong>,</p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">Thank you for registering on <strong>RIFAH Connect</strong> - India's premier Chamber of Commerce & Business Network.</p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; font-size: 13px; color: #0f172a;"><strong>Account Email:</strong> ${email}</p>
            <p style="margin: 0; font-size: 13px; color: #0f172a;"><strong>Account Type:</strong> ${role === "business_owner" ? "Business Member" : "Buyer Account"}</p>
          </div>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">You can now explore verified member businesses, post procurement requirements (RFQs), and participate in exclusive chamber networking events.</p>
          <div style="margin-top: 24px;">
            <a href="http://localhost:3000/login" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 14px;">Go to My Dashboard →</a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">RIFAH Chamber of Commerce & Industry · Digital Secretariat</p>
        </div>
      </div>
    `;

    const attachments = hasLogo ? [{ filename: "rifah1-logo.png", path: logoPath, cid: "rifahlogo" }] : [];
    return emailService.sendEmail({ to: email, subject, html, attachments });
  },

  /**
   * Sends New Business Lead notification email to matching Business Owner
   */
  sendNewLeadEmail: async ({ email, businessOwnerName, leadTitle, category, quantity, budget, location, buyerName }) => {
    const logoPath = "C:/Users/HP/OneDrive/Desktop/RIFAH/rifah-frontend/public/rifah1-logo.png";
    const hasLogo = fs.existsSync(logoPath);
    const subject = `🚀 New Business Lead Assigned: ${leadTitle}`;
    const html = `
      <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;">
        <div style="height: 6px; background: linear-gradient(90deg, #dc2626 0%, #2563eb 100%);"></div>
        <div style="padding: 32px;">
          ${hasLogo ? `<img src="cid:rifahlogo" alt="RIFAH" style="height: 44px; width: auto; margin-bottom: 20px;" />` : `<h1 style="color: #0b192c; font-size: 22px;">RIFAH CONNECT</h1>`}
          <span style="background-color: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: bold; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase;">NEW LEAD MATCH</span>
          <h2 style="color: #0f172a; font-size: 18px; margin-top: 10px;">New Buyer Requirement Assigned to You</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">Dear <strong>${businessOwnerName || "Member"}</strong>,</p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">A new verified buyer requirement matching your business category has been posted on RIFAH Connect:</p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 16px;">${leadTitle}</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;">
              <tr><td style="padding: 4px 0;"><strong>Buyer:</strong></td><td style="text-align: right; font-weight: bold; color: #0f172a;">${buyerName || "Verified Buyer"}</td></tr>
              <tr><td style="padding: 4px 0;"><strong>Category:</strong></td><td style="text-align: right; color: #0f172a;">${category || "General Requirement"}</td></tr>
              <tr><td style="padding: 4px 0;"><strong>Quantity:</strong></td><td style="text-align: right; color: #0f172a;">${quantity || "As per spec"}</td></tr>
              <tr><td style="padding: 4px 0;"><strong>Budget:</strong></td><td style="text-align: right; font-weight: bold; color: #0284c7;">${budget || "On request"}</td></tr>
              <tr><td style="padding: 4px 0;"><strong>Location:</strong></td><td style="text-align: right; color: #0f172a;">${location || "India"}</td></tr>
            </table>
          </div>

          <div style="margin-top: 24px;">
            <a href="http://localhost:3000/biz/leads" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 14px;">View Lead & Send Quotation →</a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">RIFAH Chamber of Commerce & Industry · Lead Desk</p>
        </div>
      </div>
    `;

    const attachments = hasLogo ? [{ filename: "rifah1-logo.png", path: logoPath, cid: "rifahlogo" }] : [];
    return emailService.sendEmail({ to: email, subject, html, attachments });
  },

  /**
   * Sends Business Verification Status update email
   */
  sendVerificationStatusEmail: async ({ email, ownerName, businessName, status, notes }) => {
    const logoPath = "C:/Users/HP/OneDrive/Desktop/RIFAH/rifah-frontend/public/rifah1-logo.png";
    const hasLogo = fs.existsSync(logoPath);
    const isVerified = status === "verified";
    const subject = isVerified
      ? `✅ Business Verification Approved: ${businessName}`
      : `⚠️ Business Verification Update: ${businessName}`;

    const html = `
      <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;">
        <div style="height: 6px; background: linear-gradient(90deg, #dc2626 0%, #2563eb 100%);"></div>
        <div style="padding: 32px;">
          ${hasLogo ? `<img src="cid:rifahlogo" alt="RIFAH" style="height: 44px; width: auto; margin-bottom: 20px;" />` : `<h1 style="color: #0b192c; font-size: 22px;">RIFAH CONNECT</h1>`}
          <span style="background-color: ${isVerified ? "#dcfce7" : "#fef3c7"}; color: ${isVerified ? "#166534" : "#92400e"}; font-size: 11px; font-weight: bold; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase;">
            ${isVerified ? "VERIFIED MEMBER" : "STATUS UPDATE"}
          </span>
          <h2 style="color: #0f172a; font-size: 18px; margin-top: 10px;">Verification Update for ${businessName}</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">Dear <strong>${ownerName || "Member"}</strong>,</p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            ${
              isVerified
                ? `Congratulations! Your business <strong>${businessName}</strong> has been officially verified by the RIFAH Chamber Secretariat.`
                : `The verification status for <strong>${businessName}</strong> has been updated to: <strong>${status}</strong>.`
            }
          </p>

          ${notes ? `<div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 16px; margin: 20px 0; font-size: 13px; color: #334155;"><strong>Secretariat Notes:</strong> ${notes}</div>` : ""}

          <div style="margin-top: 24px;">
            <a href="http://localhost:3000/biz/verification" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 14px;">View Verification Badge →</a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">RIFAH Chamber of Commerce & Industry · Secretariat Verification Desk</p>
        </div>
      </div>
    `;

    const attachments = hasLogo ? [{ filename: "rifah1-logo.png", path: logoPath, cid: "rifahlogo" }] : [];
    return emailService.sendEmail({ to: email, subject, html, attachments });
  },

  /**
   * Sends Event Registration / RSVP confirmation email
   */
  sendEventRegistrationEmail: async ({ email, userName, eventTitle, eventDate, location, ticketType }) => {
    const logoPath = "C:/Users/HP/OneDrive/Desktop/RIFAH/rifah-frontend/public/rifah1-logo.png";
    const hasLogo = fs.existsSync(logoPath);
    const subject = `🎟️ Event Registration Confirmed: ${eventTitle}`;
    const html = `
      <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;">
        <div style="height: 6px; background: linear-gradient(90deg, #dc2626 0%, #2563eb 100%);"></div>
        <div style="padding: 32px;">
          ${hasLogo ? `<img src="cid:rifahlogo" alt="RIFAH" style="height: 44px; width: auto; margin-bottom: 20px;" />` : `<h1 style="color: #0b192c; font-size: 22px;">RIFAH CONNECT</h1>`}
          <span style="background-color: #dcfce7; color: #166534; font-size: 11px; font-weight: bold; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase;">RSVP CONFIRMED</span>
          <h2 style="color: #0f172a; font-size: 18px; margin-top: 10px;">Event Ticket Confirmed</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">Dear <strong>${userName || "Member"}</strong>,</p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">Your registration for the following RIFAH Chamber event has been confirmed:</p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 16px;">${eventTitle}</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;">
              <tr><td style="padding: 4px 0;"><strong>Date & Time:</strong></td><td style="text-align: right; font-weight: bold; color: #0f172a;">${eventDate || "Upcoming Event"}</td></tr>
              <tr><td style="padding: 4px 0;"><strong>Venue / Location:</strong></td><td style="text-align: right; color: #0f172a;">${location || "Chamber Hall"}</td></tr>
              <tr><td style="padding: 4px 0;"><strong>Ticket Type:</strong></td><td style="text-align: right; font-weight: bold; color: #0284c7;">${ticketType || "Member Pass"}</td></tr>
            </table>
          </div>

          <div style="margin-top: 24px;">
            <a href="http://localhost:3000/events" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 14px;">View Event Details →</a>
          </div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">RIFAH Chamber of Commerce & Industry · Events Desk</p>
        </div>
      </div>
    `;

    const attachments = hasLogo ? [{ filename: "rifah1-logo.png", path: logoPath, cid: "rifahlogo" }] : [];
    return emailService.sendEmail({ to: email, subject, html, attachments });
  },

  /**
   * Sends Password Reset OTP Verification Email
   */
  sendPasswordResetEmail: async ({ email, name, resetCode }) => {
    const logoPath = "C:/Users/HP/OneDrive/Desktop/RIFAH/rifah-frontend/public/rifah1-logo.png";
    const hasLogo = fs.existsSync(logoPath);
    const subject = `🔐 Your Password Reset Verification Code: ${resetCode}`;
    const html = `
      <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff;">
        <div style="height: 6px; background: linear-gradient(90deg, #dc2626 0%, #2563eb 100%);"></div>
        <div style="padding: 32px;">
          ${hasLogo ? `<img src="cid:rifahlogo" alt="RIFAH" style="height: 44px; width: auto; margin-bottom: 20px;" />` : `<h1 style="color: #0b192c; font-size: 22px;">RIFAH CONNECT</h1>`}
          <span style="background-color: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: bold; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase;">PASSWORD RECOVERY</span>
          <h2 style="color: #0f172a; font-size: 18px; margin-top: 10px;">Reset Your RIFAH Password</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">Dear <strong>${name || "Member"}</strong>,</p>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">We received a request to reset the password for your RIFAH account (<strong>${email}</strong>). Use the verification code below to complete your password reset:</p>
          
          <div style="background-color: #f8fafc; border: 1px dashed #0284c7; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
            <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase;">YOUR VERIFICATION CODE</p>
            <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0284c7; font-family: monospace;">${resetCode}</div>
            <p style="margin: 8px 0 0 0; font-size: 11px; color: #94a3b8;">This code will expire in 15 minutes.</p>
          </div>

          <p style="color: #64748b; font-size: 13px; line-height: 1.5;">If you did not request a password reset, please disregard this email or contact support if you suspect unauthorized access.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">RIFAH Chamber of Commerce & Industry · Security Operations</p>
        </div>
      </div>
    `;

    const attachments = hasLogo ? [{ filename: "rifah1-logo.png", path: logoPath, cid: "rifahlogo" }] : [];
    return emailService.sendEmail({ to: email, subject, html, attachments });
  },
};
