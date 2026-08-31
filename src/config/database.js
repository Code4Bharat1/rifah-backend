import { env } from "./env.js";

export const databaseConfig = {
  uri: env.DATABASE.URI,
  options: {
    autoIndex: env.isDevelopment(),
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  },
};
