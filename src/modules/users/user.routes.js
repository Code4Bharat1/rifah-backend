import { Router } from "express";
import { userController } from "./user.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import { validateUpdateProfile, validateUpdateStatus } from "./user.validation.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Current User Routes
router.get("/me", authMiddleware, userController.getMe);
router.patch(
  "/me",
  authMiddleware,
  validateRequest(validateUpdateProfile),
  userController.updateMe
);
router.post(
  "/me/saved/:businessId",
  authMiddleware,
  validateObjectIdParam("businessId"),
  userController.toggleSaveBusiness
);
router.post(
  "/me/deactivate",
  authMiddleware,
  userController.deactivateMe
);

// Admin User Management Routes
router.get(
  "/",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN),
  userController.listUsers
);
router.patch(
  "/:id/status",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  validateObjectIdParam("id"),
  validateRequest(validateUpdateStatus),
  userController.updateUserStatus
);

export { router as userRoutes };
export default router;
