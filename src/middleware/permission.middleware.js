import { ForbiddenError, UnauthorizedError } from "../shared/errors/errors.js";
import { ROLES } from "../shared/constants/roles.js";

/**
 * Checks if current user has the required permission
 * Super admins bypass all permission checks automatically
 * @param {string} permission
 */
export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }

    if (req.user.role === ROLES.SUPER_ADMIN || req.user.role === ROLES.SECRETARIAT) {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    if (!userPermissions.includes(permission)) {
      return next(new ForbiddenError(`Missing required permission: ${permission}`));
    }

    next();
  };
};
