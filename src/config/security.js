import { env } from "./env.js";

export const securityConfig = {
  rateLimit: {
    windowMs: env.RATE_LIMIT.WINDOW_MS,
    max: env.RATE_LIMIT.MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests from this IP, please try again later.",
      },
    },
  },
  helmet: {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  },
  bcrypt: {
    saltRounds: env.JWT.BCRYPT_SALT_ROUNDS,
  },
};
