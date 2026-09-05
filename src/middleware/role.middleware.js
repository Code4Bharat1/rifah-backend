import { ForbiddenError, UnauthorizedError } from "../shared/errors/errors.js";
import { ROLE_HIERARCHY } from "../shared/constants/roles.js";

/**
 * Restricts route access to specific roles
 * @param  {...string} allowedRoles
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }

    console.log("DEBUG requireRole - user:", req.user.email, "role:", req.user.role, "allowedRoles:", allowedRoles);

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(`Access denied. Requires one of: ${allowedRoles.join(", ")}`)
      );
    }

    next();
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

    const userLevel = ROLE_HIERARCHY[req.user.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole] ?? 100;

    if (userLevel < requiredLevel) {
      return next(new ForbiddenError("Insufficient role permissions"));
    }

    next();
  };
};
