import rateLimit from "express-rate-limit";
import { securityConfig } from "../config/security.js";

export const rateLimitMiddleware = rateLimit({
  ...securityConfig.rateLimit,
  keyGenerator: (req) => (req.user?._id ? `user_${req.user._id}` : req.ip),
});

export const authRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.AUTH_RATE_LIMIT_MAX ? parseInt(process.env.AUTH_RATE_LIMIT_MAX) : 30,
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
  max: 1000, // Increased for smooth user testing and verification
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

export const verificationRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120, // 120 scans per 15 min per IP to prevent enumeration while allowing active event desks
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_VERIFICATION_REQUESTS",
      message: "Too many verification requests. Please try again after 15 minutes.",
    },
  },
});
