import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import QRCode from "qrcode";
import { env } from "../../config/env.js";
import { logger } from "../logger/logger.js";

/**
 * Normalizes phone numbers to standard WhatsApp chat ID format (e.g. 919876543210@c.us)
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
  return cleaned.length >= 10 ? `${cleaned}@c.us` : null;
};

/**
 * Finds local Google Chrome executable on Windows if installed
 */
const getChromeExecutablePath = () => {
  const possiblePaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
  ].filter(Boolean);

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
};

// Internal WhatsApp client state
let client = null;
let clientStatus = "NOT_INITIALIZED"; // "NOT_INITIALIZED" | "INITIALIZING" | "QR_READY" | "AUTHENTICATED" | "CONNECTED" | "AUTH_FAILURE" | "DISCONNECTED" | "ERROR"
let currentQrDataUrl = null;
let currentQrRaw = null;
let clientInfo = null;
let initPromise = null;
let lastErrorMessage = null;

/**
 * Kill any orphaned headless Chrome instances specifically spawned for wwebjs session
 */
const killOrphanWwebBrowsers = () => {
  try {
    const psPath = fs.existsSync("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
      ? "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
      : "powershell";

    const cmd = `"${psPath}" -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome.exe' -and ($_.CommandLine -like '*wwebjs*' -or $_.CommandLine -like '*userDataDir*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`;
    execSync(cmd, { stdio: "ignore", timeout: 8000 });
    // Pause briefly for Windows file system handle releases
    try {
      execSync("ping 127.0.0.1 -n 2 > nul", { stdio: "ignore", timeout: 3000 });
    } catch {}
    logger.info("[WHATSAPP] Cleaned up any orphaned wwebjs Chrome processes.");
  } catch (err) {
    logger.warn("[WHATSAPP] Process cleanup note:", err?.message);
  }
};

/**
 * Remove stale Chrome singleton/devtools locks that prevent Puppeteer from booting on Windows
 */
const cleanupStaleLocks = (authDir) => {
  try {
    killOrphanWwebBrowsers();
    const targetDirs = [
      authDir,
      path.join(authDir, "session"),
      path.join(authDir, "session", "Default"),
    ];

    const lockFiles = [
      "lockfile",
      "DevToolsActivePort",
      "SingletonLock",
      "SingletonCookie",
      "SingletonSocket",
    ];

    for (const dir of targetDirs) {
      if (!fs.existsSync(dir)) continue;
      for (const file of lockFiles) {
        const p = path.join(dir, file);
        if (fs.existsSync(p)) {
          try {
            fs.unlinkSync(p);
            logger.info(`[WHATSAPP] Cleaned up stale lock file: ${p}`);
          } catch (delErr) {
            logger.warn(`[WHATSAPP] Could not unlink ${file}:`, delErr?.message);
          }
        }
      }
    }
  } catch (err) {
    logger.warn("[WHATSAPP] Lock cleanup warning:", err?.message);
  }
};

/**
 * Ensure whatsapp-web.js and qrcode-terminal are installed in node_modules
 */
const ensureDependencies = () => {
  const wwebPath = path.resolve(process.cwd(), "node_modules", "whatsapp-web.js");
  if (!fs.existsSync(wwebPath)) {
    logger.info("[WHATSAPP] whatsapp-web.js not found in node_modules. Installing dependencies...");
    try {
      execSync("npm install --no-audit --no-fund whatsapp-web.js qrcode-terminal", {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      logger.info("[WHATSAPP] Dependencies successfully installed!");
    } catch (err) {
      logger.error("[WHATSAPP INSTALL ERROR]:", err.message);
      return false;
    }
  }
  return true;
};

export const whatsappService = {
  /**
   * Initialize WhatsApp Web Client
   */
  init: async () => {
    if (env.WHATSAPP?.ENABLED === false) {
      logger.info("[WHATSAPP] WhatsApp automation is disabled via WHATSAPP_ENABLED=false");
      return;
    }

    if (clientStatus === "CONNECTED" || clientStatus === "INITIALIZING") {
      return initPromise;
    }

    clientStatus = "INITIALIZING";
    lastErrorMessage = null;

    initPromise = (async () => {
      try {
        const hasDeps = ensureDependencies();
        if (!hasDeps) {
          clientStatus = "ERROR";
          lastErrorMessage = "Missing dependencies (whatsapp-web.js)";
          return;
        }

        const { default: pkg } = await import("whatsapp-web.js");
        const { Client, LocalAuth } = pkg;
        let qrcodeTerminal = null;
        try {
          const terminalModule = await import("qrcode-terminal");
          qrcodeTerminal = terminalModule.default || terminalModule;
        } catch {}

        const chromePath = getChromeExecutablePath();
        const puppeteerArgs = [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ];

        logger.info(`[WHATSAPP] Starting WhatsApp Web client (Chrome: ${chromePath || "bundled"})...`);

        const authDir = path.resolve(process.cwd(), ".wwebjs_auth");
        if (!fs.existsSync(authDir)) {
          fs.mkdirSync(authDir, { recursive: true });
        }

        // Clean stale lock files from previous runs
        cleanupStaleLocks(authDir);

        client = new Client({
          authStrategy: new LocalAuth({
            dataPath: authDir,
          }),
          puppeteer: {
            headless: true,
            executablePath: chromePath || undefined,
            args: puppeteerArgs,
          },
        });

        client.on("qr", async (qr) => {
          clientStatus = "QR_READY";
          currentQrRaw = qr;

          try {
            currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
          } catch (qrErr) {
            logger.warn("[WHATSAPP] Failed to generate QR data URL:", qrErr?.message);
          }

          console.log("\n");
          console.log("==================================================================");
          console.log("📲 [WHATSAPP QR CODE] SCAN THIS QR CODE WITH YOUR WHATSAPP APP:");
          console.log("👉 Open WhatsApp -> Settings -> Linked Devices -> Link a Device");
          console.log("==================================================================");
          if (qrcodeTerminal) {
            qrcodeTerminal.generate(qr, { small: true });
          }
          console.log("==================================================================\n");
        });

        client.on("loading_screen", (percent, message) => {
          logger.info(`[WHATSAPP LOADING] ${percent}% - ${message}`);
        });

        client.on("authenticated", () => {
          clientStatus = "AUTHENTICATED";
          lastErrorMessage = null;
          logger.info("[WHATSAPP] ✅ WhatsApp authenticated successfully!");

          // Fallback: If change:hasSynced was missed or already true, kick onAppStateHasSyncedEvent
          const kickSync = async () => {
            if (clientStatus === "CONNECTED" || !client?.pupPage) return;
            try {
              await client.pupPage.evaluate(() => {
                try {
                  if (typeof window.onAppStateHasSyncedEvent === "function") {
                    window.onAppStateHasSyncedEvent();
                  }
                } catch {}
              });
            } catch {}
          };
          setTimeout(kickSync, 2000);
          setTimeout(kickSync, 6000);
          setTimeout(kickSync, 15000);
        });

        client.on("auth_failure", (msg) => {
          clientStatus = "AUTH_FAILURE";
          lastErrorMessage = `Auth failure: ${msg}`;
          logger.error("[WHATSAPP] ❌ Authentication failure:", msg);
        });

        client.on("ready", () => {
          clientStatus = "CONNECTED";
          currentQrDataUrl = null;
          currentQrRaw = null;
          lastErrorMessage = null;
          clientInfo = client.info;
          logger.info(
            `[WHATSAPP] 🚀 WhatsApp Web is READY and CONNECTED! Logged in as: ${client.info?.wid?.user || "Connected"} (${
              client.info?.pushname || "RIFAH"
            })`
          );
        });

        client.on("disconnected", (reason) => {
          clientStatus = "DISCONNECTED";
          currentQrDataUrl = null;
          currentQrRaw = null;
          clientInfo = null;
          lastErrorMessage = `Disconnected: ${reason}`;
          logger.warn(`[WHATSAPP] ⚠️ WhatsApp disconnected: ${reason}. Scheduling reconnect in 10s...`);
          setTimeout(() => {
            try {
              whatsappService.init();
            } catch (reconErr) {
              logger.error("[WHATSAPP RECONNECT FAILED]:", reconErr);
            }
          }, 10000);
        });

        await client.initialize();
      } catch (err) {
        clientStatus = "ERROR";
        lastErrorMessage = err?.message || String(err);
        logger.error("[WHATSAPP INIT EXCEPTION]:", lastErrorMessage);
      }
    })();

    return initPromise;
  },

  /**
   * Reconnect or re-initialize WhatsApp client
   */
  reconnect: async () => {
    logger.info("[WHATSAPP] Forcing WhatsApp client reconnect...");
    try {
      if (client) {
        await client.destroy().catch(() => {});
      }
    } catch {}
    client = null;
    clientStatus = "NOT_INITIALIZED";
    currentQrDataUrl = null;
    currentQrRaw = null;
    clientInfo = null;
    initPromise = null;
    lastErrorMessage = null;

    const authDir = path.resolve(process.cwd(), ".wwebjs_auth");
    cleanupStaleLocks(authDir);

    return whatsappService.init();
  },

  /**
   * Get low-level Puppeteer and WhatsApp Web page state for debugging
   */
  getDebugState: async () => {
    if (!client) return { hasClient: false, clientStatus };
    if (!client.pupPage) return { hasClient: true, hasPupPage: false, clientStatus };
    try {
      const pageState = await client.pupPage.evaluate(() => {
        try {
          const socket = window.require?.("WAWebSocketModel")?.Socket;
          const conn = window.require?.("WAWebConnModel")?.Conn;
          return {
            title: document.title,
            url: window.location.href,
            hasWWebJS: typeof window.WWebJS !== "undefined",
            hasOnAppStateHasSynced: typeof window.onAppStateHasSyncedEvent === "function",
            socketState: socket?.state,
            socketHasSynced: socket?.hasSynced,
            connConnected: conn?.connected,
            connState: conn?.state,
            bodyText: document.body?.innerText?.slice(0, 300),
          };
        } catch (e) {
          return { error: e.message };
        }
      });
      return {
        clientStatus,
        clientInfo: client.info,
        pageState,
      };
    } catch (err) {
      return { clientStatus, error: err.message };
    }
  },

  /**
   * Trigger sync kick manually
   */
  forceReady: async () => {
    if (!client || !client.pupPage) return { success: false, reason: "No client/pupPage" };
    try {
      const result = await client.pupPage.evaluate(() => {
        try {
          if (typeof window.onAppStateHasSyncedEvent === "function") {
            window.onAppStateHasSyncedEvent();
            return { triggered: true };
          }
          return { triggered: false, reason: "No onAppStateHasSyncedEvent function" };
        } catch (e) {
          return { error: e.message };
        }
      });
      return { success: true, result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Get current connection status and QR code if waiting for scan
   */
  getStatus: () => {
    return {
      status: clientStatus,
      isConnected: clientStatus === "CONNECTED",
      isWaitingForScan: clientStatus === "QR_READY",
      qrCodeDataUrl: currentQrDataUrl,
      lastError: lastErrorMessage,
      user: clientInfo
        ? {
            number: clientInfo.wid?.user,
            name: clientInfo.pushname,
          }
        : null,
    };
  },

  /**
   * Send a direct text message to a WhatsApp number
   * @param {Object} options - { to, text }
   */
  sendTextMessage: async ({ to, text }) => {
    const chatId = formatPhoneNumber(to);
    if (!chatId || !text) {
      logger.warn(`[WHATSAPP SKIPPED] Missing recipient phone or empty message: ${to}`);
      return false;
    }

    if (env.WHATSAPP?.ENABLED === false) {
      logger.info(`[WHATSAPP SIMULATED - DISABLED] To: ${chatId} | Text: ${text.slice(0, 100)}...`);
      return true;
    }

    // If client is still initializing, wait up to 15 seconds
    if (clientStatus === "INITIALIZING") {
      logger.info(`[WHATSAPP WAITING] WhatsApp client is currently '${clientStatus}'. Waiting for ready...`);
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if ((clientStatus === "CONNECTED" || clientStatus === "AUTHENTICATED") && client) break;
      }
    }

    // Allow sending if CONNECTED or AUTHENTICATED with active client
    const canSend = (clientStatus === "CONNECTED" || clientStatus === "AUTHENTICATED") && client;
    if (!canSend) {
      logger.warn(
        `[WHATSAPP NOT CONNECTED] Cannot send message to ${chatId}. Status is '${clientStatus}'. Please scan QR code at /admin/whatsapp to connect.`
      );
      return false;
    }

    try {
      let targetChatId = chatId;
      const rawNumber = chatId.replace("@c.us", "");

      // Resolve WhatsApp ID using getNumberId so WhatsApp Web initializes the chat
      try {
        const numberDetails = await client.getNumberId(rawNumber);
        if (numberDetails && numberDetails._serialized) {
          targetChatId = numberDetails._serialized;
        } else {
          logger.info(`[WHATSAPP] getNumberId didn't return serialized ID for ${rawNumber}, using default ${chatId}`);
        }
      } catch (numErr) {
        logger.warn(`[WHATSAPP] getNumberId notice for ${rawNumber}:`, numErr?.message || numErr);
      }

      logger.info(`[WHATSAPP DISPATCH] Sending to ${targetChatId}...`);
      const sentMsg = await client.sendMessage(targetChatId, text.trim());
      logger.info(`[WHATSAPP SENT] Successfully delivered WhatsApp message to ${targetChatId} (ID: ${sentMsg?.id?._serialized || sentMsg?.id?.id || "OK"})`);
      return true;
    } catch (error) {
      logger.error(`[WHATSAPP SEND ERROR] Failed sending to ${chatId}:`, error?.message || error);
      return false;
    }
  },

  /**
   * Compatibility wrapper for template message (sends as formatted text via whatsapp-web.js)
   */
  sendTemplate: async ({ to, templateName, bodyParams = [] }) => {
    const text = bodyParams.length > 0 ? bodyParams.join("\n") : `Notice from RIFAH Chamber (${templateName})`;
    return whatsappService.sendTextMessage({ to, text });
  },

  /**
   * Test Message
   */
  sendTestMessage: async (phone) => {
    const text = `✅ *RIFAH Chamber WhatsApp Test*\n\nHello! WhatsApp Web automation is working successfully!\n\n_RIFAH Chamber of Commerce & Industry_`;
    return whatsappService.sendTextMessage({ to: phone, text });
  },

  sendTestHelloWorld: async (phone) => {
    return whatsappService.sendTestMessage(phone);
  },

  /**
   * 1. Event Registration & Ticket (Event Booking)
   */
  sendEventTicket: async ({ phone, userName, eventTitle, eventDate, location, ticketId, verificationUrl }) => {
    const text = `🎟️ *Event Confirmation - RIFAH Chamber*\n\nDear *${userName}*,\nYour seat for *${eventTitle}* is confirmed! ✅\n\n📅 *Date:* ${eventDate}\n📍 *Venue:* ${location}\n🎫 *Ticket ID:* ${ticketId}\n\n${
      verificationUrl ? `🔗 *Digital Pass:* ${verificationUrl}\n\n` : ""
    }Please show this confirmation at the registration desk.\n\n_RIFAH Chamber of Commerce & Industry_`;

    return whatsappService.sendTextMessage({ to: phone, text });
  },

  /**
   * 2. Payment Receipt / Invoice
   */
  sendPaymentReceipt: async ({ phone, userName, amount, purpose, receiptNumber, invoiceUrl }) => {
    const frontendBaseUrl = (env.FRONTEND_URL || "https://rifah.nexcorealliance.com").replace(/\/$/, "");
    const finalInvoiceUrl =
      invoiceUrl ||
      (receiptNumber ? `${frontendBaseUrl}/verify/invoice/${encodeURIComponent(receiptNumber)}` : "");

    const text = `🧾 *Payment Receipt - RIFAH Chamber*\n\nDear *${userName}*,\nWe have received your payment of *₹${amount}* for *${purpose}*. ✅\n\n📄 *Receipt / Invoice No:* ${receiptNumber}\n\n${
      finalInvoiceUrl ? `🔗 *Download Invoice:* ${finalInvoiceUrl}\n\n` : ""
    }Thank you for your association with RIFAH Chamber!\n\n_RIFAH Chamber of Commerce & Industry_`;

    return whatsappService.sendTextMessage({ to: phone, text });
  },

  /**
   * 3. New Business Enquiry Notification
   */
  sendNewEnquiry: async ({ phone, ownerName, enquiryTitle, buyerName, buyerPhone, message }) => {
    const frontendBaseUrl = (env.FRONTEND_URL || "https://rifah.nexcorealliance.com").replace(/\/$/, "");
    const text = `💼 *New Business Enquiry Alert!*\n\nHello *${ownerName || "Member"}*,\nYou have received a new business enquiry for *${enquiryTitle}* on the RIFAH Portal.\n\n👤 *Buyer:* ${buyerName}\n📞 *Contact:* ${
      buyerPhone || "Available in Portal"
    }\n💬 *Requirement:* "${message || ""}"\n\n👉 *Login to your RIFAH portal to view and reply:* ${frontendBaseUrl}/biz/enquiries\n\n_RIFAH Chamber of Commerce & Industry_`;

    return whatsappService.sendTextMessage({ to: phone, text });
  },

  /**
   * 4. Birthday Wishes
   */
  sendBirthdayWish: async ({ phone, name, businessName, chapter }) => {
    const text = `🎉 *Happy Birthday, ${name}!* 🎂\n\nRIFAH Chamber of Commerce & Industry extends warmest wishes to you${
      businessName ? ` and the team at *${businessName}*` : ""
    } on this special day! 🌟\n\nMay the year ahead bring you continuous growth, prosperity, and success in business.\n\nWarm regards,\n*${
      chapter ? `${chapter} - ` : ""
    }RIFAH Chamber of Commerce & Industry*`;

    return whatsappService.sendTextMessage({ to: phone, text });
  },

  /**
   * 5. Business Anniversary Wishes
   */
  sendAnniversaryWish: async ({ phone, name, businessName, years = 1, chapter }) => {
    const text = `🎊 *Happy Business Anniversary!* 💐\n\nDear *${name}*,\nRIFAH Chamber congratulates you and *${
      businessName || "your business"
    }* on completing *${years} year(s)* of enterprise and business excellence! 🚀\n\nThank you for being a valued pillar of *${
      chapter || "RIFAH Chamber"
    }*.\n\n_RIFAH Chamber of Commerce & Industry_`;

    return whatsappService.sendTextMessage({ to: phone, text });
  },

  /**
   * 6. One-to-One Meeting Notification
   */
  sendOneToOneMeeting: async ({
    phone,
    counterpartName,
    requesterName,
    requesterBusiness,
    meetingDate,
    meetingTime,
    location,
    description,
  }) => {
    const frontendBaseUrl = (env.FRONTEND_URL || "https://rifah.nexcorealliance.com").replace(/\/$/, "");
    const text = `🤝 *1-to-1 Networking Meeting Scheduled*\n\nDear *${counterpartName}*,\nA 1-to-1 business meeting has been recorded with *${requesterName}* (${
      requesterBusiness || "RIFAH Member"
    }).\n\n📅 *Date:* ${meetingDate}\n⏰ *Time:* ${meetingTime}\n📍 *Location:* ${location}\n📝 *Discussion / Purpose:* ${description}\n\n👉 *View in Portal:* ${frontendBaseUrl}/biz/networking\n\n_RIFAH Chamber of Commerce & Industry_`;

    return whatsappService.sendTextMessage({ to: phone, text });
  },

  /**
   * 7. Thank You Note for Business Closed
   */
  sendThankYouNote: async ({ phone, giverName, receiverName, receiverBusiness, amount, note }) => {
    const text = `🙏 *Thank You Note - Business Closed!*\n\nDear *${giverName}*,\n*${receiverName}* from *${receiverBusiness}* has given you a Thank You Note for business generated!\n\n💰 *Closed Business Value:* ₹${Number(
      amount
    ).toLocaleString("en-IN")}\n${note ? `💬 *Message:* "${note}"\n` : ""}\nThank you for being an active contributor to the RIFAH business network!\n\n_RIFAH Chamber of Commerce & Industry_`;

    return whatsappService.sendTextMessage({ to: phone, text });
  },

  /**
   * 8. Welcome Message (New User / Member)
   */
  sendWelcomeMessage: async ({ phone, name, role, portalLink }) => {
    const defaultPortal = `${(env.FRONTEND_URL || "https://rifah.nexcorealliance.com").replace(/\/$/, "")}/biz`;
    const targetLink = portalLink || defaultPortal;
    const text = `🌟 *Welcome to RIFAH Chamber of Commerce & Industry!*\n\nDear *${name}*,\nThank you for joining the RIFAH Business Network. Your account is now active!\n\nExplore business listings, connect with fellow entrepreneurs, attend exclusive chamber events, and grow your enterprise.\n\n👉 *Access Portal:* ${targetLink}\n\n_RIFAH Chamber of Commerce & Industry_`;

    return whatsappService.sendTextMessage({ to: phone, text });
  },

  /**
   * 9. Membership Welcome & Certificate Ready
   */
  sendMembershipWelcome: async ({ phone, name, tier, businessName, portalLink }) => {
    const defaultPortal = `${(env.FRONTEND_URL || "https://rifah.nexcorealliance.com").replace(/\/$/, "")}/biz`;
    const targetLink = portalLink || defaultPortal;
    const text = `🌟 *Welcome to RIFAH Chamber of Commerce!*\n\nDear *${name}*,\nYour *${tier}* membership for *${
      businessName || "your business"
    }* is now *ACTIVE*! 🎉\n\nYour official membership certificate is generated and ready to download.\n\n👉 *Access Member Portal:* ${targetLink}\n\n_RIFAH Chamber of Commerce & Industry_`;

    return whatsappService.sendTextMessage({ to: phone, text });
  },

  /**
   * 10. Business Referral Alert
   */
  sendReferralAlert: async ({
    phone,
    recipientName,
    referrerName,
    referrerBusiness,
    leadName,
    leadContact,
    description,
  }) => {
    const frontendBaseUrl = (env.FRONTEND_URL || "https://rifah.nexcorealliance.com").replace(/\/$/, "");
    const text = `🚀 *New Business Referral Alert!*\n\nDear *${recipientName}*,\n*${referrerName}* (${
      referrerBusiness || "RIFAH Member"
    }) has referred a new business lead to you!\n\n👤 *Lead Name:* ${leadName}\n📞 *Lead Contact:* ${
      leadContact || "Check in Portal"
    }\n📋 *Requirement:* ${description}\n\n👉 *Track this referral:* ${frontendBaseUrl}/biz/networking\n\n_RIFAH Chamber of Commerce & Industry_`;

    return whatsappService.sendTextMessage({ to: phone, text });
  },

  /**
   * Graceful cleanup
   */
  destroy: async () => {
    if (client) {
      try {
        await client.destroy();
        clientStatus = "DISCONNECTED";
        logger.info("[WHATSAPP] WhatsApp client destroyed gracefully.");
      } catch (err) {
        logger.error("[WHATSAPP DESTROY ERROR]:", err?.message || err);
      }
    }
  },
};
