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
import cluster from "node:cluster";
import os from "node:os";
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

    const existingCount = await Chapter.countDocuments();
    if (existingCount > 0) {
      return;
    }

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

    // BUG-057: demo/fixture data for the Anniversary feature — not required for the
    // server to function, so (like ensureChapters above) a failure here must only be
    // logged, never take the whole API down via the catch block's process.exit(1)
    // below. This previously crashed boot outright on an E11000 duplicate-key error
    // (see anniversary.service.js for the underlying race-condition fix).
    try {
      // 1.4 Clean up any seeded Anniversary Test Data
      await anniversaryService.cleanAnniversaryTestData();

      // 1.3 Ensure Anniversary Test Data
      await anniversaryService.seedAnniversaryTestData({ chapter: "Mumbai" });
    } catch (err) {
      logger.error("[ANNIVERSARY SEED ERROR] Skipping demo data, server will continue starting:", err);
    }

    // 2. Start Scheduled Background Tasks (Only run schedulers on primary worker to prevent duplicate jobs)
    const isPrimaryWorker = !cluster.isWorker || cluster.worker?.id === 1;
    if (isPrimaryWorker) {
      logger.info("[SCHEDULER] Primary worker initialized background schedulers.");
      eventService.startEventScheduler();
      birthdayService.startBirthdayScheduler();
      anniversaryService.startAnniversaryScheduler();
      membershipService.startMembershipExpiryScheduler();

      // Scaled for 10k/50k users: Periodic background sync of copilot knowledge base off the request path
      setInterval(async () => {
        try {
          const { syncLiveEntitiesToFile } = await import("./modules/copilot/copilot.sync.js");
          await syncLiveEntitiesToFile(true);
        } catch (err) {
          logger.warn("[SCHEDULER] Periodic knowledge base sync notice:", err?.message || err);
        }
      }, 1000 * 60 * 60); // Once every 1 hour
    }

    // 3. Start HTTP Server
    server = app.listen(env.PORT, "0.0.0.0", () => {
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

// Scaled for 10k users: Multi-core cluster mode
const shouldCluster =
  (process.env.NODE_ENV === "production" || process.env.ENABLE_CLUSTER === "true") &&
  cluster.isPrimary;

if (shouldCluster) {
  const numCPUs = Math.min(os.cpus().length, 8);
  logger.info(`[CLUSTER PRIMARY] Starting ${numCPUs} worker processes to handle 10k users on all CPU cores...`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // Scaled for 10k/50k users: Forward IPC WebSocket broadcasts across all worker processes
  cluster.on("message", (worker, message) => {
    if (message && message.type === "SOCKET_IPC_BROADCAST") {
      for (const id in cluster.workers) {
        const w = cluster.workers[id];
        if (w && w.id !== worker.id) {
          try {
            w.send(message);
          } catch {}
        }
      }
    }
  });

  cluster.on("exit", (worker, code, signal) => {
    logger.warn(`[CLUSTER] Worker ${worker.process.pid} exited (code: ${code}, signal: ${signal}). Spawning replacement worker...`);
    cluster.fork();
  });
} else {
  startServer();
}
