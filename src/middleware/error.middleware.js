import { AppError } from "../shared/errors/AppError.js";
import { ERROR_CODES } from "../shared/errors/error-codes.js";
import { env } from "../config/env.js";
import { logger } from "../infrastructure/logger/logger.js";

/**
 * Centralized Express error-handling middleware
 */
export const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let code = err.code || ERROR_CODES.INTERNAL_SERVER_ERROR;
  let message = err.message || "Internal Server Error";
  let details = err.details || null;

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === "CastError") {
    statusCode = 400;
    code = "INVALID_ID_FORMAT";
    message = `Resource not found with specified ${err.path}`;
  }

  // Handle Mongoose Duplicate Key Error (11000)
  if (err.code === 11000) {
    statusCode = 409;
    code = ERROR_CODES.CONFLICT;
    const field = Object.keys(err.keyValue || {})[0] || "field";
    message = `Duplicate value entered for ${field}. Please use another value.`;
  }

  // Handle Mongoose ValidationError
  if (err.name === "ValidationError" && err.errors) {
    statusCode = 422;
    code = ERROR_CODES.VALIDATION_ERROR;
    details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    message = "Database validation failed";
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    code = ERROR_CODES.TOKEN_INVALID;
    message = "Invalid token. Please authenticate again.";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    code = ERROR_CODES.TOKEN_EXPIRED;
    message = "Token has expired. Please authenticate again.";
  }

  // Log error if it's not a standard operational 4xx error
  if (statusCode >= 500) {
    logger.error(`[500 ERROR] ${req.method} ${req.originalUrl}:`, err);
  }

  const responsePayload = {
    success: false,
    statusCode,
    error: {
      code,
      message,
    },
  };

  if (details) {
    responsePayload.error.details = details;
  }

  if (env.isDevelopment() && statusCode >= 500) {
    responsePayload.error.stack = err.stack;
  }

  res.status(statusCode).json(responsePayload);
};
