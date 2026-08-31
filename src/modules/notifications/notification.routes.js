import { Router } from "express";
import { notificationController } from "./notification.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

router.get("/me", authMiddleware, notificationController.getMyNotifications);
router.patch("/:id/read", authMiddleware, validateObjectIdParam("id"), notificationController.markAsRead);
router.patch("/read-all", authMiddleware, notificationController.markAllAsRead);

// Admin broadcast notification
router.post(
  "/broadcast",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  notificationController.broadcast
);

export { router as notificationRoutes };
export default router;
