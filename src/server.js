import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./infrastructure/database/mongoose.js";
import { logger } from "./infrastructure/logger/logger.js";
import { initSocket } from "./infrastructure/socket/socket.js";
import { eventService } from "./modules/events/event.service.js";
import { birthdayService } from "./modules/birthdays/birthday.service.js";
import { anniversaryService } from "./modules/anniversaries/anniversary.service.js";
import { announcementService } from "./modules/announcements/announcement.service.js";
import { seedInitialCategories } from "./modules/categories/categories.data.js";
import { User } from "./modules/users/user.model.js";
import { Business } from "./modules/businesses/business.model.js";
import { Chapter } from "./modules/chapters/chapter.model.js";
import { hashPassword } from "./infrastructure/auth/password.js";
import { ROLES } from "./shared/constants/roles.js";
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
let server;

const ensureUserAccount = async () => {
  try {
    const email = "rs994086@gmail.com";
    const password = "Password@123";
    const passwordHash = await hashPassword(password);

    let chapterDoc = await Chapter.findOne({ status: "Active" });
    const chapterName = chapterDoc ? chapterDoc.name : "Mumbai";
    const chapterId = chapterDoc ? chapterDoc._id : null;

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: "Raj",
        email,
        passwordHash,
        phone: "9876543210",
        whatsapp: "9876543210",
        chapter: chapterName,
        chapterId,
        role: ROLES.BUSINESS_OWNER,
        status: "Active",
        isProfileComplete: true,
        dob: new Date("2026-09-18"),
        timezone: "Asia/Kolkata",
      });
      logger.info(`[USER SETUP] Created user ${email} with password: ${password}`);
    } else {
      user.passwordHash = passwordHash;
      user.status = "Active";
      user.isProfileComplete = true;
      user.dob = new Date("2026-09-18");
      user.timezone = "Asia/Kolkata";
      await user.save();
      logger.info(`[USER SETUP] Updated user ${email} password to: ${password}`);
    }

    let business = await Business.findOne({ owner: user._id });
    if (!business) {
      business = await Business.create({
        name: "Raj Enterprises",
        slug: `raj-enterprises-${Date.now().toString().slice(-4)}`,
        owner: user._id,
        contactPerson: "Raj",
        industry: "Information Technology",
        categories: ["Information Technology", "Software Services"],
        businessType: "Proprietorship",
        city: "Mumbai",
        state: "Maharashtra",
        chapter: chapterName,
        chapterId,
        membership: "Premium",
        dob: new Date("2026-09-18"),
        timezone: "Asia/Kolkata",
        phone: "9876543210",
        whatsapp: "9876543210",
        email: email,
        ownerEmail: email,
        status: "Active",
        verification: "pending",
        verificationStatus: "pending",
      });
      logger.info(`[BUSINESS SETUP] Created business for ${email}`);
    } else {
      business.status = "Active";
      business.verification = "pending";
      business.verificationStatus = "pending";
      business.dob = new Date("2026-09-18");
      business.timezone = "Asia/Kolkata";
      await business.save();
    }
  } catch (err) {
    logger.error("[USER SETUP ERROR]", err);
  }
};

const startServer = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDatabase();

    // 1.1 Ensure Categories & Subcategories are populated (500+ items)
    await seedInitialCategories();

    // 1.2 Ensure User Account for testing
    await ensureUserAccount();

    // 2. Start Scheduled Background Tasks
    eventService.startEventScheduler();
    birthdayService.startBirthdayScheduler();
    anniversaryService.startAnniversaryScheduler();

    // 3. Start HTTP Server
    server = app.listen(env.PORT, () => {
      logger.info(`Port:${env.PORT}`);
      logger.info(`Health Check: http://localhost:${env.PORT}/health`);
    });

    // 3. Initialize Socket.io Server
    initSocket(server);
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Handle graceful shutdowns
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Gracefully shutting down...`);
  if (server) {
    server.close(async () => {
      logger.info("HTTP server closed.");
      await disconnectDatabase();
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

startServer();
