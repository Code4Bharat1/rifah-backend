/**
 * Wraps async Express route handlers/middleware to catch errors and pass them to next()
 * @param {Function} fn - Async express handler
 * @returns {Function} Express middleware
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
