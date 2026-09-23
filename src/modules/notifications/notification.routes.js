import { Router } from "express";
import { notificationController } from "./notification.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

router.get("/", authMiddleware, notificationController.getMyNotifications);
router.get("/me", authMiddleware, notificationController.getMyNotifications);
router.patch("/:id/read", authMiddleware, validateObjectIdParam("id"), notificationController.markAsRead);
router.patch("/read-all", authMiddleware, notificationController.markAllAsRead);
router.patch("/mark-read", authMiddleware, notificationController.markAllAsRead);

router.delete("/clear-all", authMiddleware, notificationController.clearAllNotifications);
router.delete("/:id", authMiddleware, validateObjectIdParam("id"), notificationController.deleteNotification);

// Admin broadcast notification (Central Admin, State Admin, Chapter Admin)
router.post(
  "/broadcast",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  notificationController.broadcast
);

router.delete(
  "/broadcast/:broadcastId",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  notificationController.deleteBroadcast
);

export { router as notificationRoutes };
export default router;
