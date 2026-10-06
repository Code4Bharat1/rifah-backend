import { verifyAccessToken } from "../infrastructure/auth/jwt.js";
import { UnauthorizedError, ForbiddenError } from "../shared/errors/errors.js";
import { ERROR_CODES } from "../shared/errors/error-codes.js";
import { User } from "../modules/users/user.model.js";

// Direct-link downloads (<img>/<a>/window.open) cannot send an Authorization header, so a
// ?token= query param is tolerated for GET requests to these routes only. Everywhere else a
// URL-borne token would leak via logs/Referer, so it is ignored.
const QUERY_TOKEN_ROUTES = /\/(certificates|download|export|pdf|invoice)(\/|$|\.)/i;

/**
 * Middleware to authenticate requests using JWT Bearer token
 */
export const authMiddleware = async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.query.token && req.method === "GET" && QUERY_TOKEN_ROUTES.test(req.path)) {
    token = req.query.token;
  }

  if (!token) {
    return next(new UnauthorizedError("Please log in to continue", ERROR_CODES.UNAUTHORIZED));
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new UnauthorizedError("Your session has expired. Please log in again", ERROR_CODES.TOKEN_EXPIRED));
    }
    return next(new UnauthorizedError("Please log in to continue", ERROR_CODES.TOKEN_INVALID));
  }

  try {
    // The token is only a claim of identity: the account must still exist, be usable, and the
    // session must not have been revoked (logout / password change) since the token was issued.
    const userDoc = await User.findById(decoded.id).select("status state tokensValidAfter").lean();
    if (!userDoc) {
      return next(new UnauthorizedError("Please log in to continue", ERROR_CODES.TOKEN_INVALID));
    }
    if (userDoc.status === "Suspended" || userDoc.status === "Deactivated") {
      return next(new ForbiddenError("This account is not active. Please contact support."));
    }
    if (userDoc.tokensValidAfter && decoded.iat < Math.floor(new Date(userDoc.tokensValidAfter).getTime() / 1000)) {
      return next(new UnauthorizedError("Your session has ended. Please log in again", ERROR_CODES.TOKEN_INVALID));
    }

    req.user = decoded; // { id, email, role, chapterId, businessId, state }
    // Ensure state is populated on req.user (even if token was generated prior to state inclusion)
    if (!decoded.state && userDoc.state) {
      req.user.state = userDoc.state;
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication middleware - attaches req.user if a *fully valid* session is present
 * (same checks as authMiddleware: signature, expiry, account status, revocation); otherwise
 * continues anonymously instead of failing.
 */
export const optionalAuthMiddleware = (req, res, next) => {
  authMiddleware(req, res, (err) => {
    if (err) req.user = undefined;
    next();
  });
};
