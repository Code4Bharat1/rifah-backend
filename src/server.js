import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./infrastructure/database/mongoose.js";
import { logger } from "./infrastructure/logger/logger.js";
import { initSocket } from "./infrastructure/socket/socket.js";
import { eventService } from "./modules/events/event.service.js";
import { birthdayService } from "./modules/birthdays/birthday.service.js";
import { anniversaryService } from "./modules/anniversaries/anniversary.service.js";
import { announcementService } from "./modules/announcements/announcement.service.js";
import { membershipService } from "./modules/memberships/membership.service.js";
import { seedInitialCategories } from "./modules/categories/categories.data.js";
import { Chapter } from "./modules/chapters/chapter.model.js";
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
let server;


const ensureChapters = async () => {
  try {
    const SEED_CHAPTERS = [
      // ── Maharashtra ──────────────────────────────────────────────────────
      {
        name: "Mumbai Chapter",
        slug: "mumbai-chapter",
        city: "Mumbai",
        state: "Maharashtra",
        lead: "Chapter Secretary",
        status: "Active",
      },
      {
        name: "Pune Chapter",
        slug: "pune-chapter",
        city: "Pune",
        state: "Maharashtra",
        lead: "Chapter Secretary",
        status: "Active",
      },
      {
        name: "Nagpur Chapter",
        slug: "nagpur-chapter",
        city: "Nagpur",
        state: "Maharashtra",
        lead: "Chapter Secretary",
        status: "Active",
      },
      // ── Delhi / NCR ──────────────────────────────────────────────────────
      {
        name: "Delhi Central Chapter",
        slug: "delhi-central-chapter",
        city: "New Delhi",
        state: "Delhi",
        lead: "Chapter Secretary",
        status: "Active",
      },
      {
        name: "Gurugram Chapter",
        slug: "gurugram-chapter",
        city: "Gurugram",
        state: "Delhi",
        lead: "Chapter Secretary",
        status: "Active",
      },
      // ── Karnataka ────────────────────────────────────────────────────────
      {
        name: "Bengaluru Chapter",
        slug: "bengaluru-chapter",
        city: "Bengaluru",
        state: "Karnataka",
        lead: "Chapter Secretary",
        status: "Active",
      },
      // ── Tamil Nadu ───────────────────────────────────────────────────────
      {
        name: "Chennai Chapter",
        slug: "chennai-chapter",
        city: "Chennai",
        state: "Tamil Nadu",
        lead: "Chapter Secretary",
        status: "Active",
      },
      {
        name: "Coimbatore Chapter",
        slug: "coimbatore-chapter",
        city: "Coimbatore",
        state: "Tamil Nadu",
        lead: "Chapter Secretary",
        status: "Active",
      },
    ];

    let upserted = 0;
    for (const ch of SEED_CHAPTERS) {
      await Chapter.findOneAndUpdate(
        { slug: ch.slug },
        { $setOnInsert: { name: ch.name, city: ch.city, state: ch.state, lead: ch.lead, slug: ch.slug }, $set: { status: ch.status } },
        { upsert: true, new: true }
      );
      upserted++;
    }

    const total = await Chapter.countDocuments();
    logger.info(`[CHAPTER SETUP] Ensured ${upserted} seed chapters. Total chapters in DB: ${total}`);
  } catch (err) {
    logger.error("[CHAPTER SETUP ERROR]", err);
  }
};



const startServer = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDatabase();

    // 1.1 Ensure Categories & Subcategories are populated (500+ items)
    await seedInitialCategories();

    // 1.2 Ensure test chapters across multiple states exist
    await ensureChapters();

    // 1.4 Clean up any seeded Anniversary Test Data
    await anniversaryService.cleanAnniversaryTestData();

    // 2. Start Scheduled Background Tasks
    eventService.startEventScheduler();
    birthdayService.startBirthdayScheduler();
    anniversaryService.startAnniversaryScheduler();
    membershipService.startMembershipExpiryScheduler();

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
