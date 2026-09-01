import mongoose from "mongoose";
import { databaseConfig } from "../../config/database.js";
import { logger } from "../logger/logger.js";

export const connectDatabase = async () => {
  try {
    mongoose.set("strictQuery", true);
    const conn = await mongoose.connect(databaseConfig.uri, databaseConfig.options);

    logger.info(`Database connected successfully`);

    mongoose.connection.on("error", (err) => {
      logger.error("Database runtime connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected. Reconnecting...");
    });

    return conn;
  } catch (error) {
    logger.error("MongoDB initial connection error:", error.message);
    throw error;
  }
};

export const disconnectDatabase = async () => {
  try {
    await mongoose.connection.close();
    logger.info("MongoDB connection closed gracefully.");
  } catch (error) {
    logger.error("Error closing MongoDB connection:", error);
  }
};
