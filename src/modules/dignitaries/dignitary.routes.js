import { Router } from "express";
import { dignitaryController } from "./dignitary.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";

const router = Router();

import { ForbiddenError, UnauthorizedError } from "../../shared/errors/errors.js";
import { eventService } from "../events/event.service.js";

const requireDignitaryAccess = async (req, res, next) => {
  if (!req.user) {
    return next(new UnauthorizedError("Authentication required"));
  }
  const userRole = req.user.role;
  const adminRoles = [
    ROLES.CENTRAL_ADMIN,
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.SECRETARIAT,
    ROLES.COUNTRY_ADMIN,
    ROLES.STATE_ADMIN,
    ROLES.CHAPTER_ADMIN,
  ];
  if (adminRoles.includes(userRole)) {
    return next();
  }
  if (userRole === "guest_speaker_manager" || userRole === "guestManager") {
    return next();
  }
  // Check if assigned guestManager on any event
  try {
    const userId = req.user.id || req.user._id;
    const userRoles = await eventService.getUserEventRoles(userId);
    const hasGuestDuty = userRoles.some(
      (a) =>
        a.role === "guestManager" ||
        a.role === "guest_speaker_manager" ||
        (Array.isArray(a.roles) && (a.roles.includes("guestManager") || a.roles.includes("guest_speaker_manager")))
    );
    if (hasGuestDuty) {
      return next();
    }
  } catch (_) {}

  return next(
    new ForbiddenError("Access denied. Authorized administrators or Guest & Speaker Managers only.")
  );
};

// Protect all dignitary routes for authenticated admins & guest managers
router.use(authMiddleware, requireDignitaryAccess);

router.get("/", dignitaryController.getAll);
router.get("/:id", validateObjectIdParam("id"), dignitaryController.getById);
router.post("/", dignitaryController.create);
router.patch("/:id", validateObjectIdParam("id"), dignitaryController.update);
router.delete("/:id", validateObjectIdParam("id"), dignitaryController.delete);

export { router as dignitaryRoutes };
export default router;
