import { env } from "./env.js";

export const databaseConfig = {
  uri: env.DATABASE.URI,
  options: {
    autoIndex: env.isDevelopment(),
    minPoolSize: 5,
    maxPoolSize: 100, // Scaled for 10k users: prevents connection queuing
    maxIdleTimeMS: 120000, // 2 minutes (prevents aggressive idle connection drops on Atlas)
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 60000,
    connectTimeoutMS: 15000,
    retryWrites: true,
  },
};
