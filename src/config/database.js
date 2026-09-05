import { env } from "./env.js";

export const databaseConfig = {
  uri: env.DATABASE.URI,
  options: {
    autoIndex: env.isDevelopment(),
    maxPoolSize: 15,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 60000,
    connectTimeoutMS: 15000,
    retryWrites: true,
  },
};
