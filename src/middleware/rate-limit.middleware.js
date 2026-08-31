import rateLimit from "express-rate-limit";
import { securityConfig } from "../config/security.js";

export const rateLimitMiddleware = rateLimit(securityConfig.rateLimit);

export const authRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 attempts per 15 mins for sensitive auth routes
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
