import rateLimit from "express-rate-limit";
import { securityConfig } from "../config/security.js";

export const rateLimitMiddleware = rateLimit(securityConfig.rateLimit);

export const authRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // Increased for development/testing (was 30)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_AUTH_ATTEMPTS",
      message: "Too many login attempts. Please try again in 15 minutes.",
    },
  },
});

export const gstRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // max 30 GST lookups per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_GST_REQUESTS",
      message: "Too many GST verification requests. Please try again after 15 minutes.",
    },
  },
});
