import { ForbiddenError, UnauthorizedError } from "../shared/errors/errors.js";
import { ROLE_HIERARCHY } from "../shared/constants/roles.js";

/**
 * Restricts route access to specific roles
 * @param  {...string} allowedRoles
 */
export const requireRole = (...allowedRoles) => {
  const roles = allowedRoles.flat();
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }

    const userRole = req.user.role;

    if (roles.includes(userRole)) {
      return next();
    }

    return next(
      new ForbiddenError(`Access denied. Requires one of: ${roles.join(", ")}`)
    );
  };
};

/**
 * Ensures user has at least the minimum role level in hierarchy
 * @param {string} minimumRole
 */
export const requireMinRole = (minimumRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] ?? -1;
    const requiredLevel = ROLE_HIERARCHY[minimumRole] ?? 999;

    if (userLevel < requiredLevel) {
      return next(
        new ForbiddenError(
          `Access denied. Requires minimum role: ${minimumRole}`
        )
      );
    }

    next();
  };
};
