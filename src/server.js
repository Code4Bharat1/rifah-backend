import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./infrastructure/database/mongoose.js";
import { logger } from "./infrastructure/logger/logger.js";
import { initSocket } from "./infrastructure/socket/socket.js";
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
let server;

const startServer = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDatabase();

    // 2. Start HTTP Server
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
