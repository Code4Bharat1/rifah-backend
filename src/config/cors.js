import { env } from "./env.js";

export const corsConfig = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    const allowedOrigins = (env.CORS.ORIGIN || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    const frontendUrls = (env.FRONTEND_URL || "")
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);

    const isExplicitlyAllowed =
      allowedOrigins.includes(origin) ||
      frontendUrls.includes(origin) ||
      (env.isDevelopment() && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));

    if (isExplicitlyAllowed) {
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
