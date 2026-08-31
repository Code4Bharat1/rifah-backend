import { NotFoundError } from "../shared/errors/errors.js";

/**
 * 404 Route Not Found Middleware
 */
export const notFoundMiddleware = (req, res, next) => {
  next(new NotFoundError(`Cannot find endpoint ${req.method} ${req.originalUrl} on this server`));
};
