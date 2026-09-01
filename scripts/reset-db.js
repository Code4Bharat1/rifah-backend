import mongoose from "mongoose";
import { env } from "../src/config/env.js";

const resetDb = async () => {
  try {
    console.log("🗑️  Connecting to MongoDB to DROP database...");
    await mongoose.connect(env.DATABASE.URI);
    await mongoose.connection.dropDatabase();
    console.log("✅ Database dropped successfully!");
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to drop database:", error);
    process.exit(1);
  }
};

resetDb();
