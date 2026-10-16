import { env } from "../../config/env.js";
import { logger } from "../logger/logger.js";

/**
 * Normalizes phone numbers to standard international E.164 format (digits only, e.g. 919876543210)
 */
const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  let cleaned = String(phone).replace(/\D/g, "");
  // If 10 digits (India standard local number), prepend 91
  if (cleaned.length === 10) {
    cleaned = `91${cleaned}`;
  }
  // Remove leading 0 if present before country code (e.g. 091...)
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.replace(/^0+/, "");
    if (cleaned.length === 10) cleaned = `91${cleaned}`;
  }
  return cleaned.length >= 10 ? cleaned : null;
};

export const whatsappService = {
  /**
   * Send a template message via Meta WhatsApp Cloud API
   * @param {Object} options - { to, templateName, languageCode, bodyParams, headerParams }
   */
  sendTemplate: async ({ to, templateName, languageCode = "en_US", bodyParams = [] }) => {
    const formattedPhone = formatPhoneNumber(to);
    if (!formattedPhone) {
      logger.warn(`[WHATSAPP SKIPPED] Invalid or missing phone number: ${to}`);
      return false;
    }

    const enabled = env.WHATSAPP?.ENABLED;
    const phoneId = env.WHATSAPP?.PHONE_NUMBER_ID;
    const token = env.WHATSAPP?.ACCESS_TOKEN;
    const version = env.WHATSAPP?.API_VERSION || "v25.0";

    if (!enabled || !phoneId || !token) {
      logger.info(
        `[WHATSAPP SIMULATED - NO CREDS/DISABLED] To: ${formattedPhone} | Template: ${templateName} | Params: ${JSON.stringify(
          bodyParams
        )}`
      );
      return true;
    }

    try {
      const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

      const components = [];
      if (Array.isArray(bodyParams) && bodyParams.length > 0) {
        components.push({
          type: "body",
          parameters: bodyParams.map((param) => ({
            type: "text",
            text: String(param || ""),
          })),
        });
      }

      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components.length > 0 ? { components } : {}),
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        logger.error(`[WHATSAPP API ERROR] Status ${response.status}:`, data);
        return false;
      }

      const messageId = data?.messages?.[0]?.id;
      logger.info(`[WHATSAPP SENT] Template: ${templateName} to ${formattedPhone} (Message ID: ${messageId})`);
      return true;
    } catch (error) {
      logger.error(`[WHATSAPP SEND EXCEPTION] To ${formattedPhone}:`, error);
      return false;
    }
  },

  /**
   * Send a direct raw text message (works within 24hr customer care window or developer test numbers)
   */
  sendTextMessage: async ({ to, text, previewUrl = false }) => {
    const formattedPhone = formatPhoneNumber(to);
    if (!formattedPhone || !text) return false;

    const enabled = env.WHATSAPP?.ENABLED;
    const phoneId = env.WHATSAPP?.PHONE_NUMBER_ID;
    const token = env.WHATSAPP?.ACCESS_TOKEN;
    const version = env.WHATSAPP?.API_VERSION || "v25.0";

    if (!enabled || !phoneId || !token) {
      logger.info(`[WHATSAPP TEXT SIMULATED] To: ${formattedPhone} | Text: ${text.slice(0, 100)}...`);
      return true;
    }

    try {
      const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: formattedPhone,
          type: "text",
          text: {
            preview_url: previewUrl,
            body: text,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        logger.warn(`[WHATSAPP TEXT FAILED]`, data);
        return false;
      }

      logger.info(`[WHATSAPP TEXT SENT] To ${formattedPhone} ID: ${data?.messages?.[0]?.id}`);
      return true;
    } catch (error) {
      logger.error(`[WHATSAPP TEXT EXCEPTION] To ${formattedPhone}:`, error);
      return false;
    }
  },

  /**
   * 1. Send Test "Hello World" template (works on all Meta developer test accounts out of the box)
   */
  sendTestHelloWorld: async (phone) => {
    return whatsappService.sendTemplate({
      to: phone,
      templateName: "hello_world",
      languageCode: "en_US",
    });
  },

  /**
   * 2. Birthday Notification
   */
  sendBirthdayWish: async ({ phone, name, businessName, chapter }) => {
    const message = `🎉 *Happy Birthday, ${name}!* 🎂\n\nRIFAH Chamber of Commerce & Industry extends warmest wishes to you${
      businessName ? ` and *${businessName}*` : ""
    } on this special day.\n\nMay the year ahead bring you continuous growth, prosperity, and success! 🌟`;

    const textSent = await whatsappService.sendTextMessage({ to: phone, text: message });
    if (textSent) return true;

    return whatsappService.sendTemplate({
      to: phone,
      templateName: "rifah_birthday_wish",
      languageCode: "en",
      bodyParams: [name, businessName || "RIFAH Member"],
    });
  },

  /**
   * 3. Anniversary Notification
   */
  sendAnniversaryWish: async ({ phone, name, businessName, years = 1, chapter }) => {
    const message = `🎊 *Happy Anniversary, ${name}!* 💐\n\nRIFAH Chamber congratulates you and *${
      businessName || "your business"
    }* on completing ${years} year(s) of business excellence.\n\nThank you for being a valued pillar of *${
      chapter || "RIFAH Chamber"
    }*! 🚀`;

    const textSent = await whatsappService.sendTextMessage({ to: phone, text: message });
    if (textSent) return true;

    return whatsappService.sendTemplate({
      to: phone,
      templateName: "rifah_anniversary_wish",
      languageCode: "en",
      bodyParams: [name, businessName || "Business", String(years), chapter || "RIFAH"],
    });
  },

  /**
   * 4. New Business Enquiry Notification
   */
  sendNewEnquiry: async ({ phone, ownerName, enquiryTitle, buyerName, buyerPhone, message }) => {
    const frontendBaseUrl = (env.FRONTEND_URL || "https://rifah.nexcorealliance.com").replace(/\/$/, "");
    const text = `💼 *New Business Enquiry Alert!*\n\nHello ${ownerName || "Member"},\nYou received a new enquiry for *${enquiryTitle}* from *${buyerName}*.\n\n📞 *Contact:* ${buyerPhone || "N/A"}\n💬 *Message:* "${message || ""}"\n\n👉 *Login to your RIFAH portal to view and reply:* ${frontendBaseUrl}/biz/enquiries`;

    const textSent = await whatsappService.sendTextMessage({ to: phone, text });
    if (textSent) return true;

    return whatsappService.sendTemplate({
      to: phone,
      templateName: "rifah_new_enquiry",
      languageCode: "en",
      bodyParams: [ownerName || "Member", enquiryTitle, buyerName || "Buyer", buyerPhone || "", (message || "").slice(0, 100)],
    });
  },

  /**
   * 5. Event Registration & Ticket
   */
  sendEventTicket: async ({ phone, userName, eventTitle, eventDate, location, ticketId, verificationUrl }) => {
    const text = `🎟️ *Event Confirmation - RIFAH Chamber*\n\nDear ${userName},\nYour seat for *${eventTitle}* is confirmed!\n\n📅 *Date:* ${eventDate}\n📍 *Venue:* ${location}\n🎫 *Ticket ID:* ${ticketId}\n\n${verificationUrl ? `🔗 *Digital Pass:* ${verificationUrl}\n\n` : ""}Please show this confirmation at the registration desk.`;

    const textSent = await whatsappService.sendTextMessage({ to: phone, text });
    if (textSent) return true;

    return whatsappService.sendTemplate({
      to: phone,
      templateName: "rifah_event_ticket",
      languageCode: "en",
      bodyParams: [userName, eventTitle, eventDate, location, ticketId],
    });
  },

  /**
   * 6. Membership Welcome & Certificate Ready
   */
  sendMembershipWelcome: async ({ phone, name, tier, businessName, portalLink }) => {
    const defaultPortal = `${(env.FRONTEND_URL || "https://rifah.nexcorealliance.com").replace(/\/$/, "")}/biz`;
    const targetLink = portalLink || defaultPortal;
    const text = `🌟 *Welcome to RIFAH Chamber of Commerce!*\n\nDear ${name},\nYour *${tier}* membership for *${businessName || "your business"}* is now ACTIVE.\n\nYour official membership certificate is generated and ready to download.\n\n👉 *Access Member Portal:* ${targetLink}`;

    const textSent = await whatsappService.sendTextMessage({ to: phone, text });
    if (textSent) return true;

    return whatsappService.sendTemplate({
      to: phone,
      templateName: "rifah_membership_welcome",
      languageCode: "en",
      bodyParams: [name, tier || "Business", targetLink],
    });
  },

  /**
   * 7. Payment Receipt / Invoice
   */
  sendPaymentReceipt: async ({ phone, userName, amount, purpose, receiptNumber, invoiceUrl }) => {
    const text = `🧾 *Payment Receipt - RIFAH Chamber*\n\nDear ${userName},\nWe have received your payment of *₹${amount}* for *${purpose}*.\n\n*Receipt/Invoice No:* ${receiptNumber}\n\n${invoiceUrl ? `🔗 *Download Invoice:* ${invoiceUrl}\n\n` : ""}Thank you for your association with RIFAH Chamber!`;

    const textSent = await whatsappService.sendTextMessage({ to: phone, text });
    if (textSent) return true;

    return whatsappService.sendTemplate({
      to: phone,
      templateName: "rifah_payment_receipt",
      languageCode: "en",
      bodyParams: [userName, String(amount), purpose || "Membership", receiptNumber || ""],
    });
  },
};
