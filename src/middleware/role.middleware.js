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
    const isCentralAdminUser = userRole === "central_admin" || userRole === "super_admin" || userRole === "admin";
    const allowsCentralAdmin = roles.includes("central_admin") || roles.includes("super_admin") || roles.includes("admin");

    if (roles.includes(userRole) || (isCentralAdminUser && allowsCentralAdmin)) {
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

    const userLevel = ROLE_HIERARCHY[req.user.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole] ?? 100;

    if (userLevel < requiredLevel) {
      return next(new ForbiddenError("Insufficient role permissions"));
    }

    next();
  };
};
