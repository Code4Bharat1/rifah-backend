import { env } from "./env.js";

export const databaseConfig = {
  uri: env.DATABASE.URI,
  options: {
    autoIndex: env.isDevelopment(),
    minPoolSize: 10,
    maxPoolSize: 100, // Scaled for 10k users: prevents connection queuing
    maxIdleTimeMS: 45000,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 60000,
    connectTimeoutMS: 15000,
    retryWrites: true,
  },
};
