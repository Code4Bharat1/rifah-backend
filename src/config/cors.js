import { env } from "./env.js";

export const corsConfig = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    const allowedOrigins = (env.CORS.ORIGIN || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    if (
      allowedOrigins.includes(origin) ||
      allowedOrigins.includes("*") ||
      (env.FRONTEND_URL && origin === env.FRONTEND_URL) ||
      (env.FRONTEND_URL && env.FRONTEND_URL.split(",").map((u) => u.trim()).includes(origin))
    ) {
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
