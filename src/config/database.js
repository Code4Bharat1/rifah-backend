import { env } from "./env.js";

export const databaseConfig = {
  uri: env.DATABASE.URI,
  options: {
    autoIndex: env.isDevelopment(),
    minPoolSize: 5,
    maxPoolSize: 20,
    maxIdleTimeMS: 45000,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 60000,
    connectTimeoutMS: 15000,
    retryWrites: true,
  },
};
