import { env } from "./env.js";

export const corsConfig = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    const allowedOrigins = env.CORS.ORIGIN.split(",").map((o) => o.trim());
    if (allowedOrigins.includes(origin) || allowedOrigins.includes("*") || env.isDevelopment()) {
      return callback(null, true);
    }

    return callback(new Error(`CORS Error: Origin ${origin} not allowed by policy`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  exposedHeaders: ["Content-Range", "X-Content-Range", "Authorization"],
  maxAge: 86400,
};
