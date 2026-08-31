import { verifyAccessToken } from "../infrastructure/auth/jwt.js";
import { UnauthorizedError, ForbiddenError } from "../shared/errors/errors.js";
import { ERROR_CODES } from "../shared/errors/error-codes.js";

/**
 * Middleware to authenticate requests using JWT Bearer token
 */
export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Authentication token is required", ERROR_CODES.UNAUTHORIZED));
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded; // { id, email, role, chapterId, businessId }
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new UnauthorizedError("Authentication token has expired", ERROR_CODES.TOKEN_EXPIRED));
    }
    return next(new UnauthorizedError("Invalid authentication token", ERROR_CODES.TOKEN_INVALID));
  }
};

/**
 * Optional authentication middleware - attaches req.user if token is present, proceeds anyway if not
 */
export const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      req.user = verifyAccessToken(token);
    } catch {
      // Ignore token errors for optional auth
    }
  }
  next();
};
