export class AppError extends Error {
  /**
   * @param {string} message - Error description
   * @param {number} [statusCode=500] - HTTP status code
   * @param {string} [code="INTERNAL_SERVER_ERROR"] - Standardized machine error code
   * @param {Array|Object} [details=null] - Additional validation or contextual details
   */
  constructor(message, statusCode = 500, code = "INTERNAL_SERVER_ERROR", details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}
