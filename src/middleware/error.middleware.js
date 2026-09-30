import { AppError } from "../shared/errors/AppError.js";
import { ERROR_CODES } from "../shared/errors/error-codes.js";
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

  // BUG-058: Multer throws raw, cryptic errors ("Unexpected field", "File too large")
  // with no statusCode of their own, so they fell through to a bare 500 with that exact
  // literal text as the message — e.g. selecting more files than an upload.array(field,
  // maxCount) route allows throws code LIMIT_UNEXPECTED_FILE (not LIMIT_FILE_COUNT, which
  // is Multer's own confusingly-named behavior for exceeding that per-field cap), and the
  // frontend showed "Unexpected field" verbatim in the toast. Translate every Multer error
  // code to a real status + a message someone can actually act on.
  if (err.name === "MulterError") {
    statusCode = 400;
    code = err.code;
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        statusCode = 413;
        message = "That file is too large. Please choose a smaller file and try again.";
        break;
      case "LIMIT_UNEXPECTED_FILE":
        message = "Too many files selected for one upload (max 12 at a time). Please select fewer files and try again.";
        break;
      case "LIMIT_FILE_COUNT":
        message = "Too many files selected. Please select fewer files and try again.";
        break;
      case "LIMIT_FIELD_COUNT":
      case "LIMIT_PART_COUNT":
        message = "Too much data in this upload. Please try again with fewer files.";
        break;
      default:
        message = "Could not process the uploaded file(s). Please try again.";
    }
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
    code,
    message,
    error: {
      code,
      message,
    },
  };

  if (details) {
    responsePayload.error.details = details;
  }

  res.status(statusCode).json(responsePayload);
};
