import { ForbiddenError, UnauthorizedError } from "../shared/errors/errors.js";
import { ROLE_HIERARCHY, ROLES } from "../shared/constants/roles.js";

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

    // secretariat is central_admin's equal everywhere - see roles.js
    const userRole = req.user.role === ROLES.SECRETARIAT ? ROLES.CENTRAL_ADMIN : req.user.role;

    const effectiveRoles = [userRole];
    if (req.user.orgPanelType === "chapter-admin") {
      effectiveRoles.push(ROLES.CHAPTER_ADMIN);
    } else if (req.user.orgPanelType === "state-admin") {
      effectiveRoles.push(ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN);
    } else if (req.user.orgPanelType === "central-admin") {
      effectiveRoles.push(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN);
    }

    if (roles.some((r) => effectiveRoles.includes(r))) {
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
