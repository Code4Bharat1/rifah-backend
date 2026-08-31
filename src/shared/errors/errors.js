import { AppError } from "./AppError.js";
import { ERROR_CODES } from "./error-codes.js";

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details = null) {
    super(message, 400, ERROR_CODES.BAD_REQUEST, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized access", code = ERROR_CODES.UNAUTHORIZED) {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden access", code = ERROR_CODES.FORBIDDEN) {
    super(message, 403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", code = ERROR_CODES.NOT_FOUND) {
    super(message, 404, code);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict", code = ERROR_CODES.CONFLICT) {
    super(message, 409, code);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details = null) {
    super(message, 422, ERROR_CODES.VALIDATION_ERROR, details);
  }
}
